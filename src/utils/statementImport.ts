export type StatementColumn = 'date' | 'description' | 'debit' | 'credit' | 'reference';
export type StatementMapping = Record<StatementColumn, number>;
export interface StatementRow {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  reference: string;
}
export interface StatementSheet {
  rows: string[][];
  headerRow: number;
  mapping: StatementMapping;
  accountNumber?: string;
  format: 'techcombank' | 'generic';
}

export function filterStatementRowsByDateRange(rows: StatementRow[], fromDate = '', toDate = '') {
  if (fromDate && toDate && fromDate > toDate) throw new Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return rows.filter((row) => (!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate));
}

const normalizeHeader = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();

export function detectStatementSheet(rows: string[][]): StatementSheet {
  const techHeader = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes('transaction date')) &&
    row.some((cell) => normalizeHeader(cell).includes('transaction no')) &&
    row.some((cell) => normalizeHeader(cell).includes('debit')) &&
    row.some((cell) => normalizeHeader(cell).includes('credit')));
  if (techHeader >= 0) {
    const accountRow = rows.find((row) => row.some((cell) => normalizeHeader(cell).includes('account no')));
    const accountNumber = accountRow?.find((cell) => /^\d{6,19}$/.test(cell.trim()));
    const headers = rows[techHeader].map(normalizeHeader);
    const column = (token: string) => headers.findIndex((cell) => cell.includes(token));
    return { rows, headerRow: techHeader, accountNumber, format: 'techcombank',
      mapping: { date: column('transaction date'), description: column('details'),
        reference: column('transaction no'), debit: column('debit'), credit: column('credit') } };
  }
  const headerRow = rows.findIndex((row) => row.some((cell) =>
    /(^| )(date|ngay giao dich)( |$)/.test(normalizeHeader(cell))));
  if (headerRow < 0) throw new Error('Không tìm thấy hàng tiêu đề có cột ngày giao dịch.');
  const headers = rows[headerRow].map(normalizeHeader);
  const find = (...tokens: string[]) => headers.findIndex((cell) => tokens.some((token) => cell.includes(token)));
  return { rows, headerRow, format: 'generic', mapping: {
    date: find('date', 'ngay giao dich'),
    description: find('description', 'details', 'dien giai', 'noi dung'),
    debit: find('debit', 'ghi no', 'no tk', 'tien chi'),
    credit: find('credit', 'ghi co', 'co tk', 'tien thu'),
    reference: find('reference', 'transaction no', 'so but toan', 'ma giao dich'),
  } };
}

export function parseStatementDate(value: string): string | null {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/);
  const year = Number(iso?.[1] || match?.[3]);
  const month = Number(iso?.[2] || match?.[2]);
  const day = Number(iso?.[3] || match?.[1]);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

export function parseStatementAmount(value: string): number | null {
  const compact = value.replace(/[₫đ\s]/gi, '').trim();
  if (!compact || compact === '-') return null;
  let normalized = compact;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(compact)) normalized = compact.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(compact)) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(compact)) normalized = compact.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function parseStatementRows(sheet: StatementSheet, mapping = sheet.mapping) {
  const parsed: StatementRow[] = [];
  const errors: string[] = [];
  if (mapping.date < 0 || mapping.description < 0 || (mapping.debit < 0 && mapping.credit < 0) ||
    (mapping.debit >= 0 && mapping.debit === mapping.credit)) {
    return { rows: parsed, errors: ['Hãy ánh xạ ngày, diễn giải và ít nhất một cột tiền thu/chi.'] };
  }
  for (let index = sheet.headerRow + 1; index < sheet.rows.length; index++) {
    const cells = sheet.rows[index];
    const debitText = cells[mapping.debit] || '';
    const creditText = cells[mapping.credit] || '';
    if (!debitText.trim() && !creditText.trim()) continue;
    if (sheet.format === 'techcombank' && !cells[mapping.description]?.trim() &&
      !cells[mapping.reference]?.trim() && !parseStatementDate(cells[mapping.date] || '')) continue;
    const date = parseStatementDate(cells[mapping.date] || '');
    const debit = parseStatementAmount(debitText);
    const credit = parseStatementAmount(creditText);
    if (!date || (!debit && !credit) || (debit && credit)) {
      errors.push(`Dòng ${index + 1}: ngày hoặc số tiền không hợp lệ.`);
      continue;
    }
    const description = (cells[mapping.description] || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 500);
    if (!description) { errors.push(`Dòng ${index + 1}: thiếu diễn giải.`); continue; }
    parsed.push({ rowNumber: index + 1, date, description, amount: debit || credit!,
      type: debit ? 'expense' : 'income', reference: (cells[mapping.reference] || '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60) });
  }
  return { rows: parsed, errors };
}

export function statementBankId(bankCode: string, accountNumber: string, reference: string) {
  return reference ? `${bankCode}:${accountNumber}:${reference}` : undefined;
}
