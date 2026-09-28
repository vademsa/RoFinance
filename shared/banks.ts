export const BANK_OPTIONS = [
  { code: 'TCB', name: 'Techcombank (Ngân hàng Kỹ Thương)', shortName: 'Techcombank' },
  { code: 'SEAB', name: 'SeaBank (Ngân hàng Đông Nam Á)', shortName: 'SeaBank' },
  { code: 'MB', name: 'MBBank (Ngân hàng Quân Đội)', shortName: 'MBBank' },
  { code: 'MOMO', name: 'Ví điện tử MoMo', shortName: 'Ví MoMo' },
  { code: 'VCB', name: 'Vietcombank (Ngân hàng Ngoại Thương)', shortName: 'Vietcombank' },
  { code: 'VPB', name: 'VPBank (Ngân hàng Thịnh Vượng)', shortName: 'VPBank' },
  { code: 'CAKE', name: 'Cake by VPBank (Ngân hàng số Cake)', shortName: 'Cake by VPBank' },
  { code: 'ACB', name: 'ACB (Ngân hàng Á Châu)', shortName: 'ACB' },
  { code: 'BIDV', name: 'BIDV (Ngân hàng ĐT&PT Việt Nam)', shortName: 'BIDV' },
  { code: 'CTG', name: 'VietinBank (Ngân hàng Công Thương)', shortName: 'VietinBank' },
  { code: 'AGRIBANK', name: 'Agribank (Ngân hàng Nông nghiệp)', shortName: 'Agribank' },
  { code: 'TPB', name: 'TPBank (Ngân hàng Tiên Phong)', shortName: 'TPBank' },
  { code: 'VIB', name: 'VIB (Ngân hàng Quốc Tế)', shortName: 'VIB' },
  { code: 'OCB', name: 'OCB (Ngân hàng Phương Đông)', shortName: 'OCB' },
  { code: 'MSB', name: 'MSB (Ngân hàng Hàng Hải)', shortName: 'MSB' },
  { code: 'STB', name: 'Sacombank (Ngân hàng Sài Gòn Thương Tín)', shortName: 'Sacombank' },
  { code: 'HDB', name: 'HDBank (Ngân hàng Phát triển TP.HCM)', shortName: 'HDBank' },
  { code: 'SHB', name: 'SHB (Ngân hàng Sài Gòn Hà Nội)', shortName: 'SHB' },
  { code: 'EIB', name: 'Eximbank (Ngân hàng Xuất Nhập Khẩu)', shortName: 'Eximbank' },
  { code: 'LPB', name: 'LPBank (Ngân hàng Lộc Phát)', shortName: 'LPBank' },
  { code: 'KLB', name: 'KienlongBank', shortName: 'KienlongBank' },
  { code: 'NAB', name: 'Nam A Bank', shortName: 'Nam A Bank' },
  { code: 'BAB', name: 'Bac A Bank', shortName: 'Bac A Bank' },
  { code: 'PVCOMBANK', name: 'PVcomBank', shortName: 'PVcomBank' },
  { code: 'VAB', name: 'VietABank', shortName: 'VietABank' },
  { code: 'UOB', name: 'UOB Việt Nam (United Overseas Bank)', shortName: 'UOB Việt Nam' },
  { code: 'ZALOPAY', name: 'Ví điện tử ZaloPay', shortName: 'Ví ZaloPay' },
  { code: 'SHOPEEPAY', name: 'Ví điện tử ShopeePay', shortName: 'Ví ShopeePay' },
] as const;

export const CASH_PAYMENT_METHOD = {
  code: 'CASH',
  name: 'Tiền mặt',
  shortName: 'Tiền mặt',
} as const;

export const PAYMENT_METHOD_OPTIONS = [CASH_PAYMENT_METHOD, ...BANK_OPTIONS] as const;

export function findBankByCode(code: unknown) {
  if (typeof code !== 'string') return undefined;
  const normalizedCode = code.trim().toUpperCase();
  return BANK_OPTIONS.find((bank) => bank.code === normalizedCode);
}

export function findPaymentMethodByCode(code: unknown) {
  if (typeof code !== 'string') return undefined;
  const normalizedCode = code.trim().toUpperCase();
  return PAYMENT_METHOD_OPTIONS.find((method) => method.code === normalizedCode);
}

export function findPaymentMethodByName(name: unknown) {
  if (typeof name !== 'string') return undefined;
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return PAYMENT_METHOD_OPTIONS.find((method) => {
    const aliases = [method.code, method.shortName, method.name];
    return aliases.some((alias) => alias
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase() === normalizedName);
  });
}
