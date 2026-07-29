import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useSheetStyles } from '../hooks/useSheetStyles';
import { uploadDocumentToStorage, createDocumentRecord, Document } from '../db/documents';
import { supabase } from '../lib/supabase';

// The ONLY folders a client uploads into. Everything else is staff-delivered.
const CLIENT_UPLOAD_FOLDERS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tax_contracts',          label: 'Tax Contracts',      icon: 'document-text-outline' },
  { key: 'tax_invoices',           label: 'Tax Invoices',       icon: 'receipt-outline' },
  { key: 'tax_client_uploads',     label: 'Client Uploads',     icon: 'cloud-upload-outline' },
  { key: 'tax_additional_docs',    label: 'Additional Tax Docs', icon: 'folder-outline' },
  { key: 'tax_return_information', label: 'Tax Returns',        icon: 'information-circle-outline' },
];

export function ClientUploadModal({ visible, onClose, onUploaded }: {
  visible: boolean; onClose: () => void; onUploaded?: (d: Document) => void;
}) {
  const { user } = useAuth();
  const sheet = useSheetStyles('md');
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => { setFolderKey(null); setNote(''); setPicked(null); setBusy(false); setDone(false); };
  const close = () => { reset(); onClose(); };

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled) return;
      const a = r.assets[0];
      setPicked({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' });
    } catch { Alert.alert('Error', 'Could not pick a file.'); }
  };

  const upload = async () => {
    if (!folderKey || !picked || !user) return;
    setBusy(true);
    try {
      const url = await uploadDocumentToStorage(user.id, folderKey, picked.uri, picked.name, picked.mimeType);
      if (!url) { setBusy(false); Alert.alert('Upload failed', 'Could not save file to storage.'); return; }
      const doc = await createDocumentRecord({
        userId: user.id,
        email: user.email,
        name: picked.name,
        documentUrl: url,
        documentType: folderKey,
        uploadedByRole: 'client',
        uploadedBy: user.email,
      });
      if (!doc) { setBusy(false); Alert.alert('Partial success', 'File saved but record creation failed.'); return; }

      // Optional note → first message in the file's conversation thread (staff can reply).
      const trimmed = note.trim();
      if (trimmed) {
        await supabase.from('file_conversations').insert({
          file_id:       doc.id,
          folder_table:  folderKey,
          file_owner_id: user.id,
          sender_id:     user.id,
          sender_name:   user.name ?? user.email ?? 'Client',
          sender_role:   'client',
          message:       trimmed,
          is_read:       false,
        });
      }

      setBusy(false);
      setDone(true);
      onUploaded?.(doc);
      setTimeout(close, 1300);
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Upload failed', e?.message ?? 'Something went wrong.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[s.overlay, sheet.overlay]} onPress={close}>
        <Pressable style={[s.sheet, sheet.sheet]} onPress={() => {}}>
          <View style={s.handle} />

          {done ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
              <View style={s.doneCircle}><Ionicons name="checkmark" size={40} color="#16A34A" /></View>
              <Text style={s.title}>Uploaded</Text>
              <Text style={s.sub}>Your document has been sent for review.</Text>
            </View>
          ) : (
            <>
              <Text style={s.title}>Upload a Document</Text>
              <Text style={s.sub}>Choose where this document belongs, then pick your file.</Text>

              <Text style={s.label}>Document type</Text>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {CLIENT_UPLOAD_FOLDERS.map(f => {
                  const active = folderKey === f.key;
                  return (
                    <TouchableOpacity key={f.key} style={[s.folderRow, active && s.folderRowActive]} onPress={() => setFolderKey(f.key)} activeOpacity={0.75}>
                      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? '#E8B923' : Colors.textMuted} />
                      <Ionicons name={f.icon} size={16} color={active ? '#B5905B' : Colors.textMuted} />
                      <Text style={[s.folderText, active && { color: Colors.textPrimary, fontWeight: '700' }]}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={s.label}>File</Text>
              <TouchableOpacity style={s.pickBtn} onPress={pick} activeOpacity={0.8}>
                <Ionicons name={picked ? 'document-text' : 'cloud-upload-outline'} size={18} color="#E8B923" />
                <Text style={s.pickText} numberOfLines={1}>{picked ? picked.name : 'Choose a file…'}</Text>
              </TouchableOpacity>

              <Text style={s.label}>Note <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="What is this document for?"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={s.row}>
                <TouchableOpacity style={s.cancelBtn} onPress={close}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sendBtn, (!folderKey || !picked || busy) && { opacity: 0.5 }]}
                  onPress={upload}
                  disabled={!folderKey || !picked || busy}
                >
                  {busy ? <ActivityIndicator color="#3A3131" size="small" /> : <Text style={s.sendText}>Upload</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 28, gap: 10, maxHeight: '88%' },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 13, marginBottom: 4 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  optional: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'none' },
  noteInput: { color: Colors.textPrimary, fontSize: 14, backgroundColor: Colors.bgMid, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, minHeight: 72 },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.bgMid },
  folderRowActive: { borderColor: 'rgba(232,185,35,0.5)', backgroundColor: 'rgba(232,185,35,0.1)' },
  folderText: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,185,35,0.4)', backgroundColor: 'rgba(232,185,35,0.08)' },
  pickText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  sendBtn: { flex: 2, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
  doneCircle: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center' },
});
