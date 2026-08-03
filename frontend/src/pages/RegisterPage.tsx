import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
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
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }

    setLoading(true);
    try {
      await register({
        username: username.trim(),
        password,
        nickname: nickname.trim() || username.trim(),
      });
      navigate('/history', { replace: true });
    } catch (err: any) {
      setError(err.message || '注册失败');
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
          <h1 className="text-2xl font-bold text-on-surface">创建账号</h1>
          <p className="text-on-surface-variant mt-1">加入 AI 面试助手</p>
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
                用户名 <span className="text-error">*</span>
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
                昵称
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="给自己起个名字（不填则使用用户名）"
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface placeholder:text-outline focus:border-primary-container outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">
                密码 <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少6位密码"
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

            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">
                确认密码 <span className="text-error">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface placeholder:text-outline focus:border-primary-container outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl disabled:opacity-50 font-medium transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <UserPlus className="w-5 h-5" />
              )}
              {loading ? '注册中...' : '注册'}
            </button>

            <div className="text-center">
              <span className="text-sm text-on-surface-variant">
                已有账号？{' '}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  立即登录
                </Link>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
