import { CANDIDATE_COLUMNS } from '@certiflow/shared';
import { downloadCsv } from '../DataTable';

/**
 * Template generated in the browser from the same column list the server validates
 * against, so it can never drift. Phones are written without "+" because spreadsheet
 * apps treat a leading "+" as a formula (and our importer rejects formula-like cells).
 */
export function downloadTemplate() {
  downloadCsv('certiflow-candidates-template.csv', [...CANDIDATE_COLUMNS], [
    ['Asha Kumari', '9812345678', 'NGP26-0001', '2004-06-15', 78, '2026-10-15'],
    ['Rahul Deshmukh', '9812345679', 'NGP26-0002', '', 84, '15/10/2026'],
  ]);
}

export const COLUMN_HELP: { column: string; required: boolean; help: string }[] = [
  { column: 'full_name', required: true, help: 'As it should appear on the certificate' },
  { column: 'phone', required: true, help: 'Indian mobile; the certificate is sent here on WhatsApp' },
  { column: 'enrolment_id', required: true, help: 'Unique within the batch' },
  { column: 'dob', required: false, help: 'Date of birth, 2004-06-15 or 15/06/2004' },
  { column: 'score', required: true, help: 'Whole number from 0 to 100' },
  { column: 'passed_on', required: true, help: 'Date the candidate passed, not in the future' },
];
