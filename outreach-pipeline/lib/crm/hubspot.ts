import { HttpClient, type HttpOptions } from './http.js';
import type { CrmConnector, LeadInfo, LeadUpdate, OutreachNote } from './types.js';
import { formatNote } from './format.js';

/**
 * HubSpot: Private App-token som Bearer.
 * Leads opdateres med PATCH /crm/v3/objects/leads/{id} og felter under `properties`.
 */
export class HubSpotConnector implements CrmConnector {
  readonly provider = 'hubspot' as const;
  private readonly http: HttpClient;

  constructor(baseUrl: string, apiKey: string, opts: Partial<HttpOptions> = {}) {
    this.http = new HttpClient({ ...opts, baseURL: baseUrl, headers: { Authorization: `Bearer ${apiKey}` } });
  }

  async getLead(id: string): Promise<LeadInfo> {
    const res = await this.http.request<{ id: string; properties: { hs_lead_name?: string } }>(
      'GET',
      `/crm/v3/objects/leads/${encodeURIComponent(id)}?properties=hs_lead_name`,
    );
    return { id: res.id, title: res.properties.hs_lead_name ?? '' };
  }

  async updateLead(id: string, fields: LeadUpdate): Promise<void> {
    const properties: Record<string, string> = {};
    if (fields.title !== undefined) properties.hs_lead_name = fields.title;
    await this.http.request('PATCH', `/crm/v3/objects/leads/${encodeURIComponent(id)}`, { properties });
  }

  async addOutreachNote(leadId: string, note: OutreachNote): Promise<string> {
    const created = await this.http.request<{ id: string }>('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: formatNote(note, 'html'), hs_timestamp: new Date().toISOString() },
    });
    // Standard-association note -> lead (v4 "default" kræver ikke et associationTypeId).
    await this.http.request(
      'PUT',
      `/crm/v4/objects/notes/${encodeURIComponent(created.id)}/associations/default/leads/${encodeURIComponent(leadId)}`,
    );
    return created.id;
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.http.request('DELETE', `/crm/v3/objects/notes/${encodeURIComponent(noteId)}`);
  }
}
