import { useEffect, useRef } from 'react';
import { Platform, type ScrollView } from 'react-native';

/**
 * Lets a plain mouse wheel scroll a sideways strip on web.
 *
 * A horizontal ScrollView answers a finger and a trackpad's sideways swipe, but
 * not a mouse wheel, which only ever reports vertical movement. On the web build
 * that leaves the wide strips — the month bar, the statement tables, the roadmap
 * timeline — showing a scrollbar and refusing to move for anyone on a mouse.
 *
 * The wheel is only taken while the strip can still travel that way. At either
 * end it is left alone, so the page carries on scrolling rather than the pointer
 * landing in a patch where nothing happens.
 */
export function useWheelScroll() {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node: any = (ref.current as any)?.getScrollableNode?.();
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

      node.scrollLeft = at + e.deltaY;
      e.preventDefault();
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  return ref;
}
