import { Jar, BankAccount, Transaction, DebtItem } from '../types';
export { BANK_OPTIONS } from '../../shared/banks';
import {
  DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE,
  DEFAULT_INCOME_CATEGORIES,
} from './categories';

export const DEFAULT_MONTHLY_INCOME = 0;

const DEFAULT_JAR_TEMPLATES: Jar[] = [
  {
    id: 'jar-nec',
    code: 'NEC',
    name: 'Nhu cầu thiết yếu',
    percentage: 40.0,
    bankName: 'Chưa cấu hình',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    color: '#3B82F6', // Blue
    description: 'Ăn uống, thuê nhà, điện nước, xăng xe, hóa đơn sinh hoạt',
    targetBudget: 0,
    currentSpent: 0,
  },
  {
    id: 'jar-safe',
    code: 'SAFE',
    name: 'Quỹ an toàn',
    percentage: 0,
    bankName: 'Chưa cấu hình',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    color: '#06B6D4',
    description: 'Quỹ dự phòng khẩn cấp cho sức khỏe, mất thu nhập và chi phí ngoài kế hoạch',
    targetBudget: 0,
    currentSpent: 0,
  },
  {
    id: 'jar-ffa',
    code: 'FFA',
    name: 'Tự do tài chính',
    percentage: 9.30,
    bankName: 'Chưa cấu hình',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    color: '#10B981', // Emerald
    description: 'Đầu tư cổ phiếu, tiết kiệm dài hạn, tạo dòng tiền bị động',
    targetBudget: 0,
    currentSpent: 0,
  },
  {
    id: 'jar-play',
    code: 'PLAY',
    name: 'Hưởng thụ',
    percentage: 9.45,
    bankName: 'Chưa cấu hình',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    color: '#F59E0B', // Amber
    description: 'Du lịch, mua sắm đồ cá nhân, giải trí, đi cafe, thư giãn',
    targetBudget: 0,
    currentSpent: 0,
  },
  {
    id: 'jar-give',
    code: 'GIVE',
    name: 'Cho đi',
    percentage: 5.0,
    bankName: 'Chưa cấu hình',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    color: '#EC4899', // Pink
    description: 'Quà biếu cha mẹ, từ thiện, giúp đỡ bạn bè, đám xá',
    targetBudget: 0,
    currentSpent: 0,
  },
  {
    id: 'jar-edu',
    code: 'EDU',
    name: 'Giáo dục',
    percentage: 10.0,
    bankName: 'Chưa cấu hình',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    color: '#8B5CF6', // Purple
    description: 'Mua sách, khóa học online, hội thảo, nâng cao kỹ năng',
    targetBudget: 0,
    currentSpent: 0,
  },
  {
    id: 'jar-debt',
    code: 'DEBT',
    name: 'Trả nợ',
    percentage: 26.25,
    bankName: 'Chưa cấu hình',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    color: '#EF4444', // Red
    description: 'Thanh toán khoản vay mua nhà/xe, trả thẻ tín dụng hàng tháng',
    targetBudget: 0,
    currentSpent: 0,
  },
];

// New V1 accounts start clean. Percentages and descriptions are templates only;
// all account details, balances, budgets, and spending are entered by the user.
export const DEFAULT_JARS: Jar[] = DEFAULT_JAR_TEMPLATES.map((jar) => ({
  ...jar,
  bankName: 'Chưa cấu hình',
  bankCode: '',
  accountNumber: '',
  accountName: '',
  targetBudget: 0,
  currentSpent: 0,
}));

export const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [];

export const INITIAL_TRANSACTIONS: Transaction[] = [];

export const CATEGORIES_BY_JAR_CODE = Object.fromEntries(
  Object.entries(DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE)
    .map(([code, categories]) => [code, categories.map((category) => category.name)])
) as Record<string, string[]>;

export const INCOME_CATEGORIES = DEFAULT_INCOME_CATEGORIES.map((category) => category.name);

export const DEFAULT_USD_VND_RATE = 25450; // Standard USD to VND exchange rate

export const POPULAR_BINANCE_SYMBOLS = [
  { symbol: 'BTCUSDT', coin: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', coin: 'ETH', name: 'Ethereum' },
  { symbol: 'BNBUSDT', coin: 'BNB', name: 'BNB' },
  { symbol: 'SOLUSDT', coin: 'SOL', name: 'Solana' },
  { symbol: 'XRPUSDT', coin: 'XRP', name: 'Ripple' },
  { symbol: 'DOGEUSDT', coin: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADAUSDT', coin: 'ADA', name: 'Cardano' },
  { symbol: 'AVAXUSDT', coin: 'AVAX', name: 'Avalanche' },
  { symbol: 'NEARUSDT', coin: 'NEAR', name: 'NEAR Protocol' },
  { symbol: 'DOTUSDT', coin: 'DOT', name: 'Polkadot' },
  { symbol: 'LINKUSDT', coin: 'LINK', name: 'Chainlink' },
  { symbol: 'SUIUSDT', coin: 'SUI', name: 'Sui' },
  { symbol: 'PEPEUSDT', coin: 'PEPE', name: 'Pepe' },
];

export const DEFAULT_CRYPTO_ASSETS = [];

export const DEFAULT_DEBT_ITEMS: DebtItem[] = [];
