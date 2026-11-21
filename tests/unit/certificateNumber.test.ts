/**
 * Proves (unit level, "Never - data leak / duplicates"): certificate numbers are
 * random (not sequential), carry a working check character, and public names are masked.
 */
import { describe, expect, it } from 'vitest';
import { generateCertificateNumber, isValidCertificateNumber, maskName, normaliseCertificateNumber } from '@certiflow/shared';

describe('certificate numbers', () => {
  it('have the documented format and a valid check character', () => {
    for (let i = 0; i < 500; i++) {
      const n = generateCertificateNumber(2026);
      expect(n).toMatch(/^PSM-2026-[0-9A-HJKMNP-TV-Z]{11}$/);
      expect(isValidCertificateNumber(n)).toBe(true);
    }
  });

  it('are not sequential and practically never repeat', () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateCertificateNumber(2026)));
    expect(set.size).toBe(5000);
  });

  it('detect a single mistyped character', () => {
    const n = generateCertificateNumber(2026);
    const last = n.slice(-2, -1);
    const typo = n.slice(0, -2) + (last === 'A' ? 'B' : 'A') + n.slice(-1);
    expect(isValidCertificateNumber(typo)).toBe(false);
  });

  it('forgive case and Crockford look-alikes on input', () => {
    expect(normaliseCertificateNumber(' psm-2026-oil23 ')).toBe('PSM-2026-01123');
  });
});

describe('maskName', () => {
  it.each([
    ['Anika Sharma', 'A**** S****'],
    ['  priya   devi  rao ', 'P**** D**** R****'],
    ['Ä Ö', 'Ä**** Ö****'],
  ])('%s -> %s', (input, expected) => expect(maskName(input)).toBe(expected));
});
