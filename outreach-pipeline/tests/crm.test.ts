import { describe, expect, it } from 'vitest';
import { PipedriveConnector } from '../lib/crm/pipedrive.js';
import { HubSpotConnector } from '../lib/crm/hubspot.js';
import { CrmError } from '../lib/crm/types.js';
import { loadCrmEnv } from '../lib/env.js';
import { createCrmConnector } from '../lib/crm_connector.js';
import { fakeAdapter } from './fake_adapter.js';

const KEY = 'secret-token-123456';
const noSleep = async () => {};

describe('Pipedrive', () => {
  it('PATCH på lead med x-api-token', async () => {
    const f = fakeAdapter([{ status: 200 }]);
    await new PipedriveConnector('https://acme.pipedrive.com/', KEY, { adapter: f.adapter }).updateLead('abc-1', { title: 'Ny' });
    expect(f.calls[0]).toMatchObject({ method: 'PATCH', url: 'https://acme.pipedrive.com/api/v1/leads/abc-1', data: { title: 'Ny' } });
    expect(f.calls[0]!.headers['x-api-token']).toBe(KEY);
  });

  it('læser lead (read-only)', async () => {
    const f = fakeAdapter([{ status: 200, data: { success: true, data: { id: 'abc-1', title: 'Hansen Tømrer' } } }]);
    const lead = await new PipedriveConnector('https://acme.pipedrive.com', KEY, { adapter: f.adapter }).getLead('abc-1');
    expect(lead).toEqual({ id: 'abc-1', title: 'Hansen Tømrer' });
    expect(f.calls[0]!.method).toBe('GET');
  });

  it('sletter note (rollback)', async () => {
    const f = fakeAdapter([{ status: 200 }]);
    await new PipedriveConnector('https://acme.pipedrive.com', KEY, { adapter: f.adapter }).deleteNote('77');
    expect(`${f.calls[0]!.method} ${f.calls[0]!.url}`).toBe('DELETE https://acme.pipedrive.com/api/v1/notes/77');
  });

  it('opretter note på lead med escaped HTML og returnerer id', async () => {
    const f = fakeAdapter([{ status: 201, data: { success: true, data: { id: 77 } } }]);
    const id = await new PipedriveConnector('https://acme.pipedrive.com', KEY, { adapter: f.adapter })
      .addOutreachNote('abc-1', { templateId: 'prospecting_v1', subject: 'A <b>', body: 'x\ny' });
    expect(id).toBe('77');
    const data = f.calls[0]!.data as { lead_id: string; content: string };
    expect(f.calls[0]!.url).toBe('https://acme.pipedrive.com/api/v1/notes');
    expect(data.lead_id).toBe('abc-1');
    expect(data.content).toContain('A &lt;b&gt;');
    expect(data.content).toContain('x<br>y');
  });
});

describe('HubSpot', () => {
  it('PATCH med properties og Bearer-token', async () => {
    const f = fakeAdapter([{ status: 200 }]);
    await new HubSpotConnector('https://api.hubapi.com', KEY, { adapter: f.adapter }).updateLead('42', { title: 'Lead' });
    expect(f.calls[0]).toMatchObject({ method: 'PATCH', url: 'https://api.hubapi.com/crm/v3/objects/leads/42', data: { properties: { hs_lead_name: 'Lead' } } });
    expect(f.calls[0]!.headers['Authorization']).toBe(`Bearer ${KEY}`);
  });

  it('opretter note og associerer den til leadet', async () => {
    const f = fakeAdapter([{ status: 201, data: { id: 'n9' } }, { status: 200 }]);
    const id = await new HubSpotConnector('https://api.hubapi.com', KEY, { adapter: f.adapter })
      .addOutreachNote('42', { templateId: 'followup_v1', subject: 's', body: 'b' });
    expect(f.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.hubapi.com/crm/v3/objects/notes',
      'PUT https://api.hubapi.com/crm/v4/objects/notes/n9/associations/default/leads/42',
    ]);
    expect(id).toBe('n9');
  });

  it('læser og sletter', async () => {
    const f = fakeAdapter([{ status: 200, data: { id: '42', properties: { hs_lead_name: 'Berg El' } } }, { status: 204 }]);
    const c = new HubSpotConnector('https://api.hubapi.com', KEY, { adapter: f.adapter });
    expect(await c.getLead('42')).toEqual({ id: '42', title: 'Berg El' });
    await c.deleteNote('n9');
    expect(f.calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      'GET https://api.hubapi.com/crm/v3/objects/leads/42?properties=hs_lead_name',
      'DELETE https://api.hubapi.com/crm/v3/objects/notes/n9',
    ]);
  });
});

describe('HTTP-lag', () => {
  it('prøver igen ved 429 og respekterer Retry-After', async () => {
    const waits: number[] = [];
    const f = fakeAdapter([{ status: 429, headers: { 'retry-after': '2' } }, { status: 429 }, { status: 200 }]);
    await new PipedriveConnector('https://x.pipedrive.com', KEY, { adapter: f.adapter, sleep: async (ms) => { waits.push(ms); } })
      .updateLead('a', { title: 't' });
    expect(f.calls).toHaveLength(3);
    expect(waits).toEqual([2000, 2000]);
  });

  it('POST prøves ikke igen ved 5xx (undgår dobbelte noter), men ved 429', async () => {
    const f = fakeAdapter([{ status: 429 }, { status: 503 }]);
    const c = new PipedriveConnector('https://x.pipedrive.com', KEY, { adapter: f.adapter, sleep: noSleep });
    await expect(c.addOutreachNote('a', { templateId: 't_v1', subject: 's', body: 'b' })).rejects.toThrow(/503/);
    expect(f.calls).toHaveLength(2);
  });

  it('giver op efter maxRetries', async () => {
    const f = fakeAdapter([{ status: 503 }, { status: 503 }, { status: 503 }]);
    const c = new PipedriveConnector('https://x.pipedrive.com', KEY, { adapter: f.adapter, sleep: noSleep, maxRetries: 2 });
    await expect(c.updateLead('a', {})).rejects.toBeInstanceOf(CrmError);
    expect(f.calls).toHaveLength(3);
  });

  it('prøver ikke igen ved 400 og lækker aldrig API-nøglen i fejlen', async () => {
    const f = fakeAdapter([{ status: 400, data: { error: 'Bad field' } }]);
    const c = new HubSpotConnector('https://api.hubapi.com', KEY, { adapter: f.adapter, sleep: noSleep });
    const err = await c.updateLead('1', { title: 't' }).catch((e: unknown) => e);
    expect(f.calls).toHaveLength(1);
    expect(err).toBeInstanceOf(CrmError);
    expect((err as CrmError).status).toBe(400);
    expect((err as CrmError).message).toContain('Bad field');
    const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));
    expect(serialized).not.toContain(KEY);
  });
});

describe('konfiguration', () => {
  it('afviser manglende nøgle uden at vise værdier', () => {
    expect(() => loadCrmEnv({ CRM_PROVIDER: 'pipedrive', CRM_URL: 'https://a.pipedrive.com', CRM_API_KEY: 'kort' })).toThrow(/CRM_API_KEY/);
    expect(() => loadCrmEnv({ CRM_PROVIDER: 'salesforce', CRM_URL: 'https://a', CRM_API_KEY: KEY })).toThrow(/CRM_PROVIDER/);
  });

  it('vælger adapter ud fra CRM_PROVIDER', () => {
    expect(createCrmConnector({ CRM_PROVIDER: 'hubspot', CRM_URL: 'https://api.hubapi.com', CRM_API_KEY: KEY }).provider).toBe('hubspot');
  });
});
