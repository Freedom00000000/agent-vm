#!/usr/bin/env tsx
/**
 * Outreach-pipeline CLI. Læse- og skriveoperationer er adskilt, og intet skrives til CRM uden menneskelig godkendelse.
 *
 *  LÆS (ingen CRM-skrivning)
 *   validate                                   Validér config/templates.json
 *   list                                       Vis skabeloner og placeholders
 *   cvr      -i <cvr.json> -o <leads.json>     Parse/validér CVR-data -> leads-fil
 *   generate -t <id> -l <leads.json> -s <afsender> [-o <review.json>]
 *                                              Lav review-fil (alle punkter "approved": false)
 *   smoke    --lead <crm-id>                   Read-only test-kald mod CRM (tjek nøgle/URL)
 *
 *  SKRIV (kræver godkendt review-fil)
 *   apply    -r <review.json> [--max 50]       Skriv godkendte tekster som noter i CRM
 *   rollback --log <review.applied.json>       Slet de noter et apply oprettede
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadTemplates, placeholders, render, MissingVariablesError, type Templates } from '../lib/templates.js';
import { loadLeads, type Lead } from '../lib/leads.js';
import { loadCvrFile } from '../lib/cvr.js';
import { readApprovedItems, readApplyLog, timestamp, writeJson, type ApplyLog, type ReviewFile } from '../lib/review.js';
import type { CrmConnector } from '../lib/crm_connector.js';

type Log = (msg: string) => void;

// ---------------------------------------------------------------- generate (læs)

export interface GenerateResult {
  review: ReviewFile;
  skipped: { leadId: string; reason: string }[];
}

export function generateReview(templates: Templates, templateId: string, leads: Lead[], sender: string, log: Log = console.log): GenerateResult {
  const template = templates[templateId];
  if (!template) throw new Error(`Ukendt skabelon "${templateId}". Findes: ${Object.keys(templates).join(', ')}`);

  const review: ReviewFile = { kind: 'outreach-review', templateId, createdAt: new Date().toISOString(), items: [] };
  const skipped: GenerateResult['skipped'] = [];
  for (const lead of leads) {
    try {
      const msg = render(template, { ...lead, sender });
      review.items.push({ leadId: lead.id, company: lead.company, ...msg, approved: false });
      log(`  ${lead.id}: "${msg.subject}"`);
    } catch (e) {
      if (!(e instanceof MissingVariablesError)) throw e;
      skipped.push({ leadId: lead.id, reason: e.message });
      log(`  SPRUNGET OVER ${lead.id}: ${e.message}`);
    }
  }
  return { review, skipped };
}

// ---------------------------------------------------------------- apply (skriv)

export interface ApplyOptions {
  reviewPath: string;
  crm: CrmConnector;
  max: number;
  log?: Log;
}

export const applyLogPath = (reviewPath: string) => reviewPath.replace(/\.json$/, '') + '.applied.json';

export async function applyReview({ reviewPath, crm, max, log = console.log }: ApplyOptions): Promise<ApplyLog> {
  const logPath = applyLogPath(reviewPath);
  if (existsSync(logPath)) throw new Error(`Review-filen er allerede anvendt (${logPath}). Lav en ny review-fil for at undgå dobbelte noter.`);

  const { review, approved } = readApprovedItems(reviewPath);
  if (approved.length === 0) throw new Error('Ingen punkter har "approved": true – intet at skrive.');
  if (approved.length > max) throw new Error(`${approved.length} godkendte punkter overstiger grænsen på ${max} (brug --max for at hæve den).`);

  const result: ApplyLog = {
    kind: 'outreach-apply-log', provider: crm.provider, templateId: review.templateId,
    reviewFile: reviewPath, appliedAt: new Date().toISOString(), notes: [], failed: [], rolledBack: [],
  };
  log(`Skriver ${approved.length} af ${review.items.length} punkter til ${crm.provider} ...`);
  for (const item of approved) {
    try {
      const noteId = await crm.addOutreachNote(item.leadId, { templateId: review.templateId, subject: item.subject, body: item.body });
      result.notes.push({ leadId: item.leadId, noteId });
      log(`  ✔ ${item.leadId} (note ${noteId})`);
    } catch (e) {
      result.failed.push({ leadId: item.leadId, reason: (e as Error).message });
      log(`  ✘ ${item.leadId}: ${(e as Error).message}`);
    }
    writeJson(logPath, result); // gem løbende, så rollback virker selv hvis kørslen afbrydes
  }
  return result;
}

// ---------------------------------------------------------------- rollback (skriv)

export async function rollback(logPath: string, crm: CrmConnector, log: Log = console.log): Promise<ApplyLog> {
  const applied = readApplyLog(logPath);
  if (applied.provider !== crm.provider) throw new Error(`Loggen er fra ${applied.provider}, men CRM_PROVIDER er ${crm.provider}`);
  for (const { leadId, noteId } of applied.notes) {
    if (applied.rolledBack.includes(noteId)) continue;
    try {
      await crm.deleteNote(noteId);
      applied.rolledBack.push(noteId);
      log(`  ↶ ${leadId}: note ${noteId} slettet`);
    } catch (e) {
      log(`  ✘ ${leadId}: kunne ikke slette note ${noteId}: ${(e as Error).message}`);
    }
    writeJson(logPath, applied);
  }
  return applied;
}

// ---------------------------------------------------------------- CLI

async function crmFromEnv(): Promise<CrmConnector> {
  const { createCrmConnector } = await import('../lib/crm_connector.js');
  return createCrmConnector();
}

/**
 * Et CRM-lead-id er et UUID (Pipedrive) eller et tal (HubSpot) – aldrig et firmanavn.
 * Fanger fx `--lead inside ai`, som ellers sendes til CRM og giver en uforståelig 4xx/500.
 */
export function checkLeadId(id: string, extra: string[] = []): void {
  const hint = 'Brug leadets CRM-id (UUID i Pipedrive, tal i HubSpot) – ikke firmanavnet. Id\'et står i URL\'en, når du åbner leadet i CRM.';
  if (extra.length) throw new Error(`Uventede argumenter efter --lead ${id}: "${extra.join(' ')}". ${hint}`);
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error(`Ugyldigt lead-id "${id}". ${hint}`);
}

const USAGE = `Brug: npm run outreach -- <kommando> [flag]
  validate | list
  cvr      -i <cvr.json> -o <leads.json>
  generate -t <skabelon> -l <leads.json> -s <afsender> [-o <review.json>]
  smoke    --lead <crm-id>
  apply    -r <review.json> [--max 50]
  rollback --log <review.applied.json>`;

export async function main(argv: string[]): Promise<number> {
  const { positionals, values: v } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      template: { type: 'string', short: 't' },
      leads: { type: 'string', short: 'l' },
      sender: { type: 'string', short: 's' },
      input: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o' },
      review: { type: 'string', short: 'r' },
      log: { type: 'string' },
      lead: { type: 'string' },
      max: { type: 'string', default: '50' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const cmd = positionals[0];
  const need = (...keys: (keyof typeof v)[]) => {
    const missing = keys.filter((k) => !v[k]);
    if (missing.length) throw new Error(`${cmd} kræver: ${missing.map((k) => `--${k}`).join(', ')}`);
  };

  switch (cmd) {
    case 'validate': {
      console.log(`✔ ${Object.keys(loadTemplates()).length} skabeloner er gyldige`);
      return 0;
    }
    case 'list': {
      for (const [id, t] of Object.entries(loadTemplates())) console.log(`${id}  [${t.category}]  ${placeholders(t).join(', ')}`);
      return 0;
    }
    case 'cvr': {
      need('input', 'out');
      const res = loadCvrFile(v.input!);
      writeJson(v.out!, res.leads);
      for (const x of res.excluded) console.log(`  UDELADT ${x.crmId} ${x.company}: ${x.reason}`);
      for (const x of res.warnings) console.log(`  ADVARSEL ${x.crmId} ${x.company}: ${x.warning}`);
      console.log(`\n${res.leads.length} leads skrevet til ${v.out}  ·  udeladt: ${res.excluded.length}  ·  advarsler: ${res.warnings.length}`);
      return res.excluded.length ? 2 : 0;
    }
    case 'generate': {
      need('template', 'leads', 'sender');
      const out = v.out ?? `out/review-${v.template}-${timestamp()}.json`;
      const { review, skipped } = generateReview(loadTemplates(), v.template!, loadLeads(v.leads!), v.sender!);
      writeJson(out, review);
      console.log(`\nReview-fil: ${out}  (${review.items.length} tekster, ${skipped.length} sprunget over)`);
      console.log('Næste skridt: læs teksterne, sæt "approved": true på dem der må bruges, og kør apply.');
      return skipped.length ? 2 : 0;
    }
    case 'smoke': {
      need('lead');
      checkLeadId(v.lead!, positionals.slice(1));
      const crm = await crmFromEnv();
      const lead = await crm.getLead(v.lead!);
      console.log(`✔ ${crm.provider} svarer. Lead ${lead.id}: "${lead.title}" (read-only, intet ændret)`);
      return 0;
    }
    case 'apply': {
      need('review');
      const max = Number(v.max);
      if (!Number.isInteger(max) || max < 1) throw new Error('--max skal være et positivt heltal');
      const res = await applyReview({ reviewPath: v.review!, crm: await crmFromEnv(), max });
      console.log(`\nOprettet: ${res.notes.length}  Fejlet: ${res.failed.length}  ·  log: ${applyLogPath(v.review!)}`);
      return res.failed.length ? 2 : 0;
    }
    case 'rollback': {
      need('log');
      const res = await rollback(v.log!, await crmFromEnv());
      const left = res.notes.length - res.rolledBack.length;
      console.log(`\nSlettet: ${res.rolledBack.length}  Tilbage: ${left}`);
      return left ? 2 : 0;
    }
    default:
      console.log(USAGE);
      return v.help ? 0 : 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: Error) => {
      console.error(`Fejl: ${e.message}`);
      process.exit(1);
    },
  );
}
