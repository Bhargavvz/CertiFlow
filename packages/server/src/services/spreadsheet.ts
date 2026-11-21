// Turns an uploaded CSV/XLSX into rows of strings with their real spreadsheet row
// numbers. Validation lives in @certiflow/shared (validateSpreadsheet).
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { SheetInput } from '@certiflow/shared';
import { Errors } from '../errors';

export async function parseSpreadsheet(buffer: Buffer, fileName: string): Promise<SheetInput> {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'csv') return parseCsv(buffer);
  if (ext === 'xlsx') return parseXlsx(buffer);
  throw Errors.unprocessable('UNSUPPORTED_FILE', 'Upload a .csv or .xlsx file');
}

function parseCsv(buffer: Buffer): SheetInput {
  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      info: true,
    }) as { record: string[]; info: { lines: number } }[];
  } catch (err) {
    throw Errors.unprocessable('UNREADABLE_FILE', `The CSV file could not be read: ${(err as Error).message}`);
  }
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0]!.record.map((h) => h.trim());
  const rows = records.slice(1).map(({ record, info }) => ({
    // info.lines is the line the record ended on, i.e. the row number a user sees in Excel.
    rowNumber: info.lines,
    values: Object.fromEntries(headers.map((h, i) => [h, record[i] ?? ''])),
  }));
  return { headers, rows };
}

async function parseXlsx(buffer: Buffer): Promise<SheetInput> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs' Buffer type lags behind @types/node; the runtime accepts a Node Buffer.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (err) {
    throw Errors.unprocessable('UNREADABLE_FILE', `The Excel file could not be read: ${(err as Error).message}`);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= headerRow.cellCount; c++) headers.push(cellToString(headerRow.getCell(c).value).trim());

  const rows: SheetInput['rows'] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h] = cellToString(row.getCell(i + 1).value);
    });
    rows.push({ rowNumber, values });
  });
  return { headers, rows };
}

/**
 * Normalise an Excel cell to text. Formula cells come back as "=FORMULA" on purpose,
 * so the formula-injection rule rejects them instead of silently importing a result.
 */
export function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const v = value as unknown as Record<string, unknown>;
  if ('formula' in v || 'sharedFormula' in v) return `=${String(v.formula ?? v.sharedFormula ?? '')}`;
  if ('richText' in v && Array.isArray(v.richText)) return (v.richText as { text: string }[]).map((t) => t.text).join('');
  if ('text' in v) return String(v.text);
  if ('error' in v) return '#ERROR';
  return String(value);
}
