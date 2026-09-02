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
    const restoreSession = async () => {
      try {
        if (!localStorage.getItem('auth_token')) {
          await authApi.refresh();
        }
        setUser(await authApi.getMe());
      } catch {
        try {
          const refreshed = await authApi.refresh();
          setUser(authApi.toUserInfo(refreshed.session));
        } catch {
          localStorage.removeItem('auth_token');
        }
      }
    };

    restoreSession()
      .finally(() => setLoading(false));
  }, []);

  const login = async (data: LoginRequest) => {
    const res = await authApi.login(data);
    localStorage.setItem('auth_token', res.access_token);
    setUser(authApi.toUserInfo(res.session));
  };

  const register = async (data: RegisterRequest) => {
    const res = await authApi.register(data);
    localStorage.setItem('auth_token', res.access_token);
    setUser(authApi.toUserInfo(res.session));
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
