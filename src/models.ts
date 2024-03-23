import { Request, Response } from 'express';

const modelIds = [
  'openai/gpt-3.5-turbo',
  'anthropic/claude-2.0',  // "chatModelMaxTokens": 12000,
  'anthropic/claude-instant-1.2',  // "completionModelMaxTokens": 9000
  'anthropic/claude-3-haiku-20240307',  // GATEWAY
  'anthropic/claude-3-sonnet-20240229', // GATEWAY
  'anthropic/claude-3-opus-20240229',  // GATEWAY
  'openai/gpt-4-turbo-preview',
  'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
] as const;

export type ModelId = typeof modelIds[number];

const models: { [key: string]: ModelId } = {
  'GPT 3.5 Turbo' : 'openai/gpt-3.5-turbo',
  'Claude 2.0': 'anthropic/claude-2.0',
  'Claude Instant 1.2': 'anthropic/claude-instant-1.2',
  'Claude 3 Haiku': 'anthropic/claude-3-haiku-20240307',
  'Claude 3 Sonnet': 'anthropic/claude-3-sonnet-20240229',
  'Claude 3 Opus': 'anthropic/claude-3-opus-20240229',
  'GPT 4 Turbo Preview': 'openai/gpt-4-turbo-preview',
  'Mixtral Instruct': 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
};

export const getModelIdByName = (modelName: string): ModelId | null => {
  if (!Object.keys(models).includes(modelName)) return null;
  return models[modelName];
};

type ModelQuirks = {
  lastMessageAssistant?: boolean
  gateway?: boolean
};

const modelQuirks: { [key in ModelId]?: ModelQuirks } = {
  'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct': {
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
  }
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
