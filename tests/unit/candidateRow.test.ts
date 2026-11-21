/**
 * Proves (unit level, Moment 1): the spreadsheet row validator gives exact
 * per-row, per-column errors, normalises good input and blocks formula injection.
 */
import { describe, expect, it } from 'vitest';
import { FORMULA_MESSAGE, PHONE_MESSAGE, SCORE_MESSAGE, normaliseDate, normalisePhone, validateSpreadsheet } from '@certiflow/shared';

const headers = ['full_name', 'phone', 'enrolment_id', 'dob', 'score', 'passed_on'];
const row = (n: number, v: Partial<Record<string, string>> = {}) => ({
  rowNumber: n,
  values: { full_name: 'Asha Rao', phone: '+919812345678', enrolment_id: `E-${n}`, dob: '2003-01-01', score: '70', passed_on: '2026-10-01', ...v },
});

describe('phone and date normalisation', () => {
  it.each([
    ['+919812345678', '+919812345678'],
    ['9812345678', '+919812345678'],
    ['09812345678', '+919812345678'],
    ['919812345678', '+919812345678'],
    ['+91 98123-45678', '+919812345678'],
    ['12345', null],
    ['+14155550100', null],
    ['5812345678', null],
  ])('phone %s -> %s', (input, expected) => expect(normalisePhone(input)).toBe(expected));

  it.each([
    ['2026-10-15', '2026-10-15'],
    ['15/10/2026', '2026-10-15'],
    ['15-10-2026', '2026-10-15'],
    ['2026-02-30', null],
    ['31/04/2026', null],
    ['yesterday', null],
  ])('date %s -> %s', (input, expected) => expect(normaliseDate(input)).toBe(expected));
});

describe('validateSpreadsheet', () => {
  it('accepts a clean sheet and normalises values', () => {
    const r = validateSpreadsheet({ headers, rows: [row(2, { phone: '9812345678', passed_on: '01/10/2026' }), row(3)] }, 100);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidates).toHaveLength(2);
      expect(r.candidates[0]).toMatchObject({ phone: '+919812345678', passedOn: '2026-10-01', score: 70 });
    }
  });

  it('reports every bad cell with row, column and message', () => {
    const r = validateSpreadsheet(
      {
        headers,
        rows: [
          row(2),
          row(3, { phone: '12345' }),
          row(4, { score: '140' }),
          row(5, { full_name: '=CMD()' }),
          row(6, { enrolment_id: '@evil' }),
          row(7, { passed_on: '2099-01-01' }),
          row(8, { enrolment_id: 'E-2' }),
        ],
      },
      100,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        { row: 3, column: 'phone', message: PHONE_MESSAGE },
        { row: 4, column: 'score', message: SCORE_MESSAGE },
        { row: 5, column: 'full_name', message: FORMULA_MESSAGE },
        { row: 6, column: 'enrolment_id', message: FORMULA_MESSAGE },
        { row: 7, column: 'passed_on', message: 'Passed-on date cannot be in the future' },
        { row: 8, column: 'enrolment_id', message: 'Duplicate enrolment ID (already used on row 2)' },
      ]);
    }
  });

  it('rejects missing and unknown columns before looking at rows', () => {
    const r = validateSpreadsheet({ headers: ['full_name', 'phone', 'score', 'passed_on', 'aadhaar'], rows: [] }, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => [e.row, e.column])).toEqual([
        [1, 'aadhaar'],
        [1, 'enrolment_id'],
      ]);
    }
  });

  it('enforces the row limit', () => {
    const r = validateSpreadsheet({ headers, rows: [row(2), row(3), row(4)] }, 2);
    expect(r.ok).toBe(false);
  });

  it('ignores fully blank rows', () => {
    const blank = { rowNumber: 3, values: Object.fromEntries(headers.map((h) => [h, ''])) };
    const r = validateSpreadsheet({ headers, rows: [row(2), blank] }, 100);
    expect(r.ok).toBe(true);
  });
});
