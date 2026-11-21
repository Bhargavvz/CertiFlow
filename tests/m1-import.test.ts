/**
 * Proves Moment 1 - bad spreadsheet rows: a CSV/XLSX with some bad rows gets an exact
 * per-row, per-column error report and NOTHING is saved unless the whole file is valid.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { FORMULA_MESSAGE, PHONE_MESSAGE, SCORE_MESSAGE } from '@certiflow/shared';
import { prisma } from '@certiflow/server';
import { freshWorld, loginAs } from './helpers';

const sample = (name: string) => readFileSync(join(process.cwd(), 'samples', name));

async function newDraft() {
  const anika = await loginAs('anika');
  const res = await anika.post('/api/v1/batches').send({ courseName: 'Electrician Helper' });
  expect(res.status).toBe(201);
  return { anika, id: res.body.batch.id as string };
}

describe('M1: all-or-nothing spreadsheet import', () => {
  beforeEach(async () => {
    await freshWorld();
  });

  it('rejects a CSV with 3 bad rows among 20: exact errors, 0 candidates saved', async () => {
    const { anika, id } = await newDraft();
    const res = await anika.post(`/api/v1/batches/${id}/candidates/import`).attach('file', sample('bad_batch.csv'), 'bad_batch.csv');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_SPREADSHEET');
    expect(res.body.error.details.totalRows).toBe(20);
    expect(res.body.error.details.errors).toEqual([
      { row: 5, column: 'phone', value: '12345', message: PHONE_MESSAGE },
      { row: 9, column: 'score', value: '140', message: SCORE_MESSAGE },
      { row: 14, column: 'full_name', value: '=SUM(A1:A2)', message: FORMULA_MESSAGE },
    ]);
    expect(res.body.correlationId).toBeTruthy();

    expect(await prisma.candidate.count()).toBe(0);
    const batch = await prisma.batch.findUniqueOrThrow({ where: { id } });
    expect(batch.candidateCount).toBe(0);
    expect(await prisma.auditLog.count({ where: { batchId: id, action: 'CANDIDATES_IMPORTED' } })).toBe(0);
  });

  it('imports a fully valid file and records it in the audit log', async () => {
    const { anika, id } = await newDraft();
    const res = await anika.post(`/api/v1/batches/${id}/candidates/import`).attach('file', sample('good_batch.csv'), 'good_batch.csv');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(10);
    expect(await prisma.candidate.count({ where: { batchId: id } })).toBe(10);
    const rohan = await prisma.candidate.findFirstOrThrow({ where: { batchId: id, enrolmentId: 'NGP26-0003' } });
    expect(rohan.phone).toBe('+919812300003'); // normalised from "+91 98123 00003"
    expect(await prisma.auditLog.count({ where: { batchId: id, action: 'CANDIDATES_IMPORTED' } })).toBe(1);
  });

  it('a bad re-upload leaves the previously imported list untouched', async () => {
    const { anika, id } = await newDraft();
    await anika.post(`/api/v1/batches/${id}/candidates/import`).attach('file', sample('good_batch.csv'), 'good_batch.csv').expect(200);
    await anika.post(`/api/v1/batches/${id}/candidates/import`).attach('file', sample('bad_batch.csv'), 'bad_batch.csv').expect(422);
    expect(await prisma.candidate.count({ where: { batchId: id } })).toBe(10);
  });

  it('validates XLSX the same way, including formula cells', async () => {
    const { anika, id } = await newDraft();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Candidates');
    ws.addRow(['full_name', 'phone', 'enrolment_id', 'dob', 'score', 'passed_on']);
    ws.addRow(['Asha Rao', 9812345678, 'X-001', '2003-01-01', 80, '2026-10-01']);
    ws.addRow([{ formula: 'HYPERLINK("http://evil.example","click")' }, 9812345679, 'X-002', '', 75, '2026-10-01']);
    ws.addRow(['Ravi Rao', 9812345680, 'X-003', '', 'abc', '2026-10-01']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await anika.post(`/api/v1/batches/${id}/candidates/import`).attach('file', buffer, 'batch.xlsx');
    expect(res.status).toBe(422);
    expect(res.body.error.details.errors).toEqual([
      { row: 3, column: 'full_name', value: '=HYPERLINK("http://evil.example","click")', message: FORMULA_MESSAGE },
      { row: 4, column: 'score', value: 'abc', message: SCORE_MESSAGE },
    ]);
    expect(await prisma.candidate.count()).toBe(0);
  });

  it('refuses files that are not CSV/XLSX and uploads to a batch you do not own', async () => {
    const { anika, id } = await newDraft();
    await anika.post(`/api/v1/batches/${id}/candidates/import`).attach('file', Buffer.from('hello'), 'notes.txt').expect(400);

    const ravi = await loginAs('ravi');
    const res = await ravi.post(`/api/v1/batches/${id}/candidates/import`).attach('file', sample('good_batch.csv'), 'good_batch.csv');
    expect(res.status).toBe(403);
    expect(await prisma.candidate.count()).toBe(0);
  });
});
