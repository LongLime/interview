import { AlertTriangle, ArrowLeft, BarChart3, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type CollegeAnalysisData } from '../api/dashboard';

const emptyData: CollegeAnalysisData = { college_demand: [], supply_demand_analysis: [], user_activity: [], inactive_students: [], graduation_year: '' };
const number = (value: number) => value.toLocaleString('zh-CN');

export default function DashboardCollegePage() {
  const navigate = useNavigate();
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    dashboardApi.getCollegeAnalysis().then(setData).catch(() => setError('学院数据加载失败，请稍后重试')).finally(() => setLoading(false));
  }, []);
  const maxRecruit = Math.max(1, ...data.college_demand.map(item => item.recruit_count));
  const maxActivity = Math.max(1, ...data.user_activity.map(item => item.browse_count));

  return <div className="mx-auto w-full max-w-6xl">
    <header className="mb-6 flex items-center gap-3"><button type="button" onClick={() => navigate('/profile')} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label="返回个人中心" title="返回个人中心"><ArrowLeft className="h-5 w-5" /></button><div><p className="text-sm text-on-surface-variant">就业办数据看板</p><h1 className="text-3xl font-bold text-on-surface">学院分析</h1></div></header>
    <div className="mb-6 flex gap-6 border-b border-outline-variant"><button type="button" onClick={() => navigate('/dashboard/overview')} className="px-1 pb-3 text-on-surface-variant hover:text-primary">全校概况</button><button type="button" className="border-b-2 border-primary px-1 pb-3 font-semibold text-primary">学院分析</button></div>
    {error && <div className="mb-6 flex items-center gap-2 border border-error/30 bg-error-container/30 p-4 text-error"><AlertTriangle className="h-5 w-5" />{error}</div>}
    {loading ? <DashboardLoading /> : <>
    <DashboardSection title="各学院岗位需求排行" icon={<BarChart3 className="h-5 w-5 text-primary" />}><div className="space-y-5">{data.college_demand.length ? data.college_demand.map(item => <div key={item.college_name}><div className="mb-2 flex justify-between text-sm"><span className="text-on-surface">{item.college_name || '未知学院'}</span><span className="text-on-surface-variant">{number(item.recruit_count)} 岗位</span></div><div className="h-2 bg-surface-container-high"><div className="h-full bg-primary" style={{ width: `${item.recruit_count / maxRecruit * 100}%` }} /></div></div>) : <EmptyDashboardState text="暂无学院岗位需求数据" />}</div></DashboardSection>
    <DashboardSection title={`各学院供需比分析${data.graduation_year ? ` · ${data.graduation_year}届` : ''}`} icon={<Users className="h-5 w-5 text-primary" />}><div className="grid gap-4 md:grid-cols-2">{data.supply_demand_analysis.length ? data.supply_demand_analysis.map(item => <div key={item.college_name} className="border border-outline-variant p-4"><div className="flex justify-between gap-3"><span className="font-medium text-on-surface">{item.college_name}</span><span className={item.warning ? 'font-semibold text-error' : 'text-primary'}>{item.ratio} ({item.status})</span></div><div className={`mt-3 h-2 ${item.warning ? 'bg-error-container' : 'bg-surface-container-high'}`}><div className={`h-full ${item.warning ? 'bg-error' : 'bg-primary'}`} style={{ width: `${Math.min(100, item.ratio_value * 50)}%` }} /></div><div className="mt-3 flex justify-between text-xs text-on-surface-variant"><span>毕业生: {number(item.student_count)}人</span><span>岗位: {number(item.recruit_count)}个</span></div></div>) : <EmptyDashboardState text="暂无学院供需分析数据" />}</div></DashboardSection>
    <DashboardSection title="学生活跃度分析" icon={<Search className="h-5 w-5 text-primary" />}><div className="space-y-5">{data.user_activity.length ? data.user_activity.map(item => <div key={item.college_name}><div className="mb-2 flex justify-between text-sm"><span className="text-on-surface">{item.college_name}</span><span className="text-on-surface-variant">{number(item.browse_count)} 人次</span></div><div className="h-2 bg-surface-container-high"><div className="h-full bg-secondary" style={{ width: `${item.browse_count / maxActivity * 100}%` }} /></div></div>) : <EmptyDashboardState text="暂无学生活跃度数据" />}</div><p className="mt-4 text-xs text-on-surface-variant">显示各学院近7日日均访问人次</p></DashboardSection>
    <DashboardSection title={`不活跃学生预警${data.graduation_year ? ` · ${data.graduation_year}届` : ''}`} icon={<AlertTriangle className="h-5 w-5 text-error" />}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.inactive_students.map(item => <div key={item.college_name} className="flex items-center justify-between border border-error/20 bg-error-container/20 p-4"><span className="text-sm text-on-surface">{item.college_name}</span><strong className="text-error">{number(item.inactive_count)}<small className="ml-1 font-normal">人</small></strong></div>)}</div><p className="mt-4 text-xs text-on-surface-variant">* 长期未访问定义：超过14个自然日未登录就业平台。建议辅导员进行定向指导。</p></DashboardSection>
    </>}
  </div>;
}

function DashboardLoading() {
  return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-outline-variant border-t-primary-container" /></div>;
}

function DashboardSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="mb-6 border border-outline-variant bg-surface p-6 shadow-sm"><h2 className="mb-5 flex items-center gap-2 text-lg text-on-surface">{icon}{title}</h2>{children}</section>; }

function EmptyDashboardState({ text }: { text: string }) {
  return <div className="flex h-32 items-center justify-center border border-dashed border-outline-variant text-sm text-on-surface-variant">{text}</div>;
}