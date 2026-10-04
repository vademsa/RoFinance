import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';

type Edge = 'top' | 'bottom';
type Phase = 'pulling' | 'ready' | 'loading' | 'success' | 'error';
type Feedback = { edge: Edge; phase: Phase; progress: number } | null;

interface MobileEdgeRefreshProps {
  scrollRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  language: 'vi' | 'en';
  onRefresh: () => Promise<void>;
}

const THRESHOLD = 72;

function hasNestedScroll(target: EventTarget | null, container: HTMLElement) {
  let element = target instanceof HTMLElement ? target : null;
  while (element && element !== container) {
    if (element.matches('input, textarea, select, button, [contenteditable="true"]')) return true;
    const overflow = getComputedStyle(element).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') &&
      element.scrollHeight > element.clientHeight + 2) return true;
    element = element.parentElement;
  }
  return false;
}

export function MobileEdgeRefresh({ scrollRef, enabled, language, onRefresh }: MobileEdgeRefreshProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackRef = useRef<Feedback>(null);
  const refreshRef = useRef(onRefresh);
  const hideTimerRef = useRef<number | null>(null);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const container = scrollRef.current;
    if (!enabled || !container) return;
    let gesture: { startY: number; atTop: boolean; atBottom: boolean } | null = null;
    const show = (value: Feedback) => {
      feedbackRef.current = value;
      setFeedback(value);
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1 || feedbackRef.current?.phase === 'loading' ||
        hasNestedScroll(event.target, container)) return;
      const atTop = container.scrollTop <= 1;
      const atBottom = container.scrollHeight - container.clientHeight - container.scrollTop <= 1;
      gesture = { startY: event.touches[0].clientY, atTop, atBottom };
    };
    const move = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      const distance = currentY - gesture.startY;
      if (!gesture.atTop && !gesture.atBottom) {
        if (distance > 0 && container.scrollTop <= 1) {
          gesture = { startY: currentY, atTop: true, atBottom: false };
        } else if (distance < 0 && container.scrollHeight - container.clientHeight - container.scrollTop <= 1) {
          gesture = { startY: currentY, atTop: false, atBottom: true };
        }
        return;
      }
      const edge = distance > 0 ? 'top' : 'bottom';
      if ((edge === 'top' && !gesture.atTop) || (edge === 'bottom' && !gesture.atBottom)) return;
      if (edge === 'top' && container.scrollTop > 1) return;
      if (edge === 'bottom' && container.scrollHeight - container.clientHeight - container.scrollTop > 1) return;
      const progress = Math.min(1, Math.max(0, (Math.abs(distance) - 12) / THRESHOLD));
      if (progress > 0) show({ edge, phase: progress === 1 ? 'ready' : 'pulling', progress });
    };
    const cancel = () => {
      gesture = null;
      if (feedbackRef.current?.phase === 'pulling' || feedbackRef.current?.phase === 'ready') show(null);
    };
    const end = () => {
      gesture = null;
      const current = feedbackRef.current;
      if (!current || (current.phase !== 'ready' && current.phase !== 'pulling')) return;
      if (current.phase !== 'ready') {
        show(null);
        return;
      }
      show({ edge: current.edge, phase: 'loading', progress: 1 });
      void refreshRef.current()
        .then(() => show({ edge: current.edge, phase: 'success', progress: 1 }))
        .catch(() => show({ edge: current.edge, phase: 'error', progress: 1 }));
    };
    container.addEventListener('touchstart', start, { passive: true });
    container.addEventListener('touchmove', move, { passive: true });
    container.addEventListener('touchend', end);
    container.addEventListener('touchcancel', cancel);
    return () => {
      container.removeEventListener('touchstart', start);
      container.removeEventListener('touchmove', move);
      container.removeEventListener('touchend', end);
      container.removeEventListener('touchcancel', cancel);
    };
  }, [enabled, scrollRef]);

  useEffect(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    if (feedback?.phase === 'success' || feedback?.phase === 'error') {
      hideTimerRef.current = window.setTimeout(() => {
        feedbackRef.current = null;
        setFeedback(null);
      }, feedback.phase === 'success' ? 1600 : 3000);
    }
    return () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, [feedback?.phase]);

  if (!feedback) return null;
  const labels = language === 'en'
    ? { pulling: 'Pull to refresh', ready: 'Release to refresh', loading: 'Refreshing data…', success: 'Data updated', error: 'Could not refresh. Try again.' }
    : { pulling: 'Kéo để tải lại', ready: 'Thả để tải lại', loading: 'Đang tải dữ liệu…', success: 'Dữ liệu đã cập nhật', error: 'Không thể tải lại. Hãy thử lại.' };

  return (
    <div role="status" aria-live="polite" className={`mobile-refresh-indicator mobile-refresh-${feedback.edge}`}>
      {feedback.phase === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        : feedback.phase === 'success' ? <Check className="h-4 w-4" aria-hidden="true" />
          : <RefreshCw className="h-4 w-4 transition-transform" aria-hidden="true" style={{ transform: `rotate(${feedback.progress * 180}deg)` }} />}
      <span>{labels[feedback.phase]}</span>
    </div>
  );
}
