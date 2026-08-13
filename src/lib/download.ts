import { Platform, Linking } from 'react-native';

/**
 * Downloading documents — one file, or many as a single .zip.
 *
 * Files live in public Supabase Storage. Their URLs open inline by default,
 * so every download here goes through `withDownloadParam`, which asks Storage
 * for `Content-Disposition: attachment` and names the saved file.
 *
 * Zipping is web-only: it needs Blob + object URLs, which React Native does not
 * provide. On native, bulk falls back to handing each URL to the OS one at a
 * time — see `downloadMany`.
 */

export interface DownloadableFile {
  /** Public storage URL. */
  url: string;
  /** Name to save as, extension included where known. */
  name: string;
}

/** Supabase Storage serves as an attachment when asked, and honours the name. */
export function withDownloadParam(url: string, filename?: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('download', filename ?? '');
    return u.toString();
  } catch {
    // Not an absolute URL (shouldn't happen) — fall back to a manual param.
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}download=${encodeURIComponent(filename ?? '')}`;
  }
}

/** Strip characters that are illegal in file names on Windows/macOS. */
export function safeFileName(name: string): string {
  return (name || 'document')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

/** Give two files in the same zip distinct names rather than clobbering one. */
function uniqueName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) { taken.add(name); return name; }
  const dot  = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext  = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  let candidate = `${stem} (${n})${ext}`;
  while (taken.has(candidate)) { n += 1; candidate = `${stem} (${n})${ext}`; }
  taken.add(candidate);
  return candidate;
}

/** Save one file. */
export async function downloadOne(file: DownloadableFile): Promise<void> {
  const href = withDownloadParam(file.url, safeFileName(file.name));

  if (Platform.OS !== 'web') {
    await Linking.openURL(href);
    return;
  }

  const a = document.createElement('a');
  a.href = href;
  a.download = safeFileName(file.name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface ZipProgress {
  /** Files fetched so far. */
  done: number;
  total: number;
  /** Set once fetching is finished and the archive is being written. */
  zipping?: boolean;
}

export interface BulkResult {
  saved: number;
  /** Names that could not be fetched — reported rather than silently dropped. */
  failed: string[];
}

/**
 * Fetch every file and save them as one .zip (web).
 *
 * Files are fetched sequentially: a folder can hold dozens of statements, and
 * firing them all at once risks exhausting memory and hitting Storage rate
 * limits at the same moment.
 */
export async function downloadZip(
  files: DownloadableFile[],
  zipName: string,
  onProgress?: (p: ZipProgress) => void,
): Promise<BulkResult> {
  if (files.length === 0) return { saved: 0, failed: [] };

  // Loaded lazily so the ~100KB library only reaches users who download in bulk.
  // jszip is CommonJS: under interop the constructor is `.default`, without it
  // the module object IS the constructor. Accept either rather than gamble on
  // the bundler — getting it wrong only surfaces when a user clicks download.
  const mod: any = await import('jszip');
  const JSZip = mod?.default ?? mod;
  const zip = new JSZip();
  const taken = new Set<string>();
  const failed: string[] = [];
  let saved = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.({ done: i, total: files.length });
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      zip.file(uniqueName(taken, safeFileName(f.name)), await res.blob());
      saved += 1;
    } catch {
      failed.push(f.name);
    }
  }

  if (saved === 0) return { saved: 0, failed };

  onProgress?.({ done: files.length, total: files.length, zipping: true });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${safeFileName(zipName)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a delay: revoking immediately can cancel the save in Safari.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);

  return { saved, failed };
}

/**
 * Save many files. Web gets a single .zip; native has no Blob/zip support, so
 * each URL is handed to the OS in turn.
 */
export async function downloadMany(
  files: DownloadableFile[],
  zipName: string,
  onProgress?: (p: ZipProgress) => void,
): Promise<BulkResult> {
  if (files.length === 0) return { saved: 0, failed: [] };
  if (files.length === 1) {
    await downloadOne(files[0]);
    return { saved: 1, failed: [] };
  }

  if (Platform.OS === 'web') return downloadZip(files, zipName, onProgress);

  const failed: string[] = [];
  let saved = 0;
  for (let i = 0; i < files.length; i++) {
    onProgress?.({ done: i, total: files.length });
    try { await downloadOne(files[i]); saved += 1; }
    catch { failed.push(files[i].name); }
  }
  return { saved, failed };
}
