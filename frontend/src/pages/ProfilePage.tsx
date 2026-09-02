import { BarChart3, Heart, LogOut, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import request from '../api/request';
import { useAuth } from '../hooks/useAuth';

interface ProfileStats {
  browse_count: number;
  favorite_count: number;
}

interface ProfileInfo {
  user_id: string;
  username: string;
  eduPersonType: string;
  dwmc: string;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);

  useEffect(() => {
    let active = true;

    request.get<ProfileStats>('/api/my/stats')
      .then((result) => active && setStats(result))
      .catch(() => active && setStats({ browse_count: 0, favorite_count: 0 }));

    request.get<ProfileInfo>('/api/my/info')
      .then((result) => active && setProfileInfo(result))
      .catch(() => active && setProfileInfo(null));

    return () => {
      active = false;
    };
  }, []);

  const displayName = user?.nickname || user?.username || '用户';
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-8">
        <p className="mb-2 text-sm text-on-surface-variant">账户与求职偏好</p>
        <h1 className="text-3xl font-bold text-on-surface">个人中心</h1>
      </header>

      <section className="border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary-container/15 text-3xl font-semibold text-primary">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-semibold text-on-surface">{displayName}</h2>
              <span className="border border-primary/20 bg-primary-container/10 px-2 py-1 text-xs font-medium text-primary">
                已登录
              </span>
            </div>
            <p className="text-sm text-on-surface-variant">账号：{profileInfo?.username || user?.username}</p>
            <p className="mt-1 text-sm text-on-surface-variant">角色：{profileInfo?.eduPersonType === 'admin' || user?.role === 'ADMIN' ? '管理员' : '求职者'}</p>
            {(profileInfo?.dwmc || user?.college) && <p className="mt-1 text-sm text-on-surface-variant">学校：{profileInfo?.dwmc || user?.college}</p>}
          </div>
        </div>

        <div className="grid border-t border-outline-variant sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate('/recruitment-events?tab=favorites')}
            className="flex min-h-28 items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-surface-container-high sm:px-8"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-error-container text-error">
              <Heart className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-2xl font-semibold text-on-surface">{stats?.favorite_count ?? '-'}</span>
              <span className="mt-1 block text-sm text-on-surface-variant">我的收藏</span>
            </span>
          </button>
          <div className="flex min-h-28 items-center gap-4 border-t border-outline-variant px-6 py-5 sm:border-l sm:border-t-0 sm:px-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-secondary-container text-secondary">
              <UserRound className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-semibold text-on-surface">账号基本信息</span>
              <span className="mt-1 block text-sm text-on-surface-variant">{profileInfo?.eduPersonType || user?.role || '学生'}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/overview')}
            className="flex min-h-28 items-center gap-4 border-t border-outline-variant px-6 py-5 text-left transition-colors hover:bg-surface-container-high sm:border-l sm:px-8"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-tertiary-container text-tertiary">
              <BarChart3 className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-semibold text-on-surface">数据看板</span>
              <span className="mt-1 block text-sm text-on-surface-variant">查看全校概况与学院分析</span>
            </span>
          </button>
          <div className="flex min-h-28 items-center gap-4 border-t border-outline-variant px-6 py-5 sm:border-l sm:px-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-primary-container text-primary">
              <UserRound className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-2xl font-semibold text-on-surface">{stats?.browse_count ?? '-'}</span>
              <span className="mt-1 block text-sm text-on-surface-variant">浏览记录</span>
            </span>
          </div>
        </div>
      </section>

      <section className="mt-8 border border-outline-variant bg-surface">
        <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
          <h2 className="text-base font-semibold text-on-surface">账户操作</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="flex w-full items-center gap-3 px-6 py-4 text-left text-error transition-colors hover:bg-error-container/30 sm:px-8"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">退出登录</span>
        </button>
      </section>
    </div>
  );
}