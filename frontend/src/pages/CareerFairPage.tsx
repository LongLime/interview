import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  MapPin,
  Building2,
  GraduationCap,
  Clock,
  Search,
  ExternalLink,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Zap,
  Loader2,
  Settings,
  X,
  CheckCircle2,
  AlertCircle,
  Heart,
  CalendarPlus,
  Sparkles,
} from 'lucide-react';
import { careerFairApi, scrapeTaskApi, type CareerFair, type CareerFairListItem, type CareerFairUserState, type PageResponse, type RecommendedCareerFair, type ScrapeProgress } from '../api/careerFair';
import { getErrorMessage } from '../api/request';

type FeedMode = 'all' | 'recommended' | 'favorites';

export default function CareerFairPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [careerFairs, setCareerFairs] = useState<CareerFairListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [feedMode, setFeedMode] = useState<FeedMode>(() => (
    new URLSearchParams(location.search).get('tab') === 'favorites' ? 'favorites' : 'all'
  ));
  const [recommendReasons, setRecommendReasons] = useState<Record<number, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [fairType, setFairType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const listRequestController = useRef<AbortController | null>(null);
  const listRequestSequence = useRef(0);

  const [showProgress, setShowProgress] = useState(false);
  const [progressData, setProgressData] = useState<ScrapeProgress | null>(null);
  const [selectedFair, setSelectedFair] = useState<CareerFair | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [fairState, setFairState] = useState<CareerFairUserState | null>(null);
  const [stateSaving, setStateSaving] = useState(false);

  const handleOpenFair = async (fair: CareerFairListItem) => {
    setSelectedFair(null);
    setFairState(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const source = fair.externalId.startsWith('external-') ? 'external' : 'internal';
      const [detail, state] = await Promise.all([
        careerFairApi.getCareerFairById(fair.id, source),
        careerFairApi.getCareerFairState(fair.id, source),
      ]);
      setSelectedFair(detail);
      setFairState(state);
    } catch (err) {
      setDetailError(getErrorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdateFairState = async (change: Partial<CareerFairUserState>) => {
    if (!selectedFair || !fairState || stateSaving) return;
    const previousState = fairState;
    const nextState = { ...fairState, ...change };
    setFairState(nextState);
    setStateSaving(true);
    try {
      const source = selectedFair.externalId.startsWith('external-') ? 'external' : 'internal';
      const savedState = await careerFairApi.updateCareerFairState(selectedFair.id, nextState, source);
      setFairState(savedState);
      if (feedMode === 'favorites' && !savedState.isFavorited) {
        await fetchCareerFairs(0, 'favorites');
      }
    } catch (err) {
      setFairState(previousState);
      setDetailError(getErrorMessage(err));
    } finally {
      setStateSaving(false);
    }
  };

  const handleSyncData = async () => {
    if (showProgress) return;

    try {
      const tasks = await scrapeTaskApi.getAllTasks();
      if (tasks.length === 0) {
        alert('请先在定时任务配置中创建抓取任务');
        return;
      }

      const task = tasks[0];
      setShowProgress(true);
      setProgressData({
        status: 'connected',
        message: '正在连接服务器...',
        progress: 0,
        page: 0,
        count: 0,
      });

      const result = await scrapeTaskApi.executeTask(task.id);
      setProgressData({
        status: 'completed',
        message: result.message,
        progress: 100,
        page: 0,
        count: result.totalCount,
      });
      await fetchCareerFairs(0);
    } catch (err) {
      setProgressData({
        status: 'failed',
        message: `同步失败: ${getErrorMessage(err)}`,
        progress: 0,
        page: 0,
        count: 0,
      });
    }
  };

  const closeProgress = () => {
    setShowProgress(false);
    setProgressData(null);
  };

  const fetchCareerFairs = async (pageNum: number = 0, mode: FeedMode = feedMode) => {
    const requestSequence = ++listRequestSequence.current;
    listRequestController.current?.abort();
    const controller = new AbortController();
    listRequestController.current = controller;
    setLoading(true);
    setError('');
    try {
      let result: PageResponse<CareerFairListItem>;
      if (mode === 'favorites') {
        result = await careerFairApi.getFavoriteCareerFairs({
          keyword: keyword || undefined,
          page: pageNum,
          size: 12,
        }, { signal: controller.signal });
        setRecommendReasons({});
      } else if (mode === 'recommended') {
        const recommendations = await careerFairApi.getRecommendedCareerFairs({
          keyword: keyword || undefined,
          limit: 50,
        }, { signal: controller.signal });
        const offset = pageNum * 12;
        const content = recommendations.slice(offset, offset + 12);
        result = {
          content,
          totalElements: recommendations.length,
          totalPages: Math.ceil(recommendations.length / 12),
          size: 12,
          number: pageNum,
        };
        setRecommendReasons(Object.fromEntries(recommendations.map((item: RecommendedCareerFair) => [item.id, item.recommendReason])));
      } else {
        result = await careerFairApi.searchCareerFairs({
          keyword: keyword || undefined,
          fairType: fairType || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page: pageNum,
          size: 12,
        }, { signal: controller.signal });
        setRecommendReasons({});
      }
      if (requestSequence !== listRequestSequence.current) return;
      setCareerFairs(result.content);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
      setPage(result.number);
    } catch (err) {
      if (requestSequence !== listRequestSequence.current) return;
      setError(getErrorMessage(err));
    } finally {
      if (requestSequence === listRequestSequence.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCareerFairs(0);
    return () => {
      listRequestSequence.current += 1;
      listRequestController.current?.abort();
    };
  }, []);

  const handleSearch = () => {
    setPage(0);
    fetchCareerFairs(0);
  };

  const handleFeedModeChange = (mode: FeedMode) => {
    setFeedMode(mode);
    setPage(0);
    fetchCareerFairs(0, mode);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      setPage(newPage);
      fetchCareerFairs(newPage);
    }
  };

  const handleResetFilters = () => {
    setKeyword('');
    setFairType('');
    setStartDate('');
    setEndDate('');
    setPage(0);
    fetchCareerFairs(0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5);
  };

  const getFairTypeLabel = (fairType: string) => {
    const normalized = fairType?.toLowerCase();
    if (normalized.includes('双选') || normalized.includes('job_fair') || normalized === 'dual') {
      return '双选会';
    }
    if (normalized.includes('线上') || normalized === 'online') {
      return '线上宣讲';
    }
    if (normalized.includes('线下') || normalized === 'offline') {
      return '线下宣讲';
    }
    return fairType || '宣讲会';
  };

  const getStatusBadge = (fairDate: string) => {
    const date = new Date(fairDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date < today) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-variant text-on-surface-variant">
          已结束
        </span>
      );
    } else if (date.getTime() === today.getTime()) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-tertiary-container text-on-tertiary-container">
          今天
        </span>
      );
    } else {
      const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-container text-on-primary-container">
            {diffDays}天后
          </span>
        );
      }
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-secondary-container text-on-secondary-container">
          即将开始
        </span>
      );
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success';
      case 'failed':
      case 'error':
        return 'bg-error';
      default:
        return 'bg-primary';
    }
  };

  const getProgressIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-8 h-8 text-success" />;
      case 'failed':
      case 'error':
        return <AlertCircle className="w-8 h-8 text-error" />;
      default:
        return <Loader2 className="w-8 h-8 text-primary animate-spin" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Progress Overlay */}
      <AnimatePresence>
        {showProgress && progressData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-container-low rounded-2xl border border-outline-variant p-8 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-on-surface flex items-center gap-3">
                  <Zap className="w-6 h-6 text-primary" />
                  数据同步中
                </h2>
                {(progressData.status === 'completed' || progressData.status === 'failed' || progressData.status === 'error') ? (
                  <button
                    onClick={closeProgress}
                    className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={closeProgress}
                    className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
                    title="后台继续执行"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4 mb-6">
                {getProgressIcon(progressData.status)}
                <div className="flex-1">
                  <p className="text-on-surface font-medium">{progressData.message}</p>
                  {progressData.count > 0 && (
                    <p className="text-sm text-on-surface-variant mt-1">
                      已抓取 {progressData.count} 条数据
                      {progressData.page > 0 && ` · 第 ${progressData.page} 页`}
                    </p>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-on-surface-variant mb-2">
                  <span>
                    {progressData.status === 'started' && '准备中...'}
                    {progressData.status === 'connected' && '连接中...'}
                    {progressData.status === 'scraping' && '正在抓取...'}
                    {progressData.status === 'saving' && '保存数据...'}
                    {progressData.status === 'completed' && '抓取完成'}
                    {progressData.status === 'failed' && '抓取失败'}
                    {progressData.status === 'error' && '发生错误'}
                  </span>
                  <span>{progressData.progress}%</span>
                </div>
                <div className="h-3 bg-surface-variant rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressData.progress}%` }}
                    transition={{ duration: 0.3 }}
                    className={`h-full ${getProgressColor(progressData.status)} rounded-full`}
                  />
                </div>
              </div>

              {/* Step Indicators */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <div className={`flex items-center gap-1 ${progressData.progress >= 5 ? 'text-primary' : ''}`}>
                  <div className={`w-2 h-2 rounded-full ${progressData.progress >= 5 ? 'bg-primary' : 'bg-surface-variant'}`} />
                  <span>连接</span>
                </div>
                <div className={`flex items-center gap-1 ${progressData.progress >= 10 ? 'text-primary' : ''}`}>
                  <div className={`w-2 h-2 rounded-full ${progressData.progress >= 10 ? 'bg-primary' : 'bg-surface-variant'}`} />
                  <span>抓取</span>
                </div>
                <div className={`flex items-center gap-1 ${progressData.progress >= 90 ? 'text-primary' : ''}`}>
                  <div className={`w-2 h-2 rounded-full ${progressData.progress >= 90 ? 'bg-primary' : 'bg-surface-variant'}`} />
                  <span>保存</span>
                </div>
                <div className={`flex items-center gap-1 ${progressData.progress >= 100 ? 'text-success' : ''}`}>
                  <div className={`w-2 h-2 rounded-full ${progressData.progress >= 100 ? 'bg-success' : 'bg-surface-variant'}`} />
                  <span>完成</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-3">
            <Megaphone className="w-7 h-7 text-primary" />
            招聘活动
          </h1>
          <p className="text-on-surface-variant mt-1">
            汇集宣讲会与双选会信息，帮你更快找到合适的求职机会
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncData}
            disabled={showProgress}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
          >
            {showProgress ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {showProgress ? '同步中...' : '同步数据'}
          </button>
          <button
            onClick={() => navigate('/recruitment-events/tasks')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-container text-on-primary-container rounded-lg hover:bg-primary-container/80 transition-colors font-medium"
          >
            <Settings className="w-4 h-4" />
            定时任务配置
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-1 mb-4 border-b border-outline-variant/60" role="tablist" aria-label="招聘活动视图">
        {([
          ['all', '全部活动', Megaphone],
          ['recommended', '为你推荐', Sparkles],
          ['favorites', '我的收藏', Heart],
        ] as const).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={feedMode === mode}
            onClick={() => handleFeedModeChange(mode)}
            className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${feedMode === mode ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            <Icon className={`w-4 h-4 ${mode === 'favorites' && feedMode === mode ? 'fill-current' : ''}`} />
            {label}
            {feedMode === mode && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      <div className="bg-surface-container-low rounded-xl p-4 mb-6 border border-outline-variant/50">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索招聘活动、公司、学校..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-lg border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          {feedMode === 'all' && <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              showFilters
                ? 'bg-primary-container text-on-primary-container border-primary-container'
                : 'bg-surface text-on-surface border-outline-variant hover:bg-surface-container-high'
            }`}
          >
            <Filter className="w-4 h-4" />
            筛选
          </button>}
          <button
            onClick={handleSearch}
            className="px-6 py-2.5 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            搜索
          </button>
        </div>

        {showFilters && feedMode === 'all' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-4 pt-4 border-t border-outline-variant/50 grid grid-cols-3 gap-4"
          >
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1.5">活动类型</label>
              <select
                value={fairType}
                onChange={(e) => setFairType(e.target.value)}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="">全部类型</option>
                <option value="offline">线下宣讲</option>
                <option value="online">线上宣讲</option>
                <option value="dual">双选会</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1.5">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1.5">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div className="col-span-3 flex justify-end">
              <button
                onClick={handleResetFilters}
                className="text-sm text-on-surface-variant hover:text-primary transition-colors"
              >
                重置筛选条件
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-on-surface-variant">
          {feedMode === 'favorites' ? '已收藏' : feedMode === 'recommended' ? '为你筛选' : '共'} <span className="font-medium text-on-surface">{totalElements}</span> 场招聘活动
        </p>
      </div>

      {/* Career Fair List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-3 border-outline-variant border-t-primary-container rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-error mb-4">{error}</p>
          <button
            onClick={() => fetchCareerFairs(page)}
            className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg hover:bg-primary-container/80 transition-colors"
          >
            重试
          </button>
        </div>
      ) : careerFairs.length === 0 ? (
        <div className="text-center py-20 bg-surface-container-low rounded-xl border border-outline-variant/50">
          <Megaphone className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
          <p className="text-on-surface-variant">
            {feedMode === 'favorites' ? '还没有收藏的招聘活动' : feedMode === 'recommended' ? '暂无符合条件的推荐活动' : '暂无招聘活动'}
          </p>
          <p className="text-sm text-on-surface-variant/60 mt-1">
            {feedMode === 'favorites' ? '在活动详情中点击收藏后会显示在这里' : feedMode === 'recommended' ? '收藏或加入日程后，推荐会更贴近你的偏好' : '点击右上角“同步数据”按钮获取最新招聘活动'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {careerFairs.map((fair, index) => (
            <motion.div
              key={fair.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleOpenFair(fair)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') handleOpenFair(fair);
              }}
              className="bg-surface-container-low rounded-xl border border-outline-variant/50 p-5 hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary-container text-on-primary-container text-xs font-medium">
                      {getFairTypeLabel(fair.fairType)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-on-surface truncate group-hover:text-primary transition-colors">{fair.title}</h3>
                  {recommendReasons[fair.id] && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{recommendReasons[fair.id]}</span>
                    </p>
                  )}
                </div>
                {getStatusBadge(fair.fairDate)}
              </div>

              <div className="space-y-2 mb-4">
                {fair.companyName && (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <Building2 className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{fair.companyName}</span>
                  </div>
                )}
                {fair.universityName && (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <GraduationCap className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{fair.universityName}</span>
                  </div>
                )}
                {fair.venue && (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{fair.venue}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {formatDate(fair.fairDate)}
                    {fair.startTime && (
                      <span className="ml-1">
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        {formatTime(fair.startTime)}
                        {fair.endTime && ` - ${formatTime(fair.endTime)}`}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-outline-variant/30">
                <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{fair.viewCount || 0} 浏览</span>
                </div>
                <div className="flex items-center gap-2">
                  {fair.sourceUrl && (
                    <a
                      href={fair.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-lg transition-colors"
                      title="查看原文"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {(detailLoading || selectedFair) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => !stateSaving && (setSelectedFair(null), setDetailError(''))}
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(event) => event.stopPropagation()}
              className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-surface-container-low p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="text-sm font-medium text-primary">活动详情</span>
                <button
                  onClick={() => setSelectedFair(null)}
                  className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
                  title="关闭详情"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {detailLoading ? (
                <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
              ) : selectedFair && (
                <>
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 rounded-md bg-primary-container text-on-primary-container text-xs font-medium">
                        {getFairTypeLabel(selectedFair.fairType)}
                      </span>
                      {getStatusBadge(selectedFair.fairDate)}
                    </div>
                    <h2 className="text-2xl font-bold text-on-surface leading-tight">{selectedFair.title}</h2>
                  </div>

                  {detailError && <p className="mb-4 text-sm text-error">{detailError}</p>}
                  {fairState && (
                    <div className="grid grid-cols-2 gap-3 mb-7">
                      <button
                        onClick={() => handleUpdateFairState({ isFavorited: !fairState.isFavorited })}
                        disabled={stateSaving}
                        className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 font-medium transition-colors ${fairState.isFavorited ? 'border-error/40 bg-error-container text-on-error-container' : 'border-outline-variant text-on-surface hover:bg-surface-container-high'}`}
                      >
                        <Heart className={`w-4 h-4 ${fairState.isFavorited ? 'fill-current' : ''}`} />
                        {fairState.isFavorited ? '已收藏' : '收藏活动'}
                      </button>
                      <button
                        onClick={() => handleUpdateFairState({ isScheduled: !fairState.isScheduled })}
                        disabled={stateSaving}
                        className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 font-medium transition-colors ${fairState.isScheduled ? 'border-primary/40 bg-primary-container text-on-primary-container' : 'border-outline-variant text-on-surface hover:bg-surface-container-high'}`}
                      >
                        <CalendarPlus className="w-4 h-4" />
                        {fairState.isScheduled ? '已加入日程' : '加入日程'}
                      </button>
                    </div>
                  )}

                  <div className="space-y-3 border-y border-outline-variant/50 py-5 mb-6 text-sm text-on-surface-variant">
                    <div className="flex gap-3"><Calendar className="w-4 h-4 mt-0.5 shrink-0" /><span>{formatDate(selectedFair.fairDate)} {formatTime(selectedFair.startTime)}{selectedFair.endTime && ` - ${formatTime(selectedFair.endTime)}`}</span></div>
                    {selectedFair.companyName && <div className="flex gap-3"><Building2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{selectedFair.companyName}</span></div>}
                    {selectedFair.universityName && <div className="flex gap-3"><GraduationCap className="w-4 h-4 mt-0.5 shrink-0" /><span>{selectedFair.universityName}</span></div>}
                    {(selectedFair.venue || selectedFair.address) && <div className="flex gap-3"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /><span>{selectedFair.venue}{selectedFair.address && ` · ${selectedFair.address}`}</span></div>}
                  </div>
                  <div className="prose prose-sm max-w-none text-on-surface whitespace-pre-wrap">
                    {selectedFair.description || '暂无活动描述'}
                  </div>
                  {selectedFair.requirements && <div className="mt-6"><h3 className="font-semibold text-on-surface mb-2">参与要求</h3><p className="text-sm text-on-surface-variant whitespace-pre-wrap">{selectedFair.requirements}</p></div>}
                  {selectedFair.sourceUrl && <a href={selectedFair.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-8 text-sm font-medium text-primary hover:underline"><ExternalLink className="w-4 h-4" />查看原文</a>}
                </>
              )}
              {!detailLoading && detailError && !selectedFair && <p className="text-sm text-error">无法加载活动详情</p>}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pagination */}
      {!loading && !error && careerFairs.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 0}
            className="p-2 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => handlePageChange(i)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                i === page
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages - 1}
            className="p-2 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
