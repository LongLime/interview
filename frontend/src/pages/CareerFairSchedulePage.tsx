import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  MapPin,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  careerFairApi,
  type CareerFairSchedule,
  type CareerFairScheduleRequest,
} from '../api/careerFair';
import { getErrorMessage } from '../api/request';

type ScheduleForm = {
  careerFairId: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  remindMinutes: string;
};

const emptyForm: ScheduleForm = {
  careerFairId: '',
  title: '',
  startTime: '',
  endTime: '',
  location: '',
  notes: '',
  remindMinutes: '60',
};

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toLocalInput = (value: Date) => `${dateKey(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
const formatTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function toRequest(form: ScheduleForm): CareerFairScheduleRequest {
  return {
    careerFairId: form.careerFairId ? Number(form.careerFairId) : null,
    title: form.title.trim(),
    startTime: new Date(form.startTime).toISOString(),
    endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
    location: form.location.trim() || null,
    notes: form.notes.trim() || null,
    remindMinutes: form.remindMinutes ? Number(form.remindMinutes) : null,
  };
}

export default function CareerFairSchedulePage() {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey(today));
  const [schedules, setSchedules] = useState<CareerFairSchedule[]>([]);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const days = useMemo(() => monthDays(month), [month]);
  const visibleStart = dateKey(days[0]);
  const visibleEnd = dateKey(days[days.length - 1]);
  const selectedSchedules = schedules.filter((item) => item.startTime.slice(0, 10) === selectedDate);

  const loadSchedules = async () => {
    setLoading(true);
    setError('');
    try {
      setSchedules(await careerFairApi.getCareerFairSchedules({
        startDate: `${visibleStart}T00:00:00`,
        endDate: `${visibleEnd}T23:59:59`,
      }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchedules();
  }, [visibleStart, visibleEnd]);

  const openCreate = (date = selectedDate) => {
    const start = new Date(`${date}T09:00:00`);
    const end = new Date(`${date}T10:00:00`);
    setEditingId(null);
    setForm({ ...emptyForm, startTime: toLocalInput(start), endTime: toLocalInput(end) });
    setShowForm(true);
  };

  const openEdit = (item: CareerFairSchedule) => {
    setEditingId(item.id);
    setForm({
      careerFairId: item.careerFairId ? String(item.careerFairId) : '',
      title: item.title,
      startTime: toLocalInput(new Date(item.startTime)),
      endTime: item.endTime ? toLocalInput(new Date(item.endTime)) : '',
      location: item.location || '',
      notes: item.notes || '',
      remindMinutes: item.remindMinutes == null ? '' : String(item.remindMinutes),
    });
    setShowForm(true);
  };

  const saveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.startTime) return;
    setSaving(true);
    setError('');
    try {
      const payload = toRequest(form);
      if (editingId) {
        await careerFairApi.updateCareerFairSchedule(editingId, payload);
      } else {
        await careerFairApi.createCareerFairSchedule(payload);
      }
      setShowForm(false);
      await loadSchedules();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async (item: CareerFairSchedule) => {
    if (!window.confirm(`确定删除“${item.title}”吗？`)) return;
    try {
      await careerFairApi.deleteCareerFairSchedule(item.id);
      await loadSchedules();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-full bg-surface px-4 py-6 text-on-surface md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Calendar className="h-5 w-5" />
              <span className="text-sm font-semibold">招聘活动</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">招聘日程</h1>
            <p className="mt-1 text-sm text-on-surface-variant">把宣讲会、双选会和投递提醒放在同一条时间线上。</p>
          </div>
          <button type="button" onClick={() => openCreate()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:opacity-90">
            <Plus className="h-4 w-4" /> 新建日程
          </button>
        </header>

        {error && <div className="mb-4 rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">{error}</div>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-xl border border-outline-variant bg-surface-container-low p-4 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{month.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</h2>
              <div className="flex items-center gap-1">
                <button type="button" title="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md p-2 hover:bg-surface-container-high"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(dateKey(today)); }} className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-surface-container-high">今天</button>
                <button type="button" title="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md p-2 hover:bg-surface-container-high"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-l border-t border-outline-variant">
              {['日', '一', '二', '三', '四', '五', '六'].map((label) => <div key={label} className="border-b border-r border-outline-variant px-2 py-2 text-center text-xs text-on-surface-variant">{label}</div>)}
              {days.map((day) => {
                const key = dateKey(day);
                const count = schedules.filter((item) => item.startTime.slice(0, 10) === key).length;
                const inMonth = day.getMonth() === month.getMonth();
                return <button key={key} type="button" onClick={() => setSelectedDate(key)} className={`min-h-20 border-b border-r border-outline-variant p-2 text-left transition-colors ${inMonth ? 'text-on-surface' : 'text-on-surface-variant/50'} ${key === selectedDate ? 'bg-primary-container' : 'hover:bg-surface-container-high'}`}>
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${key === dateKey(today) ? 'bg-primary font-semibold text-on-primary' : ''}`}>{day.getDate()}</span>
                  {count > 0 && <span className="mt-2 block text-xs font-semibold text-primary">{count} 条日程</span>}
                </button>;
              })}
            </div>
          </section>

          <aside className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><p className="text-xs text-on-surface-variant">选中日期</p><h2 className="mt-1 font-semibold">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</h2></div>
              <button type="button" title="添加当天日程" onClick={() => openCreate(selectedDate)} className="rounded-md bg-secondary-container p-2 text-on-secondary-container hover:opacity-80"><Plus className="h-4 w-4" /></button>
            </div>
            {loading ? <div className="py-10 text-center text-sm text-on-surface-variant">正在加载...</div> : selectedSchedules.length === 0 ? <div className="border-t border-outline-variant py-10 text-center text-sm text-on-surface-variant">当天暂无招聘日程</div> : <div className="space-y-3 border-t border-outline-variant pt-4">{selectedSchedules.map((item) => <article key={item.id} className="rounded-lg border border-outline-variant bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.title}</h3><div className="mt-2 flex items-center gap-2 text-sm text-primary"><Clock3 className="h-4 w-4" />{formatTime(item.startTime)}{item.endTime && ` - ${formatTime(item.endTime)}`}</div>{item.location && <div className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant"><MapPin className="h-3.5 w-3.5" />{item.location}</div>}</div><div className="flex gap-1"><button type="button" title="编辑" onClick={() => openEdit(item)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary"><Edit3 className="h-4 w-4" /></button><button type="button" title="删除" onClick={() => void removeSchedule(item)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error"><Trash2 className="h-4 w-4" /></button></div></div>{item.notes && <p className="mt-3 border-t border-outline-variant pt-3 text-xs leading-5 text-on-surface-variant">{item.notes}</p>}</article>)}</div>}
          </aside>
        </div>

        {showForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 md:items-center md:p-4"><form onSubmit={saveSchedule} className="w-full max-w-xl rounded-t-xl bg-surface p-6 shadow-xl md:rounded-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{editingId ? '编辑日程' : '新建日程'}</h2><button type="button" title="关闭" onClick={() => setShowForm(false)} className="rounded-md p-2 hover:bg-surface-container-high"><X className="h-4 w-4" /></button></div><div className="grid gap-4 md:grid-cols-2"><label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">标题</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary" placeholder="例如：春季双选会" /></label><label><span className="mb-1 block text-sm font-medium">开始时间</span><input required type="datetime-local" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary" /></label><label><span className="mb-1 block text-sm font-medium">结束时间</span><input type="datetime-local" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary" /></label><label><span className="mb-1 block text-sm font-medium">关联活动 ID</span><input type="number" value={form.careerFairId} onChange={(event) => setForm({ ...form, careerFairId: event.target.value })} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary" placeholder="可留空" /></label><label><span className="mb-1 block text-sm font-medium">提醒提前分钟</span><input type="number" min="0" max="10080" value={form.remindMinutes} onChange={(event) => setForm({ ...form, remindMinutes: event.target.value })} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary" /></label><label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">地点</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary" placeholder="线上会议或线下场馆" /></label><label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">备注</span><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium hover:bg-surface-container-high">取消</button><button disabled={saving} type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"><Save className="h-4 w-4" />{saving ? '保存中...' : '保存日程'}</button></div></form></div>}
      </div>
    </div>
  );
}
