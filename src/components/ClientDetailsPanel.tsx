import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import {
  listClientNotes, createClientNote, updateClientNote, deleteClientNote, ClientNote,
} from '../db/clientNotes';

// Business details — what the team knows about this client's business, written
// down as it is learned so whoever opens their files next has the same picture.
//
// Internal to staff and admin. It sits above the folders because that is where
// the context is needed: while looking at their files.

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ConfirmDelete({ visible, onConfirm, onCancel }: {
  visible: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.confirm}>
          <View style={s.confirmIcon}>
            <Ionicons name="trash-outline" size={26} color={Colors.error} />
          </View>
          <Text style={s.confirmTitle}>Delete this note?</Text>
          <Text style={s.confirmSub}>
            It will be gone for everyone on the team. This cannot be undone.
          </Text>
          <View style={s.confirmRow}>
            <TouchableOpacity style={s.confirmNo} onPress={onCancel} activeOpacity={0.85}>
              <Text style={s.confirmNoText}>No, keep it</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmYes} onPress={onConfirm} activeOpacity={0.85}>
              <Text style={s.confirmYesText}>Yes, delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ClientDetailsPanel({ clientEmail, clientName }: {
  clientEmail: string;
  clientName?: string;
}) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<ClientNote[] | null>(null);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    listClientNotes(clientEmail).then(setNotes);
  }, [clientEmail]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const row = await createClientNote(clientEmail, draft, {
      email: user?.email, name: user?.name,
    });
    setBusy(false);
    if (!row) return;                        // the db module already logged why
    setNotes(n => [row, ...(n ?? [])]);
    setDraft('');
    setAdding(false);
  };

  const saveEdit = async (id: string) => {
    if (!editDraft.trim() || busy) return;
    setBusy(true);
    const row = await updateClientNote(id, editDraft);
    setBusy(false);
    if (!row) return;
    setNotes(n => (n ?? []).map(x => (x.id === id ? row : x)));
    setEditingId(null);
  };

  const remove = async (id: string) => {
    setConfirmId(null);
    const ok = await deleteClientNote(id);
    if (ok) setNotes(n => (n ?? []).filter(x => x.id !== id));
  };

  const count = notes?.length ?? 0;

  return (
    <View style={s.panel}>
      <TouchableOpacity style={s.head} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <View style={s.headIcon}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primaryDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headTitle}>Business details</Text>
          <Text style={s.headSub} numberOfLines={1}>
            {count === 0
              ? 'What the team knows about this business'
              : `${count} note${count === 1 ? '' : 's'} · internal, the client never sees these`}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={s.body}>
          {notes == null ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 14 }} />
          ) : (
            <>
              {adding ? (
                <View style={s.editor}>
                  <TextInput
                    style={s.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={`Something worth knowing about ${clientName?.split(' ')[0] || 'this client'}'s business…`}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    autoFocus
                  />
                  <View style={s.editorRow}>
                    <TouchableOpacity
                      style={s.cancel}
                      onPress={() => { setAdding(false); setDraft(''); }}
                      activeOpacity={0.85}
                    >
                      <Text style={s.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.save, !draft.trim() && s.saveOff]}
                      onPress={add}
                      disabled={!draft.trim() || busy}
                      activeOpacity={0.85}
                    >
                      {busy
                        ? <ActivityIndicator color="#3A3131" size="small" />
                        : <Text style={s.saveText}>Add note</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)} activeOpacity={0.85}>
                  <Ionicons name="add" size={16} color={Colors.primaryDeep} />
                  <Text style={s.addText}>Add a detail</Text>
                </TouchableOpacity>
              )}

              {count === 0 && !adding && (
                <Text style={s.empty}>
                  Nothing written down yet. Anything the team learns about how this
                  business runs goes here, so the next person does not have to ask again.
                </Text>
              )}

              {(notes ?? []).map(note => (
                <View key={note.id} style={s.note}>
                  {editingId === note.id ? (
                    <>
                      <TextInput
                        style={s.input}
                        value={editDraft}
                        onChangeText={setEditDraft}
                        multiline
                        autoFocus
                      />
                      <View style={s.editorRow}>
                        <TouchableOpacity style={s.cancel} onPress={() => setEditingId(null)} activeOpacity={0.85}>
                          <Text style={s.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.save, !editDraft.trim() && s.saveOff]}
                          onPress={() => saveEdit(note.id)}
                          disabled={!editDraft.trim() || busy}
                          activeOpacity={0.85}
                        >
                          <Text style={s.saveText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={s.noteBody}>{note.body}</Text>
                      <View style={s.noteFoot}>
                        <Text style={s.noteMeta} numberOfLines={1}>
                          {note.author_name || note.author_email || 'Someone'} · {whenLabel(note.created_at)}
                          {note.updated_at !== note.created_at ? ' · edited' : ''}
                        </Text>
                        <TouchableOpacity
                          onPress={() => { setEditingId(note.id); setEditDraft(note.body); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setConfirmId(note.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={15} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </>
          )}
        </View>
      )}

      <ConfirmDelete
        visible={confirmId != null}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => confirmId && remove(confirmId)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, overflow: 'hidden', marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  headIcon: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: '#FDF8EC',
    alignItems: 'center', justifyContent: 'center',
  },
  headTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  headSub: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 10,
  },
  addText: { color: Colors.primaryDeep, fontSize: 13, fontWeight: '800' },

  editor: { gap: 10 },
  input: {
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgDeep,
    borderRadius: 12, padding: 12, fontSize: 13, color: Colors.textPrimary,
    minHeight: 76, textAlignVertical: 'top',
  },
  editorRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  cancel: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary },
  save: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10,
    backgroundColor: Colors.primary, minWidth: 92, alignItems: 'center',
  },
  saveOff: { opacity: 0.45 },
  saveText: { fontSize: 12.5, fontWeight: '800', color: Colors.primaryDeep },

  empty: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, paddingVertical: 4 },

  note: {
    backgroundColor: Colors.bgDeep, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 12, padding: 12, gap: 8,
  },
  noteBody: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },
  noteFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noteMeta: { flex: 1, fontSize: 10.5, color: Colors.textMuted },

  overlay: {
    flex: 1, backgroundColor: Colors.overlay,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  confirm: {
    width: '100%', maxWidth: 360, backgroundColor: Colors.bgCard,
    borderRadius: 20, padding: 22, alignItems: 'center', gap: 10,
  },
  confirmIcon: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: '#FDECEC',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  confirmSub: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 6, width: '100%' },
  confirmNo: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  confirmNoText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  confirmYes: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: Colors.error,
  },
  confirmYesText: { fontSize: 13, fontWeight: '800', color: Colors.white },
});
