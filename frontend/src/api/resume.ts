import { request } from './request';
import type { UploadResponse } from '../types/resume';

export const resumeApi = {
  /**
   * 上传简历并获取分析结果
   */
  async uploadAndAnalyze(file: File, options?: {
    mode?: 'GENERAL' | 'CUSTOM_JD';
    title?: string;
    company?: string;
    jdText?: string;
  }): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.mode) formData.append('analysis_mode', options.mode);
    if (options?.title) formData.append('job_title', options.title);
    if (options?.company) formData.append('company_name', options.company);
    if (options?.jdText) formData.append('jd_text', options.jdText);
    return request.upload<{
      storage: { fileKey: string; fileUrl: string; resumeId: number };
      status: string;
    }>('/api/resumes/upload', formData).then((result) => ({
      storage: {
        fileKey: result.storage.fileKey,
        fileUrl: result.storage.fileUrl,
        resumeId: result.storage.resumeId,
      },
      message: result.status,
    }));
  },

  /**
   * 根据自定义 JD 分析简历
   */
  async analyzeAgainstJd(payload: {
    resumeId: number;
    jdText: string;
    title: string;
    company?: string;
  }): Promise<{ id: number; score: number | null; status: string }> {
    return request.post('/api/match/analyze-single', {
      resume_id: payload.resumeId,
      jd_text: payload.jdText,
      title: payload.title,
      company: payload.company || undefined,
    });
  },

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ status: string; service: string }> {
    return request.get('/health');
  },
};
