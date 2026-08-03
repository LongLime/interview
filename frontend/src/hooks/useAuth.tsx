import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi, type LoginRequest, type RegisterRequest, type UserInfo } from '../api/auth';

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      authApi.getMe()
        .then(setUser)
        .catch(() => localStorage.removeItem('auth_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (data: LoginRequest) => {
    const res = await authApi.login(data);
    localStorage.setItem('auth_token', res.token);
    setUser({ id: 0, username: res.username, nickname: res.nickname, role: res.role });
  };

  const register = async (data: RegisterRequest) => {
    const res = await authApi.register(data);
    localStorage.setItem('auth_token', res.token);
    setUser({ id: 0, username: res.username, nickname: res.nickname, role: res.role });
  };

  const logout = () => {
    authApi.logout().catch(() => {});
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
