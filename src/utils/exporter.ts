import * as XLSX from 'xlsx';
import { BankAccount, Jar, Transaction } from '../types';
import { formatVND, formatDateVI } from './formatters';
import { convertVndForDisplay, getRuntimePreferences } from '../lib/preferences';
import { getCategoryTotals, type AnalyticsCycle } from './analytics';
import { addNativeExcelCharts, type ExcelChart } from './excelCharts';
import { isBankOnlyIncome, isBankOnlyExpense, isBankOnlyTransaction } from '../../shared/transactions';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function buildExportReportData(
  jars: Jar[],
  transactions: Transaction[],
  monthlyIncome: number,
  jarRegistry: Jar[],
  cycle?: AnalyticsCycle,
) {
  const reportTransactions = cycle?.transactions ?? transactions;
  const activeJarIds = new Set(jars.map((jar) => jar.id));
  const archivedCycleSpent = reportTransactions
    .filter((transaction) => transaction.type === 'expense' && !isBankOnlyExpense(transaction) && !activeJarIds.has(transaction.jarId))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportJars = cycle
    ? cycle.jars.map((row) => {
        const details = jarRegistry.find((jar) => jar.id === row.jarId);
        return {
          code: row.code,
          name: row.name,
          bankName: details?.bankName || '',
          accountNumber: details?.accountNumber || '',
          accountName: details?.accountName || '',
          percentage: row.allocation !== null && cycle.income > 0
            ? Number(((row.allocation / cycle.income) * 100).toFixed(2))
            : null,
          targetBudget: row.budget,
          currentSpent: row.spent,
          remaining: row.remaining,
          archivedSpendOnly: false,
        };
      })
    : jars.map((jar) => ({
        code: jar.code,
        name: jar.name,
        bankName: jar.bankName,
        accountNumber: jar.accountNumber,
        accountName: jar.accountName,
        percentage: jar.percentage as number | null,
        targetBudget: jar.targetBudget as number | null,
        currentSpent: jar.currentSpent,
        remaining: jar.targetBudget - jar.currentSpent as number | null,
        archivedSpendOnly: false,
      }));
  let archivedCurrentCycleSpent = 0;
  if (cycle) {
    const includedJarIds = new Set(cycle.jars.map((row) => row.jarId));
    const missingExpenseByJar = new Map<string, number>();
    reportTransactions.filter((transaction) => transaction.type === 'expense' && !isBankOnlyExpense(transaction)).forEach((transaction) => {
      if (includedJarIds.has(transaction.jarId)) return;
      missingExpenseByJar.set(
        transaction.jarId,
        (missingExpenseByJar.get(transaction.jarId) || 0) + transaction.amount,
      );
    });
    missingExpenseByJar.forEach((spent, jarId) => {
      const details = jarRegistry.find((jar) => jar.id === jarId);
      if (cycle.isCurrent) archivedCurrentCycleSpent += spent;
      reportJars.push({
        code: details?.code || '—',
        name: details?.name || jarId,
        bankName: details?.bankName || '',
        accountNumber: details?.accountNumber || '',
        accountName: details?.accountName || '',
        percentage: null,
        targetBudget: cycle.isCurrent ? spent : null,
        currentSpent: spent,
        remaining: cycle.isCurrent ? 0 : null,
        archivedSpendOnly: cycle.isCurrent,
      });
    });
  }
  const detailedExpense = reportTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const bankExpenseTotal = reportTransactions.filter(isBankOnlyExpense).reduce((sum, tx) => sum + tx.amount, 0);
  const totalSpent = cycle?.expense ?? detailedExpense;
  return {
    reportTransactions,
    reportJars,
    income: cycle?.income ?? monthlyIncome + reportTransactions.filter(isBankOnlyIncome).reduce((sum, transaction) => sum + transaction.amount, 0),
    totalSpent,
    bankExpenseTotal,
    totalJarSpent: Math.max(0, totalSpent - bankExpenseTotal),
    totalAllocated: cycle
      ? cycle.budget === null ? null : cycle.budget + archivedCurrentCycleSpent
      : jars.reduce((sum, jar) => sum + jar.targetBudget, 0) + archivedCycleSpent,
    period: cycle ? `${cycle.start} – ${cycle.end}` : null,
    detailsIncomplete: Boolean(cycle && (
      cycle.transactionCount > reportTransactions.length || cycle.expense > detailedExpense
    )),
  };
}

export function buildExcelWorkbook(
  jars: Jar[],
  transactions: Transaction[],
  monthlyIncome: number,
  jarRegistry: Jar[] = jars,
  cycle?: AnalyticsCycle,
  bankAccounts: BankAccount[] = [],
) {
  const preferences = getRuntimePreferences();
  const currencyLabel = preferences.currency === 'USD' ? 'USD' : '₫';
  const { reportJars, reportTransactions, income, totalSpent, totalJarSpent, bankExpenseTotal, totalAllocated, period, detailsIncomplete } =
    buildExportReportData(jars, transactions, monthlyIncome, jarRegistry, cycle);
  // 1. Sheet "Báo cáo Hũ Tài Chính"
  const jarsSummaryData = reportJars.map((jar) => {
    const usagePercent = jar.targetBudget !== null && jar.targetBudget > 0
      ? (jar.currentSpent / jar.targetBudget) * 100 : null;
    return {
      'Mã Hũ': jar.code,
      'Tên Hũ Tài Chính': jar.name,
      'Ngân Hàng Liên Kết': jar.bankName,
      'Số Tài Khoản': jar.accountNumber,
      'Chủ Tài Khoản': jar.accountName,
      'Tỷ Lệ (%)': jar.percentage === null ? '—' : `${jar.percentage}%`,
      [`Hạn Mức Ngân Sách (${currencyLabel})`]: jar.targetBudget === null ? '' : convertVndForDisplay(jar.targetBudget),
      [`Thực Tế Đã Chi (${currencyLabel})`]: convertVndForDisplay(jar.currentSpent),
      [`Số Tiền Còn Lại (${currencyLabel})`]: jar.remaining === null ? '' : convertVndForDisplay(jar.remaining),
      'Tỷ Lệ Đã Chi (%)': usagePercent === null ? '—' : `${usagePercent.toFixed(1)}%`,
      'Trạng Thái': jar.archivedSpendOnly ? 'ĐÃ LƯU · DƯ ĐÃ CHUYỂN' : usagePercent === null ? 'CHƯA CÓ HẠN MỨC' : usagePercent > 100 ? 'VƯỢT HẠN MỨC' : usagePercent >= 80 ? 'CẢNH BÁO' : 'An Toàn',
    };
  });

  // Add Summary Row
  jarsSummaryData.push({
    'Mã Hũ': 'TỔNG',
    'Tên Hũ Tài Chính': `Tổng cộng${period ? ` · ${period}` : ''}`,
    'Ngân Hàng Liên Kết': '-',
    'Số Tài Khoản': '-',
    'Chủ Tài Khoản': '-',
    'Tỷ Lệ (%)': '100%',
    [`Hạn Mức Ngân Sách (${currencyLabel})`]: totalAllocated === null ? '' : convertVndForDisplay(totalAllocated),
    [`Thực Tế Đã Chi (${currencyLabel})`]: convertVndForDisplay(totalJarSpent),
    [`Số Tiền Còn Lại (${currencyLabel})`]: totalAllocated === null ? '' : convertVndForDisplay(totalAllocated - totalJarSpent),
    'Tỷ Lệ Đã Chi (%)': totalAllocated === null || totalAllocated <= 0 ? '—' : `${((totalJarSpent / totalAllocated) * 100).toFixed(1)}%`,
    'Trạng Thái': totalAllocated === null ? 'CHƯA CÓ HẠN MỨC' : totalJarSpent > totalAllocated ? 'VƯỢT HẠN MỨC TỔNG' : 'Trong Ngân Sách',
  });

  // 2. Sheet "Lịch Sử Giao Dịch"
  const typeOrder = { expense: 0, income: 1, transfer: 2 };
  const sortedTransactions = [...reportTransactions].sort((a, b) => typeOrder[a.type] - typeOrder[b.type]
    || (a.category.trim() || 'Chưa phân loại').localeCompare(b.category.trim() || 'Chưa phân loại', 'vi')
    || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const transactionsData: Record<string, string | number>[] = [];
  const transactionRowInfo: XLSX.RowInfo[] = [{}];
  const subtotals: { row: number; first: number; last: number }[] = [];
  let groupFirst = 2, groupAmount = 0;
  sortedTransactions.forEach((tx, index) => {
    const jar = jarRegistry.find((j) => j.id === tx.jarId);
    const account = bankAccounts.find(account => account.id === tx.bankAccountId);
    const category = tx.category.trim() || 'Chưa phân loại';
    transactionsData.push({
      'Mã Giao Dịch': tx.id,
      'Ngày': formatDateVI(tx.date),
      'Loại': tx.type === 'income' ? 'Thu nhập' : tx.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền',
      'Hũ Tài Chính': isBankOnlyTransaction(tx) ? (isBankOnlyExpense(tx) ? 'Ngoài hũ' : 'Không phân bổ') : jar ? `${jar.name} (${jar.code})` : 'Chưa phân loại',
      'Danh Mục': category,
      [`Số Tiền (${currencyLabel})`]: convertVndForDisplay(tx.amount),
      'Ngân Hàng': account?.bankName || (tx.paymentMethodCode === 'CASH' ? 'Tiền mặt' : tx.bankName || tx.legacyPaymentLabel || '-'),
      'Ghi Chú': tx.description,
      'Tài Khoản Nguồn': account?.accountNumber || tx.sourceAccountNumber || '',
      'Tài Khoản Đích': bankAccounts.find(a => a.id === tx.transferToBankAccountId)?.accountNumber || tx.recipientAccount || '',
    });
    transactionRowInfo.push({ level: 1 });
    groupAmount += convertVndForDisplay(tx.amount);
    const next = sortedTransactions[index + 1];
    if (!next || next.type !== tx.type || (next.category.trim() || 'Chưa phân loại') !== category) {
      const row = transactionsData.length + 2;
      subtotals.push({ row, first: groupFirst, last: row - 1 });
      transactionsData.push({ 'Mã Giao Dịch': 'TỔNG DANH MỤC', 'Ngày': '', 'Loại': tx.type === 'expense' ? 'Chi tiêu' : tx.type === 'income' ? 'Thu nhập' : 'Chuyển tiền',
        'Hũ Tài Chính': '', 'Danh Mục': category, [`Số Tiền (${currencyLabel})`]: groupAmount, 'Ngân Hàng': '', 'Ghi Chú': '', 'Tài Khoản Nguồn': '' });
      transactionRowInfo.push({ level: 0 });
      groupFirst = row + 1; groupAmount = 0;
    }
  });

  const wb = XLSX.utils.book_new();
  const wsOverview = XLSX.utils.json_to_sheet([
    { 'Thông tin': 'Chu kỳ báo cáo', 'Giá trị': period || 'Chu kỳ hiện tại' },
    { 'Thông tin': 'Tổng thu', 'Giá trị': convertVndForDisplay(income) },
    { 'Thông tin': 'Tổng chi', 'Giá trị': convertVndForDisplay(totalSpent) },
    { 'Thông tin': 'Chi ngoài hũ', 'Giá trị': convertVndForDisplay(bankExpenseTotal) },
    {
      'Thông tin': 'Chi tiết giao dịch',
      'Giá trị': detailsIncomplete
        ? 'Không đầy đủ: tổng chi lịch sử có thể cao hơn các giao dịch còn lưu.'
        : 'Đầy đủ theo dữ liệu hiện có.',
    },
    { 'Thông tin': 'Dòng tiền ròng', 'Giá trị': convertVndForDisplay(income - totalSpent) },
  ]);
  const wsJars = XLSX.utils.json_to_sheet(jarsSummaryData);
  const wsTx = XLSX.utils.json_to_sheet(transactionsData);
  const currencyNumberFormat =
    preferences.currency === 'USD' ? '$#,##0.00' : '#,##0 [$₫-vi-VN]';
  for (const address of ['B3', 'B4', 'B5', 'B7']) {
    const cell = wsOverview[address];
    if (cell && typeof cell.v === 'number') {
      cell.t = 'n';
      cell.z = currencyNumberFormat;
    }
  }
  ['G', 'H', 'I'].forEach((column) => {
    for (let row = 2; row <= jarsSummaryData.length + 1; row += 1) {
      const cell = wsJars[`${column}${row}`];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = currencyNumberFormat;
      }
    }
  });
  for (let row = 2; row <= transactionsData.length + 1; row += 1) {
    const cell = wsTx[`F${row}`];
    if (cell && typeof cell.v === 'number') {
      cell.t = 'n';
      cell.z = currencyNumberFormat;
    }
  }
  for (const group of subtotals) wsTx[`F${group.row}`].f = `SUM(F${group.first}:F${group.last})`;
  wsTx['!rows'] = transactionRowInfo;
  wsTx['!outline'] = { above: false };

  // Set column widths
  wsOverview['!cols'] = [{ wch: 25 }, { wch: 82 }];
  wsJars['!cols'] = [
    { wch: 10 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 20 },
    { wch: 15 },
    { wch: 16 },
  ];

  wsTx['!cols'] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 25 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 35 },
    { wch: 22 },
    { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(wb, wsOverview, 'Tổng Quan');
  XLSX.utils.book_append_sheet(wb, wsJars, 'Báo Cáo Hũ Tài Chính');
  XLSX.utils.book_append_sheet(wb, wsTx, 'Lịch Sử Giao Dịch');

  const categoryData = (['expense', 'income'] as const).flatMap(type => {
    const categories = getCategoryTotals(reportTransactions, type);
    const total = categories.reduce((sum, category) => sum + category.amount, 0);
    return categories.map(category => ({
      'Loại': type === 'expense' ? 'Chi tiêu' : 'Thu nhập', 'Danh Mục': category.name,
      'Số Giao Dịch': category.count, [`Số Tiền (${currencyLabel})`]: convertVndForDisplay(category.amount), 'Tỷ Trọng': total > 0 ? category.amount / total : 0,
    }));
  });
  const wsCategories = XLSX.utils.json_to_sheet(categoryData, { header: ['Loại', 'Danh Mục', 'Số Giao Dịch', `Số Tiền (${currencyLabel})`, 'Tỷ Trọng'] });
  wsCategories['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 18 }, { wch: 24 }, { wch: 16 }];
  for (let row = 2; row <= categoryData.length + 1; row++) {
    wsCategories[`D${row}`].z = currencyNumberFormat;
    wsCategories[`E${row}`].z = '0.0%';
  }
  if (categoryData.length) wsCategories['!autofilter'] = { ref: wsCategories['!ref']! };
  XLSX.utils.book_append_sheet(wb, wsCategories, 'Danh Mục Thu Chi');

  const wsCharts = XLSX.utils.aoa_to_sheet([
    ['RoFinance · Biểu đồ tài chính'], ['Chu kỳ', period || 'Chu kỳ hiện tại'],
    ['Tỷ trọng danh mục chỉ tính các giao dịch đã ghi. Chuyển hũ không tính là thu/chi.'],
    ['Chỉ số', `Giá trị (${currencyLabel})`], ['Tổng thu', convertVndForDisplay(income)], ['Tổng chi', convertVndForDisplay(totalSpent)], ['Dòng tiền ròng', convertVndForDisplay(income - totalSpent)],
    [], ['Chi tiết giao dịch', detailsIncomplete ? 'Lịch sử chưa đủ chi tiết; xem Tổng Quan.' : 'Đầy đủ theo dữ liệu hiện có.'],
    ['Danh mục thu', categoryData.some(row => row['Loại'] === 'Thu nhập') ? 'Xem biểu đồ và bảng Danh Mục Thu Chi.' : 'Chưa có giao dịch thu chi tiết.'],
    ['Danh mục chi', categoryData.some(row => row['Loại'] === 'Chi tiêu') ? 'Xem biểu đồ và bảng Danh Mục Thu Chi.' : 'Chưa có giao dịch chi chi tiết.'],
  ]);
  for (const row of [5, 6, 7]) wsCharts[`B${row}`].z = currencyNumberFormat;
  wsCharts['!cols'] = [{ wch: 25 }, { wch: 24 }, { wch: 5 }, ...Array.from({ length: 22 }, () => ({ wch: 11 }))];
  XLSX.utils.book_append_sheet(wb, wsCharts, 'Biểu Đồ');

  return wb;
}

export function buildExcelFile(jars: Jar[], transactions: Transaction[], monthlyIncome: number, jarRegistry: Jar[] = jars, cycle?: AnalyticsCycle, bankAccounts: BankAccount[] = []): Uint8Array {
  const workbook = buildExcelWorkbook(jars, transactions, monthlyIncome, jarRegistry, cycle, bankAccounts);
  const numberFormat = workbook.Sheets['Tổng Quan'].B3.z as string;
  const chart: ExcelChart[] = [{ title: 'Thu, chi và dòng tiền ròng', kind: 'bar', numberFormat, series: [{
    name: 'Giá trị', categories: ['Tổng thu', 'Tổng chi', 'Dòng tiền ròng'], values: [5, 6, 7].map(row => workbook.Sheets['Biểu Đồ'][`B${row}`].v as number),
    categoriesRef: "'Biểu Đồ'!$A$5:$A$7", valuesRef: "'Biểu Đồ'!$B$5:$B$7",
  }] }];
  const categories = workbook.Sheets['Danh Mục Thu Chi'];
  const categoryEnd = XLSX.utils.decode_range(categories['!ref']!).e.r + 1;
  for (const [type, title] of [['Chi tiêu', 'Tỷ trọng chi theo danh mục'], ['Thu nhập', 'Tỷ trọng thu theo danh mục']]) {
    const rows = Array.from({ length: Math.max(0, categoryEnd - 1) }, (_, i) => i + 2).filter(row => categories[`A${row}`]?.v === type);
    if (!rows.length) continue;
    chart.push({ title, kind: 'pie', numberFormat, series: [{ name: type,
      categories: rows.map(row => String(categories[`B${row}`].v)), values: rows.map(row => categories[`D${row}`].v as number),
      categoriesRef: `'Danh Mục Thu Chi'!$B$${rows[0]}:$B$${rows.at(-1)}`, valuesRef: `'Danh Mục Thu Chi'!$D$${rows[0]}:$D$${rows.at(-1)}`,
    }] });
  }
  const jarsSheet = workbook.Sheets['Báo Cáo Hũ Tài Chính'];
  const jarEnd = XLSX.utils.decode_range(jarsSheet['!ref']!).e.r;
  if (jarEnd >= 2) chart.push({ title: 'Hạn mức hũ so với thực chi', kind: 'bar', numberFormat, series: (['G', 'H'] as const).map((column, index) => ({
    name: index === 0 ? 'Hạn mức' : 'Thực chi', categories: Array.from({ length: jarEnd - 1 }, (_, i) => String(jarsSheet[`B${i + 2}`].v)),
    values: Array.from({ length: jarEnd - 1 }, (_, i) => typeof jarsSheet[`${column}${i + 2}`]?.v === 'number' ? jarsSheet[`${column}${i + 2}`].v as number : null),
    categoriesRef: `'Báo Cáo Hũ Tài Chính'!$B$2:$B$${jarEnd}`, valuesRef: `'Báo Cáo Hũ Tài Chính'!$${column}$2:$${column}$${jarEnd}`,
  })) });
  return addNativeExcelCharts(new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), workbook.SheetNames.indexOf('Biểu Đồ') + 1, chart);
}

export function exportToExcel(
  jars: Jar[],
  transactions: Transaction[],
  monthlyIncome: number,
  jarRegistry: Jar[] = jars,
  cycle?: AnalyticsCycle,
  bankAccounts: BankAccount[] = [],
) {
  const bytes = buildExcelFile(jars, transactions, monthlyIncome, jarRegistry, cycle, bankAccounts);
  const now = new Date();
  const dateStr = cycle ? `${cycle.start}_${cycle.end}` : `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = `Bao_Cao_Tai_Chinh_RoFinance_${dateStr}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportToPDFPrint(
  jars: Jar[],
  transactions: Transaction[],
  monthlyIncome: number,
  jarRegistry: Jar[] = jars,
  cycle?: AnalyticsCycle,
) {
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) return;
  const { reportJars, reportTransactions, income, totalSpent, totalJarSpent, bankExpenseTotal, totalAllocated, period, detailsIncomplete } =
    buildExportReportData(jars, transactions, monthlyIncome, jarRegistry, cycle);
  const nowStr = new Date().toLocaleDateString('vi-VN');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>Báo Cáo Quản Lý Tài Chính Cá Nhân - RoFinance</title>
      <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 30px; color: #1e293b; background: #fff; }
        .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 25px; }
        .header h1 { margin: 0; color: #1e3a8a; font-size: 24px; text-transform: uppercase; }
        .header p { margin: 5px 0 0 0; color: #64748b; font-size: 13px; }
        .grid-summary { display: flex; gap: 15px; margin-bottom: 25px; }
        .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; background: #f8fafc; }
        .card .title { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; }
        .card .value { font-size: 18px; font-weight: 700; margin-top: 4px; color: #0f172a; }
        h2 { font-size: 16px; border-left: 4px solid #3b82f6; padding-left: 8px; margin-top: 25px; margin-bottom: 12px; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
        th { background-color: #f1f5f9; font-weight: 600; color: #334155; }
        tr:nth-child(even) { background-color: #f8fafc; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block; }
        .badge-safe { background: #dcfce7; color: #15803d; }
        .badge-warning { background: #fef3c7; color: #b45309; }
        .badge-danger { background: #fee2e2; color: #b91c1c; }
        .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
        .sign-box { text-align: center; width: 200px; }
        @media print {
          body { margin: 15mm; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 20px; text-align: right;">
        <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 10px 18px; font-weight: 600; border-radius: 6px; cursor: pointer;">
          🖨️ In / Tải PDF
        </button>
      </div>

      <div class="header">
        <h1>BÁO CÁO QUẢN LÝ TÀI CHÍNH CÁ NHÂN</h1>
        <p>Mô hình Hũ Tài Chính & Phân Bổ Ngân Sách | ${period ? `Chu kỳ: ${escapeHtml(period)} | ` : ''}Ngày xuất: ${nowStr}</p>
      </div>
      ${detailsIncomplete ? '<p style="padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:8px">Chi tiết giao dịch của chu kỳ này không đầy đủ; tổng chi lịch sử có thể cao hơn các giao dịch còn lưu.</p>' : ''}

      <div class="grid-summary">
        <div class="card">
          <div class="title">Tổng Thu Nhập Chu Kỳ</div>
          <div class="value">${formatVND(income)}</div>
        </div>
        <div class="card">
          <div class="title">Đã Phân Bổ Ngân Sách</div>
          <div class="value">${totalAllocated === null ? '—' : formatVND(totalAllocated)}</div>
        </div>
        <div class="card">
          <div class="title">Thực Tế Đã Chi Tiêu</div>
          <div class="value" style="color: ${totalAllocated !== null && totalJarSpent > totalAllocated ? '#dc2626' : '#16a34a'}">
            ${formatVND(totalSpent)}
          </div>
        </div>
        <div class="card">
          <div class="title">Còn Lại Trong Các Hũ</div>
          <div class="value">${totalAllocated === null ? '—' : formatVND(totalAllocated - totalJarSpent)}</div>
        </div>
      </div>

      <p>Chi ngoài hũ: ${formatVND(bankExpenseTotal)}. Khoản này đã tính vào tổng chi nhưng không trừ hạn mức các hũ.</p>
      <h2>1. Chi Tiết Phân Bổ Theo Hũ Tài Chính</h2>
      <table>
        <thead>
          <tr>
            <th>Mã</th>
            <th>Hũ Tài Chính</th>
            <th>Ngân Hàng</th>
            <th>Số Tài Khoản</th>
            <th class="text-right">Tỷ Lệ</th>
            <th class="text-right">Hạn Mức</th>
            <th class="text-right">Đã Chi</th>
            <th class="text-right">Còn Lại</th>
            <th class="text-center">Trạng Thái</th>
          </tr>
        </thead>
        <tbody>
          ${reportJars
            .map((j) => {
              const ratio = j.targetBudget !== null && j.targetBudget > 0 ? (j.currentSpent / j.targetBudget) * 100 : null;
              const badgeClass = j.archivedSpendOnly ? 'badge-safe' : ratio !== null && ratio > 100 ? 'badge-danger' : ratio !== null && ratio >= 80 ? 'badge-warning' : 'badge-safe';
              const statusText = j.archivedSpendOnly ? 'Đã lưu · dư đã chuyển' : ratio === null ? 'Chưa có hạn mức' : ratio > 100 ? 'Vượt Hạn Mức' : ratio >= 80 ? 'Cảnh Báo' : 'An Toàn';
              return `
              <tr>
                <td><strong>${escapeHtml(j.code)}</strong></td>
                <td>${escapeHtml(j.name)}</td>
                <td>${escapeHtml(j.bankName)}</td>
                <td>${escapeHtml(j.accountNumber)}</td>
                <td class="text-right">${j.percentage === null ? '—' : `${j.percentage}%`}</td>
                <td class="text-right">${j.targetBudget === null ? '—' : formatVND(j.targetBudget)}</td>
                <td class="text-right">${formatVND(j.currentSpent)}</td>
                <td class="text-right">${j.remaining === null ? '—' : formatVND(j.remaining)}</td>
                <td class="text-center"><span class="badge ${badgeClass}">${statusText}</span></td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>

      <h2>2. Giao Dịch Trong Chu Kỳ</h2>
      <table>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Loại</th>
            <th>Hũ Tài Chính</th>
            <th>Danh Mục</th>
            <th class="text-right">Số Tiền</th>
            <th>Ngân Hàng</th>
            <th>Ghi Chú</th>
          </tr>
        </thead>
        <tbody>
          ${reportTransactions
            .map((tx) => {
              const jar = jarRegistry.find((j) => j.id === tx.jarId);
              return `
              <tr>
                <td>${formatDateVI(tx.date)}</td>
                <td>${tx.type === 'income' ? 'Thu nhập' : tx.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền'}</td>
                <td>${escapeHtml(isBankOnlyTransaction(tx) ? (isBankOnlyExpense(tx) ? 'Ngoài hũ' : 'Không phân bổ') : jar ? jar.name : '-')}</td>
                <td>${escapeHtml(tx.category)}</td>
                <td class="text-right" style="font-weight: 600; color: ${tx.type === 'income' ? '#16a34a' : '#dc2626'};">
                  ${tx.type === 'income' ? '+' : '-'}${formatVND(tx.amount)}
                </td>
                <td>${escapeHtml(tx.bankName || jar?.bankName || '-')}</td>
                <td>${escapeHtml(tx.description)}</td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>

      <div class="footer">
        <div>RoFinance - Hệ thống Quản lý Tài chính Hũ Tự Động</div>
        <div class="sign-box">
          <p><strong>Người lập báo cáo</strong></p>
          <br><br>
          <p>NGUYỄN VĂN A</p>
        </div>
      </div>

      <script>
        window.onload = function() {
          // Auto trigger print dialog if desired
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
