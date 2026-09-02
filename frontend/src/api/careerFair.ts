import type { AxiosRequestConfig } from 'axios';
import request from './request';

export interface CareerFair {
  id: number;
  externalId: string;
  title: string;
  companyName: string;
  universityName: string;
  venue: string;
  address: string;
  fairDate: string;
  startTime: string;
  endTime: string;
  fairType: string;
  industry: string;
  description: string;
  requirements: string;
  sourceUrl: string;
  posterUrl: string;
  contactInfo: string;
  viewCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CareerFairListItem = Pick<
  CareerFair,
  | 'id'
  | 'externalId'
  | 'title'
  | 'companyName'
  | 'universityName'
  | 'venue'
  | 'address'
  | 'fairDate'
  | 'startTime'
  | 'endTime'
  | 'fairType'
  | 'sourceUrl'
  | 'viewCount'
>;

export interface RecommendedCareerFair extends CareerFairListItem {
  recommendScore: number;
  recommendReason: string;
}

export interface CareerFairSearchRequest {
  keyword?: string;
  fairType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
}

export interface CareerFairUserState {
  isFavorited: boolean;
  isScheduled: boolean;
}

type UnifiedCareerFairUserState = {
  in_bookmark: boolean;
  in_schedule: boolean;
};

export interface CareerFairUserStateRequest {
  isFavorited: boolean;
  isScheduled: boolean;
}

export interface CareerFairSchedule {
  id: number;
  careerFairId: number | null;
  title: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  remindMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CareerFairScheduleRequest {
  careerFairId?: number | null;
  title: string;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  remindMinutes?: number | null;
}

export interface ScrapeTask {
  id: number;
  taskName: string;
  sourceUrl: string;
  description: string;
  cronExpression: string;
  isEnabled: boolean;
  status: string;
  lastRunTime: string;
  lastSuccessTime: string;
  lastRecordCount: number;
  totalRunCount: number;
  failCount: number;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScrapeTaskCreateRequest {
  taskName: string;
  sourceUrl: string;
  description?: string;
  cronExpression?: string;
}

export interface ScrapeRecord {
  id: number;
  taskId: number;
  taskName: string;
  sourceUrl: string;
  recordCount: number;
  newCount: number;
  updateCount: number;
  status: string;
  errorMessage: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

type UnifiedJobFair = {
  ID: number;
  source?: string;
  title?: string;
  enterprise_name?: string;
  hold_start_time?: string;
  hold_end_time?: string;
  hold_place_name?: string;
  group_recruit_name?: string;
  source_activity_id?: string | number;
};

type UnifiedJobFairDetail = {
  job_info?: Partial<UnifiedJobFair> & {
    dict_deleted_name?: string;
    content?: string;
    group_recruit_value?: string;
  };
  content?: string;
};

function mapJobFair(item: UnifiedJobFair): CareerFairListItem {
  const startTime = item.hold_start_time || '';
  const endTime = item.hold_end_time || '';
  return {
    id: item.ID,
    externalId: `${item.source || 'internal'}-${item.ID}`,
    title: item.title || '',
    companyName: item.enterprise_name || '',
    universityName: '',
    venue: item.hold_place_name || '',
    address: item.hold_place_name || '',
    fairDate: startTime.slice(0, 10),
    startTime,
    endTime,
    fairType: item.group_recruit_name || '',
    sourceUrl: '',
    viewCount: 0,
  };
}

function mapCareerFairState(state: UnifiedCareerFairUserState): CareerFairUserState {
  return {
    isFavorited: Boolean(state.in_bookmark),
    isScheduled: Boolean(state.in_schedule),
  };
}

function mapJobFairDetail(result: UnifiedJobFairDetail, id: number): CareerFair {
  const item: Partial<UnifiedJobFair> & {
    dict_deleted_name?: string;
    content?: string;
  } = result.job_info || {};
  const startTime = item.hold_start_time || '';
  const endTime = item.hold_end_time || '';
  return {
    ...mapJobFair({ ...item, ID: item.ID || id } as UnifiedJobFair),
    industry: '',
    description: result.content || item.content || '',
    requirements: '',
    posterUrl: '',
    contactInfo: '',
    isActive: item.dict_deleted_name !== '已删除',
    createdAt: '',
    updatedAt: '',
    startTime,
    endTime,
  };
}

type UnifiedSchedule = {
  ID: number;
  TARGET_ID?: number | null;
  TITLE?: string;
  COMPANY_NAME?: string | null;
  START_TIME?: string;
  END_TIME?: string | null;
  LOCATION?: string | null;
  NOTES?: string | null;
  REMIND_MINUTES?: number | null;
  CREATED_AT?: string;
};

function toCareerFairSchedulePayload(data: CareerFairScheduleRequest) {
  return {
    schedule_type: 'JOBFAIR',
    title: data.title,
    start_time: data.startTime,
    end_time: data.endTime || null,
    location: data.location || null,
    remind_minutes: data.remindMinutes ?? 60,
    notes: data.notes || null,
    ...(data.careerFairId == null
      ? {}
      : {
          target_type: 'MEETING',
          target_id: data.careerFairId,
          target_source: 'internal',
        }),
  };
}

function mapSchedule(item: UnifiedSchedule): CareerFairSchedule {
  return {
    id: item.ID,
    careerFairId: item.TARGET_ID ?? null,
    title: item.TITLE || item.COMPANY_NAME || '',
    startTime: item.START_TIME || '',
    endTime: item.END_TIME || null,
    location: item.LOCATION || null,
    notes: item.NOTES || null,
    remindMinutes: item.REMIND_MINUTES ?? null,
    createdAt: item.CREATED_AT || '',
    updatedAt: item.CREATED_AT || '',
  };
}

export interface ScrapeResult {
  success: boolean;
  totalCount: number;
  newCount: number;
  updateCount: number;
  message: string;
  errors: string[];
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface ScrapeProgress {
  status: 'connected' | 'started' | 'scraping' | 'saving' | 'completed' | 'failed' | 'error';
  message: string;
  progress: number;
  page: number;
  count: number;
}

export const careerFairApi = {
  searchCareerFairs: (params: CareerFairSearchRequest, config?: AxiosRequestConfig) =>
    request.post<{ list: UnifiedJobFair[]; total: number }>('/api/job_fairs', {
      date: params.startDate?.slice(0, 10),
      page: (params.page || 0) + 1,
      per_page: params.size || 12,
      keyword: params.keyword,
      event_type: params.fairType === '宣讲会' ? 'seminar' : params.fairType === '双选会' ? 'job_fair' : 'all',
      campus_scope: 'all',
      include_ended: true,
    }, config).then((result) => ({
      content: (result.list || []).map(mapJobFair),
      totalElements: Number(result.total || 0),
      totalPages: Math.max(1, Math.ceil(Number(result.total || 0) / (params.size || 12))),
      size: params.size || 12,
      number: params.page || 0,
    })),

  getUpcomingCareerFairs: (limit: number = 10) =>
    request.get<CareerFair[]>(`/api/career-fair/upcoming?limit=${limit}`),

  getCareerFairById: (id: number, source: string = 'internal') =>
    request.get<UnifiedJobFairDetail>(`/api/job_details/${source}/${id}`).then((result) => mapJobFairDetail(result, id)),

  getCareerFairState: (id: number, source: string = 'internal') =>
    request.get<UnifiedCareerFairUserState>(`/api/schedule/check/MEETING/${id}`, {
      params: { target_source: source },
    }).then(mapCareerFairState),

  updateCareerFairState: async (id: number, data: CareerFairUserStateRequest, source: string = 'internal') => {
    if (data.isFavorited) {
      await request.post('/api/schedule/favorite', {
        target_type: 'MEETING',
        target_id: id,
        target_source: source,
        schedule_type: 'BOOKMARK',
      });
    } else {
      await request.delete(`/api/schedule/favorite/MEETING/${id}`, {
        params: { schedule_type: 'BOOKMARK', target_source: source },
      });
    }
    return request.get<UnifiedCareerFairUserState>(`/api/schedule/check/MEETING/${id}`, {
      params: { target_source: source },
    }).then(mapCareerFairState);
  },

  getFavoriteCareerFairs: (params: { keyword?: string; page?: number; size?: number }, config?: AxiosRequestConfig) =>
    request.get<{ list: UnifiedSchedule[]; total: number }>('/api/stu_schedule/list', {
      ...config,
      params: { ...params, schedule_type: 'BOOKMARK' },
    }).then((result) => ({
      content: result.list.map((item) => ({
        id: item.TARGET_ID ?? item.ID,
        externalId: `bookmark-${item.TARGET_ID ?? item.ID}`,
        title: item.TITLE || '',
        companyName: item.COMPANY_NAME || '',
        universityName: '',
        venue: item.LOCATION || '',
        address: item.LOCATION || '',
        fairDate: item.START_TIME?.slice(0, 10) || '',
        startTime: item.START_TIME || '',
        endTime: item.END_TIME || '',
        fairType: '招聘活动',
        sourceUrl: '',
        viewCount: 0,
      })),
      totalElements: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / (params.size || 12))),
      size: params.size || 12,
      number: params.page || 0,
    })),

  getRecommendedCareerFairs: (data: { keyword?: string; limit?: number }, config?: AxiosRequestConfig) =>
    request.post<{ list: UnifiedJobFair[]; total: number }>('/api/recommendations', {
      keyword: data.keyword || '',
      limit: data.limit || 20,
      event_type: 'all',
      campus_scope: 'all',
    }, { timeout: 180000, ...config }).then((result) => result.list.map((item) => ({
      ...mapJobFair(item),
      recommendScore: Number((item as UnifiedJobFair & { recommend_score?: number }).recommend_score || 0),
      recommendReason: String((item as UnifiedJobFair & { recommend_reason?: string }).recommend_reason || ''),
    }))),

  getCareerFairSchedules: (params?: { startDate?: string; endDate?: string }) =>
    request.get<{ list: UnifiedSchedule[] }>('/api/stu_schedule/list', {
      params: { start: params?.startDate?.slice(0, 10), end: params?.endDate?.slice(0, 10) },
    }).then((result) => result.list.map(mapSchedule)),

  createCareerFairSchedule: (data: CareerFairScheduleRequest) =>
    request.post('/api/schedule/add', toCareerFairSchedulePayload(data)),

  updateCareerFairSchedule: (id: number, data: CareerFairScheduleRequest) =>
    request.put(`/api/schedule/${id}`, {
      ...toCareerFairSchedulePayload(data),
      company_name: null,
      position_name: null,
    }),

  deleteCareerFairSchedule: (id: number) =>
    request.delete<void>(`/api/schedule/${id}`),

  scrapeCareerFairs: (url: string, taskId?: number) =>
    request.post<ScrapeResult>(`/api/career-fair/scrape?url=${encodeURIComponent(url)}${taskId ? `&taskId=${taskId}` : ''}`),
};

export const scrapeTaskApi = {
  getAllTasks: () =>
    request.get<ScrapeTask[]>('/api/scrape-task'),

  getTaskById: (id: number) =>
    request.get<ScrapeTask>(`/api/scrape-task/${id}`),

  createTask: (data: ScrapeTaskCreateRequest) =>
    request.post<ScrapeTask>('/api/scrape-task', data),

  updateTask: (id: number, data: ScrapeTaskCreateRequest) =>
    request.put<ScrapeTask>(`/api/scrape-task/${id}`, data),

  deleteTask: (id: number) =>
    request.delete<void>(`/api/scrape-task/${id}`),

  toggleTaskStatus: (id: number) =>
    request.post<ScrapeTask>(`/api/scrape-task/${id}/toggle`),

  executeTask: (id: number) =>
    request.post<ScrapeResult>(`/api/scrape-task/${id}/execute`),

  getTaskRecords: (id: number, page: number = 0, size: number = 20) =>
    request.get<PageResponse<ScrapeRecord>>(`/api/scrape-task/${id}/records?page=${page}&size=${size}`),

  getAllRecords: (page: number = 0, size: number = 20) =>
    request.get<PageResponse<ScrapeRecord>>(`/api/scrape-task/records?page=${page}&size=${size}`),

  getRecentRecords: (limit: number = 10) =>
    request.get<ScrapeRecord[]>(`/api/scrape-task/records/recent?limit=${limit}`),
};

export const scrapeSseApi = {
  createEventSource: (taskId: number, onMessage: (data: ScrapeProgress) => void, onError?: () => void) => {
    const eventSource = new EventSource(`/api/scrape-sse/stream/${taskId}`);

    eventSource.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse(event.data) as ScrapeProgress;
        onMessage(data);
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    });

    eventSource.addEventListener('connected', (event) => {
      console.log('SSE connected:', event.data);
    });

    eventSource.onerror = () => {
      console.log('SSE connection error');
      onError?.();
      eventSource.close();
    };

    return eventSource;
  },

  executeWithProgress: (taskId: number) =>
    request.post<ScrapeResult>(`/api/scrape-sse/execute/${taskId}`),
};
