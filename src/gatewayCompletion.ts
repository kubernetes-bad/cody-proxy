import { Request, Response } from 'express';
import { Stream } from '@anthropic-ai/sdk/streaming';
import { getModelIdByName } from './models';
import { CODY_PROMPT, formatNonStreamingResponse, OpenAICompletionMessage, OpenAIStreamingEvent } from './completions';
import createHttpError from 'http-errors';
import { makeSgClient } from './sgClient';

const ENDPOINT_GW = 'https://cody-gateway.sourcegraph.com/';

const sgClient = makeSgClient({
  'content-type': 'application/json; charset=utf-8',
  'x-sourcegraph-feature': 'chat_completions',
  Accept: '*/*',
  'User-Agent': 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
  'Accept-Encoding': 'gzip,deflate',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
}, ENDPOINT_GW);

const DEFAULT_GENERATION_SETTINGS = {
  temperature: 0.2,
  max_tokens: 4000,
  top_k: -1,
  top_p: -1,
};

type GatewayCompletionMessage = {
  role: 'system' | 'user' | 'assistant'
  content: [{
    type: 'text'
    text: string
  }]
};

const toGatewayMessage = (oaiMessage: OpenAICompletionMessage): GatewayCompletionMessage => ({
  role: oaiMessage.role,
  content: [{
    type: 'text',
    text: oaiMessage.content || '',
  }],
});

const emptyEvent = (model: string): OpenAIStreamingEvent => ({
  id: `chatcmpl-${Math.floor(Math.random() * 10000)}`,
  object: 'chat.completion.chunk',
  created: 12345,
  model,
  system_fingerprint: 'fp_44709d6fcb',
  choices: [{
    index: 0,
    delta: {
      role: 'assistant',
      content: '',
    },
    logprobs: null,
    finish_reason: null,
  }],
});

const stopEvent = (model: string): OpenAIStreamingEvent => ({
  id: `chatcmpl-${Math.floor(Math.random() * 10000)}`,
  object: 'chat.completion.chunk',
  created: 12345,
  model,
  system_fingerprint: 'fp_44709d6fcb',
  choices: [{
    index: 0,
    delta: {
      role: 'assistant',
      content: '',
    },
    logprobs: null,
    finish_reason: 'stop',
  }],
});

type ContentBlockDeltaEvent = {
  type: 'content_block_delta'
  index: number
  delta: {
    text: string
    type: 'text_delta'
  }
}

type ContentBlockStopEvent = {
  type: 'content_block_stop'
  index: number
}

type GatewayStreamEvent = ContentBlockDeltaEvent | ContentBlockStopEvent;

const formatGatewayEvent = (model: string, event: GatewayStreamEvent): OpenAIStreamingEvent => {
  // only for 'content_block_delta' events
  if (event.type !== 'content_block_delta') throw new Error(`Bad event type: ${event.type}`);
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
        content: event.delta.text || '',
      },
      logprobs: null,
      finish_reason: null,
    }],
  };
};

export default async function postCompletionGateway(req: Request, res: Response) {
  const { model, messages, temperature, top_p, top_k, max_tokens } = req.body;
  const streaming: boolean = req.body['stream'] !== false;
  const modelId = await getModelIdByName(model);
  if (!modelId) throw createHttpError(400, 'No model selected');

  const oaiMessages = messages as OpenAICompletionMessage[];
  const shouldAddCodyPreamble = !process.env.ALLOW_SYSTEM_MESSAGE || oaiMessages
      .every((message) => message.role !== 'system');

  const systemMessage: GatewayCompletionMessage[] = shouldAddCodyPreamble ? [{
    role: 'system',
    content: [{ type: 'text', text: CODY_PROMPT }],
  }] : [];
  const completionMessages: GatewayCompletionMessage[] = [
    ...systemMessage,
    ...messages.map(toGatewayMessage),
  ];

  // trim the last assistant message - fixes error on continue
  const lastMessage = completionMessages[completionMessages.length - 1];
  if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content[0]) {
    lastMessage.content[0].text = lastMessage.content[0].text.trimEnd();
  }

  const generationSettings = {...DEFAULT_GENERATION_SETTINGS};
  if (max_tokens) generationSettings.max_tokens = max_tokens;
  if (temperature) generationSettings.temperature = temperature;
  if (top_p) generationSettings.top_p = top_p;
  if (top_k) generationSettings.top_k = top_k;

  const request = {
    ...generationSettings,
    model: modelId,
    messages: completionMessages,
    ...DEFAULT_GENERATION_SETTINGS,
    stream: true,
  };

  const abortController = new AbortController();
  req.on('end', () => {
    abortController.abort();
  });

  const response = await sgClient.post('/v1/completions/anthropic-messages', request, {
    responseType: 'stream',
    signal: abortController.signal,
  });

  if (!response.data) throw createHttpError('No response body!');

  if (response.status !== 200) {
    console.error(response.data); // TODO: PROBABLY WON'T WORK
    throw createHttpError(response.status, `Bad response: ${response.statusText}`);
  }

  if (streaming) res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const claudeStream = Stream.fromSSEResponse<GatewayStreamEvent>({ body: response.data } as any, abortController);

  let total = '';
  for await (const gatewayEvent of claudeStream) {
    if (!['content_block_delta', 'content_block_stop'].includes(gatewayEvent.type)) continue;

    if (gatewayEvent.type === 'content_block_stop') {
      if (streaming) res.write(`data: ${JSON.stringify(stopEvent(modelId))}\n\n`);
      else return res.send(formatNonStreamingResponse(modelId, total));
      break;
    }
    if (streaming) {
      const oaiEvent = formatGatewayEvent(modelId, gatewayEvent);
      res.write(`data: ${JSON.stringify(oaiEvent)}\n\n`);
    } else total += gatewayEvent.delta.text;
  }
  if (streaming) res.end();
  else return res.send(formatNonStreamingResponse(modelId, total));
};
