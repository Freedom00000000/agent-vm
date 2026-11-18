import { describe, expect, it } from 'vitest';
import { firstName, isCraftIndustry, isValidCvr, parseCvrRecords, loadCvrFile } from '../lib/cvr.js';

const base = { crm_id: 'c1', vat: '31000548', name: 'Hansen Tømrer ApS', industrycode: 433200, owners: [{ name: 'Mette Lund Hansen' }] };

describe('CVR-validering', () => {
  it('modulus 11', () => {
    expect(isValidCvr('31000548')).toBe(true);
    expect(isValidCvr('DK 31000548'.replace(' ', ''))).toBe(true);
    expect(isValidCvr(31001781)).toBe(true);
    expect(isValidCvr('31000001')).toBe(false);
    expect(isValidCvr('1234567')).toBe(false);
    expect(isValidCvr('01000548')).toBe(false);
  });

  it('håndværksbrancher er DB07 41-43', () => {
    expect(isCraftIndustry(433200)).toBe(true);
    expect(isCraftIndustry('412000')).toBe(true);
    expect(isCraftIndustry(620100)).toBe(false);
    expect(isCraftIndustry(undefined)).toBe(false);
  });

  it('fornavn til hilsen', () => expect(firstName('  Mette Lund Hansen ')).toBe('Mette'));
});

describe('parseCvrRecords', () => {
  it('laver lead med placeholder-felter', () => {
    const res = parseCvrRecords([{ ...base, city: 'Odense', industrydesc: 'Tømrer', email: 'ikke-en-mail' }]);
    expect(res.excluded).toEqual([]);
    expect(res.leads).toEqual([{ id: 'c1', name: 'Mette', company: 'Hansen Tømrer ApS', cvr: '31000548', city: 'Odense', trade: 'tømrer' }]);
  });

  it('udelader reklamebeskyttede, ophørte, dubletter, ugyldige og uden kontakt', () => {
    const res = parseCvrRecords([
      base,
      { ...base, crm_id: 'c2' },
      { ...base, crm_id: 'c3', vat: '31001781', protected: true },
      { ...base, crm_id: 'c4', vat: '31002192', enddate: '2024-01-01' },
      { ...base, crm_id: 'c5', vat: '31000001' },
      { ...base, crm_id: 'c6', vat: '31002877', owners: [] },
      { name: 'mangler felter' },
    ]);
    expect(res.leads.map((l) => l.id)).toEqual(['c1']);
    expect(res.excluded.map((x) => x.reason)).toEqual([
      'dublet af CVR 31000548',
      'reklamebeskyttet i CVR',
      'virksomheden er ophørt (2024-01-01)',
      'ugyldigt CVR-nummer (31000001)',
      'ingen kontaktperson (contact_name eller owners)',
      expect.stringContaining('crm_id'),
    ]);
  });

  it('advarer ved branche uden for håndværk', () => {
    const res = parseCvrRecords([{ ...base, industrycode: 620100, industrydesc: 'Computerprogrammering' }]);
    expect(res.leads).toHaveLength(1);
    expect(res.warnings[0]!.warning).toContain('620100');
  });

  it('eksempelfilen giver 2 leads og udelader den reklamebeskyttede', () => {
    const res = loadCvrFile('data/cvr.example.json');
    expect(res.leads.map((l) => l.id)).toEqual(['lead-001', 'lead-002']);
    expect(res.excluded[0]!.reason).toBe('reklamebeskyttet i CVR');
  });
});
