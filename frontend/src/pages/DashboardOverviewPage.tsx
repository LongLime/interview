import { AlertTriangle, ArrowLeft, BarChart3, Building2, CalendarDays, Share2, TrendingUp, Users, BriefcaseBusiness } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type OverviewData } from '../api/dashboard';

const emptyOverview: OverviewData = { meeting_count: 0, company_count: 0, position_count: 0, recruit_total: 0, graduate_count: 0, graduation_year: '', supply_demand_ratio: '1:0', monthly_trend: [], hot_positions: [] };
const number = (value: number) => value.toLocaleString('zh-CN');

export default function DashboardOverviewPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    dashboardApi.getOverview().then(setOverview).catch(() => setError('看板数据加载失败，请稍后重试')).finally(() => setLoading(false));
  }, []);
  const maxMeeting = useMemo(() => Math.max(1, ...overview.monthly_trend.map(item => item.meeting_count)), [overview.monthly_trend]);
  const maxCompany = useMemo(() => Math.max(1, ...overview.monthly_trend.map(item => item.company_count)), [overview.monthly_trend]);
  const maxRecruit = Math.max(1, ...overview.hot_positions.map(item => item.recruit_count));
  const cards = [["招聘会总场次", overview.meeting_count, CalendarDays], ["参会单位数", overview.company_count, Building2], ["发布岗位数", overview.position_count, BriefcaseBusiness], ["应届毕业生", overview.graduate_count, Users]] as const;

  return <div className="mx-auto w-full max-w-6xl">
    <header className="mb-6 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><button type="button" onClick={() => navigate('/profile')} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label="返回个人中心" title="返回个人中心"><ArrowLeft className="h-5 w-5" /></button><div><p className="text-sm text-on-surface-variant">就业办数据看板</p><h1 className="text-3xl font-bold text-on-surface">全校概况</h1></div></div><button type="button" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label="分享看板" title="分享看板"><Share2 className="h-5 w-5" /></button></header>
    <div className="mb-6 flex gap-6 border-b border-outline-variant"><button type="button" className="border-b-2 border-primary px-1 pb-3 font-semibold text-primary">全校概况</button><button type="button" onClick={() => navigate('/dashboard/college')} className="px-1 pb-3 text-on-surface-variant hover:text-primary">学院分析</button></div>
    {error && <div className="mb-6 flex items-center gap-2 border border-error/30 bg-error-container/30 p-4 text-error"><AlertTriangle className="h-5 w-5" />{error}</div>}
    {loading ? <DashboardLoading /> : <>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <div key={label} className="border border-outline-variant bg-surface p-5 shadow-sm"><Icon className="mb-4 h-5 w-5 text-primary" /><p className="text-sm text-on-surface-variant">{label}</p><p className="mt-2 text-3xl font-bold text-on-surface">{number(value)}</p></div>)}<div className="border border-primary bg-primary p-5 text-on-primary shadow-sm sm:col-span-2 lg:col-span-4"><p className="text-sm opacity-80">供需比（岗位/毕业生）</p><p className="mt-2 text-3xl font-bold">{overview.supply_demand_ratio}</p></div></section>
    <section className="mt-6 grid gap-4 lg:grid-cols-2"><div className="border border-amber-300/60 bg-amber-50 p-5 dark:bg-amber-950/30"><div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200"><AlertTriangle className="h-5 w-5" />专业需求预警</div><p className="mt-3 text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">传统艺术、基础公共管理类专业供需比低于1:0.8，建议加强此类专业的校企精准对接。</p></div><div className="border border-emerald-300/60 bg-emerald-50 p-5 dark:bg-emerald-950/30"><div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200"><TrendingUp className="h-5 w-5" />优质企业引进</div><p className="mt-3 text-sm leading-6 text-emerald-900/80 dark:text-emerald-100/80">世界500强企业进校数同比增长15.4%，高薪岗位储备充足，就业质量稳步提升。</p></div></section>
    <section className="mt-6 border border-outline-variant bg-surface p-6 shadow-sm"><div className="mb-6 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg text-on-surface"><BarChart3 className="h-5 w-5 text-primary" />招聘趋势集成分析</h2><div className="flex gap-4 text-xs text-on-surface-variant"><span><i className="mr-1 inline-block h-2 w-2 bg-primary" />场次</span><span><i className="mr-1 inline-block h-2 w-2 bg-secondary-container" />单位</span></div></div>{overview.monthly_trend.length ? <div className="flex h-56 items-end gap-3 overflow-x-auto border-b border-outline-variant pb-2">{overview.monthly_trend.map(item => <div key={item.month} className="flex min-w-12 flex-1 flex-col items-center gap-2"><div className="flex h-44 items-end gap-1"><span className="w-3 bg-secondary-container" style={{ height: `${Math.max(8, item.company_count / maxCompany * 100)}%` }} /><span className="w-3 bg-primary" style={{ height: `${Math.max(8, item.meeting_count / maxMeeting * 100)}%` }} /></div><span className="text-xs text-on-surface-variant">{item.month.slice(5)}月</span></div>)}</div> : <EmptyDashboardState text="暂无招聘会趋势数据" />}</section>
    <section className="mt-6 border border-outline-variant bg-surface p-6 shadow-sm"><h2 className="mb-5 text-lg text-on-surface">热门岗位 TOP 5</h2>{overview.hot_positions.length ? <div className="space-y-4">{overview.hot_positions.map((item, index) => <div key={item.position_name} className="flex items-center gap-4"><span className="w-6 font-semibold text-primary">{index + 1}.</span><span className="w-32 truncate text-sm text-on-surface sm:w-48">{item.position_name}</span><div className="h-2 flex-1 bg-surface-container-high"><div className="h-full bg-primary" style={{ width: `${item.recruit_count / maxRecruit * 100}%` }} /></div><span className="w-20 text-right text-sm text-on-surface-variant">{number(item.recruit_count)} 人</span></div>)}</div> : <EmptyDashboardState text="暂无岗位招聘数据" />}</section>
    </>}
  </div>;
}

function DashboardLoading() {
  return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-outline-variant border-t-primary-container" /></div>;
}

function EmptyDashboardState({ text }: { text: string }) {
  return <div className="flex h-40 items-center justify-center border border-dashed border-outline-variant text-sm text-on-surface-variant">{text}</div>;
}