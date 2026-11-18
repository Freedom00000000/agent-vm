import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

/**
 * Review-fil: bindeleddet mellem generering (læs) og skrivning til CRM.
 * Et menneske skal sætte "approved": true på hvert punkt, før `apply` vil skrive det.
 */
const ReviewItemSchema = z.object({
  leadId: z.string().min(1),
  company: z.string(),
  subject: z.string().min(1),
  body: z.string().min(1),
  approved: z.boolean(),
});

export const ReviewFileSchema = z.object({
  kind: z.literal('outreach-review'),
  templateId: z.string(),
  createdAt: z.string(),
  items: z.array(ReviewItemSchema),
});

export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type ReviewFile = z.infer<typeof ReviewFileSchema>;

export const ApplyLogSchema = z.object({
  kind: z.literal('outreach-apply-log'),
  provider: z.enum(['pipedrive', 'hubspot']),
  templateId: z.string(),
  reviewFile: z.string(),
  appliedAt: z.string(),
  notes: z.array(z.object({ leadId: z.string(), noteId: z.string() })),
  failed: z.array(z.object({ leadId: z.string(), reason: z.string() })),
  rolledBack: z.array(z.string()).default([]),
});

export type ApplyLog = z.infer<typeof ApplyLogSchema>;

const UNFILLED = /\{\{|\}\}/;

/** Læser en review-fil og returnerer de godkendte punkter. Fejler hvis en godkendt tekst stadig har placeholders. */
export function readApprovedItems(path: string): { review: ReviewFile; approved: ReviewItem[] } {
  const parsed = ReviewFileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`Ugyldig review-fil ${path}:\n` + parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  }
  const review = parsed.data;
  const ids = review.items.map((i) => i.leadId);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`Lead ${dup} står flere gange i review-filen`);

  const approved = review.items.filter((i) => i.approved);
  const broken = approved.filter((i) => UNFILLED.test(i.subject) || UNFILLED.test(i.body));
  if (broken.length) throw new Error(`Godkendte tekster indeholder uudfyldte placeholders: ${broken.map((b) => b.leadId).join(', ')}`);
  return { review, approved };
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function readApplyLog(path: string): ApplyLog {
  const parsed = ApplyLogSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`Ugyldig apply-log ${path}`);
  return parsed.data;
}

export const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
