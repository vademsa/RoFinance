import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawResult, MaterialResult } from '../../shared/character';

// Presentation only: server confirmation and receipt/idempotency remain in the
// account controller. Never invent an item or trigger a second API request here.
export function useDrawReveal(ownerKey: string | null, draw: () => Promise<{ result?: DrawResult | { itemId: string } | MaterialResult } | null>) {
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [confirmed, setConfirmed] = useState<DrawResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [runId, setRunId] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const confirmedRef = useRef<DrawResult | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    generation.current++; inFlight.current = false;
    confirmedRef.current = null; setVisible(false); setOpening(false); setResult(null); setConfirmed(null); setRunId(0); setStartedAt(null);
    return () => {
      generation.current++; inFlight.current = false;
      confirmedRef.current = null;
    };
  }, [ownerKey]);
  const complete = useCallback((outcome: DrawResult) => {
    if (!inFlight.current || confirmedRef.current !== outcome) return;
    setResult(outcome); setOpening(false); inFlight.current = false;
  }, []);
  const dismiss = () => { if (!inFlight.current) setVisible(false); };
  const show = () => {
    if (!ownerKey || inFlight.current) return;
    // Opening the popup never calls the API or spends points.
    confirmedRef.current = null; setConfirmed(null); setResult(null); setOpening(false); setVisible(true); setStartedAt(null);
  };
  const run = async () => {
    if (!ownerKey || inFlight.current) return;
    const operation = generation.current;
    const keepOpen = visible;
    setRunId((current) => current + 1);
    // Real elapsed time includes hidden/suspended frames and network latency.
    // Opening the popup alone never starts this clock or spends points.
    setStartedAt(Date.now());
    inFlight.current = true; confirmedRef.current = null; setVisible(true); setOpening(true); setResult(null); setConfirmed(null);
    try {
      const response = await draw();
      if (operation !== generation.current) return;
      if (!response?.result || !('guaranteed' in response.result)) {
        inFlight.current = false; setOpening(false); setVisible(keepOpen); return;
      }
      const outcome = response.result;
      confirmedRef.current = outcome;
      setConfirmed(outcome);
    } catch {
      // The controller retains uncertain receipts and exposes the actual error.
      if (operation === generation.current) { setOpening(false); setVisible(keepOpen); inFlight.current = false; }
    }
  };
  return { opening, result, confirmed, visible, runId, startedAt, complete, dismiss, show, run };
}
