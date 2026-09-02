import request from './request';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  session: SessionInfo;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  role: string;
  college: string;
  portal: string;
  roles: string[];
}

interface SessionInfo {
  subject: string;
  display_name: string;
  college: string;
  portal: string;
  roles: string[];
  scopes: string[];
}

function toUserInfo(session: SessionInfo): UserInfo {
  return {
    id: Number(session.subject) || 0,
    username: session.subject,
    nickname: session.display_name,
    role: session.roles[0] || 'student',
    college: session.college,
    portal: session.portal,
    roles: session.roles,
  };
}

export const authApi = {
  login: (data: LoginRequest): Promise<LoginResponse> => {
    return request.post('/api/auth/local/login', {
      principal: data.username,
      password: data.password,
      portal: 'student',
    });
  },

  getMe: (): Promise<UserInfo> => {
    const token = localStorage.getItem('auth_token');
    return request.get<SessionInfo>('/api/auth/me', token ? {
      headers: { Authorization: `Bearer ${token}` },
    } : undefined).then(toUserInfo);
  },

  refresh: (): Promise<LoginResponse> => {
    return request.post<LoginResponse>('/api/auth/refresh', { portal: 'student' })
      .then((response) => {
        localStorage.setItem('auth_token', response.access_token);
        return response;
      });
  },

  logout: (): Promise<{ success: boolean }> => {
    return request.post('/api/auth/logout', { portal: 'student' });
  },

  register: async (_data: RegisterRequest): Promise<LoginResponse> => {
    throw new Error('统一账号由求职平台管理，请使用已有账号登录');
  },

  toUserInfo,
};
