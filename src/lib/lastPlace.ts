import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Where each person was when they last left, kept on their own device.
//
// This used to live in memory, which held while moving between tabs but not
// across a sign-out — and signing out and back in is exactly when someone most
// wants to pick up where they left off.
//
// Stored per user, so the next person to sign in on a shared machine starts
// clean. Ids only, never a name or an email: this sits in the browser's storage
// on a staff laptop, and an id is meaningless to anyone reading it there.

const KEY = 'ftg_last_place';

/** What a staff member had open. */
export interface StaffPlace {
  /** The client whose page they were on. */
  clientId?: string | null;
  /** Which of that client's folders was open. */
  folderKey?: string | null;
}

/** Where a client was in their own documents. */
export interface ClientPlace {
  nav?: string;
  rootKey?: string | null;
  groupKey?: string | null;
  subKey?: string | null;
}

interface Stored {
  userId: string;
  staff?: StaffPlace;
  client?: ClientPlace;
}

// SecureStore has no web implementation, and this is a convenience rather than
// a secret, so the browser's own storage does on web. Both are wrapped: a
// device that refuses storage should lose the convenience, not the app.
const read = async (): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch { return null; }
};

const write = async (value: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  } catch { /* storage unavailable — the position is simply not kept */ }
};

/** What this user had open, or null if it was somebody else — or nobody. */
export async function loadLastPlace(userId: string | undefined): Promise<Stored | null> {
  if (!userId) return null;
  const raw = await read();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stored;
    return parsed?.userId === userId ? parsed : null;
  } catch { return null; }
}

/**
 * Record part of where this user is, leaving the rest as it was — a staff
 * member browsing a client should not wipe out where they were in Documents.
 */
export async function saveLastPlace(
  userId: string | undefined,
  patch: { staff?: StaffPlace; client?: ClientPlace },
): Promise<void> {
  if (!userId) return;
  const current = (await loadLastPlace(userId)) ?? { userId };
  await write(JSON.stringify({ ...current, ...patch, userId }));
}
