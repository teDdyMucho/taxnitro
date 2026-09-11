import { useCallback, useRef } from 'react';
import { Platform, type ScrollView } from 'react-native';

/**
 * Lets a plain mouse wheel scroll a sideways strip on web.
 *
 * A horizontal ScrollView answers a finger and a trackpad's sideways swipe, but
 * not a mouse wheel, which only ever reports vertical movement. On the web build
 * that leaves the wide strips — the month bar, the statement tables, the roadmap
 * timeline, the client picker — showing a scrollbar and refusing to move for
 * anyone on a mouse.
 *
 * The wheel is only taken while the strip can still travel that way. At either
 * end it is left alone, so the page carries on scrolling rather than the pointer
 * landing in a patch where nothing happens.
 *
 * Returns a callback ref, not a ref object, and that is the fix for the first
 * version. That one attached its listener once, when the screen mounted — so a
 * strip that appeared later never got it: the Admin Documents month bar, which
 * waits for documents to load, and every strip inside a modal, which does not
 * exist until the modal opens. A callback ref runs whenever its ScrollView
 * mounts, however late, and again with null when it goes.
 *
 * One call per strip: each ref tracks the one ScrollView it is given.
 */
export function useWheelScroll() {
  const detach = useRef<(() => void) | null>(null);

  return useCallback((view: ScrollView | null) => {
    detach.current?.();
    detach.current = null;

    if (Platform.OS !== 'web' || !view) return;
    const node: HTMLElement | undefined = (view as any).getScrollableNode?.();
    if (!node) return;

    const onWheel = (e: WheelEvent) => {
      // A trackpad's sideways swipe already works; taking it too would move the
      // strip twice for one gesture.
      if (e.deltaX !== 0 || e.deltaY === 0) return;

      const room = node.scrollWidth - node.clientWidth;
      if (room <= 0) return;

      const at = node.scrollLeft;
      const forward = e.deltaY > 0;
      if ((forward && at >= room - 1) || (!forward && at <= 0)) return;

      // Firefox counts a wheel notch in lines (deltaMode 1), about 3 of them,
      // which as pixels would move the strip 3px and look like nothing at all.
      const step = e.deltaMode === 1 ? e.deltaY * 16
        : e.deltaMode === 2 ? e.deltaY * node.clientWidth
        : e.deltaY;

      node.scrollLeft = at + step;
      e.preventDefault();
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    detach.current = () => node.removeEventListener('wheel', onWheel);
  }, []);
}
