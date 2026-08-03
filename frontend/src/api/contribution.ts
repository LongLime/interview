import request from './request';

export interface Company {
  id: number;
  name: string;
  shortName: string;
  tier: string;
}

export interface ContributionListItem {
  id: number;
  companyName: string;
  companyId: number;
  department: string;
  position: string;
  interviewYear: number;
  interviewMonth: number;
  interviewType: string;
  interviewRound: number;
  contributorNickname: string;
  anonymous: boolean;
  verified: boolean;
  viewCount: number;
  helpfulCount: number;
  questionCount: number;
  categoryLabels: string[];
  createdAt: string;
}

export interface QuestionDetail {
  id: number;
  questionText: string;
  followUpText: string;
  categoryKey: string;
  categoryLabel: string;
  difficulty: string;
  questionType: string;
  answerText: string;
  keyPoints: string[];
  topics: string[];
}

export interface ContributionDetail {
  id: number;
  companyName: string;
  companyId: number;
  department: string;
  position: string;
  interviewYear: number;
  interviewMonth: number;
  interviewType: string;
  interviewRound: number;
  contributorNickname: string;
  anonymous: boolean;
  verified: boolean;
  viewCount: number;
  helpfulCount: number;
  questions: QuestionDetail[];
  createdAt: string;
}

export interface ContributionStats {
  totalContributions: number;
  totalQuestions: number;
  totalCompanies: number;
  totalTopics: number;
  pendingReview: number;
  thisMonthContributions: number;
}

export interface QuestionSubmit {
  questionText: string;
  followUpText?: string;
  categoryKey?: string;
  categoryLabel?: string;
  difficulty?: string;
  questionType?: string;
  answerText?: string;
  keyPoints?: string[];
}

export interface ContributionSubmitRequest {
  companyId: number;
  department?: string;
  position: string;
  interviewYear: number;
  interviewMonth: number;
  interviewType?: string;
  interviewRound?: number;
  questions: QuestionSubmit[];
  contributorNickname?: string;
  anonymous: boolean;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export const contributionApi = {
  list: (params: {
    companyId?: number;
    position?: string;
    year?: number;
    type?: string;
    page?: number;
    size?: number;
  }): Promise<PageResponse<ContributionListItem>> => {
    return request.get('/api/contributions', { params });
  },

  getDetail: (id: number): Promise<ContributionDetail> => {
    return request.get(`/api/contributions/${id}`);
  },

  submit: (data: ContributionSubmitRequest): Promise<{ success: boolean; message: string; id: number }> => {
    return request.post('/api/contributions', data);
  },

  listCompanies: (): Promise<Company[]> => {
    return request.get('/api/contributions/companies');
  },

  listTopics: (): Promise<string[]> => {
    return request.get('/api/contributions/topics');
  },

  getStats: (): Promise<ContributionStats> => {
    return request.get('/api/contributions/stats');
  },

  markHelpful: (id: number): Promise<{ success: boolean; message: string }> => {
    return request.post(`/api/contributions/${id}/helpful`);
  },
};
