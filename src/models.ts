import { Request, Response } from 'express';
import { getModels, Model } from './cody';

export const getModelByName = async (modelName: string): Promise<Model | null> => {
  const models = await getModels();
  return modelName in models ? models[modelName] : null;
}

type ModelQuirks = {
  lastMessageAssistant?: boolean
  gateway?: boolean
  noStreaming?: boolean
};

const modelQuirks: { [key: string]: ModelQuirks } = { // ref to quirks
  // 'openai::2024-02-01::o1': { noStreaming: true }, // now supports streaming!
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
    data: Object.entries(newModels).map(([modelName, model]) => ({
      id: modelName,
      object: 'model',
      created: Date.now(),
      owned_by: 'openai',
      root: model.modelName,
      parent: null,
      meta: { // Open Web UI specific format
        description: "Coding Questions Only",
        capabilities: {
          vision: false,
          file_upload: false,
          web_search: false,
          image_generation: false,
          code_interpreter: false,
          citations: false,
          usage: false,
        },
        suggestion_prompts: null,
        tags: ["cody"],
      },
      permission: [generatePermission(model.modelName)],
    }))
  };

  res.json(response);
}
