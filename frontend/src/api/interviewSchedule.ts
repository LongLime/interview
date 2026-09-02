// frontend/src/api/interviewSchedule.ts

import { request } from './request';
import type {
  InterviewSchedule,
  CreateInterviewRequest,
  ParseRequest,
  ParseResponse,
  InterviewStatus
} from '../types/interviewSchedule';

type UnifiedSchedule = {
  ID: number;
  SCHEDULE_TYPE?: string;
  TITLE?: string;
  COMPANY_NAME?: string | null;
  POSITION_NAME?: string | null;
  START_TIME?: string;
  END_TIME?: string | null;
  LOCATION?: string | null;
  MEETING_LINK?: string | null;
  STATUS?: number | string;
  RESULT?: string | null;
  NOTES?: string | null;
  REMIND_MINUTES?: number | null;
};

function mapSchedule(item: UnifiedSchedule): InterviewSchedule {
  const startTime = item.START_TIME || '';
  return {
    id: item.ID,
    companyName: item.COMPANY_NAME || '',
    position: item.POSITION_NAME || item.TITLE || '',
    interviewTime: startTime,
    interviewType: item.MEETING_LINK ? 'VIDEO' : 'ONSITE',
    meetingLink: item.MEETING_LINK || '',
    roundNumber: 1,
    notes: [item.LOCATION, item.END_TIME ? `结束时间：${item.END_TIME}` : null, item.RESULT, item.NOTES]
      .filter(Boolean)
      .join('；'),
    status: 'PENDING',
    createdAt: startTime,
    updatedAt: startTime,
  };
}

function toSchedulePayload(data: CreateInterviewRequest) {
  return {
    schedule_type: 'INTERVIEW',
    title: data.companyName && data.position
      ? `${data.companyName}-${data.position}`
      : data.companyName || data.position || '面试',
    company_name: data.companyName || null,
    position_name: data.position || null,
    start_time: data.interviewTime,
    online_type: data.interviewType === 'ONSITE' ? 'OFFLINE' : data.interviewType || null,
    meeting_link: data.meetingLink || null,
    notes: [data.interviewer ? `面试官：${data.interviewer}` : null, data.notes || null]
      .filter(Boolean)
      .join('；') || null,
  };
}

function fallbackSchedule(
  data: CreateInterviewRequest,
  id: number,
  status: InterviewStatus = 'PENDING',
): InterviewSchedule {
  return {
    id,
    companyName: data.companyName,
    position: data.position,
    interviewTime: data.interviewTime,
    interviewType: data.interviewType || 'ONSITE',
    meetingLink: data.meetingLink,
    roundNumber: data.roundNumber || 1,
    interviewer: data.interviewer,
    notes: data.notes,
    status,
    createdAt: data.interviewTime,
    updatedAt: data.interviewTime,
  };
}

export const interviewScheduleApi = {
  parse: async (rawText: string, source?: 'feishu' | 'tencent' | 'zoom' | 'other'): Promise<ParseResponse> => {
    const payload: ParseRequest = { rawText, source };
    return await request.post<ParseResponse>('/api/interview-schedule/parse', payload);
  },

  create: async (data: CreateInterviewRequest): Promise<InterviewSchedule> => {
    await request.post('/api/schedule/add', toSchedulePayload(data));
    const schedules = await interviewScheduleApi.getAll();
    return schedules.find((item) => item.interviewTime === data.interviewTime && item.companyName === data.companyName)
      || fallbackSchedule(data, 0);
  },

  getById: async (id: number): Promise<InterviewSchedule> => {
    return await request.get<InterviewSchedule>(`/api/interview-schedule/${id}`);
  },

  getAll: async (params?:{
    status?: string;
    start?: string;
    end?: string;
  }): Promise<InterviewSchedule[]> => {
    const result = await request.get<{ list: UnifiedSchedule[] }>('/api/stu_schedule/list', {
      params: { start: params?.start, end: params?.end, schedule_type: 'INTERVIEW' },
    });
    return result.list.map(mapSchedule);
  },

  update: async (id: number, data: CreateInterviewRequest): Promise<InterviewSchedule> => {
    await request.put(`/api/schedule/${id}`, toSchedulePayload(data));
    const schedules = await interviewScheduleApi.getAll();
    return schedules.find((item) => item.id === id) || fallbackSchedule(data, id);
  },

  delete: async (id: number): Promise<void> => {
    await request.delete(`/api/schedule/${id}`);
  },

  updateStatus: async (id: number, status: InterviewStatus): Promise<InterviewSchedule> => {
    await request.patch(`/api/schedule/${id}/status`, null, { params: { result: status } });
    const schedules = await interviewScheduleApi.getAll();
    return schedules.find((item) => item.id === id) || fallbackSchedule({
      companyName: '',
      position: '',
      interviewTime: '',
    }, id, status);
  },
};
