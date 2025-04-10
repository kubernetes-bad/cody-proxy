import path from 'node:path';
import * as fs from 'node:fs';
import { enc, SHA256 } from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosError, AxiosInstance, AxiosResponse, RawAxiosRequestHeaders } from 'axios';
import ApiKeyManager from './apiKeyManager';

declare module 'axios' {
  export interface AxiosRequestConfig {
    _apiKey?: string;
    _metadata?: { [key: string]: string | number | boolean | null },
  }
}

const ENDPOINT_SG = 'https://sourcegraph.com/.api/';

const CAPTURE_DIR = path.join(process.cwd(), 'captures');
if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR);

const apiKeyManager = ApiKeyManager.getInstance();

export const makeRandomTraceparent = () => {
  const part2 = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const part3 = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  return `00-${part2}-${part3}-01`;
};

export function dotcomTokenToGatewayToken(dotcomToken: string): string | undefined {
  const DOTCOM_TOKEN_REGEX: RegExp =
    /^(?:sgph?_)?(?:[\da-fA-F]{16}_|local_)?(?<hexbytes>[\da-fA-F]{40})$/
  const match = DOTCOM_TOKEN_REGEX.exec(dotcomToken);

  if (!match) return undefined;

  const hexEncodedAccessTokenBytes = match?.groups?.hexbytes;

  if (!hexEncodedAccessTokenBytes) return undefined;

  const accessTokenBytes = enc.Hex.parse(hexEncodedAccessTokenBytes);
  const gatewayTokenBytes = SHA256(SHA256(accessTokenBytes)).toString();
  return 'sgd_' + gatewayTokenBytes;
}

export function makeSgClient(defaultHeaders: RawAxiosRequestHeaders, endpoint: string = ENDPOINT_SG): AxiosInstance {
  const sgClient = axios.create({
    baseURL: endpoint,
    headers: defaultHeaders,
  });

  sgClient.interceptors.request.use(async (config) => {
    const apiKey = await apiKeyManager.getKey();

    const authHeader = (config.baseURL?.includes('cody-gateway.'))
      ? `Bearer ${dotcomTokenToGatewayToken(apiKey)}`
      : `token ${apiKey}`;

    config.headers = config.headers || {};
    config.headers.Authorization = authHeader;
    if (!config.url?.endsWith('.json')) {
      config.headers.traceparent = makeRandomTraceparent();
      config.headers['x-sourcegraph-interaction-id'] = uuidv4();
    }

    config._apiKey = apiKey;

    return config;
  });

  sgClient.interceptors.response.use((response: AxiosResponse) => response, // return successful response right away
    async (error: AxiosError) => {
      if (!error.response) return Promise.reject(error); // wat

      const { status, headers } = error.response;
      const apiKey = error.config?._apiKey;

      if (!apiKey || status !== 429) { // not a 429 or there was no api key
        console.warn(`Got a 429 but there was no apiKey in error.config.data.apiKey`);
        console.dir(error);
        return Promise.reject(error);
      }

      // HTTP 429 Too Many Requests
      // retry-after can be either a number of seconds or a date
      // sg sends `Mon, 01 Apr 2022 11:22:33 UTC`
      const retryAfter = headers['retry-after']
        ? isNaN(Number(headers['retry-after'])) // is date
          ? Math.max(-1, Math.ceil((new Date(headers['retry-after']).getTime() - Date.now()) / 1000))
          : parseInt(headers['retry-after'], 10) // is seconds
        : 60;

      // special case: 0 means "banned key" - sg sends retry-after in the past, so Math.max(0, negative number) is always 0

      apiKeyManager.markRateLimited(apiKey, retryAfter);
      const newConfig = { ...error.config };
      delete newConfig._apiKey; // remove the API key from the config so interceptor will fetch a new key
      if (newConfig.headers) delete newConfig.headers.Authorization;
      return sgClient(newConfig); // retry with a new API key
    });

  return sgClient;
}
