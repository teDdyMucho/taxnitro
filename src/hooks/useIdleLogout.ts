import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/** How long a session may sit untouched before it is ended. */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes

/** How often the last-activity stamp is checked. */
const POLL_MS = 15 * 1000;

/**
 * Ends the session after a stretch with no interaction, on every platform.
 *
 * Keeps a last-activity timestamp and polls it rather than arming one long
 * setTimeout: browsers throttle timers in background tabs and the OS suspends
 * them outright when an app is backgrounded, so a plain timeout can fire minutes
 * late — or not at all — leaving a signed-in session on an unattended screen.
 * Comparing timestamps means a tab or app that slept past the limit signs out
 * the moment it wakes.
 *
 * Web wires its own DOM listeners. React Native has no global input event, so
 * the caller feeds touches in through the returned `notifyActivity`.
 */
export function useIdleLogout({
  enabled,
  onIdle,
  timeoutMs = IDLE_TIMEOUT_MS,
}: {
  enabled: boolean;
  onIdle: () => void;
  timeoutMs?: number;
}): { notifyActivity: () => void } {
  const lastActivity = useRef(Date.now());
  // Held in a ref so a changing callback never restarts the timer.
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  // Guards against firing twice while the sign-out is still in flight.
  const firedRef = useRef(false);

  const notifyActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) {
      // A fresh sign-in must start from a clean slate.
      lastActivity.current = Date.now();
      firedRef.current = false;
      return;
    }

    lastActivity.current = Date.now();
    firedRef.current = false;

    const check = () => {
      if (firedRef.current) return;
      if (Date.now() - lastActivity.current >= timeoutMs) {
        firedRef.current = true;
        onIdleRef.current();
      }
    };

    const interval = setInterval(check, POLL_MS);

    // ── Web: real input events ────────────────────────────────────────────
    let detachWeb: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const bump = () => { lastActivity.current = Date.now(); };
      const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart', 'focus'];
      events.forEach(e => window.addEventListener(e, bump, { passive: true, capture: true }));

      // Returning to a tab that slept past the limit must sign out at once,
      // not wait for the next poll.
      const onVisible = () => { if (!document.hidden) check(); };
      document.addEventListener('visibilitychange', onVisible);

      detachWeb = () => {
        events.forEach(e => window.removeEventListener(e, bump, { capture: true } as any));
        document.removeEventListener('visibilitychange', onVisible);
      };
    }

    // ── Native: same catch-up when the app is brought back to the front ───
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });

    return () => {
      clearInterval(interval);
      detachWeb?.();
      sub.remove();
    };
  }, [enabled, timeoutMs]);

  return { notifyActivity };
}
