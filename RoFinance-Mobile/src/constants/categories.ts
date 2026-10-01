import type { TransactionCategory } from '../types';

const expense = (
  id: string,
  name: string,
  icon: TransactionCategory['icon'],
  jarCode: string,
): TransactionCategory => ({
  id: `default-expense-${jarCode.toLowerCase()}-${id}`,
  name,
  icon,
  type: 'expense',
  jarCode,
});

const income = (
  id: string,
  name: string,
  icon: TransactionCategory['icon'],
): TransactionCategory => ({ id: `default-income-${id}`, name, icon, type: 'income' });

export const DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE: Record<string, TransactionCategory[]> = {
  NEC: [
    expense('breakfast', 'Ăn sáng', 'utensils', 'NEC'),
    expense('lunch', 'Ăn trưa', 'utensils', 'NEC'),
    expense('dinner', 'Ăn tối', 'utensils', 'NEC'),
    expense('coffee', 'Cafe & Đồ uống', 'coffee', 'NEC'),
    expense('market', 'Đi chợ & Siêu thị', 'shopping-basket', 'NEC'),
    expense('rent', 'Tiền thuê nhà', 'house', 'NEC'),
    expense('electricity', 'Tiền điện', 'zap', 'NEC'),
    expense('water', 'Tiền nước', 'droplets', 'NEC'),
    expense('internet', 'Internet & Điện thoại', 'wifi', 'NEC'),
    expense('fuel', 'Xăng xe', 'fuel', 'NEC'),
    expense('parking', 'Gửi xe & Cầu đường', 'parking', 'NEC'),
    expense('taxi', 'Taxi & Xe công nghệ', 'taxi', 'NEC'),
    expense('health', 'Khám bệnh & Thuốc', 'heart-pulse', 'NEC'),
    expense('insurance', 'Bảo hiểm', 'shield', 'NEC'),
    expense('children', 'Con cái & Gia đình', 'baby', 'NEC'),
    expense('home-repair', 'Sửa chữa nhà cửa', 'wrench', 'NEC'),
    expense('household', 'Vật dụng gia đình', 'sofa', 'NEC'),
    expense('other', 'Khác', 'tag', 'NEC'),
  ],
  SAFE: [
    expense('emergency-health', 'Y tế khẩn cấp', 'heart-pulse', 'SAFE'),
    expense('income-loss', 'Dự phòng mất thu nhập', 'shield', 'SAFE'),
    expense('urgent-repair', 'Sửa chữa khẩn cấp', 'wrench', 'SAFE'),
    expense('urgent-family', 'Hỗ trợ gia đình khẩn cấp', 'hand-heart', 'SAFE'),
    expense('fees-tax', 'Thuế & Phí phát sinh', 'receipt', 'SAFE'),
    expense('other', 'Dự phòng khác', 'tag', 'SAFE'),
  ],
  FFA: [
    expense('stocks', 'Cổ phiếu & Chứng khoán', 'chart', 'FFA'),
    expense('savings', 'Gửi tiết kiệm', 'piggy-bank', 'FFA'),
    expense('fund', 'Quỹ đầu tư & Chỉ số', 'trending-up', 'FFA'),
    expense('gold', 'Vàng', 'coins', 'FFA'),
    expense('real-estate', 'Bất động sản', 'building', 'FFA'),
    expense('business', 'Đầu tư kinh doanh', 'briefcase', 'FFA'),
    expense('crypto', 'Tài sản số', 'coins', 'FFA'),
    expense('other', 'Đầu tư khác', 'tag', 'FFA'),
  ],
  PLAY: [
    expense('restaurant', 'Nhà hàng & Ăn tiệm', 'utensils', 'PLAY'),
    expense('travel', 'Du lịch & Nghỉ dưỡng', 'plane', 'PLAY'),
    expense('hotel', 'Khách sạn', 'hotel', 'PLAY'),
    expense('fashion', 'Thời trang & Phụ kiện', 'shopping-bag', 'PLAY'),
    expense('electronics', 'Thiết bị điện tử', 'zap', 'PLAY'),
    expense('cinema-game', 'Phim ảnh & Game', 'gamepad', 'PLAY'),
    expense('spa', 'Spa & Chăm sóc cá nhân', 'sparkles', 'PLAY'),
    expense('sport', 'Thể thao & Gym', 'dumbbell', 'PLAY'),
    expense('party', 'Tiệc & Sự kiện', 'party', 'PLAY'),
    expense('hobby', 'Sở thích cá nhân', 'sparkles', 'PLAY'),
    expense('other', 'Hưởng thụ khác', 'tag', 'PLAY'),
  ],
  GIVE: [
    expense('family-gift', 'Quà biếu gia đình', 'gift', 'GIVE'),
    expense('wedding', 'Mừng cưới', 'party', 'GIVE'),
    expense('birthday', 'Sinh nhật', 'gift', 'GIVE'),
    expense('visit', 'Thăm hỏi', 'hand-heart', 'GIVE'),
    expense('charity', 'Từ thiện & Quyên góp', 'hand-heart', 'GIVE'),
    expense('friends', 'Giúp đỡ bạn bè', 'hand-heart', 'GIVE'),
    expense('other', 'Cho đi khác', 'tag', 'GIVE'),
  ],
  EDU: [
    expense('tuition', 'Học phí', 'graduation', 'EDU'),
    expense('online-course', 'Khóa học online', 'presentation', 'EDU'),
    expense('books', 'Sách & Tạp chí', 'book', 'EDU'),
    expense('workshop', 'Hội thảo & Workshop', 'presentation', 'EDU'),
    expense('language', 'Ngoại ngữ', 'book', 'EDU'),
    expense('certificate', 'Thi & Chứng chỉ', 'graduation', 'EDU'),
    expense('supplies', 'Dụng cụ học tập', 'pencil-ruler', 'EDU'),
    expense('other', 'Giáo dục khác', 'tag', 'EDU'),
  ],
  DEBT: [
    expense('bank-loan', 'Trả nợ ngân hàng', 'landmark', 'DEBT'),
    expense('credit-card', 'Thanh toán thẻ tín dụng', 'credit-card', 'DEBT'),
    expense('installment', 'Trả góp', 'receipt', 'DEBT'),
    expense('family-loan', 'Trả nợ người thân', 'hand-heart', 'DEBT'),
    expense('other', 'Khoản nợ khác', 'tag', 'DEBT'),
  ],
};

export const DEFAULT_INCOME_CATEGORIES: TransactionCategory[] = [
  income('salary', 'Lương hàng tháng', 'wallet'),
  income('bonus', 'Tiền thưởng', 'badge-dollar'),
  income('freelance', 'Thu nhập làm thêm', 'briefcase'),
  income('business', 'Thu nhập kinh doanh', 'trending-up'),
  income('investment', 'Lợi nhuận đầu tư', 'chart'),
  income('interest', 'Lãi tiết kiệm & Cho vay', 'piggy-bank'),
  income('refund', 'Hoàn tiền', 'rotate-ccw'),
  income('debt-collection', 'Thu hồi tiền cho vay', 'banknote'),
  income('asset-sale', 'Bán tài sản', 'coins'),
  income('gift', 'Quà tặng', 'gift'),
  income('other', 'Thu nhập khác', 'tag'),
];

export function getTransactionCategories(
  type: 'expense' | 'income',
  jarCode: string | undefined,
  customCategories: TransactionCategory[],
) {
  const defaults = type === 'income'
    ? DEFAULT_INCOME_CATEGORIES
    : DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE[jarCode || ''] || [];
  const custom = customCategories.filter((category) =>
    category.type === type && (type === 'income' || category.jarCode === jarCode)
  );
  const seen = new Set<string>();
  return [...defaults, ...custom].filter((category) => {
    const key = category.name.trim().toLocaleLowerCase('vi-VN');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findTransactionCategory(
  name: string,
  type: 'expense' | 'income',
  jarCode: string | undefined,
  customCategories: TransactionCategory[],
) {
  return getTransactionCategories(type, jarCode, customCategories)
    .find((category) => category.name === name);
}
