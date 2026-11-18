import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { CrmError } from './types.js';

export interface HttpOptions {
  baseURL: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  /** Til tests: erstat netværkslaget. */
  adapter?: AxiosRequestConfig['adapter'];
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([429, 502, 503, 504]);

export class HttpClient {
  private readonly client: AxiosInstance;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: HttpOptions) {
    this.client = axios.create({
      baseURL: opts.baseURL.replace(/\/+$/, ''),
      timeout: opts.timeoutMs ?? 10_000,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...(opts.adapter ? { adapter: opts.adapter } : {}),
    });
    this.maxRetries = opts.maxRetries ?? 3;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async request<T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, data?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.client.request<T>({ method, url, data });
        return res.data;
      } catch (e) {
        const err = e as AxiosError;
        const status = err.response?.status;
        // POST er ikke idempotent: ved 5xx kan requesten være udført, så vi prøver kun igen ved 429.
        const retryable = method === 'POST' ? status === 429 : status !== undefined && RETRYABLE.has(status);
        if (retryable && attempt < this.maxRetries) {
          await this.sleep(retryDelayMs(err, attempt));
          continue;
        }
        // Byg en NY fejl uden request-config, så Authorization-headeren aldrig havner i logs.
        throw new CrmError(`${method} ${url} fejlede: ${status ?? err.code ?? 'ukendt'} ${safeMessage(err)}`, status);
      }
    }
  }
}

function retryDelayMs(err: AxiosError, attempt: number): number {
  const retryAfter = Number(err.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 2 ** attempt * 1000;
}

function safeMessage(err: AxiosError): string {
  const body = err.response?.data as { error?: string; message?: string } | undefined;
  return (body?.error ?? body?.message ?? err.message).slice(0, 300);
}
