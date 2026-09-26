export interface GeminiModelOption {
  id: string;
  name: string;
  badge?: string;
  description: string;
  isDefault?: boolean;
  isRecommended?: boolean;
}

export const ALL_GEMINI_MODELS: Record<string, GeminiModelOption> = {
  'gemini-3.7-flash': {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    badge: 'Recommended',
    description: 'Hybrid reasoning with highest macro estimation accuracy',
    isRecommended: true,
  },
  'gemini-3.6-flash': {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    badge: 'Default',
    description: 'High speed with balanced macro estimation',
    isDefault: true,
  },
  'gemini-3.5-flash': {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    badge: 'Balanced',
    description: 'Fast, high-capability model for detailed visual recognition',
  },
  'gemini-3.5-flash-lite': {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    badge: 'Ultra Fast',
    description: 'Lowest latency & instantaneous response times',
  },
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    badge: 'Fast',
    description: 'Lightweight, low latency model for quick meal logging',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    badge: 'Deep Reasoning',
    description: 'Advanced multimodal reasoning for tricky ingredients',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: 'Fast Vision',
    description: 'Optimized multimodal vision and quick analysis',
  },
};

export const DEFAULT_BYOK_MODEL_ID = 'gemini-3.6-flash';

export function getAvailableByokModels(): GeminiModelOption[] {
  return Object.values(ALL_GEMINI_MODELS);
}

export function getGeminiModelById(modelId?: string | null): GeminiModelOption {
  if (!modelId) {
    return ALL_GEMINI_MODELS[DEFAULT_BYOK_MODEL_ID];
  }
  // Strip any CONFIG_ prefix if present
  const cleanId = modelId.startsWith('CONFIG_') ? modelId.replace('CONFIG_', '') : modelId;
  return ALL_GEMINI_MODELS[cleanId] || {
    id: cleanId,
    name: cleanId,
    description: 'Custom Gemini AI Model',
  };
}
