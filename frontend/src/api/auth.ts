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
  token: string;
  username: string;
  nickname: string;
  role: string;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  role: string;
}

export const authApi = {
  login: (data: LoginRequest): Promise<LoginResponse> => {
    return request.post('/api/auth/login', data);
  },

  register: (data: RegisterRequest): Promise<LoginResponse> => {
    return request.post('/api/auth/register', data);
  },

  getMe: (): Promise<UserInfo> => {
    const token = localStorage.getItem('auth_token');
    return request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  logout: (): Promise<{ success: boolean }> => {
    return request.post('/api/auth/logout');
  },
};
