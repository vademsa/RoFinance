import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, X } from 'lucide-react';
import { getRuntimePreferences } from '../lib/preferences';

interface ToastProps {
  children: React.ReactNode;
  onDismiss: () => void;
  eventKey?: unknown;
  duration?: number;
  tone?: 'success' | 'info';
  closeLabel?: string;
  noTranslate?: boolean;
}

/** Non-critical feedback only. Validation errors and pending actions stay inline. */
export function Toast({ children, onDismiss, eventKey, duration = 5000, tone = 'success', closeLabel, noTranslate }: ToastProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(duration);
  const started = useRef(0);
  const hovering = useRef(false);
  const focused = useRef(false);
  const isEnglish = getRuntimePreferences().language === 'en';

  useEffect(() => {
    // Native <dialog> is in the browser top layer: its notifications must also
    // live inside it rather than behind its backdrop/inert body.
    const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    const parent = dialogs.item(dialogs.length - 1) || document.body;
    let viewport = parent.querySelector<HTMLElement>(':scope > [data-toast-viewport]');
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.dataset.toastViewport = 'true';
      viewport.className = 'app-toast-viewport';
      parent.appendChild(viewport);
    }
    setHost(viewport);
  }, []);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const schedule = () => {
    started.current = Date.now();
    timer.current = setTimeout(() => { timer.current = null; dismiss.current(); }, remaining.current);
  };
  useEffect(() => {
    remaining.current = duration;
    if (!hovering.current && !focused.current) schedule();
    return clearTimer;
  }, [eventKey, duration]);

  const interact = (kind: 'hover' | 'focus', active: boolean) => {
    const wasPaused = hovering.current || focused.current;
    (kind === 'hover' ? hovering : focused).current = active;
    const paused = hovering.current || focused.current;
    if (!wasPaused && paused) {
      remaining.current = Math.max(0, remaining.current - (Date.now() - started.current));
      clearTimer();
    } else if (wasPaused && !paused) schedule();
  };

  if (!host) return null;
  return createPortal(<div className="app-toast" data-tone={tone} data-no-translate={noTranslate ? 'true' : undefined}
    role="status" aria-live="polite" aria-atomic="true"
    onPointerEnter={event => { if (event.pointerType === 'mouse') interact('hover', true); }}
    onPointerLeave={event => { if (event.pointerType === 'mouse') interact('hover', false); }}
    onFocusCapture={() => interact('focus', true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) interact('focus', false); }}>
    {tone === 'success' ? <CheckCircle2 className="app-toast-icon" aria-hidden="true" /> : <Info className="app-toast-icon" aria-hidden="true" />}
    <div className="app-toast-body">{children}</div>
    <button type="button" className="app-toast-close" onClick={() => dismiss.current()}
      aria-label={closeLabel || (isEnglish ? 'Dismiss notification' : 'Đóng thông báo')}><X size={16} aria-hidden="true" /></button>
  </div>, host);
}
