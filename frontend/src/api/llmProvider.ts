import request from './request';
import type {
  ProviderItem,
  CreateProviderRequest,
  UpdateProviderRequest,
  ProviderTestResult,
  DefaultProvider,
  AsrConfig,
  TtsConfig,
  AsrConfigRequest,
  TtsConfigRequest,
} from '../types/llmProvider';

export const llmProviderApi = {
  list: async () => {
    const providers = await request.get<Array<Record<string, unknown>>>('/api/settings/providers');
    return providers.map(normalizeProvider);
  },

  get: async (id: string) => normalizeProvider(
    await request.get<Record<string, unknown>>(`/api/settings/providers/${id}`),
  ),

  create: (data: CreateProviderRequest) =>
    request.post<void>('/api/settings/providers', {
      name: data.id,
      display_name: data.id,
      api_key: data.apiKey,
      base_url: data.baseUrl,
      model_name: data.model,
      config: {
        embedding_model: data.embeddingModel,
        embedding_dimensions: data.embeddingDimensions,
        supports_embedding: data.supportsEmbedding,
        temperature: data.temperature,
      },
    }),

  update: (id: string, data: UpdateProviderRequest) =>
    request.put<void>(`/api/settings/providers/${id}`, {
      ...(data.baseUrl !== undefined ? { base_url: data.baseUrl } : {}),
      ...(data.apiKey !== undefined ? { api_key: data.apiKey } : {}),
      ...(data.model !== undefined ? { model_name: data.model } : {}),
      config: {
        embedding_model: data.embeddingModel,
        embedding_dimensions: data.embeddingDimensions,
        supports_embedding: data.supportsEmbedding,
        temperature: data.temperature,
      },
    }),

  delete: (id: string) =>
    request.delete<void>(`/api/settings/providers/${id}`),

  test: (id: string) =>
    request.post<ProviderTestResult>(`/api/settings/providers/${id}/test`),

  reload: () =>
    request.put<void>('/api/settings/providers/1/activate'),

  getDefaultProvider: () =>
    request.get<Record<string, unknown> | null>('/api/settings/current').then((provider) => ({
      defaultProvider: provider?.id ? String(provider.id) : '',
      defaultEmbeddingProvider: provider?.id ? String(provider.id) : '',
    })),

  updateDefaultProvider: (data: DefaultProvider) =>
    request.put<void>(`/api/settings/providers/${data.defaultProvider}/activate`),

  updateDefaultEmbeddingProvider: (data: DefaultProvider) =>
    request.put<void>(`/api/settings/providers/${data.defaultEmbeddingProvider}/activate`),

  // Voice ASR/TTS Config
  getAsrConfig: () =>
    request.get<AsrConfig>('/api/llm-provider/voice/asr'),

  updateAsrConfig: (data: AsrConfigRequest) =>
    request.put<void>('/api/llm-provider/voice/asr', data),

  getTtsConfig: () =>
    request.get<TtsConfig>('/api/llm-provider/voice/tts'),

  updateTtsConfig: (data: TtsConfigRequest) =>
    request.put<void>('/api/llm-provider/voice/tts', data),

  testAsr: () =>
    request.post<ProviderTestResult>('/api/llm-provider/voice/asr/test'),
};

function normalizeProvider(provider: Record<string, unknown>): ProviderItem {
  const config = provider.config as Record<string, unknown> | null | undefined;
  return {
    id: String(provider.id ?? provider.name ?? ''),
    baseUrl: String(provider.base_url ?? provider.baseUrl ?? ''),
    maskedApiKey: String(provider.api_key ?? provider.maskedApiKey ?? ''),
    model: String(provider.model_name ?? provider.model ?? ''),
    embeddingModel: typeof config?.embedding_model === 'string' ? config.embedding_model : null,
    embeddingDimensions: typeof config?.embedding_dimensions === 'number' ? config.embedding_dimensions : null,
    supportsEmbedding: config?.supports_embedding === true,
    temperature: typeof config?.temperature === 'number' ? config.temperature : null,
    defaultChatProvider: provider.is_default === true,
    defaultEmbeddingProvider: false,
  };
}
