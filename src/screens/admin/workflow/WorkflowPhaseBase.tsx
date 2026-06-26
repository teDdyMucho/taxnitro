/**
 * Shared base component for all 4 workflow phase screens.
 * Renders: header (with back + phase badge), checklist, notes field per item,
 * query sheet items panel, messages panel, and a submit button.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../context/AuthContext';
import {
  WorkflowInstance, WorkflowPhase, ChecklistItem,
  WorkflowNote, QueryItem, WorkflowMessage,
  getChecklist, upsertChecklistItem,
  getWorkflowNotes, addWorkflowNote, resolveWorkflowNote,
  getQueryItems, addQueryItem, resolveQueryItem,
  getWorkflowMessages, sendWorkflowMessage,
  STATUS_LABEL, STATUS_COLOR, formatMonth, NEXT_STATUS,
} from '../../../db/workflow';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhaseItem {
  key: string;
  label: string;
  requires: 'has_loans' | 'has_fixed_assets' | null;
}

interface Props {
  workflow: WorkflowInstance;
  phase: WorkflowPhase;
  phaseLabel: string;
  items: readonly PhaseItem[];
  /** Extra content rendered between checklist and submit button */
  extraContent?: React.ReactNode;
  /** Called after checklist is 100% and user taps Submit */
  onAdvance: () => Promise<void>;
  onBack: () => void;
  /** If true, show reviewer notes panel (Phase C) */
  showNotes?: boolean;
  /** If true, show "Add Note" (Phase B) */
  canAddNotes?: boolean;
  /** If true, show GDrive/SmartVault link fields */
  showDriveLinks?: boolean;
  submitLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkflowPhaseBase({
  workflow, phase, phaseLabel, items, extraContent,
  onAdvance, onBack, showNotes, canAddNotes, submitLabel = 'Submit to Next Phase',
}: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [notes, setNotes] = useState<WorkflowNote[]>([]);
  const [queryItems, setQueryItems] = useState<QueryItem[]>([]);
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  // Item note editing
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});

  // Add note modal (Reviewer)
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Add query item modal
  const [showAddQuery, setShowAddQuery] = useState(false);
  const [queryDesc, setQueryDesc] = useState('');
  const [queryAmount, setQueryAmount] = useState('');
  const [queryDate, setQueryDate] = useState('');
  const [queryNeedsClient, setQueryNeedsClient] = useState(false);
  const [savingQuery, setSavingQuery] = useState(false);

  // Message panel
  const [showMessages, setShowMessages] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Resolve note modal (Reprocessor)
  const [resolveTarget, setResolveTarget] = useState<WorkflowNote | null>(null);
  const [resolveText, setResolveText] = useState('');
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cl, no, qi, ms] = await Promise.all([
      getChecklist(workflow.id, phase),
      getWorkflowNotes(workflow.id),
      getQueryItems(workflow.id),
      getWorkflowMessages(workflow.id),
    ]);
    setChecklist(cl);
    setNotes(no);
    setQueryItems(qi);
    setMessages(ms);
    const noteMap: Record<string, string> = {};
    for (const c of cl) if (c.notes) noteMap[c.item_key] = c.notes;
    setItemNotes(noteMap);
    setLoading(false);
  }, [workflow.id, phase]);

  useEffect(() => { load(); }, [load]);

  // Applicable items (filter out loan/fixed-asset items based on workflow settings)
  const applicableItems = items.filter(i => {
    if (i.requires === 'has_loans'       && !workflow.has_loans)        return false;
    if (i.requires === 'has_fixed_assets' && !workflow.has_fixed_assets) return false;
    return true;
  });

  const checkedMap = new Map(checklist.map(c => [c.item_key, c.is_checked]));
  const allChecked = applicableItems.every(i => checkedMap.get(i.key) === true);

  // For Phase C: all notes resolved
  const allNotesResolved = notes.every(n => n.is_resolved);
  const canSubmit = phase === 'C' ? (allChecked && allNotesResolved) : allChecked;

  const toggleItem = async (itemKey: string, current: boolean) => {
    if (!user) return;
    setSaving(itemKey);
    const next = !current;
    // Optimistic update
    setChecklist(prev => prev.some(c => c.item_key === itemKey)
      ? prev.map(c => c.item_key === itemKey ? { ...c, is_checked: next } : c)
      : [...prev, { id: '', workflow_id: workflow.id, phase, item_key: itemKey, is_checked: next, notes: null, checked_by: user.id, checked_at: new Date().toISOString() }]
    );
    await upsertChecklistItem({ workflow_id: workflow.id, phase, item_key: itemKey, is_checked: next, notes: itemNotes[itemKey], checked_by: user.id });
    setSaving(null);
  };

  const saveItemNote = async (itemKey: string) => {
    if (!user) return;
    await upsertChecklistItem({ workflow_id: workflow.id, phase, item_key: itemKey, is_checked: checkedMap.get(itemKey) ?? false, notes: itemNotes[itemKey], checked_by: user.id });
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !user) return;
    setSavingNote(true);
    await addWorkflowNote({ workflow_id: workflow.id, note_text: newNote.trim(), created_by: user.id });
    setNewNote(''); setShowAddNote(false); setSavingNote(false);
    load();
  };

  const handleResolve = async () => {
    if (!resolveTarget || !user) return;
    setResolving(true);
    await resolveWorkflowNote(resolveTarget.id, user.id, resolveText.trim());
    setResolveTarget(null); setResolveText(''); setResolving(false);
    load();
  };

  const handleAddQuery = async () => {
    if (!queryDesc.trim() || !user) return;
    setSavingQuery(true);
    await addQueryItem({ workflow_id: workflow.id, description: queryDesc.trim(), amount: queryAmount ? Number(queryAmount) : null, transaction_date: queryDate || null, flagged_by: user.id, needs_client: queryNeedsClient, phase_added: phase });
    setQueryDesc(''); setQueryAmount(''); setQueryDate(''); setQueryNeedsClient(false);
    setShowAddQuery(false); setSavingQuery(false);
    load();
  };

  const handleSendMsg = async () => {
    if (!msgText.trim() || !user) return;
    setSendingMsg(true);
    await sendWorkflowMessage({ workflow_id: workflow.id, sender_id: user.id, sender_name: user.name ?? user.email, message: msgText.trim() });
    setMsgText(''); setSendingMsg(false);
    const ms = await getWorkflowMessages(workflow.id);
    setMessages(ms);
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    await onAdvance();
    setAdvancing(false);
  };

  const color = STATUS_COLOR[workflow.status];

  if (loading) return <View style={p.loader}><ActivityIndicator color="#E8B923" size="large" /></View>;

  return (
    <KeyboardAvoidingView style={[p.root, { paddingTop: Platform.OS === 'web' ? 0 : insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── Header ── */}
      <LinearGradient colors={['#3A3131', '#4A3E3E']} style={p.header}>
        <TouchableOpacity style={p.backBtn} onPress={onBack} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={p.headerTitle} numberOfLines={1}>{workflow.client_name}</Text>
          <Text style={p.headerSub}>{formatMonth(workflow.month)} · {workflow.accounting_software}</Text>
        </View>
        <View style={[p.phaseBadge, { backgroundColor: color + '20', borderColor: color }]}>
          <Text style={[p.phaseText, { color }]}>Phase {phase} — {phaseLabel}</Text>
        </View>
        {/* Message button */}
        <TouchableOpacity style={p.msgBtn} onPress={() => setShowMessages(true)} activeOpacity={0.75}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="rgba(255,255,255,0.75)" />
          {messages.filter(m => !m.is_read && m.sender_id !== user?.id).length > 0 && (
            <View style={p.msgDot} />
          )}
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Progress indicator ── */}
      <View style={p.progressRow}>
        {(['A','B','C','D'] as WorkflowPhase[]).map((ph, idx) => (
          <View key={ph} style={[p.progressStep, ph === phase ? { backgroundColor: color } : (idx < ['A','B','C','D'].indexOf(phase) ? { backgroundColor: '#10B981' } : {})]}>
            <Text style={[p.progressStepText, ph === phase && { color: '#1C1713' }]}>{ph}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 100 }}>

        {/* ── Checklist ── */}
        <View style={p.section}>
          <View style={p.sectionHeader}>
            <Text style={p.sectionTitle}>CHECKLIST</Text>
            <Text style={p.sectionCount}>{applicableItems.filter(i => checkedMap.get(i.key)).length} / {applicableItems.length}</Text>
          </View>
          {applicableItems.map((item, idx) => {
            const checked = checkedMap.get(item.key) ?? false;
            const isSaving = saving === item.key;
            return (
              <View key={item.key} style={[p.checkItem, idx === applicableItems.length - 1 && { borderBottomWidth: 0 }]}>
                <TouchableOpacity style={p.checkRow} onPress={() => toggleItem(item.key, checked)} activeOpacity={0.8} disabled={isSaving}>
                  <View style={[p.checkBox, checked && p.checkBoxOn]}>
                    {isSaving ? <ActivityIndicator size="small" color="#fff" /> : checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                  <Text style={[p.checkLabel, checked && p.checkLabelDone]}>{item.label}</Text>
                </TouchableOpacity>
                {/* Notes per item */}
                <View style={p.itemNoteRow}>
                  <TextInput
                    style={[p.itemNoteInput, { outlineWidth: 0 } as any]}
                    placeholder="Add note (optional)..."
                    placeholderTextColor="#94A3B8"
                    value={itemNotes[item.key] ?? ''}
                    onChangeText={v => setItemNotes(prev => ({ ...prev, [item.key]: v }))}
                    onBlur={() => saveItemNote(item.key)}
                    multiline
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Reviewer Notes (Phase B: add, Phase C: resolve) ── */}
        {(showNotes || canAddNotes) && (
          <View style={p.section}>
            <View style={p.sectionHeader}>
              <Text style={p.sectionTitle}>REVIEWER NOTES</Text>
              {canAddNotes && (
                <TouchableOpacity style={p.addNoteBtn} onPress={() => setShowAddNote(true)} activeOpacity={0.82}>
                  <Ionicons name="add" size={14} color="#FFFFFF" />
                  <Text style={p.addNoteBtnText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
            {notes.length === 0 ? (
              <Text style={p.emptyNotes}>No notes yet.</Text>
            ) : notes.map(note => (
              <View key={note.id} style={[p.noteCard, note.is_resolved && p.noteCardResolved]}>
                <View style={p.noteTop}>
                  <Text style={p.noteText}>{note.note_text}</Text>
                  {note.is_resolved
                    ? <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    : showNotes && (
                      <TouchableOpacity onPress={() => { setResolveTarget(note); setResolveText(''); }} activeOpacity={0.8}>
                        <View style={p.resolveBtn}><Text style={p.resolveBtnText}>Resolve</Text></View>
                      </TouchableOpacity>
                    )}
                </View>
                {note.is_resolved && note.resolution_text && (
                  <Text style={p.resolutionText}>✓ {note.resolution_text}</Text>
                )}
                <Text style={p.noteMeta}>By {note.creator_name} · {new Date(note.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Query Sheet Items ── */}
        <View style={p.section}>
          <View style={p.sectionHeader}>
            <Text style={p.sectionTitle}>QUERY SHEET</Text>
            <TouchableOpacity style={p.addNoteBtn} onPress={() => setShowAddQuery(true)} activeOpacity={0.82}>
              <Ionicons name="add" size={14} color="#FFFFFF" />
              <Text style={p.addNoteBtnText}>Flag Item</Text>
            </TouchableOpacity>
          </View>
          {queryItems.length === 0 ? (
            <Text style={p.emptyNotes}>No flagged items.</Text>
          ) : queryItems.map(qi => (
            <View key={qi.id} style={[p.noteCard, qi.is_resolved && p.noteCardResolved]}>
              <View style={p.noteTop}>
                <View style={{ flex: 1 }}>
                  <Text style={p.noteText}>{qi.description}</Text>
                  {qi.amount != null && <Text style={p.noteMeta}>Amount: ${qi.amount.toFixed(2)}</Text>}
                  {qi.transaction_date && <Text style={p.noteMeta}>Date: {qi.transaction_date}</Text>}
                  {qi.needs_client && <View style={p.clientTag}><Text style={p.clientTagText}>Needs Client Input</Text></View>}
                </View>
                {!qi.is_resolved && (
                  <TouchableOpacity onPress={() => user && resolveQueryItem(qi.id, user.id).then(load)} activeOpacity={0.8}>
                    <View style={p.resolveBtn}><Text style={p.resolveBtnText}>Resolve</Text></View>
                  </TouchableOpacity>
                )}
                {qi.is_resolved && <Ionicons name="checkmark-circle" size={18} color="#10B981" />}
              </View>
              <Text style={p.noteMeta}>Flagged by {qi.flagged_by_name} · Phase {qi.phase_added}</Text>
            </View>
          ))}
        </View>

        {/* ── Extra content (e.g. drive links) ── */}
        {extraContent}

      </ScrollView>

      {/* ── Submit button ── */}
      <View style={[p.submitBar, { paddingBottom: insets.bottom + 12 }]}>
        {!canSubmit && (
          <Text style={p.submitHint}>
            {phase === 'C' && !allNotesResolved ? 'Resolve all reviewer notes first.' : `Complete all ${applicableItems.length} checklist items to proceed.`}
          </Text>
        )}
        <TouchableOpacity
          style={[p.submitBtn, !canSubmit && p.submitBtnOff]}
          onPress={handleAdvance}
          disabled={!canSubmit || advancing}
          activeOpacity={0.82}
        >
          {advancing ? <ActivityIndicator size="small" color="#1C1713" /> : (
            <><Ionicons name="arrow-forward-circle-outline" size={20} color={canSubmit ? '#1C1713' : '#94A3B8'} />
            <Text style={[p.submitBtnText, !canSubmit && { color: '#94A3B8' }]}>{submitLabel}</Text></>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Add Reviewer Note modal ── */}
      <Modal visible={showAddNote} transparent animationType="fade" onRequestClose={() => setShowAddNote(false)}>
        <View style={p.modalOverlay}>
          <View style={p.modalCard}>
            <Text style={p.modalTitle}>Add Reviewer Note</Text>
            <TextInput style={[p.modalInput, { outlineWidth: 0 } as any]} placeholder="Describe the issue or correction needed..." placeholderTextColor="#94A3B8" value={newNote} onChangeText={setNewNote} multiline numberOfLines={4} textAlignVertical="top" autoFocus />
            <View style={p.modalBtns}>
              <TouchableOpacity style={p.modalCancel} onPress={() => setShowAddNote(false)}><Text style={p.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[p.modalConfirm, (!newNote.trim() || savingNote) && { opacity: 0.5 }]} onPress={handleAddNote} disabled={!newNote.trim() || savingNote}>
                {savingNote ? <ActivityIndicator size="small" color="#1C1713" /> : <Text style={p.modalConfirmText}>Add Note</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Resolve Note modal ── */}
      <Modal visible={!!resolveTarget} transparent animationType="fade" onRequestClose={() => setResolveTarget(null)}>
        <View style={p.modalOverlay}>
          <View style={p.modalCard}>
            <Text style={p.modalTitle}>Resolve Note</Text>
            <Text style={p.resolveNoteText}>{resolveTarget?.note_text}</Text>
            <TextInput style={[p.modalInput, { outlineWidth: 0 } as any]} placeholder="Describe how this was resolved..." placeholderTextColor="#94A3B8" value={resolveText} onChangeText={setResolveText} multiline numberOfLines={3} textAlignVertical="top" />
            <View style={p.modalBtns}>
              <TouchableOpacity style={p.modalCancel} onPress={() => setResolveTarget(null)}><Text style={p.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[p.modalConfirm, resolving && { opacity: 0.5 }]} onPress={handleResolve} disabled={resolving}>
                {resolving ? <ActivityIndicator size="small" color="#1C1713" /> : <Text style={p.modalConfirmText}>Mark Resolved</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Query Item modal ── */}
      <Modal visible={showAddQuery} transparent animationType="fade" onRequestClose={() => setShowAddQuery(false)}>
        <View style={p.modalOverlay}>
          <View style={p.modalCard}>
            <Text style={p.modalTitle}>Flag Query Item</Text>
            <TextInput style={[p.modalInput, { outlineWidth: 0 } as any]} placeholder="Description of the transaction or issue..." placeholderTextColor="#94A3B8" value={queryDesc} onChangeText={setQueryDesc} multiline numberOfLines={3} textAlignVertical="top" />
            <TextInput style={[p.modalInputSm, { outlineWidth: 0 } as any]} placeholder="Amount (optional)" placeholderTextColor="#94A3B8" value={queryAmount} onChangeText={setQueryAmount} keyboardType="decimal-pad" />
            <TextInput style={[p.modalInputSm, { outlineWidth: 0 } as any]} placeholder="Date YYYY-MM-DD (optional)" placeholderTextColor="#94A3B8" value={queryDate} onChangeText={setQueryDate} />
            <TouchableOpacity style={p.toggle} onPress={() => setQueryNeedsClient(!queryNeedsClient)} activeOpacity={0.8}>
              <View style={[p.toggleBox, queryNeedsClient && p.toggleBoxOn]}>{queryNeedsClient && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
              <Text style={p.toggleLabel}>Needs client input</Text>
            </TouchableOpacity>
            <View style={p.modalBtns}>
              <TouchableOpacity style={p.modalCancel} onPress={() => setShowAddQuery(false)}><Text style={p.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[p.modalConfirm, (!queryDesc.trim() || savingQuery) && { opacity: 0.5 }]} onPress={handleAddQuery} disabled={!queryDesc.trim() || savingQuery}>
                {savingQuery ? <ActivityIndicator size="small" color="#1C1713" /> : <Text style={p.modalConfirmText}>Add Item</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Messages panel ── */}
      <Modal visible={showMessages} animationType="slide" transparent onRequestClose={() => setShowMessages(false)}>
        <View style={p.msgOverlay}>
          <View style={p.msgPanel}>
            <View style={p.msgPanelHeader}>
              <Text style={p.msgPanelTitle}>Team Messages</Text>
              <TouchableOpacity onPress={() => setShowMessages(false)}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
            </View>
            <FlatList
              data={messages}
              keyExtractor={m => m.id}
              contentContainerStyle={{ padding: 12, gap: 8 }}
              renderItem={({ item }) => {
                const isOwn = item.sender_id === user?.id;
                return (
                  <View style={[p.msgBubble, isOwn && p.msgBubbleOwn]}>
                    {!isOwn && <Text style={p.msgSender}>{item.sender_name}</Text>}
                    <Text style={[p.msgText, isOwn && p.msgTextOwn]}>{item.message}</Text>
                    <Text style={[p.msgTime, isOwn && p.msgTimeOwn]}>{new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={p.emptyNotes}>No messages yet.</Text>}
            />
            <View style={p.msgInputRow}>
              <TextInput style={[p.msgInput, { outlineWidth: 0 } as any]} placeholder="Message team..." placeholderTextColor="#94A3B8" value={msgText} onChangeText={setMsgText} />
              <TouchableOpacity style={[p.msgSendBtn, (!msgText.trim() || sendingMsg) && { opacity: 0.5 }]} onPress={handleSendMsg} disabled={!msgText.trim() || sendingMsg} activeOpacity={0.82}>
                {sendingMsg ? <ActivityIndicator size="small" color="#1C1713" /> : <Ionicons name="send" size={16} color="#1C1713" />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

export const p = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F8FAFC' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, gap: 10 },
  backBtn:     { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 },
  phaseBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  phaseText:   { fontSize: 10, fontWeight: '800' },
  msgBtn:      { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  msgDot:      { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

  progressRow:  { flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  progressStep: { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' },
  progressStepText: { color: '#94A3B8', fontSize: 12, fontWeight: '800' },

  section:       { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sectionTitle:  { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  sectionCount:  { color: '#374151', fontSize: 12, fontWeight: '700' },
  addNoteBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3A3131', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  addNoteBtnText:{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  checkItem:   { borderBottomWidth: 1, borderBottomColor: '#F8FAFC', paddingHorizontal: 14, paddingTop: 12 },
  checkRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 4 },
  checkBox:    { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  checkBoxOn:  { backgroundColor: '#10B981', borderColor: '#10B981' },
  checkLabel:  { flex: 1, color: '#111827', fontSize: 13, lineHeight: 20 },
  checkLabelDone: { color: '#94A3B8', textDecorationLine: 'line-through' },
  itemNoteRow:   { paddingBottom: 10, paddingLeft: 34 },
  itemNoteInput: { color: '#374151', fontSize: 12, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#E5E7EB', minHeight: 32 },

  noteCard:         { marginHorizontal: 14, marginVertical: 6, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', gap: 4 },
  noteCardResolved: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  noteTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noteText:     { flex: 1, color: '#111827', fontSize: 13, lineHeight: 18 },
  noteMeta:     { color: '#94A3B8', fontSize: 11 },
  resolutionText: { color: '#10B981', fontSize: 12, fontStyle: 'italic' },
  resolveBtn:   { backgroundColor: '#E8B923', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  resolveBtnText: { color: '#1C1713', fontSize: 11, fontWeight: '700' },
  resolveNoteText: { color: '#374151', fontSize: 13, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 8 },
  clientTag:    { flexDirection: 'row', alignItems: 'center', marginTop: 4, backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  clientTagText:{ color: '#4338CA', fontSize: 10, fontWeight: '700' },
  emptyNotes:   { color: '#94A3B8', fontSize: 12, padding: 14, textAlign: 'center' },

  submitBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 16, paddingTop: 12, gap: 6 },
  submitHint:    { color: '#94A3B8', fontSize: 12, textAlign: 'center' },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14 },
  submitBtnOff:  { backgroundColor: '#F1F5F9' },
  submitBtnText: { color: '#1C1713', fontSize: 15, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalCard:    { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, width: 340, gap: 12 },
  modalTitle:   { color: '#111827', fontSize: 16, fontWeight: '800' },
  modalInput:   { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, color: '#111827', fontSize: 13, minHeight: 80 },
  modalInputSm: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, color: '#111827', fontSize: 13 },
  modalBtns:    { flexDirection: 'row', gap: 10 },
  modalCancel:  { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  modalConfirm: { flex: 1, backgroundColor: '#E8B923', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modalConfirmText: { color: '#1C1713', fontWeight: '800', fontSize: 14 },

  toggle:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  toggleBoxOn: { backgroundColor: '#E8B923', borderColor: '#E8B923' },
  toggleLabel: { color: '#374151', fontSize: 13 },

  msgOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  msgPanel:       { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' },
  msgPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  msgPanelTitle:  { color: '#111827', fontSize: 16, fontWeight: '800' },
  msgBubble:      { backgroundColor: '#F1F5F9', borderRadius: 14, padding: 10, alignSelf: 'flex-start', maxWidth: '80%', gap: 2 },
  msgBubbleOwn:   { backgroundColor: '#E8B923', alignSelf: 'flex-end' },
  msgSender:      { color: '#6B7280', fontSize: 10, fontWeight: '700' },
  msgText:        { color: '#111827', fontSize: 13, lineHeight: 18 },
  msgTextOwn:     { color: '#1C1713' },
  msgTime:        { color: '#94A3B8', fontSize: 10, alignSelf: 'flex-end' },
  msgTimeOwn:     { color: 'rgba(28,23,19,0.55)' },
  msgInputRow:    { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  msgInput:       { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 22, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 10, color: '#111827', fontSize: 13 },
  msgSendBtn:     { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E8B923', alignItems: 'center', justifyContent: 'center' },
});
