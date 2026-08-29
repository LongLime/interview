import { request } from './request';

// ========== 类型定义 ==========

export interface CreateSessionRequest {
  roleType?: string;
  skillId: string;
  difficulty?: string;
  customJdText?: string;
  resumeId?: number;
  introEnabled?: boolean;
  techEnabled?: boolean;
  projectEnabled?: boolean;
  hrEnabled?: boolean;
  plannedDuration?: number;
  llmProvider?: string;
}

export interface SessionResponse {
  sessionId: number;
  roleType: string;
  currentPhase: string;
  status: string;
  startTime: string;
  plannedDuration: number;
  webSocketUrl: string;
}

export interface InterviewMessage {
  id: number;
  sessionId: number;
  messageType: string;
  phase: string;
  userRecognizedText: string;
  aiGeneratedText: string;
  timestamp: string;
  sequenceNum: number;
}

export interface VoiceAnswerDetail {
  questionIndex: number;
  question: string;
  category: string;
  userAnswer: string;
  score: number;
  feedback: string;
  referenceAnswer?: string | null;
  keyPoints?: string[] | null;
}

export interface VoiceEvaluationDetail {
  sessionId: number;
  totalQuestions: number;
  overallScore: number;
  overallFeedback: string;
  strengths: string[];
  improvements: string[];
  answers: VoiceAnswerDetail[];
}

/**
 * Evaluation status response from GET/POST evaluation endpoints
 */
export interface EvaluationStatusResponse {
  evaluateStatus: string | null;  // PENDING | PROCESSING | COMPLETED | FAILED
  evaluateError?: string | null;
  evaluation?: VoiceEvaluationDetail | null;
}

/**
 * Session metadata for history list
 */
export interface SessionMeta {
  sessionId: number;
  roleType: string;
  status: string;
  currentPhase: string;
  createdAt: string;
  updatedAt: string;
  actualDuration?: number;
  messageCount: number;
  evaluateStatus?: string;
  evaluateError?: string;
}

// WebRTC 实时通话相关类型
export interface SdpExchangeResponse {
  answerSdp: string;
  model: string;
  voice: string;
  instructions: string;
}

export interface AppendMessageRequest {
  messageType: string;
  userText?: string | null;
  aiText?: string | null;
}

// ========== API 函数 ==========

export const voiceInterviewApi = {
  /**
   * 创建新的语音面试会话
   */
  async createSession(data: CreateSessionRequest): Promise<SessionResponse> {
    return request.post<SessionResponse>('/api/voice-interview/sessions', data);
  },

  /**
   * 获取会话详情
   */
  async getSession(sessionId: number): Promise<SessionResponse> {
    return request.get<SessionResponse>(`/api/voice-interview/sessions/${sessionId}`);
  },

  /**
   * 结束会话
   */
  async endSession(sessionId: number): Promise<void> {
    return request.post<void>(`/api/voice-interview/sessions/${sessionId}/end`);
  },

  /**
   * 获取会话消息列表
   */
  async getMessages(sessionId: number): Promise<InterviewMessage[]> {
    return request.get<InterviewMessage[]>(
      `/api/voice-interview/sessions/${sessionId}/messages`
    );
  },

  /**
   * 获取面试评估状态和结果（轮询）
   */
  async getEvaluation(sessionId: number): Promise<EvaluationStatusResponse> {
    return request.get<EvaluationStatusResponse>(
      `/api/voice-interview/sessions/${sessionId}/evaluation`
    );
  },

  /**
   * 触发异步评估生成
   */
  async generateEvaluation(sessionId: number): Promise<EvaluationStatusResponse> {
    return request.post<EvaluationStatusResponse>(
      `/api/voice-interview/sessions/${sessionId}/evaluation`
    );
  },

  /**
   * Pause interview session
   */
  async pauseSession(sessionId: number, reason: string = 'user_initiated'): Promise<void> {
    return request.put(
      `/api/voice-interview/sessions/${sessionId}/pause`,
      { reason }
    );
  },

  /**
   * Resume interview session
   */
  async resumeSession(sessionId: number): Promise<SessionResponse> {
    return request.put<SessionResponse>(
      `/api/voice-interview/sessions/${sessionId}/resume`
    );
  },

  /**
   * Get all sessions
   */
  async getAllSessions(userId?: string, status?: string): Promise<SessionMeta[]> {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (status) params.append('status', status);

    return request.get<SessionMeta[]>(
      `/api/voice-interview/sessions?${params.toString()}`
    );
  },

  /**
   * 删除语音面试会话
   */
  async deleteSession(sessionId: number): Promise<void> {
    return request.delete(`/api/voice-interview/sessions/${sessionId}`);
  },

  /**
   * WebRTC 通话：将浏览器 Offer SDP 交给后端代理交换，换取 Answer SDP 与会话配置
   */
  async exchangeSdp(sessionId: number, offerSdp: string): Promise<SdpExchangeResponse> {
    return request.post<SdpExchangeResponse>(
      `/api/voice-interview/sessions/${sessionId}/webrtc/sdp`,
      { offerSdp }
    );
  },

  /**
   * WebRTC 通话：回传一条转录消息（用户回答或面试官提问），用于存档与评分
   */
  async appendMessage(
    sessionId: number,
    message: AppendMessageRequest
  ): Promise<void> {
    return request.post<void>(
      `/api/voice-interview/sessions/${sessionId}/messages`,
      message
    );
  },

};

export default voiceInterviewApi;
