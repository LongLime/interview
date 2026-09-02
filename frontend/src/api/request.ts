import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * 后端统一响应结构
 */
interface Result<T = unknown> {
  code: number;
  message: string;
  data?: T;
  result?: T;
}

interface RetryableAxiosConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

const getBaseURL = () => {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env) return env;

  return '';
};

const baseURL = getBaseURL();

export function getApiUrl(path: string): string {
  return `${baseURL}${path}`;
}

const instance: AxiosInstance = axios.create({
  baseURL,
  timeout: 60000,
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = axios.post(
    `${baseURL}/api/auth/refresh`,
    { portal: 'student' },
    { withCredentials: true },
  ).then((response) => {
    const token = response.data?.access_token;
    if (typeof token !== 'string' || !token) {
      throw new Error('认证服务返回了无效令牌');
    }
    localStorage.setItem('auth_token', token);
    return token;
  }).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * 响应拦截器
 * 
 * 后端约定：所有响应都是 HTTP 200 + Result
 * - code === 200 → 成功，返回 data
 * - code !== 200 → 失败，直接显示 message
 */
instance.interceptors.response.use(
  (response) => {
    const result = response.data as Result;
    
    // 检查是否是 Result 格式
    if (result && typeof result === 'object' && 'code' in result) {
      if (result.code === 200 || result.code === 10000) {
        response.data = result.data ?? result.result;
        return response;
      }
      // 失败：直接抛出 message
      return Promise.reject(new Error(result.message || '请求失败'));
    }
    
    // 非 Result 格式，直接返回
    return response;
  },
  async (error) => {
    // 有响应的情况：后端返回了结果（即使是错误）
    if (error.response) {
      const config = error.config as RetryableAxiosConfig | undefined;
      const isAuthRequest = config?.url?.includes('/api/auth/') === true;
      if (error.response.status === 401 && config && !config._retry && !isAuthRequest) {
        config._retry = true;
        try {
          const token = await refreshAccessToken();
          config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
          return instance.request(config);
        } catch {
          localStorage.removeItem('auth_token');
        }
      }

      const { data } = error.response;
      // 尝试解析 Result 格式
      if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
        const result = data as Result;
        return Promise.reject(new Error(result.message || '请求失败'));
      }
      if (data && typeof data === 'object' && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail) {
          return Promise.reject(new Error(detail));
        }
      }
      // 响应格式不对
      return Promise.reject(new Error('请求失败，请重试'));
    }

    // 没有响应的情况：真正的网络错误或连接被重置
    // 对于文件上传，可能是网络超时或连接中断，但不一定是文件大小问题
    // 让后端返回真实的错误信息，而不是在这里假设
    const config = error.config;
    const isUpload = config && (
      config.url?.includes('/upload') ||
      config.headers?.['Content-Type']?.toString().includes('multipart')
    );

    if (isUpload) {
      // 文件上传失败且没有响应，可能是网络超时或连接中断
      // 不直接假设是文件大小问题，返回更通用的错误信息
      return Promise.reject(new Error('上传失败，可能是网络超时或连接中断，请重试'));
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return Promise.reject(new Error('推荐数据加载超时，请稍后重试'));
    }

    // 其他网络错误
    return Promise.reject(new Error('网络连接失败，请检查网络'));
  }
);

export const request = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return instance.get(url, config).then(res => res.data);
  },

  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.post(url, data, config).then(res => res.data);
  },

  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.put(url, data, config).then(res => res.data);
  },

  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.patch(url, data, config).then(res => res.data);
  },

  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return instance.delete(url, config).then(res => res.data);
  },

  /**
   * 文件上传
   */
  upload<T>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
    return instance.post(url, formData, {
      timeout: 300000, // 5分钟，与Nginx proxy_read_timeout对齐
      ...config,
    }).then(res => res.data);
  },

  /**
   * 获取原始实例（用于特殊场景如下载 Blob）
   */
  getInstance(): AxiosInstance {
    return instance;
  },
};

/**
 * 获取错误信息
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return '未知错误';
}

export default request;
