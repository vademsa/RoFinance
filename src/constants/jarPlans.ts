import type { Jar } from '../types';

export interface JarPlanDefinition {
  id: string;
  name: string;
  description: string;
  suitableFor: string;
  allocations: { code: Jar['code']; percentage: number }[];
}

export const CUSTOM_JAR_PLAN_ID = 'custom';

export const JAR_PLAN_DEFINITIONS: JarPlanDefinition[] = [
  {
    id: 'balanced-no-debt',
    name: 'Cân bằng – Không nợ',
    description: 'Giữ cân bằng giữa sinh hoạt, dự phòng và tích lũy dài hạn.',
    suitableFor: 'Thu nhập ổn định và không có khoản vay',
    allocations: [
      { code: 'NEC', percentage: 50 },
      { code: 'SAFE', percentage: 15 },
      { code: 'FFA', percentage: 15 },
      { code: 'PLAY', percentage: 10 },
      { code: 'EDU', percentage: 7 },
      { code: 'GIVE', percentage: 3 },
    ],
  },
  {
    id: 'asset-growth',
    name: 'Tăng trưởng tài sản',
    description: 'Tăng tỷ trọng đầu tư và học tập khi chi phí sinh hoạt đã ổn định.',
    suitableFor: 'Người muốn ưu tiên tích lũy và đầu tư',
    allocations: [
      { code: 'NEC', percentage: 40 },
      { code: 'SAFE', percentage: 15 },
      { code: 'FFA', percentage: 25 },
      { code: 'EDU', percentage: 10 },
      { code: 'PLAY', percentage: 7 },
      { code: 'GIVE', percentage: 3 },
    ],
  },
  {
    id: 'variable-income',
    name: 'Thu nhập chưa ổn định',
    description: 'Ưu tiên chi phí thiết yếu và quỹ dự phòng trước khi tăng đầu tư.',
    suitableFor: 'Freelancer, kinh doanh hoặc thu nhập biến động',
    allocations: [
      { code: 'NEC', percentage: 60 },
      { code: 'SAFE', percentage: 25 },
      { code: 'FFA', percentage: 5 },
      { code: 'EDU', percentage: 5 },
      { code: 'PLAY', percentage: 5 },
    ],
  },
  {
    id: 'debt-priority',
    name: 'Ưu tiên trả nợ',
    description: 'Dành một phần rõ ràng cho nghĩa vụ nợ nhưng vẫn duy trì dự phòng.',
    suitableFor: 'Người đang có khoản vay hoặc trả góp',
    allocations: [
      { code: 'NEC', percentage: 45 },
      { code: 'DEBT', percentage: 25 },
      { code: 'SAFE', percentage: 10 },
      { code: 'FFA', percentage: 8 },
      { code: 'EDU', percentage: 5 },
      { code: 'PLAY', percentage: 5 },
      { code: 'GIVE', percentage: 2 },
    ],
  },
  {
    id: 'student-starter',
    name: 'Sinh viên / Mới đi làm',
    description: 'Tập trung sinh hoạt, dự phòng ban đầu và phát triển bản thân.',
    suitableFor: 'Người mới bắt đầu quản lý tài chính',
    allocations: [
      { code: 'NEC', percentage: 55 },
      { code: 'SAFE', percentage: 15 },
      { code: 'EDU', percentage: 15 },
      { code: 'FFA', percentage: 10 },
      { code: 'PLAY', percentage: 5 },
    ],
  },
];

export function findJarPlan(planId: string) {
  return JAR_PLAN_DEFINITIONS.find((plan) => plan.id === planId);
}
