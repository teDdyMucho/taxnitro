import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Modal, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useSheetStyles } from '../hooks/useSheetStyles';
import type { Profile } from '../db/profiles';
import {
  UPDATE_SERVICES, hasStatements, submitTeamOneUpdate,
  type UpdateService, type UpdateEntry, type PickedDoc,
} from '../db/teamOne';
import { DateField, isIsoDate } from './DateField';

// Team One's update for one client — Camaree:
//   Select Service: TAX, BK or CFO
//   Estimated Completion Date: (Select Date for each service selected)
//   If BK or CFO selected then: Query Sheet (a link), PNL (upload), Balance (upload)
//
// Only the services this client is assigned to Team One for are offered.
// Everything sent waits for FTG staff to review it.

const SERVICE_LABEL: Record<UpdateService, string> = { TAX: 'TAX', BK: 'Bookkeeping', CFO: 'CFO' };

interface Draft { date: string; link: string; pnl: PickedDoc | null; balance: PickedDoc | null }
const emptyDraft = (): Draft => ({ date: '', link: '', pnl: null, balance: null });

const today = () => new Date().toISOString().slice(0, 10);
const looksLikeLink = (v: string) => /^https?:\/\/\S+\.\S+/i.test(v.trim());

export function TeamOneUpdateModal({ visible, client, services, onClose, onSent }: {
  visible: boolean;
  client: Profile;
  /** What Team One is assigned for this client. */
  services: string[];
  onClose: () => void;
  onSent?: () => void;
}) {
  const { user } = useAuth();
  const sheet = useSheetStyles('md');
  const offered = UPDATE_SERVICES.filter(s => services.includes(s));
  const [picked, setPicked] = useState<UpdateService[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const reset = () => { setPicked([]); setDrafts({}); setBusy(false); setDone(false); setError(null); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const draftOf = (svc: UpdateService) => drafts[svc] ?? emptyDraft();
  const patch = (svc: UpdateService, p: Partial<Draft>) =>
    setDrafts(d => ({ ...d, [svc]: { ...draftOf(svc), ...p } }));
  const toggle = (svc: UpdateService) =>
    setPicked(prev => (prev.includes(svc) ? prev.filter(x => x !== svc) : [...prev, svc]));

  const pickFile = async (svc: UpdateService, which: 'pnl' | 'balance') => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.length) return;
    const a = r.assets[0];
    patch(svc, { [which]: { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' } });
  };

  // What still stops it being sent, if anything.
  const problem = (() => {
    if (picked.length === 0) return 'Pick at least one service.';
    for (const svc of picked) {
      const d = draftOf(svc);
      if (!isIsoDate(d.date)) return `Add the estimated completion date for ${SERVICE_LABEL[svc]}.`;
      if (d.link.trim() && !looksLikeLink(d.link)) return `The ${SERVICE_LABEL[svc]} query sheet link should start with https://`;
    }
    return null;
  })();

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    const entries: UpdateEntry[] = picked.map(svc => {
      const d = draftOf(svc);
      return hasStatements(svc)
        ? { service: svc, estCompletion: d.date, querySheetUrl: d.link, pnl: d.pnl, balance: d.balance }
        : { service: svc, estCompletion: d.date };
    });
    const res = await submitTeamOneUpdate(client.email, entries, user?.email ?? null);
    setBusy(false);
    if (res.ok) {
      setDone(true);
      onSent?.();
      setTimeout(() => { reset(); onClose(); }, 1300);
    } else {
      setError(`Could not send: ${res.failed.join(', ')}. Everything else went through.`);
      onSent?.();
    }
  };

  const fileRow = (svc: UpdateService, which: 'pnl' | 'balance', label: string) => {
    const doc = draftOf(svc)[which];
    return (
      <TouchableOpacity style={[t1.pick, doc && t1.pickOn]} onPress={() => pickFile(svc, which)} activeOpacity={0.85}>
        <Ionicons name={doc ? 'document-text' : 'cloud-upload-outline'} size={16} color={Colors.primaryDark} />
        <Text style={t1.pickText} numberOfLines={1}>{doc ? doc.name : `Upload ${label}`}</Text>
        {doc && (
          <TouchableOpacity onPress={() => patch(svc, { [which]: null })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[t1.overlay, sheet.overlay]} onPress={close}>
        <Pressable style={[t1.sheet, sheet.sheet]} onPress={() => {}}>
          <View style={t1.handle} />
          {done ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
              <View style={t1.doneCircle}><Ionicons name="checkmark" size={40} color="#16A34A" /></View>
              <Text style={t1.title}>Sent for review</Text>
              <Text style={t1.sub}>FTG staff will check it and let you know.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              <Text style={t1.title}>Add Update</Text>
              <Text style={t1.sub}>
                For {client.company_name || client.full_name || client.email}. Staff review everything you send.
              </Text>

              <Text style={t1.label}>Service</Text>
              {offered.length === 0 ? (
                <Text style={t1.note}>This client is not assigned to you for TAX, BK or CFO.</Text>
              ) : (
                <View style={t1.chips}>
                  {offered.map(svc => {
                    const on = picked.includes(svc);
                    return (
                      <TouchableOpacity key={svc} style={[t1.chip, on && t1.chipOn]} onPress={() => toggle(svc)} activeOpacity={0.8}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={16} color={on ? '#334155' : Colors.textMuted} />
                        <Text style={[t1.chipText, on && t1.chipTextOn]}>{SERVICE_LABEL[svc]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {offered.filter(svc => picked.includes(svc)).map(svc => {
                const d = draftOf(svc);
                return (
                  <View key={svc} style={t1.card}>
                    <Text style={t1.cardTitle}>{SERVICE_LABEL[svc]}</Text>
                    <Text style={t1.fieldLabel}>Estimated completion date</Text>
                    <DateField value={d.date} onChange={v => patch(svc, { date: v })} min={today()} />
                    {hasStatements(svc) && (
                      <>
                        <Text style={t1.fieldLabel}>Query Sheet (link)</Text>
                        <TextInput
                          style={t1.input}
                          value={d.link}
                          onChangeText={v => patch(svc, { link: v })}
                          placeholder="https://docs.google.com/…"
                          placeholderTextColor={Colors.textMuted}
                          autoCapitalize="none"
                          keyboardType="url"
                        />
                        <Text style={t1.fieldLabel}>P&L</Text>
                        {fileRow(svc, 'pnl', 'the P&L')}
                        <Text style={t1.fieldLabel}>Balance Sheet</Text>
                        {fileRow(svc, 'balance', 'the balance sheet')}
                      </>
                    )}
                  </View>
                );
              })}

              {(error || (picked.length > 0 && problem)) && (
                <Text style={t1.error}>{error ?? problem}</Text>
              )}

              <View style={t1.row}>
                <TouchableOpacity style={t1.cancelBtn} onPress={close} disabled={busy}>
                  <Text style={t1.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[t1.sendBtn, (!!problem || busy) && { opacity: 0.5 }]}
                  onPress={submit}
                  disabled={!!problem || busy}
                >
                  {busy ? <ActivityIndicator color="#3A3131" size="small" /> : <Text style={t1.sendText}>Send for Review</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const t1 = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 28, maxHeight: '90%' },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  note: { color: Colors.textMuted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 14,
    borderRadius: 10, backgroundColor: Colors.bgMid, borderWidth: 1, borderColor: Colors.border,
  },
  chipOn: { backgroundColor: '#EEF2F7', borderColor: '#64748B' },
  chipText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: Colors.textPrimary, fontWeight: '700' },
  card: { borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, padding: 14, gap: 6, marginTop: 4 },
  cardTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  fieldLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 6 },
  input: {
    backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: Colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: Colors.border,
  },
  pick: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(181,144,91,0.6)', backgroundColor: Colors.bgMid,
  },
  pickOn: { borderStyle: 'solid', borderColor: 'rgba(232,185,35,0.5)', backgroundColor: 'rgba(232,185,35,0.08)' },
  pickText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  error: { color: Colors.error, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  sendBtn: { flex: 2, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
  doneCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
});
