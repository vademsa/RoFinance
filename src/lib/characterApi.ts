import { apiFetch } from '@platform';
import type { CharacterProfile, CharacterState, DrawResult, LeaderboardEntry, MaterialKind, ItemMaterial, MaterialResult } from '../../shared/character';
import { isCharacterProfile, isDrawResult, isLeaderboardEntry, isMaterialResult } from './characterContracts';
import { COSMETICS, canExchangeCosmetic } from '../../shared/character';
import { beforeCharacterMutation } from './appRelease';

export class CharacterApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
export function createCharacterApi(fetcher: typeof fetch, beforeMutation: () => Promise<void> = async () => {}) {
  const request = async <T>(path: string, init: RequestInit = {}, validate: (data: any) => boolean = (data) => isCharacterProfile(data.profile)): Promise<T> => {
    // Allow profile drafts to be saved before refresh; gate point/material actions.
    if (init.method === 'POST') {
      try { await beforeMutation(); }
      catch (error) { throw new CharacterApiError(error instanceof Error && error.message === 'APP_UPDATE_REQUIRED' ? 'APP_UPDATE_REQUIRED' : 'CHARACTER_UNAVAILABLE', 503); }
    }
    const response = await fetcher(`/api/character${path}`, { ...init, cache: 'no-store',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      signal: init.signal || AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new CharacterApiError(typeof data?.error === 'string' ? data.error : 'CHARACTER_UNAVAILABLE', response.status);
    if (!data || typeof data !== 'object' || !validate(data)) throw new CharacterApiError('CHARACTER_UNAVAILABLE', 0);
    return data as T;
  };
  return {
    profile: () => request<{ profile: CharacterProfile }>('/profile'),
    update: (patch: Partial<Pick<CharacterState, 'characterId' | 'gender' | 'nickname' | 'optIn' | 'equipped'>>) =>
      request<{ profile: CharacterProfile }>('/profile', { method: 'PATCH', body: JSON.stringify(patch) }),
    draw: (requestId: string) => request<{ profile: CharacterProfile; result: DrawResult }>('/draw', {
      method: 'POST', body: JSON.stringify({ requestId }),
    }, (data) => isCharacterProfile(data.profile) && isDrawResult(data.result) && (data.result.itemId === null || data.profile.ownedItemIds.includes(data.result.itemId))),
    exchange: (requestId: string, itemId: string) => request<{ profile: CharacterProfile; result: { itemId: string } }>('/exchange', {
      method: 'POST', body: JSON.stringify({ requestId, itemId }),
    }, (data) => isCharacterProfile(data.profile) && data.result?.itemId === itemId && data.profile.ownedItemIds.includes(itemId) && COSMETICS.some((item) => item.id === itemId && canExchangeCosmetic(item))),
    transform: (kind: MaterialKind, requestId: string, items: ItemMaterial[]) => request<{ profile: CharacterProfile; result: MaterialResult }>(`/${kind}`, {
      method: 'POST', body: JSON.stringify({ requestId, items }),
    }, (data) => isCharacterProfile(data.profile) && isMaterialResult(data.result, kind, items) && (data.result.itemId === null || data.profile.ownedItemIds.includes(data.result.itemId))),
    leaderboard: (season: string) => request<{ season: string; entries: LeaderboardEntry[] }>(`/leaderboard?season=${encodeURIComponent(season)}`, {},
      (data) => data.season === season && Array.isArray(data.entries) && data.entries.length <= 50 && data.entries.every(isLeaderboardEntry)),
  };
}
export const characterApi = createCharacterApi(apiFetch, beforeCharacterMutation);
