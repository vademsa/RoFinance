const BANK_BINS: Record<string, string> = {
  TCB: '970407', VCB: '970436', BIDV: '970418', CTG: '970415', ICB: '970415',
  AGRIBANK: '970405', OCB: '970448', MB: '970422', ACB: '970416', VPB: '970432',
  TPB: '970423', STB: '970403', HDB: '970437', VIB: '970441', SHB: '970443',
  EIB: '970431', MSB: '970426', BAB: '970409', MOMO: '971025', PVCOMBANK: '970412',
  VAB: '970427', NAB: '970428', SEAB: '970440', LPB: '970449', KLB: '970452',
  CAKE: '546034', UOB: '970458',
};

const tlv = (tag: string, value: string) => `${tag}${String(new TextEncoder().encode(value).length).padStart(2, '0')}${value}`;

function normalizeText(value: string, maxLength: number) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/đ/g, 'd')
    .replace(/[^A-Za-z0-9 .-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, maxLength);
}

function crc16(value: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function canCreateVietQR(bankCode: string, accountNumber: string) {
  return Boolean(BANK_BINS[bankCode.toUpperCase()] && /^[0-9]{6,19}$/.test(accountNumber.replace(/\D/g, '')));
}

export function createVietQRPayload(options: { bankCode: string; accountNumber: string; accountName?: string; amount?: number; purpose?: string }) {
  const bankBin = BANK_BINS[options.bankCode.toUpperCase()];
  const accountNumber = options.accountNumber.replace(/\D/g, '');
  if (!bankBin || !/^[0-9]{6,19}$/.test(accountNumber)) throw new Error('Ngân hàng hoặc số tài khoản chưa hỗ trợ tạo VietQR.');
  const consumer = tlv('00', bankBin) + tlv('01', accountNumber);
  const merchant = tlv('00', 'A000000727') + tlv('01', consumer) + tlv('02', 'QRIBFTTA');
  const amount = Number(options.amount) > 0 ? Math.round(Number(options.amount)) : 0;
  const purpose = normalizeText(options.purpose || '', 25);
  const merchantName = normalizeText(options.accountName || 'ROFINANCE', 25) || 'ROFINANCE';
  let payload = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', merchant) + tlv('53', '704');
  if (amount) payload += tlv('54', String(amount));
  payload += tlv('58', 'VN') + tlv('59', merchantName) + tlv('60', 'HANOI');
  if (purpose) payload += tlv('62', tlv('08', purpose));
  payload += '6304';
  return payload + crc16(payload);
}
