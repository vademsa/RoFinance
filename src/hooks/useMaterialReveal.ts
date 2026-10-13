import { useEffect, useRef, useState } from 'react';
import type { ItemMaterial, MaterialKind, MaterialResult } from '../../shared/character';

export type MaterialPhase = 'idle' | 'gathering' | 'waiting' | 'charging' | 'revealing' | 'complete';
export function useMaterialReveal(onTransform: (kind: MaterialKind, items: ItemMaterial[]) => Promise<MaterialResult | null>) {
  const [phase, setPhase] = useState<MaterialPhase>('idle');
  const [materials, setMaterials] = useState<ItemMaterial[]>([]);
  const [result, setResult] = useState<MaterialResult | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const timers = useRef(new Map<ReturnType<typeof setTimeout>, () => void>());
  useEffect(() => () => {
    generation.current++;
    for (const [timer, resolve] of timers.current) { clearTimeout(timer); resolve(); }
    timers.current.clear(); running.current = false;
  }, []);
  const pause = (duration: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { timers.current.delete(timer); resolve(); }, duration);
    timers.current.set(timer, resolve);
  });
  const run = async (kind: MaterialKind, selected: ItemMaterial[]) => {
    if (running.current) return;
    running.current = true;
    const operation = ++generation.current;
    const snapshot = selected.map((entry) => ({ ...entry }));
    setMaterials(snapshot); setResult(null); setPhase('gathering');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Call once. No reroll, fabricated result, or extra request from animation.
    const confirmation = Promise.resolve().then(() => operation === generation.current ? onTransform(kind, snapshot) : null).catch(() => null);
    await pause(reduced ? 200 : 1200);
    if (operation !== generation.current) return;
    setPhase('waiting');
    const response = await confirmation;
    if (operation !== generation.current) return;
    if (!response) { running.current = false; setPhase('idle'); return; }
    setResult(response); setPhase('charging');
    await pause(reduced ? 150 : 800);
    if (operation !== generation.current) return;
    setPhase('revealing');
    await pause(reduced ? 150 : 900);
    if (operation !== generation.current) return;
    running.current = false; setPhase('complete');
  };
  const reset = () => { if (!running.current) { setResult(null); setMaterials([]); setPhase('idle'); } };
  return { phase, materials, result, run, reset, running: !['idle', 'complete'].includes(phase) };
}
