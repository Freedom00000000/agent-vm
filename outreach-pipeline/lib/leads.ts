import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const LeadSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    company: z.string().min(1),
    email: z.email().optional(),
  })
  .catchall(z.string());

export type Lead = z.infer<typeof LeadSchema>;

export function loadLeads(path: string): Lead[] {
  const result = z.array(LeadSchema).safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!result.success) {
    throw new Error(`Ugyldig leads-fil ${path}:\n` + result.error.issues.map((i) => `  - [${i.path.join('.')}] ${i.message}`).join('\n'));
  }
  return result.data;
}
