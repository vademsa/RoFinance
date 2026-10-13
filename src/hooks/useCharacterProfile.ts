import { useCallback, useEffect, useRef, useState } from 'react';
import { CharacterApiError, characterApi } from '../lib/characterApi';
import type { CharacterProfile, CharacterState, DrawResult, MaterialResult, MaterialKind, ItemMaterial } from '../../shared/character';
import { characterReceiptStorage } from '@platform';
import { nextCharacterReceipt, receiptKey, type PendingCharacterAction } from '../../shared/characterReceipt';

type PendingAction = PendingCharacterAction;
export function useCharacterProfile(ownerId: string | null, refreshKey: number) {
  const [profile, setProfile] = useState<CharacterProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const ownerRef = useRef(ownerId);
  const generation = useRef(0);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  const loadingRef = useRef(false);
  const hasProfileRef = useRef(false);
  const deferredRefresh = useRef(false);
  const assignPending = (action: PendingAction | null) => { pendingRef.current = action; setPending(action); };
  const refresh = useCallback(async () => {
    if (!ownerId || ownerRef.current !== ownerId) return;
    if (busyRef.current) { deferredRefresh.current = true; return; }
    const currentGeneration = generation.current;
    const request = ++sequence.current;
    // Background reads must not disable a button midway through a tap. A
    // mutation advances sequence below, so late reads cannot overwrite it.
    loadingRef.current = !hasProfileRef.current; setLoading(loadingRef.current);
    try {
      const receipt = await nextCharacterReceipt(characterReceiptStorage, ownerId);
      if (currentGeneration !== generation.current || request !== sequence.current) return;
      assignPending(receipt);
      const result = await characterApi.profile();
      if (currentGeneration === generation.current && request === sequence.current) { hasProfileRef.current = true; setProfile(result.profile); setError(null); }
    } catch (failure) {
      if (currentGeneration === generation.current && request === sequence.current) setError(failure instanceof CharacterApiError ? failure.code : 'CHARACTER_UNAVAILABLE');
    } finally {
      if (currentGeneration === generation.current && request === sequence.current) { loadingRef.current = false; setLoading(false); }
    }
  }, [ownerId]);
  useEffect(() => {
    ownerRef.current = ownerId; generation.current++; sequence.current++;
    busyRef.current = false; loadingRef.current = false; hasProfileRef.current = false; deferredRefresh.current = false; pendingRef.current = null;
    setProfile(null); setError(null); setPending(null); setBusy(false); setLoading(false);
    if (ownerId) void refresh();
    return () => { generation.current++; sequence.current++; };
  }, [ownerId, refresh]);
  useEffect(() => {
    if (!ownerId || refreshKey === 0) return;
    const timer = window.setTimeout(() => { void refresh(); }, 400);
    return () => window.clearTimeout(timer);
  }, [ownerId, refreshKey, refresh]);
  const perform = async (action: () => Promise<{ profile: CharacterProfile; result?: DrawResult | { itemId: string } | MaterialResult }>, isPointAction: boolean) => {
    if (!ownerId || ownerRef.current !== ownerId || busyRef.current || loadingRef.current) return null;
    const currentGeneration = generation.current;
    const pointReceipt = isPointAction ? pendingRef.current : null;
    busyRef.current = true; setBusy(true); setError(null); ++sequence.current;
    try {
      const response = await action();
      if (currentGeneration !== generation.current) return null;
      // Persisted receipt removal is also part of confirmation. If it fails, keep
      // the same UUID for a safe idempotent replay on this device after restart.
      if (pointReceipt) await characterReceiptStorage.remove(receiptKey(ownerId, pointReceipt.requestId));
      if (currentGeneration !== generation.current) return null;
      hasProfileRef.current = true; setProfile(response.profile);
      if (pointReceipt) {
        const remaining = await nextCharacterReceipt(characterReceiptStorage, ownerId);
        if (currentGeneration !== generation.current) return null;
        assignPending(remaining);
      }
      return response;
    } catch (failure) {
      if (currentGeneration !== generation.current) return null;
      setError(failure instanceof CharacterApiError ? failure.code : 'CHARACTER_UNAVAILABLE');
      // A second device or a backdated correction may have exhausted a stale
      // balance. Read authoritative points before offering another new draw.
      if (isPointAction && failure instanceof CharacterApiError && ['NOT_ENOUGH_POINTS', 'NOT_ENOUGH_DUPLICATES'].includes(failure.code)) deferredRefresh.current = true;
      // A definite rejection means no debit. Network/5xx failures can happen after commit;
      // keep the same request ID for confirmation instead of creating a second draw.
      if (isPointAction && failure instanceof CharacterApiError && ['INVALID_INPUT', 'INVALID_REQUEST_ID', 'INVALID_ITEM', 'NOT_ENOUGH_POINTS', 'NOT_ENOUGH_FRAGMENTS', 'ALREADY_OWNED', 'INVALID_MATERIALS', 'MIXED_RARITY', 'MAX_RARITY', 'NOT_ENOUGH_DUPLICATES'].includes(failure.code)) {
        try {
          if (pointReceipt) await characterReceiptStorage.remove(receiptKey(ownerId, pointReceipt.requestId));
          const remaining = await nextCharacterReceipt(characterReceiptStorage, ownerId);
          if (currentGeneration === generation.current) assignPending(remaining);
        } catch { /* Preserve receipt if storage is unavailable. */ }
      }
      return null;
    } finally {
      if (currentGeneration === generation.current) {
        busyRef.current = false; setBusy(false);
        if (deferredRefresh.current) { deferredRefresh.current = false; void refresh(); }
      }
    }
  };
  const update = (patch: Partial<Pick<CharacterState, 'characterId' | 'gender' | 'nickname' | 'optIn' | 'equipped'>>) => {
    return perform(() => characterApi.update(patch), false);
  };
  const draw = () => {
    if (busyRef.current || loadingRef.current || (pendingRef.current && pendingRef.current.kind !== 'draw')) return Promise.resolve(null);
    const action = pendingRef.current || { kind: 'draw' as const, requestId: crypto.randomUUID() };
    const currentGeneration = generation.current;
    assignPending(action);
    return perform(async () => {
      await characterReceiptStorage.set(receiptKey(ownerId!, action.requestId), JSON.stringify(action));
      if (currentGeneration !== generation.current) throw new CharacterApiError('CHARACTER_UNAVAILABLE', 0);
      return characterApi.draw(action.requestId);
    }, true);
  };
  const exchange = (itemId: string) => {
    if (busyRef.current || loadingRef.current || (pendingRef.current && (pendingRef.current.kind !== 'exchange' || pendingRef.current.itemId !== itemId))) return Promise.resolve(null);
    const action = pendingRef.current || { kind: 'exchange' as const, requestId: crypto.randomUUID(), itemId };
    const currentGeneration = generation.current;
    assignPending(action);
    return perform(async () => {
      await characterReceiptStorage.set(receiptKey(ownerId!, action.requestId), JSON.stringify(action));
      if (currentGeneration !== generation.current) throw new CharacterApiError('CHARACTER_UNAVAILABLE', 0);
      return characterApi.exchange(action.requestId, itemId);
    }, true);
  };
  const sameOwner = ownerRef.current === ownerId;
  const transform = (kind: MaterialKind, items: ItemMaterial[]) => {
    if (busyRef.current || loadingRef.current || (pendingRef.current && pendingRef.current.kind !== kind)) return Promise.resolve(null);
    const action = pendingRef.current || { kind, requestId: crypto.randomUUID(), items: items.map((entry) => ({ ...entry })) };
    const currentGeneration = generation.current;
    assignPending(action);
    return perform(async () => {
      await characterReceiptStorage.set(receiptKey(ownerId!, action.requestId), JSON.stringify(action));
      if (currentGeneration !== generation.current) throw new CharacterApiError('CHARACTER_UNAVAILABLE', 0);
      return characterApi.transform(kind, action.requestId, action.items!);
    }, true);
  };
  return { profile: sameOwner ? profile : null, error: sameOwner ? error : null, loading, busy, pending: sameOwner ? pending : null, refresh, update, draw, exchange, transform };
}
export type CharacterController = ReturnType<typeof useCharacterProfile>;
