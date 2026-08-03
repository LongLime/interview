import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Search, ThumbsUp, Eye, FileText, Building2, TrendingUp } from 'lucide-react';
import { contributionApi, Company } from '../api/contribution';

const INTERVIEW_TYPES = [
  { value: '', label: '全部类型' },
  { value: 'SOCIAL', label: '社招' },
  { value: 'CAMPUS', label: '校招' },
  { value: 'INTERN', label: '实习' },
];

export default function ContributionPage() {
  const navigate = useNavigate();
  const [contributions, setContributions] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    companyId: '',
    year: '',
    type: '',
    keyword: '',
  });

  const [pagination, setPagination] = useState({
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadContributions();
  }, [filters, pagination.page]);

  const loadData = async () => {
    try {
      const [companiesRes, statsRes] = await Promise.all([
        contributionApi.listCompanies(),
        contributionApi.getStats(),
      ]);
      setCompanies(companiesRes);
      setStats(statsRes);
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  const loadContributions = async () => {
    setLoading(true);
    try {
      const res = await contributionApi.list({
        companyId: filters.companyId ? Number(filters.companyId) : undefined,
        year: filters.year ? Number(filters.year) : undefined,
        type: filters.type || undefined,
        position: filters.keyword || undefined,
        page: pagination.page,
        size: pagination.size,
      });
      setContributions(res.content);
      setPagination(prev => ({
        ...prev,
        totalElements: res.totalElements,
        totalPages: res.totalPages,
      }));
    } catch (error) {
      console.error('加载面经失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 0 }));
    loadContributions();
  };

  const getInterviewTypeLabel = (type: string) => {
    return INTERVIEW_TYPES.find(t => t.value === type)?.label || type;
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 md:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-primary-container text-on-primary rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
            <BookOpen className="w-5 h-5 sm:w-7 sm:h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-on-surface">面经分享</h1>
            <p className="text-sm sm:text-base text-on-surface-variant">分享大厂真实面试经验，帮助更多人</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/contribution/submit')}
          className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">贡献面经</span>
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 md:mb-8">
          <div className="bg-surface rounded-xl p-3 sm:p-5 border border-outline-variant">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-container/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold text-on-surface">{stats.totalContributions}</p>
                <p className="text-xs sm:text-sm text-on-surface-variant">累计面经</p>
              </div>
            </div>
          </div>
          <div className="bg-surface rounded-xl p-3 sm:p-5 border border-outline-variant">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-container/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold text-on-surface">{stats.totalQuestions}</p>
                <p className="text-xs sm:text-sm text-on-surface-variant">面试题目</p>
              </div>
            </div>
          </div>
          <div className="bg-surface rounded-xl p-3 sm:p-5 border border-outline-variant">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-status-success-bg text-status-success rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold text-on-surface">{stats.totalCompanies}</p>
                <p className="text-xs sm:text-sm text-on-surface-variant">覆盖公司</p>
              </div>
            </div>
          </div>
          <div className="bg-surface rounded-xl p-3 sm:p-5 border border-outline-variant">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-warning-container/20 text-warning rounded-lg flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold text-on-surface">{stats.thisMonthContributions}</p>
                <p className="text-xs sm:text-sm text-on-surface-variant">本月新增</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl p-3 sm:p-4 border border-outline-variant mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="w-5 h-5 text-outline flex-shrink-0" />
            <input
              type="text"
              placeholder="搜索公司、岗位..."
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-transparent border-none outline-none text-on-surface placeholder-text-outline min-w-0"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.companyId}
              onChange={(e) => setFilters({ ...filters, companyId: e.target.value })}
              className="px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface flex-1 sm:flex-none"
            >
              <option value="">全部公司</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filters.year}
              onChange={(e) => setFilters({ ...filters, year: e.target.value })}
              className="px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface flex-1 sm:flex-none"
            >
              <option value="">全部年份</option>
              {years.map(y => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface flex-1 sm:flex-none"
            >
              {INTERVIEW_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button
              onClick={handleSearch}
              className="px-4 py-2 btn-primary text-sm font-medium w-full sm:w-auto"
            >
              搜索
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      ) : contributions.length === 0 ? (
        <div className="bg-surface rounded-xl p-8 sm:p-12 border border-outline-variant text-center">
          <BookOpen className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-outline mb-4" />
          <h3 className="text-base sm:text-lg font-medium text-on-surface-variant mb-2">暂无面经</h3>
          <p className="text-sm sm:text-base text-outline mb-6">成为第一个分享面经的人吧！</p>
          <button
            onClick={() => navigate('/contribution/submit')}
            className="inline-flex items-center gap-2 btn-primary"
          >
            <Plus className="w-5 h-5" />
            贡献面经
          </button>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {contributions.map((item) => (
            <Link
              key={item.id}
              to={`/contribution/${item.id}`}
              className="block bg-surface rounded-xl p-4 sm:p-5 border border-outline-variant hover:border-primary-container/50 hover:shadow-lg transition-all group"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="text-base sm:text-lg font-semibold text-on-surface group-hover:text-primary transition-colors truncate">
                      {item.companyName}
                      {item.department && <span className="text-outline font-normal"> · {item.department}</span>}
                    </h3>
                    {item.position && (
                      <span className="px-2 py-0.5 bg-primary-container/10 text-primary text-xs rounded-full whitespace-nowrap">
                        {item.position}
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-xs rounded-full whitespace-nowrap">
                      {getInterviewTypeLabel(item.interviewType)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-on-surface-variant">
                    <span>{item.interviewYear}.{String(item.interviewMonth).padStart(2, '0')}</span>
                    <span className="hidden sm:inline">·</span>
                    <span>第{item.interviewRound}轮面试</span>
                    <span className="hidden sm:inline">·</span>
                    <span>{item.questionCount}道题目</span>
                    <span className="hidden sm:inline">·</span>
                    <span>👤 {item.anonymous ? '匿名用户' : item.contributorNickname}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs sm:text-sm text-outline flex-shrink-0">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {item.viewCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {item.helpfulCount}
                  </span>
                </div>
              </div>
              {item.categoryLabels && item.categoryLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {item.categoryLabels.map((label: string, idx: number) => (
                    <span key={idx} className="px-2 py-0.5 sm:py-1 bg-surface-container-lowest text-on-surface-variant text-xs rounded-md">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 mt-6 sm:mt-8">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 0}
              className="px-3 sm:px-4 py-2 bg-surface border border-outline-variant rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-lowest transition-colors text-sm"
            >
              上一页
            </button>
            <span className="px-3 sm:px-4 py-2 text-xs sm:text-sm text-on-surface-variant">
              第 {pagination.page + 1} / {pagination.totalPages} 页
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages - 1}
              className="px-3 sm:px-4 py-2 bg-surface border border-outline-variant rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-lowest transition-colors text-sm"
            >
              下一页
            </button>
          </div>
          <span className="text-xs text-outline">{pagination.totalElements} 条</span>
        </div>
      )}
    </div>
  );
}
