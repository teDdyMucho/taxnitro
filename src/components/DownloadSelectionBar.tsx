/**
 * Marking files for download, shared by every document list in the app.
 *
 * `useDownloadSelection` owns the selection and the bulk download; this file
 * also exports the bar that sits above a list while marking is on, and the
 * round checkbox a row shows in its place.
 *
 * Keeping all of it here is what makes marking behave identically for a client
 * browsing their own folder and for staff working a client's documents.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { DownloadableFile, downloadMany, downloadOne, ZipProgress } from '../lib/download';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDownloadSelection<T extends { id: string }>(
  toFile: (item: T) => DownloadableFile,
) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [busy, setBusy]           = useState(false);
  const [progress, setProgress]   = useState<ZipProgress | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const exitSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); }, []);

  const startSelect = useCallback(() => setSelecting(true), []);

  const selectAll = useCallback((items: T[]) => {
    setSelected(new Set(items.map(i => i.id)));
  }, []);

  /** Download an explicit list — a whole folder, or the marked rows. */
  const download = useCallback(async (items: T[], zipName: string) => {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: items.length });
    try {
      const result = await downloadMany(items.map(toFile), zipName, setProgress);
      if (result.failed.length > 0) {
        setNotice(`${result.saved} downloaded · ${result.failed.length} could not be fetched`);
      } else if (Platform.OS === 'web' && items.length > 1) {
        setNotice(`${result.saved} files saved as ${zipName}.zip`);
      }
    } catch {
      setNotice('Download failed. Check your connection and try again.');
    } finally {
      setBusy(false);
      setProgress(null);
      setTimeout(() => setNotice(null), 4000);
    }
  }, [busy, toFile]);

  const downloadSelected = useCallback(async (items: T[], zipName: string) => {
    const picked = items.filter(i => selected.has(i.id));
    await download(picked, zipName);
    exitSelect();
  }, [selected, download, exitSelect]);

  const downloadSingle = useCallback(async (item: T) => {
    if (busy) return;
    setBusy(true);
    try { await downloadOne(toFile(item)); }
    catch { setNotice('Download failed.'); setTimeout(() => setNotice(null), 4000); }
    finally { setBusy(false); }
  }, [busy, toFile]);

  return {
    selecting, selected, busy, progress, notice,
    startSelect, exitSelect, toggle, clear, selectAll,
    download, downloadSelected, downloadSingle,
    setNotice,
  };
}

export type DownloadSelection<T extends { id: string }> = ReturnType<typeof useDownloadSelection<T>>;

// ── Row checkbox ─────────────────────────────────────────────────────────────

export function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <View style={[s.box, checked && s.boxOn]}>
      {checked && <Ionicons name="checkmark" size={13} color="#3A3131" />}
    </View>
  );
}

// ── Bar ──────────────────────────────────────────────────────────────────────

export function DownloadSelectionBar({
  selection,
  items,
  zipName,
  label = 'files',
  allowSelect = true,
  onMoveSelected,
  onDeleteSelected,
}: {
  selection: DownloadSelection<any>;
  /** Everything currently listed — what "Select all" and folder download cover. */
  items: any[];
  /** Base name of the archive, without the .zip. */
  zipName: string;
  label?: string;
  /** Off where the rows aren't files — a folder list has nothing to tick. */
  allowSelect?: boolean;
  /**
   * What else can be done to a marked set, where the caller can do it.
   *
   * Belly Jane, on the files sitting outside any subfolder: "pano itong walang
   * folder pano ko nalang edelete or ipasok sa newsubfolder para malipat ko?"
   * One at a time is the answer without these.
   */
  onMoveSelected?: (ids: string[]) => void;
  onDeleteSelected?: (ids: string[]) => void;
}) {
  const { selecting, selected, busy, progress } = selection;
  const count    = selected.size;
  const allOn    = items.length > 0 && count === items.length;
  const progText = useMemo(() => {
    if (!progress) return null;
    return progress.zipping
      ? 'Building archive…'
      : `Preparing ${progress.done} of ${progress.total}…`;
  }, [progress]);

  // ── Idle: entry points ──
  if (!selecting) {
    return (
      <View style={s.bar}>
        <TouchableOpacity
          style={[s.ghostBtn, (busy || items.length === 0) && s.disabled]}
          onPress={() => selection.download(items, zipName)}
          disabled={busy || items.length === 0}
          activeOpacity={0.8}
        >
          {busy
            ? <ActivityIndicator size="small" color="#B5905B" />
            : <Ionicons name="download-outline" size={15} color="#B5905B" />}
          <Text style={s.ghostText} numberOfLines={1}>
            {progText ?? `Download all${items.length ? ` (${items.length})` : ''}`}
          </Text>
        </TouchableOpacity>

        {allowSelect && (
          <TouchableOpacity
            style={[s.ghostBtn, (busy || items.length === 0) && s.disabled]}
            onPress={selection.startSelect}
            disabled={busy || items.length === 0}
            activeOpacity={0.8}
          >
            <Ionicons name="checkbox-outline" size={15} color="#B5905B" />
            <Text style={s.ghostText}>Select</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Marking ──
  return (
    <View style={[s.bar, s.barActive]}>
      <TouchableOpacity
        style={s.linkBtn}
        onPress={() => (allOn ? selection.clear() : selection.selectAll(items))}
        disabled={busy}
        activeOpacity={0.7}
      >
        <SelectCheckbox checked={allOn} />
        <Text style={s.linkText}>{allOn ? 'None' : 'All'}</Text>
      </TouchableOpacity>

      <Text style={s.countText} numberOfLines={1}>
        {progText ?? `${count} of ${items.length} ${label} marked`}
      </Text>

      <TouchableOpacity style={s.linkBtn} onPress={selection.exitSelect} disabled={busy} activeOpacity={0.7}>
        <Text style={s.cancelText}>Cancel</Text>
      </TouchableOpacity>

      {onMoveSelected && (
        <TouchableOpacity
          style={[s.ghostBtn, (count === 0 || busy) && s.disabled]}
          onPress={() => onMoveSelected([...selected])}
          disabled={count === 0 || busy}
          activeOpacity={0.8}
        >
          <Ionicons name="folder-outline" size={15} color="#B5905B" />
          <Text style={s.ghostText}>Move</Text>
        </TouchableOpacity>
      )}

      {onDeleteSelected && (
        <TouchableOpacity
          style={[s.ghostBtn, (count === 0 || busy) && s.disabled]}
          onPress={() => onDeleteSelected([...selected])}
          disabled={count === 0 || busy}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={15} color="#EF4444" />
          <Text style={[s.ghostText, { color: '#EF4444' }]}>Delete</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[s.primaryBtn, (count === 0 || busy) && s.disabled]}
        onPress={() => selection.downloadSelected(items, zipName)}
        disabled={count === 0 || busy}
        activeOpacity={0.85}
      >
        {busy
          ? <ActivityIndicator size="small" color="#3A3131" />
          : <Ionicons name="download-outline" size={15} color="#3A3131" />}
        <Text style={s.primaryText}>{busy ? '' : `Download${count ? ` ${count}` : ''}`}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Small toast for the outcome of a download. */
export function DownloadNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.notice}>
      <Ionicons name="information-circle-outline" size={15} color={Colors.white} />
      <Text style={s.noticeText}>{message}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 10,
  },
  barActive: {
    backgroundColor: 'rgba(232,185,35,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.4)',
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.bgMid,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ghostText: { color: '#B5905B', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },

  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkText: { color: '#B5905B', fontSize: 12, fontWeight: '700' },
  cancelText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  countText: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#E8B923',
  },
  primaryText: { color: '#3A3131', fontSize: 12, fontWeight: '800' },

  box: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  boxOn: { backgroundColor: '#E8B923', borderColor: '#E8B923' },

  notice: {
    position: 'absolute' as any,
    bottom: 24, left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: '#3A3131', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    zIndex: 999,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  noticeText: { flex: 1, color: Colors.white, fontSize: 12.5, fontWeight: '600' },
});
