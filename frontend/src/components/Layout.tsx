import {Link, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {motion} from 'framer-motion';
import {BookOpen, Calendar, CalendarDays, Database, FileStack, LogOut, MessageSquare, Settings, Sparkles, Users,} from 'lucide-react';
import {useTheme} from '../hooks/useTheme';
import {useAuth} from '../hooks/useAuth';
import {useState} from 'react';
import UnifiedInterviewModal, {UnifiedInterviewConfig} from './UnifiedInterviewModal';

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

export default function Layout() {
  const location = useLocation();
  const currentPath = location.pathname;
  const {theme, toggleTheme} = useTheme();
  const {user, logout} = useAuth();
  const navigate = useNavigate();
  const [interviewModalPreset, setInterviewModalPreset] = useState<{
    defaultMode: 'text' | 'voice';
    defaultResumeId?: number;
    title: string;
    subtitle: string;
    startButtonText: string;
  } | null>(null);

  const openInterviewModalWithResume = (resumeId: number) => {
    setInterviewModalPreset({
      defaultMode: 'text',
      defaultResumeId: resumeId,
      title: '开始模拟面试',
      subtitle: '配置面试参数，开始练习',
      startButtonText: '开始面试',
    });
  };

  const handleInterviewStart = (config: UnifiedInterviewConfig) => {
    setInterviewModalPreset(null);
    if (config.mode === 'text') {
      navigate('/interview', {
        state: {
          resumeId: config.resumeId,
          interviewConfig: {
            skillId: config.skillId,
            difficulty: config.difficulty,
            questionCount: config.questionCount,
            llmProvider: config.llmProvider,
          },
        },
      });
      return;
    }

    const params = new URLSearchParams({
      skillId: config.skillId,
      difficulty: config.difficulty,
    });
    navigate(`/voice-interview?${params.toString()}`, {
      state: {
        voiceConfig: {
          skillId: config.skillId,
          difficulty: config.difficulty,
          techEnabled: true,
          projectEnabled: true,
          hrEnabled: true,
          plannedDuration: config.plannedDuration,
          resumeId: config.resumeId,
          llmProvider: config.llmProvider,
        },
      },
    });
  };

  const navItems: NavItem[] = [
    { id: 'resumes', path: '/history', label: '简历管理', icon: FileStack },
    { id: 'career-fair', path: '/recruitment-events', label: '招聘活动', icon: CalendarDays },
    { id: 'interview-hub', path: '/interview-hub', label: '模拟面试', icon: Sparkles },
    { id: 'interviews', path: '/interviews', label: '面试记录', icon: Users },
    { id: 'interview-schedule', path: '/interview-schedule', label: '面试日程', icon: Calendar },
    { id: 'kb-manage', path: '/knowledgebase', label: '知识库管理', icon: Database },
    { id: 'chat', path: '/knowledgebase/chat', label: '问答助手', icon: MessageSquare },
    { id: 'contribution', path: '/contribution', label: '贡献面经', icon: BookOpen },
    { id: 'settings', path: '/settings', label: '设置', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path.startsWith('#')) return false;
    if (path === '/history') {
      return currentPath === '/history'
        || currentPath === '/'
        || currentPath.startsWith('/history/')
        || currentPath === '/upload';
    }
    if (path === '/interview-hub') {
      return currentPath === '/interview-hub'
        || currentPath === '/interview'
        || currentPath.startsWith('/interview/')
        || currentPath.startsWith('/voice-interview');
    }
    if (path === '/knowledgebase') {
      return currentPath === '/knowledgebase' || currentPath === '/knowledgebase/upload';
    }
    if (path === '/contribution') {
      return currentPath === '/contribution' || currentPath.startsWith('/contribution/');
    }
    if (path === '/recruitment-events') {
      return currentPath === '/recruitment-events'
        || currentPath.startsWith('/recruitment-events/')
        || currentPath === '/career-fair'
        || currentPath.startsWith('/career-fair/');
    }
    return currentPath.startsWith(path);
  };

  return (
    <div className="flex min-h-screen bg-background text-on-background font-body-md">
      {/* SideNavBar */}
      <nav className="fixed left-0 top-0 h-full w-[280px] bg-surface/80 backdrop-blur-md border-r border-outline-variant shadow-sm flex flex-col py-6 px-4 gap-y-2 z-50 glass-nav">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary text-on-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-on-surface">AI Interview</h1>
            <p className="font-label-md text-on-surface-variant">智能面试助手</p>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.id}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 group
                  ${active
                    ? 'bg-primary-container/10 dark:bg-primary-container/20 text-primary dark:text-primary-fixed-dim border-l-4 border-primary'
                    : 'text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim hover:bg-surface-container-high dark:hover:bg-surface-container-highest'
                  }`}
              >
                <item.icon
                  className={`w-5 h-5 ${active ? '' : ''}`}
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                />
                <span className={`font-body-md text-body-md ${active ? 'font-medium' : ''}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-auto pt-4 border-t border-outline-variant/50 space-y-2">
          {/* Theme Toggle Switch */}
          <div className="w-full flex items-center justify-between px-4 py-2 rounded-lg bg-surface-container-high/50 dark:bg-surface-container-highest/20 transition-all duration-300">
            <span className="text-sm text-on-surface-variant font-medium">深色模式</span>
            <button
              type="button"
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${
                theme === 'dark' ? 'bg-primary' : 'bg-outline-variant/30'
              }`}
              role="switch"
              aria-checked={theme === 'dark'}
            >
              <span
                className={`pointer-events-none flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-300 ease-in-out ${
                  theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                }`}
              >
                {theme === 'dark' ? (
                  <span className="material-symbols-outlined text-[14px] text-primary">dark_mode</span>
                ) : (
                  <span className="material-symbols-outlined text-[14px] text-primary">light_mode</span>
                )}
              </span>
            </button>
          </div>

          {/* User Info */}
          {user && (
            <div className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-surface-container-high dark:hover:bg-surface-container-highest transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface">{user.nickname || user.username}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="text-outline hover:text-error transition-colors p-1 rounded hover:bg-error-container"
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="ml-[280px] flex-1 flex flex-col min-h-screen">
        <motion.div
          key={currentPath}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="flex-1 px-10 py-8"
        >
          <Outlet context={{ openInterviewModalWithResume }} />
        </motion.div>
      </main>

      {/* 统一面试弹窗 */}
      <UnifiedInterviewModal
        isOpen={interviewModalPreset !== null}
        onClose={() => setInterviewModalPreset(null)}
        onStart={handleInterviewStart}
        defaultMode={interviewModalPreset?.defaultMode || 'text'}
        defaultResumeId={interviewModalPreset?.defaultResumeId}
        hideModeSwitch={interviewModalPreset?.defaultResumeId == null}
        title={interviewModalPreset?.title || '开始模拟面试'}
        subtitle={interviewModalPreset?.subtitle || '选择面试模式和主题，快速开始'}
        startButtonText={interviewModalPreset?.startButtonText || '开始面试'}
      />
    </div>
  );
}
