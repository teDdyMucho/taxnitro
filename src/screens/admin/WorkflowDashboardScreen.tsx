import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { getAllClients, getAllStaff, Profile } from '../../db/profiles';
import {
  WorkflowInstance, WorkflowStatus, AccountingSoftware,
  getWorkflowInstances, createWorkflowInstance, updateWorkflowStatus,
  STATUS_LABEL, STATUS_COLOR, currentMonth, formatMonth, NEXT_STATUS,
} from '../../db/workflow';
import { ProcessorScreen } from './workflow/ProcessorScreen';
import { ReviewerScreen } from './workflow/ReviewerScreen';
import { ReprocessorScreen } from './workflow/ReprocessorScreen';
import { ReportSenderScreen } from './workflow/ReportSenderScreen';

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});

const SOFTWARE_OPTIONS: AccountingSoftware[] = ['QBO', 'QBD', 'Xero'];

const STATUS_ICON: Record<WorkflowStatus, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  processor:     'construct-outline',
  reviewer:      'search-outline',
  reprocessor:   'refresh-outline',
  report_sender: 'send-outline',
  complete:      'checkmark-circle-outline',
};

const PIPELINE_STEPS: WorkflowStatus[] = ['processor', 'reviewer', 'reprocessor', 'report_sender', 'complete'];

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkflowDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [month, setMonth] = useState(currentMonth());
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<WorkflowStatus | 'all'>('all');

  // Create workflow modal
  const [showCreate, setShowCreate] = useState(false);
  const [clients, setClients] = useState<Profile[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [newClient, setNewClient] = useState<Profile | null>(null);
  const [newMonth, setNewMonth] = useState(currentMonth());
  const [newSoftware, setNewSoftware] = useState<AccountingSoftware>('QBO');
  const [newProcessor, setNewProcessor] = useState<Profile | null>(null);
  const [newReviewer, setNewReviewer] = useState<Profile | null>(null);
  const [newLoans, setNewLoans] = useState(false);
  const [newFixedAssets, setNewFixedAssets] = useState(false);
  const [creating, setCreating] = useState(false);

  // Open workflow
  const [openWorkflow, setOpenWorkflow] = useState<WorkflowInstance | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getWorkflowInstances(month);
    setInstances(data);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const openCreateModal = async () => {
    setShowCreate(true);
    const [c, s] = await Promise.all([getAllClients(), getAllStaff()]);
    setClients(c); setStaff(s);
  };

  const handleCreate = async () => {
    if (!newClient || !user) return;
    setCreating(true);
    await createWorkflowInstance({
      client_id: newClient.id, month: newMonth,
      accounting_software: newSoftware,
      assigned_processor: newProcessor?.id ?? null,
      assigned_reviewer: newReviewer?.id ?? null,
      has_loans: newLoans, has_fixed_assets: newFixedAssets,
      created_by: user.id,
    });
    setCreating(false);
    setShowCreate(false);
    load();
  };

  const filtered = instances.filter(i => filterStatus === 'all' || i.status === filterStatus);

  const stats: Record<WorkflowStatus, number> = {
    processor: 0, reviewer: 0, reprocessor: 0, report_sender: 0, complete: 0,
  };
  for (const i of instances) stats[i.status]++;

  // If a workflow is open, show its phase screen
  if (openWorkflow) {
    const props = {
      workflow: openWorkflow,
      onBack: () => { setOpenWorkflow(null); load(); },
      onAdvance: async () => {
        const next = NEXT_STATUS[openWorkflow.status];
        if (next) await updateWorkflowStatus(openWorkflow.id, next);
        setOpenWorkflow(null);
        load();
      },
    };
    if (openWorkflow.status === 'processor')     return <ProcessorScreen    {...props} />;
    if (openWorkflow.status === 'reviewer')      return <ReviewerScreen     {...props} />;
    if (openWorkflow.status === 'reprocessor')   return <ReprocessorScreen  {...props} />;
    if (openWorkflow.status === 'report_sender') return <ReportSenderScreen {...props} />;
  }

  return (
    <View style={[s.root, { paddingTop: Platform.OS === 'web' ? 0 : insets.top }]}>

      {/* ── Header ── */}
      <LinearGradient colors={['#3A3131', '#4A3E3E']} style={s.header}>
        <View>
          <Text style={s.headerTitle}>Bookkeeping Workflow</Text>
          <Text style={s.headerSub}>{filtered.length} client{filtered.length !== 1 ? 's' : ''} · {formatMonth(month)}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreateModal} activeOpacity={0.82}>
          <Ionicons name="add" size={20} color="#1C1713" />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Month picker ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthBar} contentContainerStyle={s.monthBarContent}>
        {MONTHS.map(m => (
          <TouchableOpacity key={m} style={[s.monthChip, m === month && s.monthChipActive]} onPress={() => setMonth(m)} activeOpacity={0.75}>
            <Text style={[s.monthChipText, m === month && s.monthChipTextActive]}>{formatMonth(m)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Pipeline summary ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pipelineBar} contentContainerStyle={s.pipelineBarContent}>
        {PIPELINE_STEPS.map(st => (
          <TouchableOpacity key={st} style={[s.pipelineCard, filterStatus === st && { borderColor: STATUS_COLOR[st], borderWidth: 2 }]} onPress={() => setFilterStatus(filterStatus === st ? 'all' : st)} activeOpacity={0.82}>
            <View style={[s.pipelineDot, { backgroundColor: STATUS_COLOR[st] }]} />
            <Text style={s.pipelineLabel}>{STATUS_LABEL[st]}</Text>
            <Text style={[s.pipelineCount, { color: STATUS_COLOR[st] }]}>{stats[st]}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.pipelineCard, filterStatus === 'all' && { borderColor: '#E8B923', borderWidth: 2 }]} onPress={() => setFilterStatus('all')} activeOpacity={0.82}>
          <Ionicons name="apps-outline" size={14} color="#E8B923" />
          <Text style={s.pipelineLabel}>All</Text>
          <Text style={[s.pipelineCount, { color: '#E8B923' }]}>{instances.length}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── List ── */}
      {loading ? (
        <View style={s.loader}><ActivityIndicator color="#E8B923" size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="clipboard-outline" size={52} color="rgba(232,185,35,0.25)" />
          <Text style={s.emptyTitle}>No workflows for {formatMonth(month)}</Text>
          <Text style={s.emptySub}>Tap + to create one for a client.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <WorkflowCard item={item} onOpen={() => setOpenWorkflow(item)} />}
        />
      )}

      {/* ── Create Modal ── */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Workflow</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* Client */}
              <Text style={s.fieldLabel}>Client *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {clients.map(c => (
                  <TouchableOpacity key={c.id} style={[s.selectChip, newClient?.id === c.id && s.selectChipActive]} onPress={() => setNewClient(c)} activeOpacity={0.8}>
                    <Text style={[s.selectChipText, newClient?.id === c.id && { color: '#FFFFFF' }]} numberOfLines={1}>{c.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {/* Month */}
              <Text style={s.fieldLabel}>Month *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {MONTHS.map(m => (
                  <TouchableOpacity key={m} style={[s.selectChip, newMonth === m && s.selectChipActive]} onPress={() => setNewMonth(m)} activeOpacity={0.8}>
                    <Text style={[s.selectChipText, newMonth === m && { color: '#FFFFFF' }]}>{formatMonth(m)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {/* Software */}
              <Text style={s.fieldLabel}>Accounting Software *</Text>
              <View style={s.softwareRow}>
                {SOFTWARE_OPTIONS.map(sw => (
                  <TouchableOpacity key={sw} style={[s.softwareChip, newSoftware === sw && s.softwareChipActive]} onPress={() => setNewSoftware(sw)} activeOpacity={0.8}>
                    <Text style={[s.softwareChipText, newSoftware === sw && { color: '#1C1713' }]}>{sw}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Processor */}
              <Text style={s.fieldLabel}>Assign Processor</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {staff.map(p => (
                  <TouchableOpacity key={p.id} style={[s.selectChip, newProcessor?.id === p.id && s.selectChipActive]} onPress={() => setNewProcessor(newProcessor?.id === p.id ? null : p)} activeOpacity={0.8}>
                    <Text style={[s.selectChipText, newProcessor?.id === p.id && { color: '#FFFFFF' }]} numberOfLines={1}>{p.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {/* Reviewer */}
              <Text style={s.fieldLabel}>Assign Reviewer</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {staff.map(p => (
                  <TouchableOpacity key={p.id} style={[s.selectChip, newReviewer?.id === p.id && s.selectChipActive]} onPress={() => setNewReviewer(newReviewer?.id === p.id ? null : p)} activeOpacity={0.8}>
                    <Text style={[s.selectChipText, newReviewer?.id === p.id && { color: '#FFFFFF' }]} numberOfLines={1}>{p.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {/* Toggles */}
              <View style={s.toggleRow}>
                <TouchableOpacity style={s.toggle} onPress={() => setNewLoans(!newLoans)} activeOpacity={0.8}>
                  <View style={[s.toggleBox, newLoans && s.toggleBoxOn]}>{newLoans && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
                  <Text style={s.toggleLabel}>Client has loans</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.toggle} onPress={() => setNewFixedAssets(!newFixedAssets)} activeOpacity={0.8}>
                  <View style={[s.toggleBox, newFixedAssets && s.toggleBoxOn]}>{newFixedAssets && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
                  <Text style={s.toggleLabel}>Has fixed assets</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[s.createBtn, (!newClient || creating) && { opacity: 0.5 }]}
              onPress={handleCreate}
              disabled={!newClient || creating}
              activeOpacity={0.82}
            >
              {creating ? <ActivityIndicator size="small" color="#1C1713" /> : <Text style={s.createBtnText}>Create Workflow</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Workflow Card ─────────────────────────────────────────────────────────────

function WorkflowCard({ item, onOpen }: { item: WorkflowInstance; onOpen: () => void }) {
  const color = STATUS_COLOR[item.status];
  const stepIdx = PIPELINE_STEPS.indexOf(item.status);

  return (
    <TouchableOpacity style={ws.card} onPress={onOpen} activeOpacity={0.88}>
      {/* Left color bar */}
      <View style={[ws.bar, { backgroundColor: color }]} />

      <View style={{ flex: 1, gap: 8, padding: 14 }}>
        {/* Top row */}
        <View style={ws.topRow}>
          <Text style={ws.clientName} numberOfLines={1}>{item.client_name}</Text>
          <View style={[ws.statusBadge, { backgroundColor: color + '20' }]}>
            <View style={[ws.statusDot, { backgroundColor: color }]} />
            <Text style={[ws.statusText, { color }]}>{STATUS_LABEL[item.status]}</Text>
          </View>
        </View>

        {/* Software + month */}
        <View style={ws.metaRow}>
          <View style={ws.softwareBadge}><Text style={ws.softwareText}>{item.accounting_software}</Text></View>
          <Text style={ws.metaText}>{formatMonth(item.month)}</Text>
          {item.has_loans && <View style={ws.tagBadge}><Text style={ws.tagText}>Loans</Text></View>}
          {item.has_fixed_assets && <View style={ws.tagBadge}><Text style={ws.tagText}>Fixed Assets</Text></View>}
        </View>

        {/* Pipeline progress bar */}
        <View style={ws.progressTrack}>
          {PIPELINE_STEPS.map((st, idx) => (
            <View key={st} style={[ws.progressStep, idx <= stepIdx && { backgroundColor: STATUS_COLOR[st] }]} />
          ))}
        </View>

        {/* Assigned staff */}
        {(item.processor_name || item.reviewer_name) && (
          <View style={ws.staffRow}>
            {item.processor_name ? <Text style={ws.staffText}><Text style={ws.staffRole}>Processor:</Text> {item.processor_name}</Text> : null}
            {item.reviewer_name  ? <Text style={ws.staffText}><Text style={ws.staffRole}>Reviewer:</Text> {item.reviewer_name}</Text> : null}
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ alignSelf: 'center', marginRight: 14 }} />
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8FAFC' },
  loader:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: '#374151', fontSize: 17, fontWeight: '700' },
  emptySub:   { color: '#94A3B8', fontSize: 13 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  addBtn:      { width: 38, height: 38, borderRadius: 12, backgroundColor: '#E8B923', alignItems: 'center', justifyContent: 'center' },

  monthBar:        { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  monthBarContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  monthChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E5E7EB' },
  monthChipActive: { backgroundColor: '#E8B923', borderColor: '#E8B923' },
  monthChipText:   { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  monthChipTextActive: { color: '#1C1713' },

  pipelineBar:        { maxHeight: 72, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pipelineBarContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center', paddingVertical: 10 },
  pipelineCard:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  pipelineDot:        { width: 8, height: 8, borderRadius: 4 },
  pipelineLabel:      { color: '#6B7280', fontSize: 11, fontWeight: '600' },
  pipelineCount:      { fontSize: 14, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle:   { color: '#111827', fontSize: 18, fontWeight: '800' },
  fieldLabel:   { color: '#374151', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  selectChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  selectChipActive: { backgroundColor: '#3A3131', borderColor: '#3A3131' },
  selectChipText:   { color: '#374151', fontSize: 13, fontWeight: '600' },
  softwareRow:  { flexDirection: 'row', gap: 10, marginBottom: 12 },
  softwareChip: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  softwareChipActive: { backgroundColor: '#E8B923', borderColor: '#E8B923' },
  softwareChipText:   { color: '#374151', fontSize: 14, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  toggle:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  toggleBoxOn: { backgroundColor: '#E8B923', borderColor: '#E8B923' },
  toggleLabel: { color: '#374151', fontSize: 13 },
  createBtn:     { backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  createBtnText: { color: '#1C1713', fontSize: 15, fontWeight: '800' },
});

const ws = StyleSheet.create({
  card:   { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  bar:    { width: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clientName:    { color: '#111827', fontSize: 15, fontWeight: '800', flex: 1 },
  statusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot:     { width: 6, height: 6, borderRadius: 3 },
  statusText:    { fontSize: 11, fontWeight: '700' },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  softwareBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  softwareText:  { color: '#92400E', fontSize: 10, fontWeight: '800' },
  metaText:      { color: '#6B7280', fontSize: 12 },
  tagBadge:      { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText:       { color: '#4338CA', fontSize: 10, fontWeight: '700' },
  progressTrack: { flexDirection: 'row', gap: 3 },
  progressStep:  { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#F1F5F9' },
  staffRow:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  staffText:     { color: '#6B7280', fontSize: 11 },
  staffRole:     { fontWeight: '700', color: '#374151' },
});
