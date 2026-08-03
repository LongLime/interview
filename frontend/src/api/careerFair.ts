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

export interface CareerFairSearchRequest {
  keyword?: string;
  fairType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
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
  searchCareerFairs: (params: CareerFairSearchRequest) =>
    request.post<PageResponse<CareerFair>>('/api/career-fair/search', params),

  getUpcomingCareerFairs: (limit: number = 10) =>
    request.get<CareerFair[]>(`/api/career-fair/upcoming?limit=${limit}`),

  getCareerFairById: (id: number) =>
    request.get<CareerFair>(`/api/career-fair/${id}`),

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
