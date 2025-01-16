import { Request, Response } from 'express';

const modelIds = [
  'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
  'fireworks/accounts/fireworks/models/mixtral-8x22b-instruct',
  'anthropic/claude-2.0',  // "chatModelMaxTokens": 12000,
  'anthropic/claude-2.1',
  'anthropic/claude-instant-1.2',  // "completionModelMaxTokens": 9000
  'anthropic/claude-3-haiku-20240307', // GATEWAY, "completionModelMaxTokens": 7000
  'anthropic/claude-3-5-haiku-latest', // GATEWAY, "completionModelMaxTokens": 7000
  'anthropic/claude-3-sonnet-20240229', // GATEWAY, "completionModelMaxTokens": 15000
  'anthropic/claude-3-opus-20240229',  // GATEWAY, "completionModelMaxTokens": 45000
  'anthropic/claude-3-5-sonnet-20240620', // GATEWAY, "completionModelMaxTokens": 45000
  'anthropic/claude-3-5-sonnet-latest', // GATEWAY, "completionModelMaxTokens": 45000
  'openai/gpt-3.5-turbo',
  'openai/gpt-4-1106-preview',
  'openai/gpt-4-turbo-preview',
  'openai/gpt-4-turbo',
  'openai/gpt-4o',
  'openai/cody-chat-preview-001', // "completionModelMaxTokens: 45000
  'openai/cody-chat-preview-002', // "completionModelMaxTokens: 45000
  'google/gemini-1.5-pro-latest', // "completionModelMaxTokens": 15000
  'google/gemini-1.5-flash-latest', // "completionModelMaxTokens": 15000
  'google/gemini-2.0-flash-exp', // "completionModelMaxTokens": 15000
] as const;

export type ModelId = typeof modelIds[number];

const models: { [key: string]: ModelId } = {
  'Mixtral 8x7B': 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
  'Mixtral 8x22B': 'fireworks/accounts/fireworks/models/mixtral-8x22b-instruct',
  'Claude 2.0': 'anthropic/claude-2.0',
  'Claude Instant 1.2': 'anthropic/claude-instant-1.2',
  'Claude 3 Haiku v2': 'anthropic/claude-3-5-haiku-latest',
  'Claude 3 Haiku v1': 'anthropic/claude-3-haiku-20240307',
  'Claude 3 Sonnet': 'anthropic/claude-3-sonnet-20240229',
  'Claude 3 Opus': 'anthropic/claude-3-opus-20240229',
  'Claude 3.5 Sonnet v1': 'anthropic/claude-3-5-sonnet-20240620',
  'Claude 3.5 Sonnet v2': 'anthropic/claude-3-5-sonnet-latest',
  'GPT 3.5 Turbo' : 'openai/gpt-3.5-turbo',
  'GPT 4 Turbo Preview (1106)': 'openai/gpt-4-1106-preview',
  'GPT 4 Turbo Preview': 'openai/gpt-4-turbo-preview',
  'GPT 4 Turbo': 'openai/gpt-4-turbo',
  'GPT-4o': 'openai/gpt-4o',
  'OpenAI o1-preview': 'openai/cody-chat-preview-001',
  'OpenAI o1-mini': 'openai/cody-chat-preview-002',
  'Gemini 2.0 Flash Experimental': 'google/gemini-2.0-flash-exp',
  'Gemini 1.5 Pro': 'google/gemini-1.5-pro-latest',
  'Gemini 1.5 Flash': 'google/gemini-1.5-flash-latest',
};

export const getModelIdByName = (modelName: string): ModelId | null => {
  if (!Object.keys(models).includes(modelName)) return null;
  return models[modelName];
};

type ModelQuirks = {
  lastMessageAssistant?: boolean
  gateway?: boolean
  noStreaming?: boolean
};

const modelQuirks: { [key in ModelId]?: ModelQuirks } = {
  'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct': {
    lastMessageAssistant: false,
  },
  'fireworks/accounts/fireworks/models/mixtral-8x22b-instruct': {
    lastMessageAssistant: false,
  },
  'anthropic/claude-3-opus-20240229': {
    gateway: true,
  },
  'anthropic/claude-3-sonnet-20240229': {
    gateway: true,
  },
  'anthropic/claude-3-haiku-20240307': {
    gateway: true,
  },
  'anthropic/claude-3-5-haiku-latest': {
    gateway: true,
  },
  'anthropic/claude-3-5-sonnet-20240620': {
    gateway: true,
  },
  'anthropic/claude-3-5-sonnet-latest': {
    gateway: true,
  },
  'openai/cody-chat-preview-001': {
    noStreaming: true,
  },
  'openai/cody-chat-preview-002': {
    noStreaming: true,
  },
};

export const getModelQuirks = (modelId: ModelId) => modelQuirks[modelId];

export default function getModelsHandler(req: Request, res: Response) {
  console.log(`GET /v1/models from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
  const generatePermission = (modelId: string) => ({
    "id": `modelperm-${modelId}`,
    "object": "model_permission",
    "created": Date.now(),
    "allow_create_engine": false,
    "allow_sampling": true,
    "allow_logprobs": true,
    "allow_search_indices": false,
    "allow_view": true,
    "allow_fine_tuning": false,
    "organization": "*",
    "group": null,
    "is_blocking": false,
  });

  const response = {
    "object": "list",
    "data": Object.entries(models).map(([modelName, modelId]) => ({
      "id": modelName,
      "object": "model",
      "created": Date.now(),
      "owned_by": "openai",
      "root": modelId,
      "parent": null,
      "permission": [generatePermission(modelId)]
    }))
  };

  res.json(response);
}
