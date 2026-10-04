import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';

type Edge = 'top' | 'bottom';
type Phase = 'pulling' | 'ready' | 'loading' | 'success' | 'error';
type Feedback = { edge: Edge; phase: Phase; progress: number; anchor: number } | null;

interface MobileEdgeRefreshProps {
  scrollRef: RefObject<HTMLElement | null>;
  language: 'vi' | 'en';
  onRefresh: () => Promise<void>;
}

const THRESHOLD = 72;
const RELEASE_DURATION = 260;

function hasNestedScroll(target: EventTarget | null, container: HTMLElement) {
  let element = target instanceof HTMLElement ? target : null;
  while (element && element !== container) {
    if (element.matches('input, textarea, select, button, [contenteditable="true"]')) return true;
    const overflow = getComputedStyle(element).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight + 2) return true;
    element = element.parentElement;
  }
  return false;
}

export function MobileEdgeRefresh({ scrollRef, language, onRefresh }: MobileEdgeRefreshProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackRef = useRef<Feedback>(null);
  const refreshRef = useRef(onRefresh);
  const hideTimerRef = useRef<number | null>(null);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let gesture: { startX: number; startY: number; atTop: boolean; atBottom: boolean; topAnchor: number; bottomAnchor: number } | null = null;
    let releaseTimer: number | null = null;
    let completionTimer: number | null = null;
    let disposed = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const show = (value: Feedback) => {
      feedbackRef.current = value;
      setFeedback(value);
    };
    const clearReleaseTimer = () => {
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      releaseTimer = null;
    };
    const moveContent = (offset: number, animate = false) => {
      clearReleaseTimer();
      if (reducedMotion) return;
      container.style.transition = animate ? `transform ${RELEASE_DURATION}ms cubic-bezier(.2,.8,.2,1)` : 'none';
      container.style.transform = `translate3d(0, ${offset}px, 0)`;
    };
    const releaseContent = () => {
      if (reducedMotion) return;
      moveContent(0, true);
      releaseTimer = window.setTimeout(() => {
        container.style.transition = '';
        container.style.transform = '';
        releaseTimer = null;
      }, RELEASE_DURATION);
    };
    const getAnchors = () => {
      const bounds = container.getBoundingClientRect();
      const bottomNav = document.querySelector<HTMLElement>('.mobile-bottom-nav');
      return {
        topAnchor: bounds.top,
        bottomAnchor: Math.max(0, window.innerHeight - (bottomNav?.getBoundingClientRect().top ?? bounds.bottom)),
      };
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1 || feedbackRef.current?.phase === 'loading' ||
        hasNestedScroll(event.target, container)) return;
      if (feedbackRef.current) show(null);
      const atTop = container.scrollTop <= 1;
      const atBottom = container.scrollHeight - container.clientHeight - container.scrollTop <= 1;
      gesture = { startX: event.touches[0].clientX, startY: event.touches[0].clientY,
        atTop, atBottom, ...getAnchors() };
    };
    const move = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      const distance = currentY - gesture.startY;
      if (Math.abs(distance) < Math.abs(event.touches[0].clientX - gesture.startX) * 1.2) return;
      if (!gesture.atTop && !gesture.atBottom) {
        if (distance > 0 && container.scrollTop <= 1) gesture = { ...gesture, startY: currentY, atTop: true };
        else if (distance < 0 && container.scrollHeight - container.clientHeight - container.scrollTop <= 1)
          gesture = { ...gesture, startY: currentY, atBottom: true };
        return;
      }
      const edge = distance > 0 ? 'top' : 'bottom';
      if ((edge === 'top' && !gesture.atTop) || (edge === 'bottom' && !gesture.atBottom) ||
        (edge === 'top' && container.scrollTop > 1) ||
        (edge === 'bottom' && container.scrollHeight - container.clientHeight - container.scrollTop > 1)) {
        if (feedbackRef.current?.phase === 'pulling' || feedbackRef.current?.phase === 'ready') {
          show(null);
          releaseContent();
        }
        return;
      }
      const pullDistance = Math.max(0, Math.abs(distance) - 12);
      const progress = Math.min(1, pullDistance / THRESHOLD);
      if (progress === 0) {
        if (feedbackRef.current?.phase === 'pulling' || feedbackRef.current?.phase === 'ready') {
          show(null);
          releaseContent();
        }
        return;
      }
      moveContent((edge === 'top' ? 1 : -1) * Math.min(88, pullDistance * 0.7));
      show({ edge, phase: progress === 1 ? 'ready' : 'pulling', progress,
        anchor: edge === 'top' ? gesture.topAnchor : gesture.bottomAnchor });
    };
    const cancel = () => {
      gesture = null;
      if (feedbackRef.current?.phase === 'pulling' || feedbackRef.current?.phase === 'ready') {
        show(null);
        releaseContent();
      }
    };
    const end = () => {
      gesture = null;
      const current = feedbackRef.current;
      if (!current || (current.phase !== 'ready' && current.phase !== 'pulling')) return;
      if (current.phase !== 'ready') {
        show(null);
        releaseContent();
        return;
      }
      moveContent(current.edge === 'top' ? 56 : -56, true);
      show({ ...current, phase: 'loading', progress: 1 });
      const startedAt = Date.now();
      void Promise.resolve().then(() => refreshRef.current())
        .then(() => 'success' as const, () => 'error' as const)
        .then((phase) => {
          if (disposed) return;
          completionTimer = window.setTimeout(() => {
            if (disposed) return;
            releaseContent();
            show({ ...current, phase, progress: 1 });
          }, Math.max(0, 450 - (Date.now() - startedAt)));
        });
    };
    container.addEventListener('touchstart', start, { passive: true });
    container.addEventListener('touchmove', move, { passive: true });
    container.addEventListener('touchend', end);
    container.addEventListener('touchcancel', cancel);
    return () => {
      disposed = true;
      clearReleaseTimer();
      if (completionTimer !== null) window.clearTimeout(completionTimer);
      container.style.transition = '';
      container.style.transform = '';
      container.removeEventListener('touchstart', start);
      container.removeEventListener('touchmove', move);
      container.removeEventListener('touchend', end);
      container.removeEventListener('touchcancel', cancel);
    };
  }, [scrollRef]);

  useEffect(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    if (feedback?.phase === 'success' || feedback?.phase === 'error') {
      hideTimerRef.current = window.setTimeout(() => {
        feedbackRef.current = null;
        setFeedback(null);
      }, feedback.phase === 'success' ? 1300 : 3000);
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
    <div role="status" aria-live="polite"
      className={`mobile-refresh-indicator mobile-refresh-${feedback.edge}`}
      style={feedback.edge === 'top' ? { top: feedback.anchor } : { bottom: feedback.anchor }}>
      <div className="mobile-refresh-surface" style={{ opacity: Math.min(1, feedback.progress * 2) }}>
        {feedback.phase === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          : feedback.phase === 'success' ? <Check className="h-5 w-5" aria-hidden="true" />
            : <RefreshCw className="h-5 w-5" aria-hidden="true" style={{ transform: `rotate(${feedback.progress * 180}deg)` }} />}
      </div>
      <span className="mobile-refresh-label">{labels[feedback.phase]}</span>
    </div>
  );
}
