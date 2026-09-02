import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, LogIn } from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary text-on-primary rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-on-surface">统一账号登录</h1>
          <p className="text-on-surface-variant mt-1">账号由求职平台统一管理</p>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl soft-shadow p-8">
          <div className="space-y-5">
            <div className="p-4 bg-surface-container-low border border-outline-variant rounded-xl text-sm text-on-surface-variant leading-6">
              当前桌面端与求职平台共用账号和数据。请使用求职平台创建的账号登录，暂不支持在此单独注册。
            </div>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all"
            >
              <LogIn className="w-5 h-5" />
              返回登录
            </button>
            <div className="text-center">
              <span className="text-sm text-on-surface-variant">
                需要创建账号？{' '}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  联系求职平台
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
