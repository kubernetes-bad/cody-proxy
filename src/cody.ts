import { makeSgClient } from './sgClient';

const ENDPOINT_SGWEB = 'https://sourcegraph.com/.api/';
const MODELS_CACHE_DURATION = 60 * 1000 * 30;

const sgClient = makeSgClient({
  'Content-Type': 'application/json',
  'Accept-Encoding': 'gzip;q=0',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  'Referer': 'https://sourcegraph.com/.assets/_sk/_app/immutable/workers/agent.worker-BKx2OhRZ.js',
  'User-Agent': 'web/0.0.1 (Browser Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15)',
  'x-requested-with': 'Sourcegraph',
  'x-sourcegraph-client': 'https://sourcegraph.com',
}, ENDPOINT_SGWEB);

let modelsCache: {
  data: { [key: string]: string };
  timestamp: number;
} | null = null;

export async function getModels(): Promise<{ [key: string]: string }> {
  if (modelsCache && Date.now() - modelsCache.timestamp < MODELS_CACHE_DURATION) return modelsCache.data;

  const apiModels = await sgClient.get<ModelsEndpointResponse>('modelconfig/supported-models.json');
  if (!apiModels || !apiModels.data || !apiModels.data.models || !apiModels.data.models.length) return {};
  const models = apiModels.data.models;

  const result = models.reduce((accum, model) => {
    const provider = model.modelRef.split(':')[0];
    // filter out all autocomplete models
    if (model.capabilities.includes('autocomplete')) return accum;
    accum[model.displayName] = `${provider}/${model.modelName}`;
    return accum;
  }, {} as { [key: string]: string });

  modelsCache = { data: result, timestamp: Date.now() };
  return result;
}

type ModelsEndpointResponse = {
  schemaVersion: string
  revision: string
  providers: {
    id: string
    displayName: string
  }[],
  models: Model[]
  defaultModels: { [key: string]: string };
};

export type Model = {
  modelRef: string
  displayName: string
  modelName: string
  capabilities: ('edit' | 'chat' | 'vision' | 'tools' | 'autocomplete' | 'reasoning')[],
  category: string
  status: string
  tier: string
  contextWindow: {
    maxInputTokens: number
    maxOutputTokens: number
  },
  estimatedModelCost: {
    unit: string
    inputTokenPennies: number
    outputTokenPennies: number
  },
  modelConfigAllTiers?: {
    [key: string]: { // tier name
      contextWindow: {
        maxInputTokens: number
        maxOutputTokens: number
        maxUserInputTokens: number
      }
    }
  }
};
