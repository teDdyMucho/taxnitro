import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/** How long a session may sit untouched before "Still there?" is asked. */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes

/**
 * How long "Still there?" waits for an answer before the session ends anyway.
 * Daja asked for the question in place of signing straight out; a screen left
 * unattended must still lock, so nobody answering means nobody is there.
 */
export const IDLE_GRACE_MS = 60 * 1000;         // 1 minute

/**
 * How long a document preview may be read with no input the page can see. A
 * preview is a frame, and the mouse and wheel inside it never reach this page,
 * so reading a long statement looked like nobody there (Belly, 2026-10-28).
 * Longer than the usual limit, but still a limit: a screen left on a preview
 * locks too.
 */
export const READING_TIMEOUT_MS = 15 * 60 * 1000;   // 15 minutes

/** How often the last-activity stamp is checked. */
const POLL_MS = 15 * 1000;

// Every tab of the app shares one activity clock. Each tab used to keep its
// own, so a second tab left open ran out by itself, and its sign-out ended the
// tab being worked in as well, since every tab shares the one session.
const SHARED_KEY = 'ftg.lastActivity';
const SHARE_EVERY_MS = 5 * 1000;
const TAB = Math.random().toString(36).slice(2);

function readShared(): { at: number; tab: string } {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return { at: 0, tab: '' };
  try {
    const [at, tab] = (localStorage.getItem(SHARED_KEY) ?? '').split('|');
    return { at: Number(at) || 0, tab: tab ?? '' };
  } catch { return { at: 0, tab: '' }; }
}

function share(at: number) {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(SHARED_KEY, `${at}|${TAB}`); } catch {}
}

/** When someone last did anything in another tab of the app; 0 if not since this tab. */
export function lastActivityElsewhere(): number {
  const s = readShared();
  return s.tab && s.tab !== TAB ? s.at : 0;
}

const isFrame = (el: unknown) => /^(IFRAME|EMBED|OBJECT)$/.test((el as Element | null)?.tagName ?? '');

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
}): { notifyActivity: () => void; rearm: (opts?: { silent?: boolean }) => void } {
  const lastActivity = useRef(Date.now());
  // Held in a ref so a changing callback never restarts the timer.
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  // Guards against firing twice while the sign-out is still in flight.
  const firedRef = useRef(false);
  // When this tab last told the others, so a moving mouse writes now and then.
  const sharedAt = useRef(0);

  const touch = useCallback((now: number) => {
    lastActivity.current = now;
    if (now - sharedAt.current >= SHARE_EVERY_MS) { sharedAt.current = now; share(now); }
  }, []);

  const notifyActivity = useCallback(() => touch(Date.now()), [touch]);

  /**
   * Start counting again from now — after "Yes, I'm still here". `silent` when
   * the question gave way to activity in another tab: that was not this tab's
   * user, so it is not told to the other tabs as if it were.
   */
  const rearm = useCallback((opts?: { silent?: boolean }) => {
    const now = Date.now();
    lastActivity.current = now;
    if (!opts?.silent) { sharedAt.current = now; share(now); }
    firedRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      // A fresh sign-in must start from a clean slate.
      lastActivity.current = Date.now();
      firedRef.current = false;
      return;
    }

    lastActivity.current = Date.now();
    sharedAt.current = lastActivity.current;
    share(lastActivity.current);
    firedRef.current = false;

    // Web fills this in: whether someone is reading a preview right now.
    let reading = () => false;

    const check = () => {
      if (firedRef.current) return;
      const last = Math.max(lastActivity.current, readShared().at);
      const limit = reading() ? Math.max(timeoutMs, READING_TIMEOUT_MS) : timeoutMs;
      if (Date.now() - last >= limit) {
        firedRef.current = true;
        onIdleRef.current();
      }
    };

    const interval = setInterval(check, POLL_MS);

    // ── Web: real input events ────────────────────────────────────────────
    let detachWeb: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const bump = () => touch(Date.now());
      // Input only. Focus and scroll also fire when the page moves them itself,
      // as "Still there?" does when it opens, and that is nobody being there:
      // shared with the other tabs, it would clear their question unanswered.
      // A real scroll comes with a wheel, touch or key; coming back to the tab
      // is the window's own focus, listened for without capture.
      const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
      events.forEach(e => window.addEventListener(e, bump, { passive: true, capture: true }));
      window.addEventListener('focus', bump);

      // The pointer resting on a preview, or a click into one, with this window
      // in front: someone is reading, though the frame keeps their input.
      let overFrame = false;
      const onOver = (e: Event) => { overFrame = isFrame(e.target); };
      window.addEventListener('mouseover', onOver, { passive: true, capture: true });
      reading = () => document.hasFocus() && (overFrame || isFrame(document.activeElement));

      // Returning to a tab that slept past the limit must sign out at once,
      // not wait for the next poll.
      const onVisible = () => { if (!document.hidden) check(); };
      document.addEventListener('visibilitychange', onVisible);

      detachWeb = () => {
        events.forEach(e => window.removeEventListener(e, bump, { capture: true } as any));
        window.removeEventListener('focus', bump);
        window.removeEventListener('mouseover', onOver, { capture: true } as any);
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
  }, [enabled, timeoutMs, touch]);

  return { notifyActivity, rearm };
}
