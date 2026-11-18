import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** Skabelon-id skal ende på en version, fx `prospecting_v1`. */
const TemplateId = z.string().regex(/^[a-z][a-z0-9_]*_v\d+$/, 'id skal have formen <navn>_v<nummer>');

const TemplateSchema = z.object({
  category: z.string().min(1),
  subject: z.string().min(1).max(150),
  body: z.string().min(1).max(5000),
});

const TemplatesFileSchema = z.record(TemplateId, TemplateSchema);

export type Template = z.infer<typeof TemplateSchema>;
export type Templates = Record<string, Template>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function parseTemplates(raw: unknown): Templates {
  if (raw && typeof raw === 'object') {
    const bad = Object.keys(raw).filter((k) => !TemplateId.safeParse(k).success);
    if (bad.length) throw new Error(`Ugyldige skabelon-id'er (skal have formen <navn>_v<nummer>): ${bad.join(', ')}`);
  }
  const result = TemplatesFileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Ugyldig templates.json:\n' + result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  }
  for (const [id, t] of Object.entries(result.data)) {
    const unbalanced = (s: string) => (s.match(/\{\{/g)?.length ?? 0) !== (s.match(/\}\}/g)?.length ?? 0);
    if (unbalanced(t.subject) || unbalanced(t.body)) throw new Error(`Skabelon ${id}: ubalancerede {{ }}`);
  }
  return result.data;
}

export function loadTemplates(path = new URL('../config/templates.json', import.meta.url)): Templates {
  return parseTemplates(JSON.parse(readFileSync(path, 'utf8')));
}

export function placeholders(template: Template): string[] {
  const names = new Set<string>();
  for (const text of [template.subject, template.body]) for (const m of text.matchAll(PLACEHOLDER)) names.add(m[1]!);
  return [...names].sort();
}

export class MissingVariablesError extends Error {
  constructor(readonly missing: string[]) {
    super(`Manglende værdier for: ${missing.join(', ')}`);
    this.name = 'MissingVariablesError';
  }
}

/** Udfylder en skabelon. Kaster fejl hvis en placeholder mangler eller er tom – så der aldrig sendes "Hej {{name}}". */
export function render(template: Template, vars: Record<string, string | undefined>): { subject: string; body: string } {
  const missing = placeholders(template).filter((k) => !vars[k]?.trim());
  if (missing.length) throw new MissingVariablesError(missing);
  const fill = (s: string) => s.replace(PLACEHOLDER, (_, k: string) => vars[k]!.trim());
  return { subject: fill(template.subject), body: fill(template.body) };
}
