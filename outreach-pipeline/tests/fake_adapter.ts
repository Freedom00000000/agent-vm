import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

export interface Recorded { method: string; url: string; headers: Record<string, unknown>; data: unknown }
type Reply = { status: number; data?: unknown; headers?: Record<string, string> };

/** Axios-adapter der optager requests og svarer med forudbestemte svar (i rækkefølge). */
export function fakeAdapter(replies: Reply[]) {
  const calls: Recorded[] = [];
  const adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    calls.push({
      method: (config.method ?? '').toUpperCase(),
      url: `${config.baseURL ?? ''}${config.url ?? ''}`,
      headers: AxiosHeaders.from(config.headers).toJSON(),
      data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    });
    const reply = replies.shift() ?? { status: 200, data: {} };
    const response: AxiosResponse = {
      status: reply.status, statusText: '', data: reply.data ?? {},
      headers: reply.headers ?? {}, config,
    };
    if (reply.status >= 400) throw new AxiosError(`Request failed with status code ${reply.status}`, 'ERR_BAD_RESPONSE', config, null, response);
    return response;
  };
  return { adapter, calls };
}
