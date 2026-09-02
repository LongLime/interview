import { getApiUrl, request, getErrorMessage } from './request';

// ========== 类型定义 ==========

export interface RagChatSession {
  id: number;
  title: string;
  knowledgeBaseIds: number[];
  createdAt: string;
}

interface UnifiedChat {
  id: number;
  title: string;
  message_count: number;
  created_at: string;
}

interface UnifiedChatGroup {
  kb_id: number;
  kb_name: string;
  chats: UnifiedChat[];
}

export interface RagChatSessionListItem {
  id: number;
  title: string;
  messageCount: number;
  knowledgeBaseNames: string[];
  knowledgeBaseIds?: number[];
  updatedAt: string;
  isPinned: boolean;
}

export interface RagChatMessage {
  id: number;
  type: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface KnowledgeBaseItem {
  id: number;
  name: string;
  originalFilename: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  questionCount: number;
}

export interface RagChatSessionDetail {
  id: number;
  title: string;
  knowledgeBases: KnowledgeBaseItem[];
  messages: RagChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ========== API 函数 ==========

export const ragChatApi = {
  /**
   * 创建新会话
   */
  async createSession(knowledgeBaseIds: number[], title?: string): Promise<RagChatSession> {
    if (knowledgeBaseIds.length !== 1) {
      throw new Error('统一知识库问答一次只能选择一个知识库');
    }
    const result = await request.post<{ chat_id: number; title: string; kb_id: number }>(
      '/api/knowledge/chat/start',
      { kb_id: knowledgeBaseIds[0], title },
    );
    return {
      id: result.chat_id,
      title: result.title,
      knowledgeBaseIds: [result.kb_id],
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * 获取会话列表
   */
  async listSessions(): Promise<RagChatSessionListItem[]> {
    const response = await request.get<{ groups: UnifiedChatGroup[] }>('/api/knowledge/chats');
    return response.groups.flatMap(group => group.chats.map(chat => ({
      id: chat.id,
      title: chat.title,
      messageCount: chat.message_count,
      knowledgeBaseNames: [group.kb_name],
      knowledgeBaseIds: [group.kb_id],
      updatedAt: chat.created_at,
      isPinned: false,
    })));
  },

  /**
   * 获取会话详情
   */
  async getSessionDetail(sessionId: number): Promise<RagChatSessionDetail> {
    const response = await request.get<{
      chat_id: number;
      messages: Array<{ id: number; role: 'user' | 'assistant'; content: string; created_at: string }>;
    }>(`/api/knowledge/chat/${sessionId}/history`);
    const sessions = await this.listSessions();
    const summary = sessions.find(session => session.id === sessionId);
    return {
      id: sessionId,
      title: summary?.title || `对话 ${sessionId}`,
      knowledgeBases: (summary?.knowledgeBaseIds || []).map(id => ({
        id,
        name: summary?.knowledgeBaseNames[0] || '',
        originalFilename: '',
        fileSize: 0,
        contentType: 'application/octet-stream',
        uploadedAt: summary?.updatedAt || '',
        lastAccessedAt: summary?.updatedAt || '',
        accessCount: 0,
        questionCount: 0,
      })),
      messages: response.messages.map(message => ({
        id: message.id,
        type: message.role,
        content: message.content,
        createdAt: message.created_at,
      })),
      createdAt: summary?.updatedAt || new Date().toISOString(),
      updatedAt: summary?.updatedAt || new Date().toISOString(),
    };
  },

  /**
   * 更新会话标题
   */
  async updateSessionTitle(sessionId: number, title: string): Promise<void> {
    void sessionId;
    void title;
    throw new Error('统一知识库暂不支持修改对话标题');
  },

  /**
   * 更新会话知识库
   */
  async updateKnowledgeBases(sessionId: number, knowledgeBaseIds: number[]): Promise<void> {
    void sessionId;
    void knowledgeBaseIds;
    throw new Error('统一知识库暂不支持修改对话知识库');
  },

  /**
   * 切换会话置顶状态
   */
  async togglePin(sessionId: number): Promise<void> {
    void sessionId;
    throw new Error('统一知识库暂不支持置顶对话');
  },

  /**
   * 删除会话
   */
  async deleteSession(sessionId: number): Promise<void> {
    void sessionId;
    throw new Error('统一知识库暂不支持删除对话');
  },

  /**
   * 发送消息（流式SSE）
   */
  async sendMessageStream(
    sessionId: number,
    question: string,
    onMessage: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        getApiUrl(`/api/knowledge/chat/${sessionId}/ask`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ question }),
        }
      );

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

      // 从 SSE 事件中提取内容
      const extractEventContent = (event: string): string | null => {
        if (!event.trim()) return null;

        const lines = event.split('\n');
        const contentParts: string[] = [];

        for (const line of lines) {
          if (line.startsWith('data:')) {
            // 提取 data: 后面的内容，保留原始格式（包括缩进空格）
            // ServerSentEvent 不会在 data: 后添加额外空格
            contentParts.push(line.substring(5));
          }
        }

        if (contentParts.length === 0) return null;

        // 合并内容并还原转义的换行符
        return contentParts.join('')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r');
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer) {
            const content = extractEventContent(buffer);
            if (content) {
              onMessage(content);
            }
          }
          onComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // SSE 事件以 \n\n 分隔，但也需要处理单行的情况
        let newlineIndex = buffer.indexOf('\n\n');
        if (newlineIndex === -1) {
          // 如果没有找到 \n\n，尝试处理单行 data: 格式
          const singleLineIndex = buffer.indexOf('\n');
          if (singleLineIndex !== -1 && buffer.substring(0, singleLineIndex).startsWith('data:')) {
            const line = buffer.substring(0, singleLineIndex);
            const content = extractEventContent(line);
            if (content) {
              onMessage(content);
            }
            buffer = buffer.substring(singleLineIndex + 1);
          }
          continue;
        }

        // 处理完整的事件块
        const eventBlock = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 2);

        const content = extractEventContent(eventBlock);
        if (content !== null) {
          try {
            const payload = JSON.parse(content) as { content?: string; done?: boolean };
            if (payload.content) onMessage(payload.content);
          } catch {
            onMessage(content);
          }
        }
      }
    } catch (error) {
      onError(new Error(getErrorMessage(error)));
    }
  },
};
