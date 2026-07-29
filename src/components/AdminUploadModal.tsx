import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useSheetStyles } from '../hooks/useSheetStyles';
import { uploadDocumentToStorage, createDocumentRecord, Document } from '../db/documents';
import { getAllClients, Profile } from '../db/profiles';

// Every folder an admin/staff can upload into, grouped by suite. Full access.
const UPLOAD_FOLDERS: { title: string; folders: { key: string; label: string }[] }[] = [
  { title: 'Tax Documents & Returns', folders: [
    { key: 'tax_contracts',          label: 'Tax Contracts' },
    { key: 'tax_invoices',           label: 'Tax Invoices' },
    { key: 'tax_client_uploads',     label: 'Client Uploads' },
    { key: 'tax_additional_docs',    label: 'Additional Tax Docs' },
    { key: 'tax_return_information',  label: 'Tax Returns' },
  ]},
  { title: 'Bookkeeping & Financials', folders: [
    { key: 'bk_contracts',           label: 'BK Contracts' },
    { key: 'bk_invoices',            label: 'BK Invoices' },
    { key: 'bk_final_pnl',           label: 'Additional BK Docs' },
    { key: 'bk_mr_required_info',    label: 'Monthly Reporting (Required Info)' },
    { key: 'bk_mr_client_review',    label: 'Monthly Reporting (For Client Review)' },
    { key: 'bk_mr_final_statements', label: 'Monthly Reporting (Final Statements)' },
  ]},
  { title: 'CFO Advisory', folders: [
    { key: 'cfo_contracts',           label: 'CFO Contracts' },
    { key: 'cfo_invoices',            label: 'CFO Invoices' },
    { key: 'cfo_additional_docs',     label: 'Additional CFO Docs' },
    { key: 'cfo_mr_required_info',    label: 'Monthly Reporting (Required Info)' },
    { key: 'cfo_mr_client_review',    label: 'Monthly Reporting (For Client Review)' },
    { key: 'cfo_mr_final_statements', label: 'Monthly Reporting (Final Statements & Insights)' },
  ]},
];

export function AdminUploadModal({ visible, onClose, onUploaded }: {
  visible: boolean; onClose: () => void; onUploaded?: (d: Document) => void;
}) {
  const { user } = useAuth();
  const sheet = useSheetStyles('lg');
  const [clients, setClients] = useState<Profile[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [client, setClient] = useState<Profile | null>(null);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { if (visible) getAllClients().then(setClients); }, [visible]);

  const reset = () => { setClient(null); setClientQuery(''); setFolderKey(null); setPicked(null); setBusy(false); setDone(false); };
  const close = () => { reset(); onClose(); };

  const filteredClients = clientQuery.trim()
    ? clients.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(clientQuery.toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes(clientQuery.toLowerCase()))
    : clients;

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled) return;
      const a = r.assets[0];
      setPicked({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' });
    } catch { Alert.alert('Error', 'Could not pick a file.'); }
  };

  const upload = async () => {
    if (!client || !folderKey || !picked) return;
    setBusy(true);
    try {
      const url = await uploadDocumentToStorage(client.id, folderKey, picked.uri, picked.name, picked.mimeType);
      if (!url) { setBusy(false); Alert.alert('Upload failed', 'Could not save file to storage.'); return; }
      const doc = await createDocumentRecord({
        userId: client.id,
        email: client.email,
        name: picked.name,
        documentUrl: url,
        documentType: folderKey,
        uploadedByRole: (user?.role === 'admin' ? 'admin' : 'staff'),
        uploadedBy: user?.email ?? 'staff',
      });
      setBusy(false);
      if (!doc) { Alert.alert('Partial success', 'File saved but record creation failed.'); return; }
      setDone(true);
      onUploaded?.(doc);
      setTimeout(close, 1200);
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
              <Text style={s.sub}>File added to {client?.full_name || 'the client'}.</Text>
            </View>
          ) : (
            <>
              <Text style={s.title}>Upload a Document</Text>
              <Text style={s.sub}>Pick a client, choose a folder, then upload the file.</Text>

              {/* Step 1: client */}
              <Text style={s.label}>Client</Text>
              {client ? (
                <TouchableOpacity style={s.selectedClient} onPress={() => setClient(null)} activeOpacity={0.8}>
                  <Ionicons name="person-circle-outline" size={20} color="#B5905B" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.selName}>{client.full_name || 'Unnamed'}</Text>
                    <Text style={s.selEmail}>{client.email}</Text>
                  </View>
                  <Ionicons name="swap-horizontal-outline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <>
                  <View style={s.searchRow}>
                    <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
                    <TextInput
                      style={[s.searchInput, { outlineWidth: 0 } as any]}
                      placeholder="Search client…" placeholderTextColor={Colors.textMuted}
                      value={clientQuery} onChangeText={setClientQuery}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
                    {filteredClients.map(c => (
                      <TouchableOpacity key={c.id} style={s.clientRow} onPress={() => setClient(c)} activeOpacity={0.75}>
                        <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.clientName} numberOfLines={1}>{c.full_name || 'Unnamed'}</Text>
                          <Text style={s.clientEmail} numberOfLines={1}>{c.email}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {filteredClients.length === 0 && <Text style={s.noClients}>No clients found.</Text>}
                  </ScrollView>
                </>
              )}

              {/* Step 2: folder (after client) */}
              {client && (
                <>
                  <Text style={s.label}>Folder</Text>
                  <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                    {UPLOAD_FOLDERS.map(group => (
                      <View key={group.title} style={{ marginBottom: 4 }}>
                        <Text style={s.groupLabel}>{group.title}</Text>
                        {group.folders.map(f => {
                          const active = folderKey === f.key;
                          return (
                            <TouchableOpacity key={f.key} style={[s.folderRow, active && s.folderRowActive]} onPress={() => setFolderKey(f.key)} activeOpacity={0.75}>
                              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={16} color={active ? '#E8B923' : Colors.textMuted} />
                              <Text style={[s.folderText, active && { color: Colors.textPrimary, fontWeight: '700' }]}>{f.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Step 3: file (after folder) */}
              {client && folderKey && (
                <>
                  <Text style={s.label}>File</Text>
                  <TouchableOpacity style={s.pickBtn} onPress={pick} activeOpacity={0.8}>
                    <Ionicons name={picked ? 'document-text' : 'cloud-upload-outline'} size={18} color="#E8B923" />
                    <Text style={s.pickText} numberOfLines={1}>{picked ? picked.name : 'Choose a file…'}</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={s.row}>
                <TouchableOpacity style={s.cancelBtn} onPress={close}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sendBtn, (!client || !folderKey || !picked || busy) && { opacity: 0.5 }]}
                  onPress={upload}
                  disabled={!client || !folderKey || !picked || busy}
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
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 28, gap: 8, maxHeight: '90%' },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 13, marginBottom: 4 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 },
  groupLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgMid, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  clientName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  clientEmail: { color: Colors.textMuted, fontSize: 12 },
  noClients: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 14 },
  selectedClient: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(181,144,91,0.1)', borderWidth: 1, borderColor: 'rgba(181,144,91,0.4)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  selName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  selEmail: { color: Colors.textMuted, fontSize: 12 },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.bgMid },
  folderRowActive: { borderColor: 'rgba(232,185,35,0.5)', backgroundColor: 'rgba(232,185,35,0.1)' },
  folderText: { color: Colors.textSecondary, fontSize: 13.5, flex: 1 },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,185,35,0.4)', backgroundColor: 'rgba(232,185,35,0.08)' },
  pickText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  sendBtn: { flex: 2, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
  doneCircle: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center' },
});
