// 简历分析响应类型
export interface ResumeAnalysisResponse {
  overallScore: number;
  scoreDetail: ScoreDetail;
  summary: string;
  strengths: string[];
  suggestions: Suggestion[];
  originalText: string;
}

// 存储信息
export interface StorageInfo {
  fileKey: string;
  fileUrl: string;
  resumeId?: number;
}

// 上传API完整响应（异步模式：analysis 可能为空）
export interface UploadResponse {
  analysis?: ResumeAnalysisResponse;
  storage: StorageInfo;
  duplicate?: boolean;
  message?: string;
}

export interface ScoreDetail {
  contentScore: number;      // 内容完整性 (0-25)
  structureScore: number;    // 结构清晰度 (0-20)
  skillMatchScore: number;   // 说服力 (0-40)
  expressionScore: number;   // 表达专业性 (0-15)
  projectScore: number;      // 旧 API 兼容字段，固定为 0，不参与评分
}

export interface Suggestion {
  category: string;         // 建议类别
  priority: '高' | '中' | '低';
  issue: string;            // 问题描述
  recommendation: string;   // 具体建议
}

export interface ApiError {
  error: string;
  detectedType?: string;
  allowedTypes?: string[];
}
