import * as XLSX from 'xlsx';
import { Jar, Transaction } from '../types';
import { formatVND, formatDateVI } from './formatters';
import { convertVndForDisplay, getRuntimePreferences } from '../lib/preferences';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function exportToExcel(
  jars: Jar[],
  transactions: Transaction[],
  monthlyIncome: number,
  jarRegistry: Jar[] = jars,
) {
  const preferences = getRuntimePreferences();
  const currencyLabel = preferences.currency === 'USD' ? 'USD' : '₫';
  // 1. Sheet "Báo cáo Hũ Tài Chính"
  const activeJarIds = new Set(jars.map((jar) => jar.id));
  const archivedCycleSpent = transactions
    .filter((transaction) => transaction.type === 'expense' && !activeJarIds.has(transaction.jarId))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalAllocated = jars.reduce((sum, j) => sum + j.targetBudget, 0) + archivedCycleSpent;
  const totalSpent = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const jarsSummaryData = jars.map((jar) => {
    const remaining = jar.targetBudget - jar.currentSpent;
    const usagePercent = jar.targetBudget > 0 ? (jar.currentSpent / jar.targetBudget) * 100 : 0;
    return {
      'Mã Hũ': jar.code,
      'Tên Hũ Tài Chính': jar.name,
      'Ngân Hàng Liên Kết': jar.bankName,
      'Số Tài Khoản': jar.accountNumber,
      'Chủ Tài Khoản': jar.accountName,
      'Tỷ Lệ (%)': `${jar.percentage}%`,
      [`Hạn Mức Ngân Sách (${currencyLabel})`]: convertVndForDisplay(jar.targetBudget),
      [`Thực Tế Đã Chi (${currencyLabel})`]: convertVndForDisplay(jar.currentSpent),
      [`Số Tiền Còn Lại (${currencyLabel})`]: convertVndForDisplay(remaining),
      'Tỷ Lệ Đã Chi (%)': `${usagePercent.toFixed(1)}%`,
      'Trạng Thái': usagePercent > 100 ? 'VƯỢT HẠN MỨC' : usagePercent >= 80 ? 'CẢNH BÁO' : 'An Toàn',
    };
  });

  // Add Summary Row
  jarsSummaryData.push({
    'Mã Hũ': 'TỔNG',
    'Tên Hũ Tài Chính': `Tổng Thu Nhập: ${formatVND(monthlyIncome)}`,
    'Ngân Hàng Liên Kết': '-',
    'Số Tài Khoản': '-',
    'Chủ Tài Khoản': '-',
    'Tỷ Lệ (%)': '100%',
    [`Hạn Mức Ngân Sách (${currencyLabel})`]: convertVndForDisplay(totalAllocated),
    [`Thực Tế Đã Chi (${currencyLabel})`]: convertVndForDisplay(totalSpent),
    [`Số Tiền Còn Lại (${currencyLabel})`]: convertVndForDisplay(totalAllocated - totalSpent),
    'Tỷ Lệ Đã Chi (%)': `${((totalSpent / totalAllocated) * 100).toFixed(1)}%`,
    'Trạng Thái': totalSpent > totalAllocated ? 'VƯỢT HẠN MỨC TỔNG' : 'Trong Ngân Sách',
  });

  // 2. Sheet "Lịch Sử Giao Dịch"
  const transactionsData = transactions.map((tx) => {
    const jar = jarRegistry.find((j) => j.id === tx.jarId);
    return {
      'Mã Giao Dịch': tx.id,
      'Ngày': formatDateVI(tx.date),
      'Loại': tx.type === 'income' ? 'Thu nhập' : tx.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền',
      'Hũ Tài Chính': jar ? `${jar.name} (${jar.code})` : 'Chưa phân loại',
      'Danh Mục': tx.category,
      [`Số Tiền (${currencyLabel})`]: convertVndForDisplay(tx.amount),
      'Ngân Hàng': tx.bankName || jar?.bankName || '-',
      'Ghi Chú': tx.description,
    };
  });

  const wb = XLSX.utils.book_new();
  const wsJars = XLSX.utils.json_to_sheet(jarsSummaryData);
  const wsTx = XLSX.utils.json_to_sheet(transactionsData);
  const vndNumberFormat =
    preferences.currency === 'USD' ? '$#,##0.00' : '#,##0 [$₫-vi-VN]';
  ['G', 'H', 'I'].forEach((column) => {
    for (let row = 2; row <= jarsSummaryData.length + 1; row += 1) {
      const cell = wsJars[`${column}${row}`];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = vndNumberFormat;
      }
    }
  });
  for (let row = 2; row <= transactionsData.length + 1; row += 1) {
    const cell = wsTx[`F${row}`];
    if (cell && typeof cell.v === 'number') {
      cell.t = 'n';
      cell.z = vndNumberFormat;
    }
  }

  // Set column widths
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
  ];

  XLSX.utils.book_append_sheet(wb, wsJars, 'Báo Cáo Hũ Tài Chính');
  XLSX.utils.book_append_sheet(wb, wsTx, 'Lịch Sử Giao Dịch');

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  XLSX.writeFile(wb, `Bao_Cao_Tai_Chinh_RoFinance_${dateStr}.xlsx`);
}

export function exportToPDFPrint(
  jars: Jar[],
  transactions: Transaction[],
  monthlyIncome: number,
  jarRegistry: Jar[] = jars,
) {
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) return;

  const totalSpent = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const activeJarIds = new Set(jars.map((jar) => jar.id));
  const archivedCycleSpent = transactions
    .filter((transaction) => transaction.type === 'expense' && !activeJarIds.has(transaction.jarId))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalAllocated = jars.reduce((sum, j) => sum + j.targetBudget, 0) + archivedCycleSpent;
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
        <p>Mô hình Hũ Tài Chính & Phân Bổ Ngân Sách | Ngày xuất: ${nowStr}</p>
      </div>

      <div class="grid-summary">
        <div class="card">
          <div class="title">Tổng Thu Nhập Tháng</div>
          <div class="value">${formatVND(monthlyIncome)}</div>
        </div>
        <div class="card">
          <div class="title">Đã Phân Bổ Ngân Sách</div>
          <div class="value">${formatVND(totalAllocated)}</div>
        </div>
        <div class="card">
          <div class="title">Thực Tế Đã Chi Tiêu</div>
          <div class="value" style="color: ${totalSpent > totalAllocated ? '#dc2626' : '#16a34a'}">
            ${formatVND(totalSpent)}
          </div>
        </div>
        <div class="card">
          <div class="title">Thặng Dư Còn Lại</div>
          <div class="value">${formatVND(totalAllocated - totalSpent)}</div>
        </div>
      </div>

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
          ${jars
            .map((j) => {
              const remaining = j.targetBudget - j.currentSpent;
              const ratio = j.targetBudget > 0 ? (j.currentSpent / j.targetBudget) * 100 : 0;
              const badgeClass = ratio > 100 ? 'badge-danger' : ratio >= 80 ? 'badge-warning' : 'badge-safe';
              const statusText = ratio > 100 ? 'Vượt Hạn Mức' : ratio >= 80 ? 'Cảnh Báo' : 'An Toàn';
              return `
              <tr>
                <td><strong>${escapeHtml(j.code)}</strong></td>
                <td>${escapeHtml(j.name)}</td>
                <td>${escapeHtml(j.bankName)}</td>
                <td>${escapeHtml(j.accountNumber)}</td>
                <td class="text-right">${j.percentage}%</td>
                <td class="text-right">${formatVND(j.targetBudget)}</td>
                <td class="text-right">${formatVND(j.currentSpent)}</td>
                <td class="text-right">${formatVND(remaining)}</td>
                <td class="text-center"><span class="badge ${badgeClass}">${statusText}</span></td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>

      <h2>2. Lịch Sử Giao Dịch Gần Đây</h2>
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
          ${transactions
            .slice(0, 15)
            .map((tx) => {
              const jar = jarRegistry.find((j) => j.id === tx.jarId);
              return `
              <tr>
                <td>${formatDateVI(tx.date)}</td>
                <td>${tx.type === 'income' ? 'Thu nhập' : tx.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền'}</td>
                <td>${escapeHtml(jar ? jar.name : '-')}</td>
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
