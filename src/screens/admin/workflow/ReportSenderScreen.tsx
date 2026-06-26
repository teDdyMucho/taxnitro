import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkflowInstance, PHASE_D_ITEMS, saveDriveLink, getDriveLinks, DriveLink } from '../../../db/workflow';
import { WorkflowPhaseBase, p } from './WorkflowPhaseBase';
import { useAuth } from '../../../context/AuthContext';

interface Props {
  workflow: WorkflowInstance;
  onBack: () => void;
  onAdvance: () => Promise<void>;
}

// ── Drive link fields for Phase D ─────────────────────────────────────────────

const SMARTVAULT_LABELS = ['Balance Sheet', 'Profit & Loss', 'Query Sheet'];

function SmartVaultLinks({ workflow }: { workflow: WorkflowInstance }) {
  const { user } = useAuth();
  const [links, setLinks] = useState<DriveLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  React.useEffect(() => {
    getDriveLinks(workflow.id).then(data => {
      setLinks(data.filter(l => l.storage === 'smartvault'));
      const map: Record<string, string> = {};
      for (const l of data) if (l.storage === 'smartvault') map[l.label] = l.url;
      setUrls(map);
      setLoaded(true);
    });
  }, [workflow.id]);

  const save = async (label: string) => {
    if (!urls[label]?.trim() || !user) return;
    setSaving(label);
    await saveDriveLink({ workflow_id: workflow.id, storage: 'smartvault', label, url: urls[label].trim(), saved_by: user.id });
    setSaving(null);
  };

  if (!loaded) return null;

  return (
    <View style={[p.section, { marginTop: 0 }]}>
      <View style={p.sectionHeader}>
        <Text style={p.sectionTitle}>SMARTVAULT LINKS</Text>
      </View>
      {SMARTVAULT_LABELS.map(label => {
        const saved = links.find(l => l.label === label);
        return (
          <View key={label} style={sv.row}>
            <View style={sv.labelRow}>
              <Ionicons name={saved ? 'checkmark-circle' : 'cloud-upload-outline'} size={16} color={saved ? '#10B981' : '#94A3B8'} />
              <Text style={[sv.label, saved && { color: '#10B981' }]}>{label}</Text>
            </View>
            {saved ? (
              <Text style={sv.savedUrl} numberOfLines={1}>{saved.url}</Text>
            ) : (
              <View style={sv.inputRow}>
                <TextInput
                  style={[sv.input, { outlineWidth: 0 } as any]}
                  placeholder="Paste SmartVault link..."
                  placeholderTextColor="#94A3B8"
                  value={urls[label] ?? ''}
                  onChangeText={v => setUrls(prev => ({ ...prev, [label]: v }))}
                />
                <TouchableOpacity style={[sv.saveBtn, (!urls[label]?.trim() || saving === label) && { opacity: 0.5 }]} onPress={() => save(label)} disabled={!urls[label]?.trim() || saving === label} activeOpacity={0.8}>
                  {saving === label ? <ActivityIndicator size="small" color="#1C1713" /> : <Text style={sv.saveBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const sv = StyleSheet.create({
  row:       { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 6 },
  labelRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label:     { color: '#374151', fontSize: 13, fontWeight: '700' },
  savedUrl:  { color: '#94A3B8', fontSize: 11, marginLeft: 24 },
  inputRow:  { flexDirection: 'row', gap: 8 },
  input:     { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 8, color: '#111827', fontSize: 12 },
  saveBtn:   { backgroundColor: '#E8B923', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#1C1713', fontSize: 12, fontWeight: '700' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function ReportSenderScreen({ workflow, onBack, onAdvance }: Props) {
  return (
    <WorkflowPhaseBase
      workflow={workflow}
      phase="D"
      phaseLabel="Report Sender"
      items={PHASE_D_ITEMS}
      onBack={onBack}
      onAdvance={onAdvance}
      submitLabel="Mark Complete & Notify Client ✓"
      extraContent={<SmartVaultLinks workflow={workflow} />}
    />
  );
}
