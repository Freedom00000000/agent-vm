import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLogPath, applyReview, generateReview, rollback } from '../scripts/outreach_generator.js';
import { loadTemplates } from '../lib/templates.js';
import type { CrmConnector } from '../lib/crm_connector.js';
import type { ApplyLog, ReviewFile } from '../lib/review.js';

const templates = loadTemplates();
const silent = () => {};
const leads = [
  { id: 'l1', name: 'Mette', company: 'Hansen Tømrer ApS' },
  { id: 'l2', name: '', company: 'Tom A/S' },
  { id: 'l3', name: 'Jonas', company: 'Berg El A/S' },
];

function fakeCrm(failFor?: string) {
  let n = 0;
  return {
    provider: 'pipedrive' as const,
    getLead: vi.fn(),
    updateLead: vi.fn(),
    addOutreachNote: vi.fn(async (id: string) => {
      if (id === failFor) throw new Error('500');
      return `n${++n}`;
    }),
    deleteNote: vi.fn(async () => {}),
  } satisfies CrmConnector;
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'outreach-')); });

function writeReview(approve: string[]): string {
  const { review } = generateReview(templates, 'haandvaerk_30min_v1', leads, 'Carsten', silent);
  for (const item of review.items) item.approved = approve.includes(item.leadId);
  const path = join(dir, 'review.json');
  writeFileSync(path, JSON.stringify(review));
  return path;
}

describe('generateReview', () => {
  it('laver review med alt ikke-godkendt og springer manglende felter over', () => {
    const { review, skipped } = generateReview(templates, 'haandvaerk_30min_v1', leads, 'Carsten', silent);
    expect(review.items.map((i) => i.leadId)).toEqual(['l1', 'l3']);
    expect(review.items.every((i) => i.approved === false)).toBe(true);
    expect(review.items[0]!.subject).toBe('30 minutter tilbage i hverdagen hos Hansen Tømrer ApS');
    expect(skipped).toEqual([{ leadId: 'l2', reason: 'Manglende værdier for: name' }]);
  });

  it('afviser ukendt skabelon', () => {
    expect(() => generateReview(templates, 'nope_v1', leads, 'C', silent)).toThrow(/Ukendt/);
  });
});

describe('applyReview', () => {
  it('skriver kun godkendte punkter og gemmer note-id i log', async () => {
    const crm = fakeCrm();
    const res = await applyReview({ reviewPath: writeReview(['l3']), crm, max: 50, log: silent });
    expect(crm.addOutreachNote).toHaveBeenCalledTimes(1);
    expect(crm.addOutreachNote.mock.calls[0]![0]).toBe('l3');
    expect(res.notes).toEqual([{ leadId: 'l3', noteId: 'n1' }]);
  });

  it('nægter at køre uden godkendelser, over --max og to gange på samme review', async () => {
    const crm = fakeCrm();
    await expect(applyReview({ reviewPath: writeReview([]), crm, max: 50, log: silent })).rejects.toThrow(/approved/);
    await expect(applyReview({ reviewPath: writeReview(['l1', 'l3']), crm, max: 1, log: silent })).rejects.toThrow(/grænsen/);
    const path = writeReview(['l1']);
    await applyReview({ reviewPath: path, crm, max: 50, log: silent });
    await expect(applyReview({ reviewPath: path, crm, max: 50, log: silent })).rejects.toThrow(/allerede anvendt/);
    expect(crm.addOutreachNote).toHaveBeenCalledTimes(1);
  });

  it('afviser godkendt tekst med uudfyldt placeholder (manuelt redigeret)', async () => {
    const path = writeReview(['l1']);
    const review = JSON.parse(readFileSync(path, 'utf8')) as ReviewFile;
    review.items[0]!.body = 'Hej {{name}}';
    writeFileSync(path, JSON.stringify(review));
    await expect(applyReview({ reviewPath: path, crm: fakeCrm(), max: 50, log: silent })).rejects.toThrow(/placeholders/);
  });

  it('fortsætter ved fejl og logger dem', async () => {
    const res = await applyReview({ reviewPath: writeReview(['l1', 'l3']), crm: fakeCrm('l1'), max: 50, log: silent });
    expect(res.failed.map((f) => f.leadId)).toEqual(['l1']);
    expect(res.notes.map((n) => n.leadId)).toEqual(['l3']);
  });
});

describe('rollback', () => {
  it('sletter oprettede noter, kan genoptages og tjekker provider', async () => {
    const crm = fakeCrm();
    const reviewPath = writeReview(['l1', 'l3']);
    await applyReview({ reviewPath, crm, max: 50, log: silent });
    const logPath = applyLogPath(reviewPath);
    expect(existsSync(logPath)).toBe(true);

    crm.deleteNote.mockRejectedValueOnce(new Error('timeout'));
    let res = await rollback(logPath, crm, silent);
    expect(res.rolledBack).toEqual(['n2']);

    res = await rollback(logPath, crm, silent);
    expect(res.rolledBack.sort()).toEqual(['n1', 'n2']);
    expect(crm.deleteNote).toHaveBeenCalledTimes(3);

    const hub = { ...fakeCrm(), provider: 'hubspot' as const };
    await expect(rollback(logPath, hub, silent)).rejects.toThrow(/pipedrive/);
    expect((JSON.parse(readFileSync(logPath, 'utf8')) as ApplyLog).rolledBack).toHaveLength(2);
  });
});
