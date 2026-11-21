import { describe, expect, it } from 'vitest';
import { checkLeadId } from '../scripts/outreach_generator.js';

describe('smoke: lead-id-validering', () => {
  it('accepterer Pipedrive-UUID og HubSpot-tal', () => {
    expect(() => checkLeadId('adf21080-0e10-11eb-879b-05d71fb426ec')).not.toThrow();
    expect(() => checkLeadId('42')).not.toThrow();
  });

  it('afviser firmanavn uden anførselstegn (--lead inside ai)', () => {
    expect(() => checkLeadId('inside', ['ai'])).toThrow(/Uventede argumenter.*ikke firmanavnet/);
  });

  it('afviser firmanavn i anførselstegn', () => {
    expect(() => checkLeadId('inside ai')).toThrow(/Ugyldigt lead-id/);
  });
});
