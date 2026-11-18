import { loadCrmEnv, type CrmEnv } from './env.js';
import { HubSpotConnector } from './crm/hubspot.js';
import { PipedriveConnector } from './crm/pipedrive.js';
import type { CrmConnector } from './crm/types.js';

export type { CrmConnector, LeadInfo, LeadUpdate, OutreachNote } from './crm/types.js';
export { CrmError } from './crm/types.js';

/** Opretter den rigtige adapter ud fra CRM_PROVIDER i .env. */
export function createCrmConnector(env: CrmEnv = loadCrmEnv()): CrmConnector {
  switch (env.CRM_PROVIDER) {
    case 'pipedrive':
      return new PipedriveConnector(env.CRM_URL, env.CRM_API_KEY);
    case 'hubspot':
      return new HubSpotConnector(env.CRM_URL, env.CRM_API_KEY);
  }
}
