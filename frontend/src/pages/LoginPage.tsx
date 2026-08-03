import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('请填写用户名和密码');
      return;
    }

    setLoading(true);
    try {
      await login({ username: username.trim(), password });
      navigate('/history', { replace: true });
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary text-on-primary rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-on-surface">AI 面试助手</h1>
          <p className="text-on-surface-variant mt-1">登录您的账号</p>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl soft-shadow p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-error-container/50 border border-error-container text-error rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoFocus
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface placeholder:text-outline focus:border-primary-container outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface placeholder:text-outline focus:border-primary-container outline-none transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl disabled:opacity-50 font-medium transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              {loading ? '登录中...' : '登录'}
            </button>

            <div className="text-center">
              <span className="text-sm text-on-surface-variant">
                还没有账号？{' '}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  立即注册
                </Link>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
