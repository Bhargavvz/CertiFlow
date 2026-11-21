// Spreadsheet validation for candidate imports (Moment 1).
// Validates EVERYTHING first and returns a precise per-row, per-column error list;
// the caller saves nothing unless the whole file is valid.
import { z } from 'zod';

export const CANDIDATE_COLUMNS = ['full_name', 'phone', 'enrolment_id', 'dob', 'score', 'passed_on'] as const;
export type CandidateColumn = (typeof CANDIDATE_COLUMNS)[number];
export const REQUIRED_COLUMNS: readonly CandidateColumn[] = ['full_name', 'phone', 'enrolment_id', 'score', 'passed_on'];

export interface RowError {
  /** Spreadsheet row number as the user sees it (header = row 1). */
  row: number;
  column: string;
  /** What the cell contained (trimmed to 60 chars), so the centre can find it in their sheet. */
  value: string;
  message: string;
}

/** Echo back at most 60 characters of the offending cell. */
export function cellPreview(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

export interface CandidateInput {
  fullName: string;
  phone: string;
  enrolmentId: string;
  dob: string | null;
  score: number;
  passedOn: string;
}

export interface SheetInput {
  headers: string[];
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export type SheetValidation =
  | { ok: true; candidates: CandidateInput[] }
  | { ok: false; errors: RowError[]; totalRows: number };

// Cells starting with these characters are executed as formulas by Excel/Sheets
// when someone later opens an export (CSV/formula injection, e.g. =CMD()).
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
export const FORMULA_MESSAGE = 'Must not start with =, +, -, @ (blocked to prevent spreadsheet formula injection)';
export const PHONE_MESSAGE = 'Phone must be an Indian mobile number, e.g. +919876543210';
export const SCORE_MESSAGE = 'Score must be a whole number from 0 to 100';

/** Accepts +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX or XXXXXXXXXX (spaces/dashes ignored); returns E.164. */
export function normalisePhone(raw: string): string | null {
  const compact = raw.replace(/[\s()-]/g, '');
  if (/^\+91[6-9]\d{9}$/.test(compact)) return compact;
  if (/^91[6-9]\d{9}$/.test(compact)) return `+${compact}`;
  if (/^0?[6-9]\d{9}$/.test(compact)) return `+91${compact.slice(-10)}`;
  return null;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY; returns YYYY-MM-DD or null if not a real date. */
export function normaliseDate(raw: string): string | null {
  const v = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else if ((match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(v))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const text = (label: string, max: number) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`)
    .refine((v) => !FORMULA_PREFIX.test(v), FORMULA_MESSAGE);

const requiredDate = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .transform((v, ctx) => {
      const d = normaliseDate(v);
      if (!d) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a date like 2026-10-15 or 15/10/2026` });
        return z.NEVER;
      }
      return d;
    });

export const candidateRowSchema = z
  .object({
    full_name: text('Full name', 100).refine(
      (v) => /^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(v),
      'Full name may contain only letters, spaces, dots, apostrophes and hyphens',
    ),
    phone: z
      .string({ required_error: 'Phone is required' })
      .trim()
      .min(1, 'Phone is required')
      .transform((v, ctx) => {
        const phone = normalisePhone(v);
        if (!phone) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_MESSAGE });
          return z.NEVER;
        }
        return phone;
      }),
    enrolment_id: text('Enrolment ID', 40).refine(
      (v) => /^[A-Za-z0-9][A-Za-z0-9/-]{2,39}$/.test(v),
      'Enrolment ID must be 3-40 letters, digits, "/" or "-"',
    ),
    dob: z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        const d = normaliseDate(v);
        if (!d) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date of birth must be a date like 2004-06-15 or 15/06/2004' });
          return z.NEVER;
        }
        return d;
      }),
    score: z
      .string({ required_error: 'Score is required' })
      .trim()
      .min(1, 'Score is required')
      .transform((v, ctx) => {
        if (!/^\d{1,3}$/.test(v) || Number(v) > 100) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: SCORE_MESSAGE });
          return z.NEVER;
        }
        return Number(v);
      }),
    passed_on: requiredDate('Passed-on date'),
  })
  .superRefine((row, ctx) => {
    // Cross-field rules only make sense once the individual fields parsed.
    if (typeof row.passed_on !== 'string') return;
    const today = new Date().toISOString().slice(0, 10);
    if (row.passed_on > today) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['passed_on'], message: 'Passed-on date cannot be in the future' });
    }
    if (typeof row.dob === 'string') {
      const ageAtPass = Number(row.passed_on.slice(0, 4)) - Number(row.dob.slice(0, 4));
      if (row.dob >= row.passed_on || ageAtPass < 14 || ageAtPass > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dob'],
          message: 'Date of birth must make the candidate 14-100 years old on the passed-on date',
        });
      }
    }
  });

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function validateSpreadsheet(sheet: SheetInput, maxRows: number): SheetValidation {
  const headers = sheet.headers.map(normaliseHeader);
  const errors: RowError[] = [];

  // 1. Header problems make every row meaningless, so report them alone.
  const seenHeaders = new Set<string>();
  for (const h of headers) {
    if (!h) continue;
    if (seenHeaders.has(h)) errors.push({ row: 1, column: h, value: h, message: `Column "${h}" appears more than once` });
    seenHeaders.add(h);
    if (!(CANDIDATE_COLUMNS as readonly string[]).includes(h)) {
      errors.push({ row: 1, column: h, value: h, message: `Unknown column "${h}". Allowed columns: ${CANDIDATE_COLUMNS.join(', ')}` });
    }
  }
  for (const col of REQUIRED_COLUMNS) {
    if (!seenHeaders.has(col)) errors.push({ row: 1, column: col, value: '', message: `Missing required column "${col}"` });
  }
  if (errors.length) return { ok: false, errors, totalRows: sheet.rows.length };

  // Re-key values by normalised header and drop fully blank rows.
  const rows = sheet.rows
    .map((r) => ({
      rowNumber: r.rowNumber,
      values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [normaliseHeader(k), v ?? ''])),
    }))
    .filter((r) => Object.values(r.values).some((v) => String(v).trim() !== ''));

  if (rows.length === 0) return { ok: false, errors: [{ row: 2, column: '(file)', value: '', message: 'The file has no candidate rows' }], totalRows: 0 };
  if (rows.length > maxRows) {
    return { ok: false, errors: [{ row: maxRows + 2, column: '(file)', value: '', message: `A batch may have at most ${maxRows} candidates` }], totalRows: rows.length };
  }

  // 2. Validate every row; never stop at the first error.
  const candidates: CandidateInput[] = [];
  const firstRowForEnrolment = new Map<string, number>();
  for (const r of rows) {
    const parsed = candidateRowSchema.safeParse(r.values);
    if (!parsed.success) {
      const reported = new Set<string>();
      for (const issue of parsed.error.issues) {
        const column = String(issue.path[0] ?? '(row)');
        if (reported.has(column)) continue; // one clear message per cell
        reported.add(column);
        errors.push({ row: r.rowNumber, column, value: cellPreview(r.values[column]), message: issue.message });
      }
      continue;
    }
    const key = parsed.data.enrolment_id.toUpperCase();
    const firstRow = firstRowForEnrolment.get(key);
    if (firstRow !== undefined) {
      errors.push({ row: r.rowNumber, column: 'enrolment_id', value: cellPreview(r.values.enrolment_id), message: `Duplicate enrolment ID (already used on row ${firstRow})` });
      continue;
    }
    firstRowForEnrolment.set(key, r.rowNumber);
    candidates.push({
      fullName: parsed.data.full_name,
      phone: parsed.data.phone,
      enrolmentId: parsed.data.enrolment_id,
      dob: parsed.data.dob,
      score: parsed.data.score,
      passedOn: parsed.data.passed_on,
    });
  }

  errors.sort((a, b) => a.row - b.row);
  return errors.length ? { ok: false, errors, totalRows: rows.length } : { ok: true, candidates };
}
