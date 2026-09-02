import { request } from './request';
import type {
  CreateInterviewRequest,
  CurrentQuestionResponse,
  InterviewReport,
  InterviewQuestion,
  InterviewSession,
  SubmitAnswerRequest,
  SubmitAnswerResponse
} from '../types/interview';

export interface TextSessionMeta {
  sessionId: string;
  skillId: string;
  difficulty: string;
  resumeId: number | null;
  totalQuestions: number;
  status: string;
  evaluateStatus: string | null;
  evaluateError: string | null;
  overallScore: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface UnifiedSessionResult {
  sessionId: string;
  resumeText: string;
  totalQuestions: number;
  currentQuestionIndex: number;
  questions: Array<{
    questionIndex: number;
    question: string;
    type: string;
    category: string;
    userAnswer: string | null;
    score: number | null;
    feedback: string | null;
  }>;
  status: InterviewSession['status'];
}

export const interviewApi = {
  /**
   * 列出所有文字面试会话
   */
  async listSessions(): Promise<TextSessionMeta[]> {
    const response = await request.get<TextSessionMeta[]>('/api/interview/sessions');
    return response.map(item => ({
      ...item,
      sessionId: String(item.sessionId),
    }));
  },

  /**
   * 创建面试会话
   */
  async createSession(req: CreateInterviewRequest): Promise<InterviewSession> {
    const result = await request.post<UnifiedSessionResult>('/api/interview/sessions', {
      resume_text: req.resumeText,
      question_count: req.questionCount,
      skill_id: req.skillId,
      difficulty: req.difficulty === 'senior' ? 'senior' : req.difficulty === 'junior' ? 'junior' : 'mid',
      resume_id: req.resumeId ?? null,
      force_create: req.forceCreate ?? false,
      llm_provider: req.llmProvider ?? null,
      custom_categories: req.customCategories ?? null,
      jd_text: req.jdText ?? null,
    }, {
      timeout: 180000, // 3分钟超时，AI生成问题需要时间
    });
    return {
      ...result,
      sessionId: String(result.sessionId),
      resumeText: result.resumeText || req.resumeText,
      questions: result.questions.map((item) => ({ ...item })),
    };
  },

  /**
   * 获取会话信息
   */
  async getSession(sessionId: string): Promise<InterviewSession> {
    throw new Error(`统一文字面试暂不支持恢复进行中的会话（会话 ${sessionId}）`);
  },

  /**
   * 获取当前问题
   */
  async getCurrentQuestion(sessionId: string): Promise<CurrentQuestionResponse> {
    throw new Error(`统一文字面试暂不支持读取当前问题（会话 ${sessionId}）`);
  },

  /**
   * 提交答案
   */
  async submitAnswer(req: SubmitAnswerRequest): Promise<SubmitAnswerResponse> {
    const result = await request.post<SubmitAnswerResponse>(
      `/api/interview/sessions/${req.sessionId}/answers`,
      { question_index: req.questionIndex, answer: req.answer },
      {
        timeout: 180000, // 3分钟超时
      }
    );
    return result;
  },

  /**
   * 获取面试报告
   */
  async getReport(sessionId: string): Promise<InterviewReport> {
    const result = await request.get<InterviewReport>(`/api/interview/sessions/${sessionId}/report`, {
      timeout: 180000, // 3分钟超时，AI评估需要时间
    });
    return { ...result, sessionId };
  },

  /**
   * 查找未完成的面试会话
   */
  async findUnfinishedSession(resumeId: number): Promise<InterviewSession | null> {
    void resumeId;
    return null;
  },

  /**
   * 暂存答案（不进入下一题）
   */
  async saveAnswer(req: SubmitAnswerRequest): Promise<void> {
    void req;
  },

  /**
   * 提前交卷
   */
  async completeInterview(sessionId: string): Promise<void> {
    await request.post(`/api/interview/sessions/${sessionId}/complete`, undefined, { timeout: 180000 });
  },

  async nextQuestion(sessionId: string, questionIndex: number): Promise<InterviewQuestion> {
    const result = await request.get<CurrentQuestionResponse>(
      `/api/interview/sessions/${sessionId}/question`,
      { timeout: 180000 },
    );
    if (result.completed || !result.question) {
      throw new Error('面试已完成，没有下一道问题');
    }
    return { ...result.question, questionIndex: questionIndex + 1 };
  },
};
