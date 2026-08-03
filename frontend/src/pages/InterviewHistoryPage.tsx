import {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AnimatePresence, motion} from 'framer-motion';
import {historyApi} from '../api/history';
import {interviewApi, type TextSessionMeta} from '../api/interview';
import {voiceInterviewApi, SessionMeta} from '../api/voiceInterview';
import {formatDate} from '../utils/date';
import {getScoreProgressColor} from '../utils/score';
import {skillApi, type SkillDTO} from '../api/skill';
import {getTemplateName} from '../utils/voiceInterview';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Mic,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';

type InterviewType = 'all' | 'text' | 'voice';

interface UnifiedInterviewItem {
  id: string;
  type: 'text' | 'voice';
  title: string;
  sessionId: string;
  status: string;
  evaluateStatus?: string;
  evaluateError?: string;
  overallScore: number | null;
  totalQuestions?: number;
  actualDuration?: number;
  createdAt: string;
  resumeId?: number;
  voiceSessionId?: number;
}

interface InterviewStats {
  totalCount: number;
  completedCount: number;
  averageScore: number;
}

function isCompletedStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'EVALUATED';
}

function isLiveStatus(status: string): boolean {
  return status === 'IN_PROGRESS' || status === 'PAUSED';
}

function isEvaluateCompleted(item: UnifiedInterviewItem): boolean {
  if (item.evaluateStatus === 'COMPLETED') return true;
  if (item.status === 'EVALUATED') return true;
  return false;
}

function isEvaluating(item: UnifiedInterviewItem): boolean {
  return item.evaluateStatus === 'PENDING' || item.evaluateStatus === 'PROCESSING';
}

function isEvaluateFailed(item: UnifiedInterviewItem): boolean {
  return item.evaluateStatus === 'FAILED';
}

function StatusIcon({ item }: { item: UnifiedInterviewItem }) {
  if (isEvaluateFailed(item)) return <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400"/>;
  if (isEvaluating(item)) return <RefreshCw className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin"/>;
  if (isEvaluateCompleted(item)) return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400"/>;
  if (item.status === 'IN_PROGRESS') return <PlayCircle className="w-4 h-4 text-blue-500 dark:text-blue-400"/>;
  return <Clock className="w-4 h-4 text-yellow-500 dark:text-yellow-400"/>;
}

function getStatusText(item: UnifiedInterviewItem): string {
  if (isEvaluateFailed(item)) return '评估失败';
  if (isEvaluating(item)) return item.evaluateStatus === 'PROCESSING' ? '评估中' : '等待评估';
  if (isEvaluateCompleted(item)) return '已完成';
  if (item.status === 'IN_PROGRESS') return '进行中';
  if (item.status === 'PAUSED') return '已暂停';
  if (isCompletedStatus(item.status)) return '已提交';
  return '已创建';
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  suffix?: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface rounded-xl p-6 shadow-sm border border-outline-variant"
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-on-surface-variant">{label}</p>
          <p className="text-2xl font-bold text-on-surface">
            {value}{suffix && <span className="text-base font-normal text-outline ml-1">{suffix}</span>}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function TypeBadge({ type }: { type: 'text' | 'voice' }) {
  if (type === 'voice') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-medium">
        <Mic className="w-3 h-3" />
        语音
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
      <FileText className="w-3 h-3" />
      文字
    </span>
  );
}

interface InterviewHistoryPageProps {
  onBack: () => void;
  onViewInterview: (sessionId: string, resumeId?: number) => void;
  onRestartInterview?: (resumeId: number) => void;
  onContinueInterview?: (sessionId: string) => void;
}

/** Shallow comparison for polling change-detection */
function itemsEqual(a: UnifiedInterviewItem[], b: UnifiedInterviewItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i], bi = b[i];
    if (ai.id !== bi.id || ai.status !== bi.status ||
        ai.evaluateStatus !== bi.evaluateStatus || ai.overallScore !== bi.overallScore) return false;
  }
  return true;
}

export default function InterviewHistoryPage({ onBack: _onBack, onViewInterview, onRestartInterview, onContinueInterview }: InterviewHistoryPageProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<UnifiedInterviewItem[]>([]);
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<InterviewType>('all');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<UnifiedInterviewItem | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);
  const skillsRef = useRef<SkillDTO[]>([]);
  const skillsLoadedRef = useRef(false);

  const loadAll = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);

    try {
      // Only fetch skills on first load; reuse cached ref on polling
      if (!skillsLoadedRef.current) {
        skillsRef.current = await skillApi.listSkills().catch(() => [] as SkillDTO[]);
        skillsLoadedRef.current = true;
      }
      const loadedSkills = skillsRef.current;
      const [textInterviews, voiceSessions] = await Promise.all([
        loadTextInterviews(loadedSkills),
        loadVoiceInterviews(),
      ]);

      const voiceWithNames = voiceSessions.map(item => {
        const skillName = getTemplateName(item.title, loadedSkills);
        return skillName !== item.title ? { ...item, title: skillName } : item;
      });

      const all = [...textInterviews, ...voiceWithNames];
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setItems(prev => {
        if (isPolling && itemsEqual(prev, all)) return prev;
        return all;
      });

      // Compute stats
      const evaluated = all.filter(i => isEvaluateCompleted(i));
      const totalScore = evaluated.reduce((sum, i) => sum + (i.overallScore || 0), 0);
      const newStats = {
        totalCount: all.length,
        completedCount: evaluated.length,
        averageScore: evaluated.length > 0 ? Math.round(totalScore / evaluated.length) : 0,
      };
      setStats(prev => {
        if (isPolling && prev &&
            prev.totalCount === newStats.totalCount &&
            prev.completedCount === newStats.completedCount &&
            prev.averageScore === newStats.averageScore) return prev;
        return newStats;
      });
    } catch (err) {
      console.error('加载面试记录失败', err);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, []);

  // Load text interviews from dedicated API
  async function loadTextInterviews(skills: SkillDTO[]): Promise<UnifiedInterviewItem[]> {
    try {
      const sessions = await interviewApi.listSessions();
      return sessions.map((session: TextSessionMeta) => ({
        id: session.sessionId,
        type: 'text' as const,
        title: getTemplateName(session.skillId, skills),
        sessionId: session.sessionId,
        status: session.status,
        evaluateStatus: session.evaluateStatus ?? undefined,
        evaluateError: session.evaluateError ?? undefined,
        overallScore: session.overallScore,
        totalQuestions: session.totalQuestions,
        createdAt: session.createdAt,
        resumeId: session.resumeId ?? undefined,
      }));
    } catch {
      return [];
    }
  }

  // Load voice interviews from voice API
  async function loadVoiceInterviews(): Promise<UnifiedInterviewItem[]> {
    try {
      const sessions = await voiceInterviewApi.getAllSessions();
      return sessions.map((session: SessionMeta) => ({
        id: `voice-${session.sessionId}`,
        type: 'voice' as const,
        title: session.roleType,
        sessionId: String(session.sessionId),
        status: session.status,
        evaluateStatus: session.evaluateStatus,
        evaluateError: session.evaluateError,
        overallScore: null,
        actualDuration: session.actualDuration,
        createdAt: session.createdAt,
        voiceSessionId: session.sessionId,
      }));
    } catch {
      return [];
    }
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Polling for evaluation status
  useEffect(() => {
    const hasEvaluating = items.some(i => isEvaluating(i));

    if (hasEvaluating && !pollingRef.current) {
      pollingRef.current = window.setInterval(() => loadAll(true), 3000);
    } else if (!hasEvaluating && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [items, loadAll]);

  const handleRowClick = (item: UnifiedInterviewItem) => {
    if (item.type === 'text') {
      onViewInterview(item.sessionId, item.resumeId);
    } else if (item.voiceSessionId) {
      const isLive = isLiveStatus(item.status);
      if (isLive) {
        navigate('/voice-interview', { state: { voiceSessionId: item.voiceSessionId } });
      } else {
        navigate(`/voice-interview/${item.voiceSessionId}/evaluation`);
      }
    }
  };

  const handleDeleteClick = (item: UnifiedInterviewItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteItem(item);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
    setDeletingSessionId(deleteItem.sessionId);
    try {
      if (deleteItem.type === 'voice' && deleteItem.voiceSessionId) {
        await voiceInterviewApi.deleteSession(deleteItem.voiceSessionId);
      } else {
        await historyApi.deleteInterview(deleteItem.sessionId);
      }
      await loadAll();
      setDeleteItem(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败，请稍后重试');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleExport = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(sessionId);
    try {
      const blob = await historyApi.exportInterviewPdf(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `面试报告_${sessionId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('导出失败，请重试');
    } finally {
      setExporting(null);
    }
  };

  // Filter + search
  const filtered = items.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <motion.div className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-8 flex-wrap gap-6">
        <div>
          <motion.h1
            className="text-2xl font-bold text-on-surface flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Users className="w-7 h-7 text-primary-container" />
            面试记录
          </motion.h1>
          <motion.p
            className="text-on-surface-variant mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            查看和管理所有模拟面试记录
          </motion.p>
        </div>

        <motion.div
          className="flex items-center gap-3 bg-surface border border-outline-variant rounded-xl px-4 py-2.5 min-w-[280px] focus-within:border-primary-container focus-within:ring-0 transition-all"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Search className="w-5 h-5 text-outline" />
          <input
            type="text"
            placeholder="搜索名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 outline-none text-on-surface placeholder:text-outline bg-transparent"
          />
        </motion.div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard icon={Users} label="面试总数" value={stats.totalCount} color="bg-primary-container" />
          <StatCard icon={CheckCircle} label="已完成" value={stats.completedCount} color="bg-primary-container" />
          <StatCard icon={TrendingUp} label="平均分数" value={stats.averageScore} suffix="分" color="bg-primary-container" />
        </div>
      )}

      {/* Type filter tabs */}
      <div className="flex items-center gap-2 mb-6">
        {([
          { key: 'all', label: '全部' },
          { key: 'text', label: '文字面试' },
          { key: 'voice', label: '语音面试' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === tab.key
                ? 'bg-primary-container text-on-primary'
                : 'bg-transparent text-on-surface-variant hover:text-on-surface border border-primary-container'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-container animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <motion.div
          className="text-center py-20 bg-surface rounded-xl shadow-sm border border-outline-variant"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Users className="w-16 h-16 text-outline mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-on-surface mb-2">暂无面试记录</h3>
          <p className="text-on-surface-variant">开始一次模拟面试后，记录将显示在这里</p>
        </motion.div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <motion.div
          className="bg-surface rounded-xl shadow-sm border border-outline-variant overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <table className="w-full">
            <thead className="bg-surface-container-lowest border-b border-outline-variant">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-on-surface-variant">类型</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-on-surface-variant">名称</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-on-surface-variant">状态</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-on-surface-variant">得分</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-on-surface-variant">详情</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-on-surface-variant">时间</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-on-surface-variant">操作</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((item, index) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleRowClick(item)}
                    className="border-b border-outline-variant hover:bg-surface-container-high cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <TypeBadge type={item.type} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {item.type === 'text' ? (
                          <FileText className="w-5 h-5 text-outline" />
                        ) : (
                          <Mic className="w-5 h-5 text-purple-400" />
                        )}
                        <div>
                          <p className="font-medium text-on-surface">{item.title}</p>
                          <p className="text-xs text-outline">#{item.id.slice(-8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <StatusIcon item={item} />
                        <span className="text-sm text-on-surface-variant">{getStatusText(item)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isEvaluateCompleted(item) && item.overallScore !== null ? (
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-2 bg-surface-container-high rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full ${getScoreProgressColor(item.overallScore)} rounded-full`}
                              initial={{ width: 0 }}
                              animate={{ width: `${item.overallScore}%` }}
                              transition={{ duration: 0.8, delay: index * 0.05 }}
                            />
                          </div>
                          <span className="font-bold text-on-surface">{item.overallScore}</span>
                        </div>
                      ) : isEvaluating(item) ? (
                        <span className="text-blue-500 dark:text-blue-400 text-sm">生成中...</span>
                      ) : isEvaluateFailed(item) ? (
                        <span className="text-red-500 dark:text-red-400 text-sm" title={item.evaluateError}>失败</span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.type === 'text' && item.totalQuestions != null ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-high text-on-surface-variant rounded-lg text-sm">
                          {item.totalQuestions} 题
                        </span>
                      ) : item.type === 'voice' ? (
                        <span className="text-sm text-on-surface-variant">
                          {formatDuration(item.actualDuration)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.type === 'text' && !isCompletedStatus(item.status) && !isEvaluateCompleted(item) && onContinueInterview && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onContinueInterview(item.sessionId); }}
                            className="p-2 text-outline hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="继续面试"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        )}
                        {item.type === 'voice' && isLiveStatus(item.status) && item.voiceSessionId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate('/voice-interview', { state: { voiceSessionId: item.voiceSessionId } }); }}
                            className="p-2 text-outline hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="继续面试"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        )}
                        {isEvaluateCompleted(item) && item.type === 'text' && (
                          <button
                            onClick={(e) => handleExport(item.sessionId, e)}
                            disabled={exporting === item.sessionId}
                            className="p-2 text-outline hover:text-primary-container hover:bg-primary-container/10 rounded-lg transition-colors disabled:opacity-50"
                            title="导出PDF"
                          >
                            {exporting === item.sessionId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {isEvaluateCompleted(item) && item.type === 'text' && item.resumeId && onRestartInterview && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRestartInterview(item.resumeId!); }}
                            className="p-2 text-outline hover:text-primary-container hover:bg-primary-container/10 dark:hover:bg-primary-container/20 rounded-lg transition-colors"
                            title="重新面试"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                            onClick={(e) => handleDeleteClick(item, e)}
                            disabled={deletingSessionId === item.sessionId}
                            className="p-2 text-outline hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        <ChevronRight className="w-5 h-5 text-outline group-hover:text-primary-container group-hover:translate-x-1 transition-all"/>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </motion.div>
      )}

      <DeleteConfirmDialog
        open={deleteItem !== null}
        item={deleteItem ? { id: 0, sessionId: deleteItem.sessionId } : null}
        itemType="面试记录"
        loading={deletingSessionId !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteItem(null)}
      />
    </motion.div>
  );
}
