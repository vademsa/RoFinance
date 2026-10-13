import type { Mood, ItemSlot, Rarity, CosmeticGender } from '../../../shared/character';
export type CharacterLanguage = 'vi' | 'en';
export const genderLabels: Record<CosmeticGender, [string, string]> = { male: ['Nam', 'Male'], female: ['Nữ', 'Female'], unisex: ['Dùng chung', 'Unisex'] };
export const moodLabels: Record<Mood, [string, string]> = {
  happy: ['Vui vẻ', 'Happy'], steady: ['Bình thường', 'Steady'], worried: ['Lo lắng', 'Worried'], attention: ['Cần chú ý', 'Needs attention'],
};
export const slotLabels: Record<ItemSlot, [string, string]> = {
  shirt: ['Áo', 'Shirts'], hat: ['Mũ', 'Hats'], shoes: ['Giày', 'Shoes'], hair: ['Tóc', 'Hair'],
  face: ['Gương mặt', 'Faces'], expression: ['Biểu cảm', 'Expressions'], backpack: ['Balo', 'Backpacks'],
};
export const rarityLabels: Record<Rarity, [string, string]> = { common: ['Thông thường', 'Common'], rare: ['Hiếm', 'Rare'], special: ['Đặc biệt', 'Special'], legendary: ['Huyền thoại', 'Legendary'] };
export const reasonLabels: Record<string, [string, string]> = {
  incomplete: ['Chưa đủ dữ liệu thu nhập, ngân sách hoặc giao dịch cho chu kỳ này.', 'Income, budget or transaction data for this cycle is incomplete.'],
  overBudget: ['Có hũ đã chi vượt ngân sách. Bạn có thể xem lại kế hoạch cho phần còn lại của chu kỳ.', 'A jar is over budget. You can review your plan for the rest of the cycle.'],
  essentialLow: ['Hũ thiết yếu đã dùng hết ngân sách khi chu kỳ còn nhiều ngày.', 'The essentials budget is used up while there are still days left in this cycle.'],
  fastPace: ['Nhịp chi tiêu đang nhanh hơn tiến độ chu kỳ.', 'Spending is moving faster than the progress of the cycle.'],
  onTrack: ['Chi tiêu đang trong kế hoạch và các hũ còn phần dự phòng.', 'Spending is on track and the jars still have a buffer.'],
  steady: ['Nhân vật đang theo dõi chu kỳ cùng bạn.', 'Your companion is following this cycle with you.'],
};
export const errorLabels: Record<string, [string, string]> = {
  INVALID_GENDER: ['Chỉ được chọn Nam hoặc Nữ cho nhân vật.', 'Choose Male or Female for your character.'],
  INVALID_NICKNAME: ['Biệt danh cần 2–24 ký tự: chữ, số, dấu cách, dấu chấm, gạch ngang hoặc gạch dưới.', 'Use 2–24 letters, numbers, spaces, dots, hyphens or underscores for your alias.'],
  NOT_ENOUGH_POINTS: ['Chưa đủ điểm thưởng để quay.', 'Not enough reward points for a draw.'],
  APP_UPDATE_REQUIRED: ['Có bản cập nhật. Đóng popup để ứng dụng làm mới, sau đó xác nhận lại lượt đang chờ; điểm không bị trừ hai lần.', 'An update is available. Close the popup to refresh, then confirm the pending action; points will not be charged twice.'],
  NOT_ENOUGH_FRAGMENTS: ['Chưa đủ mảnh để đổi vật phẩm.', 'Not enough fragments to exchange an item.'],
  NOT_ENOUGH_DUPLICATES: ['Không còn đủ bản dư. Hãy tải lại tủ đồ.', 'Not enough spare copies remain. Refresh your wardrobe.'],
  INVALID_MATERIALS: ['Chọn đúng số bản dư và vật phẩm hợp lệ.', 'Select the exact number of valid spare copies.'],
  MIXED_RARITY: ['Ghép cần 7 bản dư cùng độ hiếm.', 'Fusion requires 7 spare copies of the same rarity.'],
  MAX_RARITY: ['Huyền thoại là bậc cao nhất, không thể ghép tiếp.', 'Legendary is the highest tier and cannot be fused further.'],
  REQUEST_ID_CONFLICT: ['Mã giao dịch đã được dùng cho thao tác khác. Hãy xác nhận đúng thao tác đang chờ.', 'This request ID belongs to another action. Confirm the original pending action.'],
  UNOWNED_EQUIPMENT: ['Bạn chỉ có thể lưu trang phục đã sở hữu.', 'You can only save items you own.'],
  ALREADY_OWNED: ['Bạn đã sở hữu vật phẩm này.', 'You already own this item.'],
  CHARACTER_RATE_LIMIT: ['Bạn đang thao tác quá nhanh. Hãy thử lại sau một phút.', 'Too many requests. Please try again in a minute.'],
  INVALID_CYCLE: ['Chu kỳ này chưa có dữ liệu hợp lệ.', 'This cycle has no valid data yet.'],
};
export const label = (pair: [string, string], language: CharacterLanguage) => pair[language === 'en' ? 1 : 0];
export const characterError = (code: string, language: CharacterLanguage) => label(errorLabels[code] ||
  ['Chưa thể kết nối hồ sơ nhân vật. Bạn có thể thử lại.', 'Your character profile could not be reached. You can try again.'], language);
