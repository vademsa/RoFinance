import { apiFetch } from '@platform';
import { beforeCharacterMutation } from './appRelease';
import { COMMUNITY_PAGE_SIZE, isCommunityPlan, type CommunityPlan, type CommunityDesign } from '../../shared/communityPlans';
async function request(path: string, ownerId: string, init: RequestInit = {}) {
  if (init.method && init.method !== 'GET') await beforeCharacterMutation();
  const response = await apiFetch(`/api/community-plans${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-RoFinance-Owner': ownerId, ...init.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'COMMUNITY_UNAVAILABLE');
  if (!data || typeof data !== 'object') throw new Error('COMMUNITY_UNAVAILABLE');
  return data;
}
export const communityApi = {
  list: async (page: number, mine: boolean, ownerId: string): Promise<{ plans: CommunityPlan[]; total: number }> => {
    const data = await request(`?page=${page}${mine ? '&mine=true' : ''}`, ownerId);
    if (data.page !== page || !Number.isSafeInteger(data.total) || data.total < 0 || !Array.isArray(data.plans) || data.plans.length > COMMUNITY_PAGE_SIZE || !data.plans.every(isCommunityPlan)) throw new Error('COMMUNITY_UNAVAILABLE');
    return data;
  },
  publish: async (design: CommunityDesign, ownerId: string): Promise<CommunityPlan> => {
    const data = await request('', ownerId, { method: 'POST', body: JSON.stringify(design) });
    if (!isCommunityPlan(data.plan) || !data.plan.isOwner) throw new Error('COMMUNITY_UNAVAILABLE');
    return data.plan;
  },
  unpublish: async (id: string, ownerId: string) => {
    const data = await request(`/${encodeURIComponent(id)}`, ownerId, { method: 'DELETE' });
    if (data.success !== true) throw new Error('COMMUNITY_UNAVAILABLE');
  },
  adopt: async (planId: string, requestId: string, expectedRevision: string, ownerId: string): Promise<{ revision: string; creatorRewardGranted: boolean }> => {
    const data = await request('/adopt', ownerId, { method: 'POST', body: JSON.stringify({ planId, requestId, expectedRevision }) });
    if (typeof data.revision !== 'string' || !/^\d+$/.test(data.revision) || typeof data.creatorRewardGranted !== 'boolean') throw new Error('COMMUNITY_UNAVAILABLE');
    return data;
  },
};
