import { describe, expect, it } from 'vitest';
import { loadTemplates, parseTemplates, placeholders, render, MissingVariablesError } from '../lib/templates.js';

describe('templates.json', () => {
  it('den versionsstyrede fil er gyldig', () => {
    const t = loadTemplates();
    expect(Object.keys(t)).toContain('prospecting_v1');
  });

  it('afviser id uden version', () => {
    expect(() => parseTemplates({ prospecting: { category: 'x', subject: 's', body: 'b' } })).toThrow(/_v/);
  });

  it('afviser ubalancerede klammer', () => {
    expect(() => parseTemplates({ a_v1: { category: 'x', subject: 'Hej {{name}', body: 'b' } })).toThrow(/ubalancerede/);
  });
});

describe('render', () => {
  const tpl = { category: 'p', subject: 'Optimering af {{company}}', body: 'Hej {{ name }}, {{company}} vokser. /{{sender}}' };

  it('finder placeholders', () => {
    expect(placeholders(tpl)).toEqual(['company', 'name', 'sender']);
  });

  it('udfylder alle felter', () => {
    const out = render(tpl, { company: 'Nordvind ApS', name: 'Mette', sender: 'Carsten' });
    expect(out.subject).toBe('Optimering af Nordvind ApS');
    expect(out.body).toBe('Hej Mette, Nordvind ApS vokser. /Carsten');
  });

  it('kaster fejl ved manglende eller tomme værdier', () => {
    expect(() => render(tpl, { company: 'X', name: '  ', sender: 'C' })).toThrow(MissingVariablesError);
    try { render(tpl, { company: 'X' }); } catch (e) { expect((e as MissingVariablesError).missing).toEqual(['name', 'sender']); }
  });
});
