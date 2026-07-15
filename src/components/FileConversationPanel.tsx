import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, FlatList, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import type { Document } from '../db/documents';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  file_id: string;
  folder_table: string;
  file_owner_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'client' | 'admin' | 'staff';
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Props {
  visible: boolean;
  doc: Document;
  fileOwnerId: string;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDate(d: string) {
  const date = new Date(d);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FileConversationPanel({ visible, doc, fileOwnerId, onClose }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === 'web' ? 0 : insets.top;
  const pb = Platform.OS === 'web' ? 16 : insets.bottom + 8;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(false);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const listRef = useRef<FlatList>(null);

  const currentRole = user?.role ?? 'client';
  const isStaffOrAdmin = currentRole === 'admin' || currentRole === 'staff';

  const markRead = useCallback((msgs: Message[]) => {
    const unread = msgs
      .filter(m => !m.is_read && m.sender_role !== currentRole)
      .map(m => m.id);
    if (unread.length > 0) {
      supabase.from('file_conversations').update({ is_read: true }).in('id', unread).then(() => {});
    }
  }, [currentRole]);

  const load = useCallback(async () => {
    if (!doc?.id || !doc.document_type) return;
    setLoading(true);
    const { data } = await supabase
      .from('file_conversations')
      .select('*')
      .eq('file_id', doc.id)
      .eq('folder_table', doc.document_type)
      .order('created_at', { ascending: true });

    const msgs = (data ?? []) as Message[];
    setMessages(msgs);
    markRead(msgs);
    setLoading(false);
  }, [doc?.id, doc?.document_type, markRead]);

  useEffect(() => {
    if (!visible || !doc?.id) return;
    load();

    const channel = supabase
      .channel(`conv:${doc.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'file_conversations',
        filter: `file_id=eq.${doc.id}`,
      }, payload => {
        const msg = payload.new as Message;
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        if (msg.sender_role !== currentRole) {
          supabase.from('file_conversations').update({ is_read: true }).eq('id', msg.id).then(() => {});
        }
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [visible, doc?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
    }
  }, [messages.length]);

  const send = async () => {
    if (!text.trim() || sending || !user) return;
    const msg = text.trim();
    setText('');
    setSending(true);

    const { error } = await supabase.from('file_conversations').insert({
      file_id:       doc.id,
      folder_table:  doc.document_type,
      file_owner_id: fileOwnerId,
      sender_id:     user.id,
      sender_name:   user.name ?? user.email ?? 'User',
      sender_role:   currentRole,
      message:       msg,
      is_read:       false,
    });

    setSending(false);

    if (error) {
      console.error('file_conversations insert failed:', error);
      setText(msg); // restore so the reply isn't lost
      Alert.alert('Could not send', error.message || 'Something went wrong sending your reply.');
    }
  };

  const docName = (doc.file_name || doc.name || 'Document') as string;
  const hasAdminNote = !!doc.approval_note && doc.approval_status !== 'approved';

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.sender_id === user?.id;
    const isStaff = item.sender_role === 'admin' || item.sender_role === 'staff';
    const prev = messages[index - 1];
    const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(item.created_at).toDateString();
    const senderLabel = item.sender_role === 'admin' ? 'Admin' : item.sender_role === 'staff' ? 'Staff' : item.sender_name;

    return (
      <>
        {showDate && (
          <View style={cs.dateSep}>
            <View style={cs.dateLine} />
            <Text style={cs.dateText}>{fmtDate(item.created_at)}</Text>
            <View style={cs.dateLine} />
          </View>
        )}
        <View style={[cs.row, isOwn ? cs.rowRight : cs.rowLeft]}>
          {!isOwn && (
            <LinearGradient
              colors={isStaff ? ['#E8B923', '#B5905B'] : ['#4A3E3E', '#3A3131']}
              style={cs.avatar}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Text style={cs.avatarText}>{senderLabel[0]?.toUpperCase() ?? 'U'}</Text>
            </LinearGradient>
          )}

          <View style={[cs.bubble, isOwn ? cs.bubbleOwn : cs.bubbleOther, { maxWidth: '78%' }]}>
            {!isOwn && (
              <Text style={[cs.senderName, isStaff && { color: '#E8B923' }]}>{senderLabel}</Text>
            )}
            <Text style={[cs.msgText, isOwn && cs.msgTextOwn]}>{item.message}</Text>
            <View style={cs.meta}>
              <Text style={[cs.time, isOwn && cs.timeOwn]}>{fmtTime(item.created_at)}</Text>
              {isOwn && (
                <Ionicons
                  name={item.is_read ? 'checkmark-done' : 'checkmark'}
                  size={11}
                  color={item.is_read ? '#E8B923' : 'rgba(255,255,255,0.45)'}
                />
              )}
            </View>
          </View>
        </View>
      </>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[cs.root, { paddingTop: pt }]}>

        {/* ── Header ── */}
        <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} style={cs.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <TouchableOpacity style={cs.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <View style={cs.headerCenter}>
            <View style={cs.headerIconWrap}>
              <Ionicons name="chatbubbles-outline" size={16} color="#E8B923" />
            </View>
            <Text style={cs.headerTitle} numberOfLines={1}>{docName}</Text>
            <Text style={cs.headerSub}>Conversation</Text>
          </View>
          <View style={{ width: 36 }} />
        </LinearGradient>

        {/* ── Admin feedback banner ── */}
        {hasAdminNote && (
          <View style={[cs.banner, doc.approval_status === 'rejected' ? cs.bannerRejected : cs.bannerPending]}>
            <Ionicons
              name={doc.approval_status === 'rejected' ? 'close-circle' : 'time'}
              size={16}
              color={doc.approval_status === 'rejected' ? '#EF4444' : '#F59E0B'}
            />
            <View style={{ flex: 1 }}>
              <Text style={[cs.bannerLabel, doc.approval_status === 'rejected' ? { color: '#991B1B' } : { color: '#92400E' }]}>
                {doc.approval_status === 'rejected' ? 'Rejected' : 'Pending'} — Admin Feedback
              </Text>
              <Text style={[cs.bannerNote, doc.approval_status === 'rejected' ? { color: '#B91C1C' } : { color: '#B45309' }]}>
                {doc.approval_note}
              </Text>
            </View>
          </View>
        )}

        {/* ── Messages ── */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={pt + 110}
        >
          {loading ? (
            <View style={cs.loader}>
              <ActivityIndicator color="#E8B923" size="large" />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={m => m.id}
              renderItem={renderMessage}
              contentContainerStyle={cs.list}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={cs.empty}>
                  <Ionicons name="chatbubble-ellipses-outline" size={52} color="rgba(232,185,35,0.25)" />
                  <Text style={cs.emptyTitle}>Start the conversation</Text>
                  <Text style={cs.emptySub}>
                    {hasAdminNote
                      ? 'Reply to the admin feedback above'
                      : 'Ask a question or leave a note about this file'}
                  </Text>
                </View>
              }
            />
          )}

          {/* ── Input bar ── */}
          <View style={[cs.inputRow, { paddingBottom: pb }]}>
            <TextInput
              style={[cs.input, { outlineWidth: 0 } as any]}
              value={text}
              onChangeText={setText}
              placeholder="Type your reply…"
              placeholderTextColor="rgba(255,255,255,0.28)"
              multiline
              maxLength={500}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[cs.sendBtn, (!text.trim() || sending) && cs.sendBtnOff]}
              onPress={send}
              disabled={!text.trim() || sending}
              activeOpacity={0.82}
            >
              {sending
                ? <ActivityIndicator size="small" color="#2C2320" />
                : <Ionicons name="send" size={16} color="#2C2320" />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#1C1713' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, overflow: 'hidden' },
  closeBtn:    { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerCenter:{ flex: 1, alignItems: 'center', gap: 3 },
  headerIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(232,185,35,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  headerSub:   { color: 'rgba(255,255,255,0.45)', fontSize: 11 },

  // Feedback banner
  banner:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  bannerRejected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  bannerPending:  { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, marginBottom: 2 },
  bannerNote:     { fontSize: 12, lineHeight: 17 },

  // Messages
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: 12, gap: 4, paddingBottom: 20 },

  dateSep:  { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
  dateLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  dateText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600' },

  row:      { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
  rowLeft:  { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  avatar:     { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#1C1713', fontSize: 11, fontWeight: '800' },

  bubble:      { borderRadius: 16, padding: 11, gap: 4 },
  bubbleOther: { backgroundColor: '#2C2320', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderBottomLeftRadius: 4 },
  bubbleOwn:   { backgroundColor: '#E8B923', borderBottomRightRadius: 4 },

  senderName: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', marginBottom: 1 },
  msgText:    { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18 },
  msgTextOwn: { color: '#2C2320' },

  meta:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1, alignSelf: 'flex-end' },
  time:     { fontSize: 10, color: 'rgba(255,255,255,0.35)' },
  timeOwn:  { color: 'rgba(44,35,32,0.55)' },

  // Empty
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '700' },
  emptySub:   { color: 'rgba(255,255,255,0.28)', fontSize: 12, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: '#1C1713' },
  input:    { flex: 1, backgroundColor: '#2C2320', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF', fontSize: 14, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100 },
  sendBtn:    { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E8B923', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendBtnOff: { backgroundColor: 'rgba(232,185,35,0.25)' },
});
