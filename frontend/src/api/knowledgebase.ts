import { getApiUrl, getErrorMessage, request } from './request';

// 向量化状态
export type VectorStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface KnowledgeBaseItem {
  id: number;
  name: string;
  category: string | null;
  originalFilename: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  questionCount: number;
  vectorStatus: VectorStatus;
  vectorError: string | null;
  chunkCount: number;
}

// 统计信息
export interface KnowledgeBaseStats {
  totalCount: number;
  totalQuestionCount: number;
  totalAccessCount: number;
  completedCount: number;
  processingCount: number;
}

export type SortOption = 'time' | 'size' | 'access' | 'question';

export interface UploadKnowledgeBaseResponse {
  knowledgeBase: {
    id: number;
    name: string;
    category: string;
    fileSize: number;
    contentLength: number;
  };
  storage: {
    fileKey: string;
    fileUrl: string;
  };
  duplicate: boolean;
}

interface UnifiedKnowledgeBase {
  id: number;
  name: string;
  description: string | null;
  document_count: number;
  created_at: string;
}

interface UnifiedDocument {
  doc_id: number;
  file_name: string;
  vector_status: string;
}

function mapKnowledgeBase(item: UnifiedKnowledgeBase): KnowledgeBaseItem {
  return {
    id: item.id,
    name: item.name,
    category: null,
    originalFilename: item.name,
    fileSize: 0,
    contentType: 'application/octet-stream',
    uploadedAt: item.created_at,
    lastAccessedAt: item.created_at,
    accessCount: 0,
    questionCount: 0,
    vectorStatus: item.document_count > 0 ? 'COMPLETED' : 'PROCESSING',
    vectorError: null,
    chunkCount: 0,
  };
}

export interface QueryRequest {
  knowledgeBaseIds: number[];  // 支持多个知识库
  question: string;
}

export interface QueryResponse {
  answer: string;
  knowledgeBaseId: number;
  knowledgeBaseName: string;
}

export const knowledgeBaseApi = {
  /**
   * 上传知识库文件
   */
  async uploadKnowledgeBase(file: File, name?: string, category?: string): Promise<UploadKnowledgeBaseResponse> {
    const base = await request.post<{ id: number; name: string; description: string | null }>(
      '/api/knowledge/bases',
      { name: name?.trim() || file.name, description: category || null },
    );
    const formData = new FormData();
    formData.append('file', file);
    const document = await request.upload<UnifiedDocument>(
      `/api/knowledge/bases/${base.id}/upload`,
      formData,
    );
    return {
      knowledgeBase: {
        id: base.id,
        name: base.name,
        category: category || '',
        fileSize: file.size,
        contentLength: file.size,
      },
      storage: { fileKey: document.file_name, fileUrl: '' },
      duplicate: false,
    };
  },

    /**
     * 下载知识库文件
     */
    async downloadKnowledgeBase(id: number): Promise<Blob> {
      throw new Error(`统一知识库暂不支持下载（知识库 ${id}）`);
    },

  /**
   * 获取所有知识库列表
   */
  async getAllKnowledgeBases(sortBy?: SortOption, vectorStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'): Promise<KnowledgeBaseItem[]> {
    const response = await request.get<{ list: UnifiedKnowledgeBase[] }>('/api/knowledge/bases');
    let result = response.list.map(mapKnowledgeBase);
    if (vectorStatus) result = result.filter(item => item.vectorStatus === vectorStatus);
    if (sortBy === 'size') result.sort((a, b) => b.fileSize - a.fileSize);
    return result;
  },

  /**
   * 获取知识库详情
   */
  async getKnowledgeBase(id: number): Promise<KnowledgeBaseItem> {
    const list = await this.getAllKnowledgeBases();
    const item = list.find(base => base.id === id);
    if (!item) throw new Error('知识库不存在');
    return item;
  },

  /**
   * 删除知识库
   */
  async deleteKnowledgeBase(id: number): Promise<void> {
    return request.delete(`/api/knowledge/bases/${id}`);
  },

  // ========== 分类管理 ==========

  /**
   * 获取所有分类
   */
  async getAllCategories(): Promise<string[]> {
    return [];
  },

  /**
   * 根据分类获取知识库
   */
  async getByCategory(category: string): Promise<KnowledgeBaseItem[]> {
    const list = await this.getAllKnowledgeBases();
    return list.filter(item => item.category === category);
  },

  /**
   * 获取未分类的知识库
   */
  async getUncategorized(): Promise<KnowledgeBaseItem[]> {
    const list = await this.getAllKnowledgeBases();
    return list.filter(item => !item.category);
  },

  /**
   * 更新知识库分类
   */
  async updateCategory(_id: number, _category: string | null): Promise<void> {
    throw new Error('统一知识库暂不支持分类管理');
  },

  // ========== 搜索 ==========

  /**
   * 搜索知识库
   */
  async search(keyword: string): Promise<KnowledgeBaseItem[]> {
    const list = await this.getAllKnowledgeBases();
    const normalized = keyword.toLowerCase();
    return list.filter(item => item.name.toLowerCase().includes(normalized));
  },

  // ========== 统计 ==========

  /**
   * 获取知识库统计信息
   */
  async getStatistics(): Promise<KnowledgeBaseStats> {
    const list = await this.getAllKnowledgeBases();
    return {
      totalCount: list.length,
      totalQuestionCount: list.reduce((sum, item) => sum + item.questionCount, 0),
      totalAccessCount: list.reduce((sum, item) => sum + item.accessCount, 0),
      completedCount: list.filter(item => item.vectorStatus === 'COMPLETED').length,
      processingCount: list.filter(item => item.vectorStatus === 'PROCESSING' || item.vectorStatus === 'PENDING').length,
    };
  },

  // ========== 向量化管理 ==========

  /**
   * 重新向量化知识库（手动重试）
   */
  async revectorize(id: number): Promise<void> {
    throw new Error(`统一知识库暂不支持重新向量化（知识库 ${id}）`);
  },

  /**
   * 基于知识库回答问题
   */
  async queryKnowledgeBase(_req: QueryRequest): Promise<QueryResponse> {
    throw new Error('统一知识库问答仅支持流式模式');
  },

  /**
   * 基于知识库回答问题（流式SSE）
   * 注意：SSE 使用 fetch API，不走统一的 axios 封装
   */
  async queryKnowledgeBaseStream(
    req: QueryRequest,
    onMessage: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(getApiUrl('/api/knowledgebase/query/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        // 尝试解析错误响应
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            throw new Error(errorData.message);
          }
        } catch {
          // 忽略解析错误
        }
        throw new Error(`请求失败 (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // 辅助函数：处理 data: 行并提取内容
      const extractContent = (line: string): string | null => {
        if (!line.startsWith('data:')) {
          return null;
        }
        let content = line.substring(5); // 移除 "data:" 前缀
        // SSE 标准：如果 data: 后第一个字符是空格，这是协议层面的空格，应该移除
        // 但这是可选的，有些实现可能没有这个空格
        if (content.startsWith(' ')) {
          content = content.substring(1);
        }
        // 如果内容为空（data: 或 data: ），可能表示换行，返回换行符
        if (content.length === 0) {
          return '\n';
        }
        return content;
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // 处理剩余的 buffer
          if (buffer) {
            const content = extractContent(buffer);
            if (content) {
              onMessage(content);
            }
          }
          onComplete();
          break;
        }

        // 解码数据块并添加到 buffer
        buffer += decoder.decode(value, { stream: true });

        // 按行分割处理 SSE 格式
        // SSE 格式：data: content\n 或 data:content\n，空行 \n\n 表示事件结束
        const lines = buffer.split('\n');
        // 保留最后一行（可能不完整，等待更多数据）
        buffer = lines.pop() || '';

        // 处理完整的行
        for (const line of lines) {
          const content = extractContent(line);
          if (content !== null) {
            // 发送内容（保留所有格式，包括空格、换行等，因为 Markdown 需要）
            onMessage(content);
          }
          // 空行（line === ''）在 SSE 中表示事件结束，但我们不需要特殊处理
          // 因为每个 data: 行已经是一个完整的数据块
        }
      }
    } catch (error) {
      onError(new Error(getErrorMessage(error)));
    }
  },
};
