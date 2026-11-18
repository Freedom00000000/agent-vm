import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Lead } from './leads.js';

/** CVR-nummer: 8 cifre, modulus 11-kontrol med vægtene 2,7,6,5,4,3,2,1. */
export function isValidCvr(raw: string | number): boolean {
  const cvr = String(raw).replace(/\s|^DK/gi, '');
  if (!/^[1-9]\d{7}$/.test(cvr)) return false;
  const weights = [2, 7, 6, 5, 4, 3, 2, 1];
  const sum = [...cvr].reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0);
  return sum % 11 === 0;
}

/** DB07 hovedgrupper 41-43: byggeri, anlæg og specialiseret bygge- og anlægsvirksomhed (tømrer, el, VVS, maler ...). */
export function isCraftIndustry(industryCode: string | number | undefined): boolean {
  if (industryCode === undefined) return false;
  return /^4[123]/.test(String(industryCode));
}

/**
 * Én række fra en CVR-eksport (cvrapi.dk-format) beriget med `crm_id`, så den kan kobles til leadet i CRM.
 * Ukendte felter ignoreres.
 */
const CvrRecordSchema = z.object({
  crm_id: z.string().min(1),
  vat: z.union([z.string(), z.number()]).transform(String),
  name: z.string().min(1),
  city: z.string().optional(),
  industrycode: z.union([z.string(), z.number()]).optional(),
  industrydesc: z.string().optional(),
  protected: z.boolean().optional(),
  email: z.string().optional(),
  enddate: z.string().nullable().optional(),
  contact_name: z.string().optional(),
  owners: z.array(z.object({ name: z.string() })).nullable().optional(),
});

export type CvrRecord = z.infer<typeof CvrRecordSchema>;

export interface CvrParseResult {
  leads: Lead[];
  excluded: { crmId: string; company: string; reason: string }[];
  warnings: { crmId: string; company: string; warning: string }[];
}

/** Normaliserer mellemrum i firmanavnet. */
export function displayCompanyName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function parseCvrRecords(raw: unknown): CvrParseResult {
  const rows = z.array(z.unknown()).parse(raw);
  const out: CvrParseResult = { leads: [], excluded: [], warnings: [] };
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const parsed = CvrRecordSchema.safeParse(row);
    if (!parsed.success) {
      out.excluded.push({ crmId: `række ${i + 1}`, company: '?', reason: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
      return;
    }
    const r = parsed.data;
    const company = displayCompanyName(r.name);
    const exclude = (reason: string) => out.excluded.push({ crmId: r.crm_id, company, reason });

    if (!isValidCvr(r.vat)) return exclude(`ugyldigt CVR-nummer (${r.vat})`);
    if (seen.has(r.vat)) return exclude(`dublet af CVR ${r.vat}`);
    seen.add(r.vat);
    if (r.enddate) return exclude(`virksomheden er ophørt (${r.enddate})`);
    if (r.protected) return exclude('reklamebeskyttet i CVR');

    const name = r.contact_name ?? r.owners?.[0]?.name;
    if (!name) return exclude('ingen kontaktperson (contact_name eller owners)');

    if (!isCraftIndustry(r.industrycode)) {
      out.warnings.push({ crmId: r.crm_id, company, warning: `branche ${r.industrycode ?? '?'} (${r.industrydesc ?? 'ukendt'}) er ikke håndværk (DB07 41-43)` });
    }

    out.leads.push({
      id: r.crm_id,
      name: firstName(name),
      company,
      cvr: r.vat,
      ...(r.city ? { city: r.city } : {}),
      ...(r.industrydesc ? { trade: r.industrydesc.toLowerCase() } : {}),
      ...(r.email && z.email().safeParse(r.email).success ? { email: r.email } : {}),
    });
  });
  return out;
}

/** "Mette Lund Hansen" -> "Mette" (til "Hej {{name}}"). */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

export function loadCvrFile(path: string): CvrParseResult {
  return parseCvrRecords(JSON.parse(readFileSync(path, 'utf8')));
}
