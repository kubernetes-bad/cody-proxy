import { Request, Response } from 'express';
import { getModelIdByName, getModelQuirks, ModelId } from './models';
import axios from 'axios';
import createHttpError from 'http-errors';
import postCompletionGateway from './gatewayCompletion';

export const AUTH_TOKEN: string = process.env.AUTH_TOKEN || '';

export const CODY_PROMPT = 'You are Cody, an AI coding assistant from Sourcegraph.';
export const CODY_PROMPT_ANSWER = 'I am Cody, an AI coding assistant from Sourcegraph.';

const ENDPOINT_SG = 'https://sourcegraph.com/.api/';

if (!AUTH_TOKEN) throw new Error('No token found. Please set your env var AUTH_TOKEN to your token value');

const sgClient = axios.create({
  baseURL: ENDPOINT_SG,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip;q=0',
    Authorization: `token ${AUTH_TOKEN}`,
    Pragma: 'no-cache',
    'Cache-Control': 'no-cache',
    'User-Agent': false,
  },
});

export type OpenAICompletionMessage = {
  role: 'user' | 'assistant' | 'system'
  content?: string
};

type CompletionMessage = {
  speaker: 'human' | 'assistant'
  text?: string
};

type FinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'function_call';

type OpenAiResponseBase = {
  id: string,
  object: 'chat.completion.chunk' | 'chat.completion',
  created: number,
  model: ModelId,
  system_fingerprint?: string
  usage?: {
    prompt_tokens: number,
    total_tokens: number,
    completion_tokens: number,
  },
}

export type OpenAIStreamingEvent = OpenAiResponseBase & {
  object: "chat.completion.chunk",
  choices: {
    index: number,
    delta: {
      role?: 'assistant'
      content: string
    },
    logprobs?: null,
    finish_reason: FinishReason | null,
  }[],
};

export type OpenAINonStreamingResponse = OpenAiResponseBase & {
  object: 'chat.completion',
  choices: [{
    index: 0,
    message: {
      role?: 'assistant',
      content: string,
    },
    logprobs?: null,
    finish_reason: FinishReason | null,
  }]
}

type StreamingEvent = {
  type: 'done' | 'completion'
  data: { completion?: string, stopReason?: FinishReason | '' }
};

export const DEFAULT_GENERATION_SETTINGS = {
  temperature: 0.2,
  topK: -1,
  topP: -1,
};

type CompletionRequest = {
  temperature: number
  topK: number
  topP: number
  maxTokensToSample: number
  model: ModelId
  messages: (CompletionMessage | { text: string, speaker: string })[]
  stream?: boolean
}

export const makeRandomTraceparent = () => {
  const part2 = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const part3 = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  return `00-${part2}-${part3}-01`;
};

const formatEvent = (model: ModelId, event: StreamingEvent): OpenAIStreamingEvent => {
  return {
    id: `chatcmpl-${Math.floor(Math.random() * 10000)}`,
    object: 'chat.completion.chunk',
    created: 12345,
    model,
    system_fingerprint: 'fp_44709d6fcb',
    choices: [{
      index: 0,
      delta: {
        role: 'assistant',
        content: event.data.completion || '',
      },
      logprobs: null,
      finish_reason: event.type === 'done' ? 'stop' : null,
    }],
  };
};

export const formatNonStreamingResponse = (model: ModelId, content: string): OpenAINonStreamingResponse => {
  return {
    id: `chatcmpl-${Math.floor(Math.random() * 10000)}`,
    object: 'chat.completion',
    created: 12345,
    model,
    system_fingerprint: 'fp_44709d6fcb',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
      },
      logprobs: null,
      finish_reason: 'stop',
    }],
  };
};

function parseEvent(eventString: string): StreamingEvent | null {
  const startIndex = eventString.indexOf('event:');
  if (startIndex === -1) throw new Error('Event marker not found');

  const eventData = eventString.slice(startIndex + 6); // 'event:'.length = 6
  const type = eventData.substring(0, eventData.indexOf('\n')).trim()  as 'done' | 'completion';
  const jsonData = eventData.substring(eventData.indexOf('\n') + 7).trim(); // 'data:'.length = 7
  return { type, data: JSON.parse(jsonData) };
}

const toSourcegraphMessage = (oai: OpenAICompletionMessage): CompletionMessage => {
  // { role: 'user', content: 'test' } -> {"speaker": "human", "text": "test" }
  const result: CompletionMessage = {
    speaker: oai.role === 'user' ? 'human' : 'assistant',
  };
  if (!!oai.content) result.text = oai.content.trim();
  return result;
};

export default async function postCompletion(req: Request, res: Response) {
  const { model, messages } = req.body;
  const oaiMessages = (messages as OpenAICompletionMessage[]);
  if (oaiMessages.some(message => message.role === 'system') && !process.env.ALLOW_SYSTEM_MESSAGE) {
    throw createHttpError(400, 'Cannot send system messages with Cody Proxy');
  }
  const modelId = getModelIdByName(model);
  if (!modelId) throw createHttpError(400, 'No model selected');
  const quirks = getModelQuirks(modelId);
  const streamOutputFormat = req.body['stream'] !== false;
  // model can't stream, or it was explicitly requested not to stream
  const shouldRequestStreaming = !((quirks?.noStreaming || false) || !streamOutputFormat);

  console.log(`New Completion request for ${model}`);
  if (process.env.DEBUG) console.dir({ model, messages });

  if (quirks?.gateway === true) return postCompletionGateway(req, res);

  const completionMessages = [
    { text: CODY_PROMPT, speaker: 'human' },
    { text: CODY_PROMPT_ANSWER, speaker: 'assistant' },
    ...oaiMessages.map(toSourcegraphMessage),
  ]
  if (quirks?.lastMessageAssistant !== false) completionMessages.push({ speaker: 'assistant' });

  const request: CompletionRequest = {
    ...DEFAULT_GENERATION_SETTINGS,
    maxTokensToSample: 4000,
    model: modelId,
    messages: completionMessages,
  };
  if (!shouldRequestStreaming) request.stream = false;

  const response = await sgClient.post('/completions/stream', request, {
    responseType: shouldRequestStreaming ? 'stream' : 'json',
    headers: {
      traceparent: makeRandomTraceparent(),
    },
  });

  if (!streamOutputFormat) {
    const text = response.data.completion;
    if (!text) res.status(500).send('Error getting data from cody');
    else res.send(formatNonStreamingResponse(model, text));
    return;
  }

  // SSE stuff
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = response.data;
  if (quirks?.noStreaming) {
    const completion: string = stream.completion;
    if (completion) res.write(`data: ${JSON.stringify(
      formatEvent(modelId, { type: 'completion', data: { completion }})
    )}\n\n`);
    res.write(`data: ${JSON.stringify(
      formatEvent(modelId, { type: 'done', data: { completion: '', stopReason: 'stop' } })
    )}\n\n`);
    res.end();
    return;
  }

  let previousCompletion = '';
  let buffer = '';
  stream.on('data', (data: Buffer) => {
    const eventString = data.toString();
    buffer += eventString;
    const events = buffer.split('\n\n');
    for (let i = 0; i < events.length - 1; i++) {
      const event = events[i];
      const parsedEvent = parseEvent(event);
      if (!parsedEvent) continue;
      if (parsedEvent.type === 'completion' && parsedEvent.data.completion) {
        const delta = parsedEvent.data.completion.substring(previousCompletion.length);
        parsedEvent.data.completion = delta;
        previousCompletion += delta;
      }
      const oaiEvent = formatEvent(modelId, parsedEvent);
      res.write(`data: ${JSON.stringify(oaiEvent)}\n\n`);
    }

    buffer = events[events.length - 1];
  });

  stream.on('end', () => {
    res.end();
  });

  stream.on('error', (error: any) => {
    console.error('Error streaming data:', error);
    res.status(500).send('Error streaming data');
  });
}
