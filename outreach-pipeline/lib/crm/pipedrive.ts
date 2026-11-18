import { HttpClient, type HttpOptions } from './http.js';
import type { CrmConnector, LeadInfo, LeadUpdate, OutreachNote } from './types.js';
import { formatNote } from './format.js';

/**
 * Pipedrive: API-token sendes i headeren `x-api-token`.
 * Leads ligger på /api/v1/leads/{uuid} og opdateres med PATCH. Svar er pakket i `{ success, data }`.
 */
export class PipedriveConnector implements CrmConnector {
  readonly provider = 'pipedrive' as const;
  private readonly http: HttpClient;

  constructor(baseUrl: string, apiKey: string, opts: Partial<HttpOptions> = {}) {
    this.http = new HttpClient({ ...opts, baseURL: `${baseUrl.replace(/\/+$/, '')}/api/v1`, headers: { 'x-api-token': apiKey } });
  }

  async getLead(id: string): Promise<LeadInfo> {
    const res = await this.http.request<{ data: { id: string; title: string } }>('GET', `/leads/${encodeURIComponent(id)}`);
    return { id: res.data.id, title: res.data.title };
  }

  async updateLead(id: string, fields: LeadUpdate): Promise<void> {
    await this.http.request('PATCH', `/leads/${encodeURIComponent(id)}`, fields);
  }

  async addOutreachNote(leadId: string, note: OutreachNote): Promise<string> {
    const res = await this.http.request<{ data: { id: number } }>('POST', '/notes', { lead_id: leadId, content: formatNote(note, 'html') });
    return String(res.data.id);
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.http.request('DELETE', `/notes/${encodeURIComponent(noteId)}`);
  }
}
