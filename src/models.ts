import { Request, Response } from 'express';
import { getModels } from './cody';

export const getModelIdByName = async (modelName: string): Promise<string | null> => {
  const models = await getModels();
  return models[modelName] || null;
};

type ModelQuirks = {
  lastMessageAssistant?: boolean
  gateway?: boolean
  noStreaming?: boolean
};

const modelQuirks: { [key: string]: ModelQuirks } = {
  'openai/o1-2024-12-17': { noStreaming: true },
};

const generatePermission = (modelId: string) => ({
  id: `modelperm-${modelId}`,
  object: 'model_permission',
  created: Date.now(),
  allow_create_engine: false,
  allow_sampling: true,
  allow_logprobs: true,
  allow_search_indices: false,
  allow_view: true,
  allow_fine_tuning: false,
  organization: '*',
  group: null,
  is_blocking: false,
});

export const getModelQuirks = (modelId: string) => {
  const quirks = { ...modelQuirks[modelId] };
  const provider = modelId.includes('/') ? modelId.split('/')[0] : null;
  if (provider === 'anthropic') quirks.gateway = true;
  else if (provider === 'fireworks') quirks.lastMessageAssistant = false;
  return quirks;
}

export default async function getModelsHandler(req: Request, res: Response) {
  console.log(`GET /v1/models from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);

  const newModels = await getModels();

  const response = {
    object: 'list',
    data: Object.entries(newModels).map(([modelName, modelId]) => ({
      id: modelName,
      object: 'model',
      created: Date.now(),
      owned_by: 'openai',
      root: modelId,
      parent: null,
      permission: [generatePermission(modelId)],
    }))
  };

  res.json(response);
}
