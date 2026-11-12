import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoFields } from '../test/fixtures';
import { fieldRepository, isField, isUntouchedLegacySample, needsLegacyReview } from './repository';

afterEach(() => vi.unstubAllGlobals());

describe('local field repository', () => {
  it('starts empty and identifies untouched legacy sample records without deleting them', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(fieldRepository.getAll()).toEqual([]);
    const modified = { ...demoFields[0], name: 'My edited field' };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([demoFields[1], modified]) });
    expect(fieldRepository.getAll()).toEqual([demoFields[1], modified]);
    expect(isUntouchedLegacySample(demoFields[1])).toBe(true);
    expect(isUntouchedLegacySample(modified)).toBe(false);
    expect(needsLegacyReview(modified)).toBe(true);
    expect(needsLegacyReview({ ...modified, reviewedRealData: true })).toBe(false);
    vi.stubGlobal('localStorage', { getItem: () => '[]' });
    expect(fieldRepository.getAll()).toEqual([]);
  });

  it('validates coordinates, numeric soil values and corrupt storage', () => {
    expect(isField(demoFields[0])).toBe(true);
    expect(isField({ ...demoFields[0], latitude: 500 })).toBe(false);
    expect(isField({ ...demoFields[0], soil: { ...demoFields[0].soil, nitrogen: 'high' } })).toBe(false);
    vi.stubGlobal('localStorage', { getItem: () => '{broken' });
    expect(() => fieldRepository.getAll()).toThrow('could not be read');
  });

  it('surfaces quota errors instead of claiming changes were saved', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceeded'); } });
    expect(() => fieldRepository.saveAll(demoFields)).toThrow('full or unavailable');
  });

  it('accepts optional measured details and preserves legacy records while rejecting invalid extensions', () => {
    const extended = { ...demoFields[0], country: 'Lebanon', areaUnit: 'acre', archived: true, soil: { ...demoFields[0].soil, provenance: 'measured', salinity: 1.2, moisture: 18, sampleDate: '2025-03-02', sampleDepthCm: 20, laboratory: 'Regional lab', testMethod: 'Olsen' }, irrigation: { method: 'drip', source: 'well', seasonalRestrictions: 'summer limit' }, priorities: ['production', 'risk-reduction'] };
    expect(isField(extended)).toBe(true);
    expect(isField({ ...extended, soil: { ...extended.soil, salinity: -1 } })).toBe(false);
    expect(isField({ ...extended, soil: { ...extended.soil, sampleDate: '2025-02-30' } })).toBe(false);
    expect(isField({ ...extended, soilReport: { id: 'x', filename: 'file.exe', mimeType: 'application/x-msdownload', size: 10 } })).toBe(false);
    expect(isField(demoFields[0])).toBe(true);
  });
});

