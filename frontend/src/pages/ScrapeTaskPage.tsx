import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit3,
  Clock,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  History,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Settings,
  Sun,
  Timer,
  CalendarDays,
} from 'lucide-react';
import {
  scrapeTaskApi,
  type ScrapeTask,
  type ScrapeRecord,
  type ScrapeResult,
} from '../api/careerFair';
import { getErrorMessage } from '../api/request';

interface TaskFormData {
  taskName: string;
  sourceUrl: string;
  description: string;
  cronExpression: string;
}

type ScheduleMode = 'daily' | 'interval';
type IntervalUnit = 'minutes' | 'hours';

export default function ScrapeTaskPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ScrapeTask[]>([]);
  const [records, setRecords] = useState<ScrapeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<ScrapeTask | null>(null);
  const [executingTaskId, setExecutingTaskId] = useState<number | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const [formData, setFormData] = useState<TaskFormData>({
    taskName: '',
    sourceUrl: 'https://www.cqbys.com/teachin?keyword=&universityid=&type=offline&time=&page=',
    description: '',
    cronExpression: '0 0 2 * * ?',
  });

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('daily');
  const [dailyHour, setDailyHour] = useState(2);
  const [dailyMinute, setDailyMinute] = useState(0);
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('hours');

  const buildCronExpression = () => {
    if (scheduleMode === 'daily') {
      return `0 ${dailyMinute} ${dailyHour} * * ?`;
    } else {
      if (intervalUnit === 'minutes') {
        return `0 0/${intervalValue} * * * ?`;
      } else {
        return `0 0 */${intervalValue} * * ?`;
      }
    }
  };

  const parseCronExpression = (cron: string) => {
    if (!cron) return;

    const parts = cron.split(' ');
    if (parts.length >= 5) {
      const minutePart = parts[1];
      const hourPart = parts[2];

      if (minutePart.includes('/')) {
        setScheduleMode('interval');
        const intervalNum = parseInt(minutePart.split('/')[1]);
        if (!isNaN(intervalNum)) {
          setIntervalValue(intervalNum);
          setIntervalUnit('minutes');
        }
      } else if (hourPart.includes('/')) {
        setScheduleMode('interval');
        const intervalNum = parseInt(hourPart.split('/')[1]);
        if (!isNaN(intervalNum)) {
          setIntervalValue(intervalNum);
          setIntervalUnit('hours');
        }
      } else {
        setScheduleMode('daily');
        const hour = parseInt(hourPart);
        const minute = parseInt(minutePart);
        if (!isNaN(hour)) setDailyHour(hour);
        if (!isNaN(minute)) setDailyMinute(minute);
      }
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    setError('');
    try {
      const [taskList, recentRecords] = await Promise.all([
        scrapeTaskApi.getAllTasks(),
        scrapeTaskApi.getRecentRecords(10),
      ]);
      setTasks(taskList);
      setRecords(recentRecords);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleCreateTask = async () => {
    try {
      const cronExpr = buildCronExpression();
      await scrapeTaskApi.createTask({
        ...formData,
        cronExpression: cronExpr,
      });
      setShowForm(false);
      resetForm();
      fetchTasks();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask) return;
    try {
      const cronExpr = buildCronExpression();
      await scrapeTaskApi.updateTask(editingTask.id, {
        ...formData,
        cronExpression: cronExpr,
      });
      setEditingTask(null);
      setShowForm(false);
      fetchTasks();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm('确定要删除这个抓取任务吗？')) return;
    try {
      await scrapeTaskApi.deleteTask(id);
      fetchTasks();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggleTask = async (id: number) => {
    try {
      await scrapeTaskApi.toggleTaskStatus(id);
      fetchTasks();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleExecuteTask = async (id: number) => {
    setExecutingTaskId(id);
    try {
      const result: ScrapeResult = await scrapeTaskApi.executeTask(id);
      if (result.success) {
        alert(`抓取成功！共获取 ${result.totalCount} 条数据`);
      } else {
        alert(`抓取失败: ${result.message}`);
      }
      fetchTasks();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExecutingTaskId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      taskName: '',
      sourceUrl: 'https://www.cqbys.com/teachin?keyword=&universityid=&type=offline&time=&page=',
      description: '',
      cronExpression: '0 0 2 * * ?',
    });
    setScheduleMode('daily');
    setDailyHour(2);
    setDailyMinute(0);
    setIntervalValue(1);
    setIntervalUnit('hours');
  };

  const openEditForm = (task: ScrapeTask) => {
    setEditingTask(task);
    setFormData({
      taskName: task.taskName,
      sourceUrl: task.sourceUrl,
      description: task.description || '',
      cronExpression: task.cronExpression || '0 0 2 * * ?',
    });
    parseCronExpression(task.cronExpression);
    setShowForm(true);
  };

  const openCreateForm = () => {
    resetForm();
    setEditingTask(null);
    setShowForm(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-error" />;
      case 'RUNNING':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'DISABLED':
        return <Pause className="w-4 h-4 text-on-surface-variant" />;
      default:
        return <Clock className="w-4 h-4 text-on-surface-variant" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return '成功';
      case 'FAILED':
        return '失败';
      case 'RUNNING':
        return '运行中';
      case 'DISABLED':
        return '已禁用';
      default:
        return '空闲';
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const getScheduleDescription = (cron: string) => {
    if (!cron) return '未设置';

    const parts = cron.split(' ');
    if (parts.length >= 5) {
      const minutePart = parts[1];
      const hourPart = parts[2];

      if (minutePart.includes('/')) {
        const interval = parseInt(minutePart.split('/')[1]);
        return `每隔 ${interval} 分钟`;
      } else if (hourPart.includes('/')) {
        const interval = parseInt(hourPart.split('/')[1]);
        return `每隔 ${interval} 小时`;
      } else {
        const hour = parseInt(hourPart);
        const minute = parseInt(minutePart);
        return `每天 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
    }
    return cron;
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/career-fair')}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-on-surface flex items-center gap-3">
              <Settings className="w-7 h-7 text-primary" />
              定时任务配置
            </h1>
            <p className="text-on-surface-variant mt-1">
              配置和管理宣讲会数据抓取任务
            </p>
          </div>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          新建任务
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-error-container text-on-error-container rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
          <button
            onClick={() => setError('')}
            className="ml-auto text-sm hover:underline"
          >
            清除
          </button>
        </div>
      )}

      {/* Task Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-container-low rounded-xl border border-outline-variant p-6 w-full max-w-lg"
            >
              <h2 className="text-xl font-bold text-on-surface mb-6">
                {editingTask ? '编辑任务' : '新建抓取任务'}
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1.5">
                    任务名称
                  </label>
                  <input
                    type="text"
                    value={formData.taskName}
                    onChange={(e) => setFormData({ ...formData, taskName: e.target.value })}
                    placeholder="例如：重庆高校毕业生就业网宣讲会抓取"
                    className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1.5">
                    抓取网址
                  </label>
                  <input
                    type="text"
                    value={formData.sourceUrl}
                    onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                    placeholder="https://www.cqbys.com/teachin..."
                    className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Schedule Mode Selection */}
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-2">
                    定时方式
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setScheduleMode('daily')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                        scheduleMode === 'daily'
                          ? 'border-primary bg-primary-container/30'
                          : 'border-outline-variant hover:border-primary/50'
                      }`}
                    >
                      <Sun className={`w-6 h-6 ${scheduleMode === 'daily' ? 'text-primary' : 'text-on-surface-variant'}`} />
                      <span className={`text-sm font-medium ${scheduleMode === 'daily' ? 'text-primary' : 'text-on-surface'}`}>
                        每日定时
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        每天固定时间执行
                      </span>
                    </button>
                    <button
                      onClick={() => setScheduleMode('interval')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                        scheduleMode === 'interval'
                          ? 'border-primary bg-primary-container/30'
                          : 'border-outline-variant hover:border-primary/50'
                      }`}
                    >
                      <Timer className={`w-6 h-6 ${scheduleMode === 'interval' ? 'text-primary' : 'text-on-surface-variant'}`} />
                      <span className={`text-sm font-medium ${scheduleMode === 'interval' ? 'text-primary' : 'text-on-surface'}`}>
                        间隔同步
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        每隔固定时间执行
                      </span>
                    </button>
                  </div>
                </div>

                {/* Daily Schedule Config */}
                {scheduleMode === 'daily' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-4 p-4 bg-surface rounded-lg border border-outline-variant">
                      <CalendarDays className="w-5 h-5 text-primary flex-shrink-0" />
                      <div className="flex items-center gap-3">
                        <div>
                          <label className="block text-xs text-on-surface-variant mb-1">小时</label>
                          <select
                            value={dailyHour}
                            onChange={(e) => setDailyHour(parseInt(e.target.value))}
                            className="px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>
                                {i.toString().padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span className="text-xl font-bold text-on-surface mt-5">:</span>
                        <div>
                          <label className="block text-xs text-on-surface-variant mb-1">分钟</label>
                          <select
                            value={dailyMinute}
                            onChange={(e) => setDailyMinute(parseInt(e.target.value))}
                            className="px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
                          >
                            {Array.from({ length: 12 }, (_, i) => i * 5).map((min) => (
                              <option key={min} value={min}>
                                {min.toString().padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <span className="ml-auto text-sm text-on-surface-variant">
                        每天执行一次
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Interval Schedule Config */}
                {scheduleMode === 'interval' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-4 p-4 bg-surface rounded-lg border border-outline-variant">
                      <Timer className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-sm text-on-surface">每隔</span>
                      <select
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(parseInt(e.target.value))}
                        className="px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
                      >
                        {intervalUnit === 'minutes'
                          ? Array.from({ length: 12 }, (_, i) => i * 5 + 5).map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))
                          : Array.from({ length: 24 }, (_, i) => i + 1).map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                      </select>
                      <select
                        value={intervalUnit}
                        onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                        className="px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
                      >
                        <option value="minutes">分钟</option>
                        <option value="hours">小时</option>
                      </select>
                      <span className="text-sm text-on-surface-variant ml-auto">
                        自动同步数据
                      </span>
                    </div>
                  </motion.div>
                )}

                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1.5">
                    描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="任务描述（可选）"
                    rows={2}
                    className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={editingTask ? handleUpdateTask : handleCreateTask}
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {editingTask ? '保存修改' : '创建任务'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tasks List */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/50 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-outline-variant/50 flex items-center justify-between">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            抓取任务列表
          </h2>
          <span className="text-sm text-on-surface-variant">{tasks.length} 个任务</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-on-surface-variant">暂无抓取任务</p>
            <p className="text-sm text-on-surface-variant/60 mt-1">
              点击右上角"新建任务"按钮创建
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/30">
            {tasks.map((task) => (
              <div key={task.id} className="p-4 hover:bg-surface-container-high/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-on-surface">{task.taskName}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          task.isEnabled
                            ? 'bg-primary-container text-on-primary-container'
                            : 'bg-surface-variant text-on-surface-variant'
                        }`}
                      >
                        {task.isEnabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" />
                        <span className="truncate max-w-xs">{task.sourceUrl}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-on-surface-variant mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {getScheduleDescription(task.cronExpression)}
                      </span>
                    </div>
                    {task.lastRunTime && (
                      <div className="flex items-center gap-4 text-xs text-on-surface-variant/60 mt-1">
                        <span>上次执行: {formatDateTime(task.lastRunTime)}</span>
                        {task.lastRecordCount > 0 && (
                          <span>抓取记录: {task.lastRecordCount} 条</span>
                        )}
                        <span className="flex items-center gap-1">
                          {getStatusIcon(task.status)}
                          {getStatusText(task.status)}
                        </span>
                      </div>
                    )}
                    {task.errorMessage && (
                      <p className="text-xs text-error mt-1">{task.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <button
                      onClick={() => handleExecuteTask(task.id)}
                      disabled={executingTaskId === task.id || !task.isEnabled}
                      className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-lg transition-colors disabled:opacity-30"
                      title="立即执行"
                    >
                      {executingTaskId === task.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleToggleTask(task.id)}
                      className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-lg transition-colors"
                      title={task.isEnabled ? '禁用' : '启用'}
                    >
                      {task.isEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEditForm(task)}
                      className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-lg transition-colors"
                      title="查看记录"
                    >
                      {expandedTaskId === task.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Records */}
                <AnimatePresence>
                  {expandedTaskId === task.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <TaskRecords taskId={task.id} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Records */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/50">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            最近抓取记录
          </h2>
        </div>
        {records.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-on-surface-variant text-sm">暂无抓取记录</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/30">
            {records.map((record) => (
              <div key={record.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  {record.status === 'SUCCESS' ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : record.status === 'FAILED' ? (
                    <XCircle className="w-4 h-4 text-error" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  )}
                  <span className="text-on-surface font-medium">{record.taskName || `任务 #${record.taskId}`}</span>
                  <span className="text-on-surface-variant">{record.recordCount} 条</span>
                  {record.newCount > 0 && (
                    <span className="text-success text-xs">+{record.newCount} 新</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-on-surface-variant">
                  <span>{formatDuration(record.durationMs)}</span>
                  <span>{formatDateTime(record.startedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRecords({ taskId }: { taskId: number }) {
  const [records, setRecords] = useState<ScrapeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const result = await scrapeTaskApi.getTaskRecords(taskId, 0, 5);
        setRecords(result.content);
      } catch (err) {
        console.error('获取记录失败', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, [taskId]);

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  if (loading) {
    return (
      <div className="py-4 flex justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-on-surface-variant">
        暂无执行记录
      </div>
    );
  }

  return (
    <div className="mt-3 bg-surface rounded-lg border border-outline-variant/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-outline-variant/30">
            <th className="px-4 py-2 text-left text-on-surface-variant font-medium">状态</th>
            <th className="px-4 py-2 text-left text-on-surface-variant font-medium">记录数</th>
            <th className="px-4 py-2 text-left text-on-surface-variant font-medium">耗时</th>
            <th className="px-4 py-2 text-left text-on-surface-variant font-medium">执行时间</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-b border-outline-variant/20 last:border-0">
              <td className="px-4 py-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    record.status === 'SUCCESS'
                      ? 'bg-success-container text-on-success-container'
                      : record.status === 'FAILED'
                      ? 'bg-error-container text-on-error-container'
                      : 'bg-primary-container text-on-primary-container'
                  }`}
                >
                  {record.status === 'SUCCESS' ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : record.status === 'FAILED' ? (
                    <XCircle className="w-3 h-3" />
                  ) : (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                  {record.status === 'SUCCESS' ? '成功' : record.status === 'FAILED' ? '失败' : '运行中'}
                </span>
              </td>
              <td className="px-4 py-2 text-on-surface">{record.recordCount} 条</td>
              <td className="px-4 py-2 text-on-surface-variant">{formatDuration(record.durationMs)}</td>
              <td className="px-4 py-2 text-on-surface-variant">{formatDateTime(record.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
