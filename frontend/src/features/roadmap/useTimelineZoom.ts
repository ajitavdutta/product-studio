import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  anchoredScrollLeft,
  baseMinWidth,
  fitZoom as computeFitZoom,
  stepZoom as nextStep,
  wheelZoom,
} from '../../lib/timeline';
import { useRoadmapEditor } from './state';

/** What to do with scrollLeft once the zoomed timeline has rendered. */
type PendingScroll =
  { kind: 'anchor'; oldWidth: number; scrollLeft: number; anchorX: number } | { kind: 'start' };

const RESET_ZOOM = 1;

function contentWidth(scrollBox: HTMLElement): number {
  const content = scrollBox.firstElementChild;
  return content instanceof HTMLElement ? content.offsetWidth : scrollBox.scrollWidth;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * RM-20 zoom for the roadmap timeline: buttons, Ctrl/Cmd+wheel around the pointer,
 * Ctrl/Cmd `=` `-` `0`, and Fit. Each view keeps its own zoom (in the editor store).
 * Returns the scroll box's width, which the header needs for sprint date labels.
 */
export function useTimelineZoom(scrollRef: RefObject<HTMLDivElement | null>) {
  const view = useRoadmapEditor((state) => state.view);
  const zoom = useRoadmapEditor((state) => state.zoom[view]);
  const setZoom = useRoadmapEditor((state) => state.setZoom);
  const [containerWidth, setContainerWidth] = useState(0);
  const pending = useRef<PendingScroll | null>(null);

  // Event listeners read the live zoom so they never act on a stale value.
  const currentZoom = useCallback(() => useRoadmapEditor.getState().zoom[view], [view]);

  const zoomTo = useCallback(
    (next: number, anchorX?: number) => {
      const scrollBox = scrollRef.current;
      if (scrollBox) {
        pending.current = {
          kind: 'anchor',
          oldWidth: contentWidth(scrollBox),
          scrollLeft: scrollBox.scrollLeft,
          anchorX: anchorX ?? scrollBox.clientWidth / 2,
        };
      }
      setZoom(view, next);
    },
    [scrollRef, setZoom, view],
  );

  // Track the box width: it drives Fit and the sprint column width.
  useLayoutEffect(() => {
    const scrollBox = scrollRef.current;
    if (!scrollBox) return;
    setContainerWidth(scrollBox.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(scrollBox.clientWidth);
    });
    observer.observe(scrollBox);
    return () => {
      observer.disconnect();
    };
  }, [scrollRef]);

  // After the zoomed timeline renders, keep the anchored date under the pointer.
  useLayoutEffect(() => {
    const scrollBox = scrollRef.current;
    const scroll = pending.current;
    pending.current = null;
    if (!scrollBox || !scroll) return;
    scrollBox.scrollLeft =
      scroll.kind === 'start'
        ? 0
        : anchoredScrollLeft(
            scroll.oldWidth,
            contentWidth(scrollBox),
            scroll.scrollLeft,
            scroll.anchorX,
          );
  }, [scrollRef, zoom, view]);

  // Ctrl/Cmd+wheel needs a non-passive listener, or the browser zooms the page instead.
  useEffect(() => {
    const scrollBox = scrollRef.current;
    if (!scrollBox) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const anchorX = event.clientX - scrollBox.getBoundingClientRect().left;
      zoomTo(wheelZoom(currentZoom(), event.deltaY), anchorX);
    };
    scrollBox.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scrollBox.removeEventListener('wheel', onWheel);
    };
  }, [scrollRef, zoomTo, currentZoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (isTextEntry(event.target)) return;
      let next: number | null = null;
      if (event.key === '=' || event.key === '+') next = nextStep(currentZoom(), 1);
      else if (event.key === '-') next = nextStep(currentZoom(), -1);
      else if (event.key === '0') next = RESET_ZOOM;
      if (next === null) return;
      // Stop the browser zooming the whole page.
      event.preventDefault();
      zoomTo(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [zoomTo, currentZoom]);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      zoomTo(nextStep(zoom, direction));
    },
    [zoom, zoomTo],
  );
  const resetZoom = useCallback(() => {
    zoomTo(RESET_ZOOM);
  }, [zoomTo]);
  const fitZoom = useCallback(() => {
    const width = scrollRef.current?.clientWidth ?? containerWidth;
    pending.current = { kind: 'start' };
    setZoom(view, computeFitZoom(width, baseMinWidth(view)));
  }, [scrollRef, containerWidth, setZoom, view]);

  return { zoom, containerWidth, stepZoom, resetZoom, fitZoom };
}
