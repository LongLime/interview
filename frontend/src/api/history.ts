import { request } from './request';

export type AnalyzeStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type EvaluateStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

function normalizeAnalyzeStatus(status: string): AnalyzeStatus {
  const normalized = status.toUpperCase();
  if (normalized === 'ANALYZING') return 'PROCESSING';
  if (normalized === 'PENDING' || normalized === 'COMPLETED' || normalized === 'FAILED') {
    return normalized;
  }
  return 'PENDING';
}

export interface ResumeListItem {
  id: number;
  filename: string;
  fileSize: number;
  uploadedAt: string;
  accessCount: number;
  latestScore?: number;
  lastAnalyzedAt?: string;
  interviewCount: number;
  analyzeStatus?: AnalyzeStatus;
  analyzeError?: string;
  storageUrl?: string;
}

export interface ResumeStats {
  totalCount: number;
  totalInterviewCount: number;
  totalAccessCount: number;
}

export interface AnalysisItem {
  id: number;
  overallScore: number;
  grade?: string | null;
  contentScore: number;
  structureScore: number;
  skillMatchScore: number;
  expressionScore: number;
  projectScore: number;
  summary: string;
  analyzedAt: string;
  strengths: string[];
  suggestions: unknown[];
  jobMatchResult?: MatchResultItem;
}

export interface InterviewItem {
  id: number;
  sessionId: string;
  totalQuestions: number;
  status: string;
  evaluateStatus?: EvaluateStatus;
  evaluateError?: string;
  overallScore: number | null;
  overallFeedback: string | null;
  createdAt: string;
  completedAt: string | null;
  questions?: unknown[];
  strengths?: string[];
  improvements?: string[];
  referenceAnswers?: unknown[];
}

export interface AnswerItem {
  questionIndex: number;
  question: string;
  category: string;
  userAnswer: string;
  score: number;
  feedback: string;
  referenceAnswer?: string;
  keyPoints?: string[];
  answeredAt: string;
}

export interface ResumeDetail {
  id: number;
  filename: string;
  fileSize: number;
  contentType: string;
  storageUrl: string;
  uploadedAt: string;
  accessCount: number;
  resumeText: string;
  analyzeStatus?: AnalyzeStatus;
  analyzeError?: string;
  analyses: AnalysisItem[];
  interviews: InterviewItem[];
}

export interface MatchResultItem {
  id: number;
  resumeId: number;
  jobTargetId: number | null;
  company: string | null;
  title: string | null;
  jdText: string;
  score: number | null;
  grade: string | null;
  verdict: string | null;
  hardExcluded: boolean;
  annotations: Array<Record<string, unknown>>;
  interviewTips: string;
  gaps: MatchGap[];
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchGap {
  requirement: string;
  weight: 'hard' | 'must' | 'nice';
  evidence: string | null;
  suggestion: string;
}

export interface InterviewDetail extends InterviewItem {
  evaluateStatus?: EvaluateStatus;
  evaluateError?: string;
  answers: AnswerItem[];
}

export const historyApi = {
  /**
   * 获取所有简历列表
   */
  async getResumes(): Promise<ResumeListItem[]> {
    const response = await request.get<Array<{
      id: number;
      filename: string;
      fileSize: number;
      uploadedAt: string;
      accessCount: number;
      latestScore?: number | null;
      lastAnalyzedAt?: string | null;
      interviewCount: number;
      analyzeStatus: string;
      analyzeError?: string | null;
      storageUrl?: string | null;
    }>>('/api/resumes');
    return response.map(resume => ({
      id: resume.id,
      filename: resume.filename,
      fileSize: resume.fileSize,
      uploadedAt: resume.uploadedAt,
      accessCount: resume.accessCount,
      latestScore: resume.latestScore ?? undefined,
      lastAnalyzedAt: resume.lastAnalyzedAt ?? undefined,
      interviewCount: resume.interviewCount,
      analyzeStatus: normalizeAnalyzeStatus(resume.analyzeStatus),
      analyzeError: resume.analyzeError ?? undefined,
      storageUrl: resume.storageUrl ?? undefined,
    }));
  },

  /**
   * 获取简历详情
   */
  async getResumeDetail(id: number): Promise<ResumeDetail> {
    const resume = await request.get<{
        id: number;
        filename: string;
        fileSize: number;
        contentType: string;
        storageUrl: string;
        uploadedAt: string;
        accessCount: number;
        resumeText: string;
        analyzeStatus: string;
        analyzeError?: string | null;
        analyses: AnalysisItem[];
        interviews: InterviewItem[];
    }>(`/api/resumes/${id}/detail`);
    return {
      id: resume.id,
      filename: resume.filename,
      fileSize: resume.fileSize,
      contentType: resume.contentType,
      storageUrl: resume.storageUrl,
      uploadedAt: resume.uploadedAt,
      accessCount: resume.accessCount,
      resumeText: resume.resumeText,
      analyzeStatus: normalizeAnalyzeStatus(resume.analyzeStatus),
      analyzeError: resume.analyzeError ?? undefined,
      analyses: resume.analyses,
      interviews: resume.interviews,
    };
  },

  /**
   * 获取该简历的岗位匹配结果
   */
  async getMatchResults(id: number): Promise<MatchResultItem[]> {
    return request.get<MatchResultItem[]>(`/api/match/resume/${id}`);
  },

  /**
   * 获取面试详情
   */
  async getInterviewDetail(sessionId: string): Promise<InterviewDetail> {
    return request.get<InterviewDetail>(`/api/interview/sessions/${sessionId}/details`);
  },

  /**
   * 导出简历分析报告PDF
   */
  async exportAnalysisPdf(resumeId: number): Promise<Blob> {
    const response = await request.getInstance().get(`/api/resumes/${resumeId}/export`, {
      responseType: 'blob',
      skipResultTransform: true,
    } as never);
    return response.data;
  },

  /**
   * 导出面试报告PDF
   */
  async exportInterviewPdf(sessionId: string): Promise<Blob> {
    const response = await request.getInstance().get(`/api/interview/sessions/${sessionId}/export`, {
      responseType: 'blob',
      skipResultTransform: true,
    } as never);
    return response.data;
  },

  /**
   * 删除简历
   */
  async deleteResume(id: number): Promise<void> {
    return request.delete(`/api/resumes/${id}`);
  },

  /**
   * 删除面试记录
   */
  async deleteInterview(sessionId: string): Promise<void> {
    return request.delete(`/api/interview/sessions/${sessionId}`);
  },

  /**
   * 获取简历统计信息
   */
  async getStatistics(): Promise<ResumeStats> {
    return request.get<ResumeStats>('/api/resumes/statistics');
  },

  /**
   * 重新分析简历
   */
  async reanalyze(id: number): Promise<void> {
    return request.post(`/api/resumes/${id}/reanalyze`);
  },
};
