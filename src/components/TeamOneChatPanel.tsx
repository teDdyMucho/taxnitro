import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getTeamOneServices } from '../db/teamOne';
import { listChat, sendChat, markChatRead, otherSide, type ChatMessage } from '../db/teamOneChat';

// The chat between Team One and FTG, on a client's profile. Daja: "a chat
// inside of each client profile that will allow them to communicate with FTG.
// This chat will only be visible to Team 1 and FTG." The client's own app never
// shows it, and the database would not give it to them if it did.
//
// For staff it is there on the clients Team One has, or once a thread exists.
// It opens by itself when the other side has written something unread, and
// reading it marks that read.

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function TeamOneChatPanel({ clientEmail, clientName }: { clientEmail: string; clientName?: string | null }) {
  const { user } = useAuth();
  const isTeamOne = user?.role === 'team_one';
  const email = clientEmail.trim().toLowerCase();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  // Team One only ever opens the clients it has; for staff, look it up.
  const [assigned, setAssigned] = useState<boolean | null>(isTeamOne ? true : null);
  const [open, setOpen] = useState(isTeamOne);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let live = true;
    setMessages(null);
    listChat(email).then(m => { if (live) setMessages(m); });
    if (!isTeamOne) getTeamOneServices(email).then(s => { if (live) setAssigned(s.length > 0); });
    // New messages arrive as they are sent.
    const ch = supabase
      .channel(`team-one-chat:${email}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_one_chat', filter: `client_email=eq.${email}` },
        p => {
          const row = p.new as ChatMessage;
          setMessages(prev => (prev ?? []).some(x => x.id === row.id) ? prev : [...(prev ?? []), row]);
        })
      .subscribe();
    return () => { live = false; supabase.removeChannel(ch); };
  }, [email, isTeamOne]);

  const theirs = otherSide(user?.role);
  const unread = (messages ?? []).filter(m => !m.is_read && theirs.includes(m.sender_role)).length;

  // Something new from the other side opens the panel.
  useEffect(() => { if (unread > 0) setOpen(true); }, [unread > 0]);

  // Open with unread messages showing: they have been read.
  useEffect(() => {
    if (!open || unread === 0) return;
    markChatRead(email).then(() =>
      setMessages(prev => prev?.map(m => (theirs.includes(m.sender_role) ? { ...m, is_read: true } : m)) ?? prev));
  }, [open, unread, email]);

  // Keep the newest message in view.
  useEffect(() => {
    if (open) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
  }, [open, messages?.length]);

  // Staff: not for a client Team One does not have, unless they already talked.
  if (!isTeamOne && (assigned === null || (assigned === false && (messages?.length ?? 0) === 0))) return null;

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !user) return;
    setSending(true);
    const row = await sendChat(email, text, { id: user.id, name: user.name, role: user.role }, clientName);
    setSending(false);
    if (!row) { Alert.alert('Could not send', 'Please try again.'); return; }
    setDraft('');
    setMessages(prev => (prev ?? []).some(x => x.id === row.id) ? prev : [...(prev ?? []), row]);
  };

  const label = (m: ChatMessage) => {
    const who = m.sender_name || (m.sender_role === 'team_one' ? 'Team One' : 'FTG');
    if (m.sender_id === user?.id) return 'You';
    return m.sender_role === 'team_one' ? `Team One · ${who}` : `FTG · ${who}`;
  };

  return (
    <View style={s.panel}>
      <TouchableOpacity style={s.head} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <View style={s.headIcon}>
          <Ionicons name="chatbubbles-outline" size={16} color={Colors.primaryDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headTitle}>{isTeamOne ? 'Chat with FTG' : 'Team One chat'}</Text>
          <Text style={s.headSub} numberOfLines={1}>
            Only FTG and Team One see this
            {messages && messages.length ? ` · ${messages.length} message${messages.length === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        {unread > 0 && (
          <View style={s.badge}><Text style={s.badgeText}>{unread}</Text></View>
        )}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={s.body}>
          {messages == null ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 14 }} />
          ) : messages.length === 0 ? (
            <Text style={s.empty}>
              {isTeamOne
                ? 'Nothing yet. Questions about this client go here, and FTG answers here.'
                : 'Nothing yet. Team One asks about this client here.'}
            </Text>
          ) : (
            <ScrollView ref={scrollRef} style={s.list} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {messages.map(m => {
                const mine = m.sender_id === user?.id;
                return (
                  <View key={m.id} style={[s.msg, mine ? s.msgMine : s.msgTheirs]}>
                    <Text style={s.msgWho}>{label(m)} · {when(m.created_at)}</Text>
                    <Text style={s.msgText}>{m.message}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={s.compose}>
            <TextInput
              style={[s.input, { outlineWidth: 0 } as any]}
              value={draft}
              onChangeText={setDraft}
              placeholder={isTeamOne ? 'Message FTG…' : 'Message Team One…'}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              style={[s.send, (!draft.trim() || sending) && s.sendOff]}
              onPress={send}
              disabled={!draft.trim() || sending}
              activeOpacity={0.85}
            >
              {sending
                ? <ActivityIndicator size="small" color={Colors.primaryDeep} />
                : <Ionicons name="send" size={15} color={Colors.primaryDeep} />}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // As the panels above it, so the profile reads as one set.
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
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.primaryDeep },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  empty: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, paddingVertical: 4 },
  list: { maxHeight: 320 },
  msg: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: '#FDF1D9' },
  msgTheirs: { alignSelf: 'flex-start', backgroundColor: Colors.bgMid },
  msgWho: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted },
  msgText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18 },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgDeep,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13,
    color: Colors.textPrimary, minHeight: 40, maxHeight: 120, textAlignVertical: 'top',
  },
  send: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendOff: { opacity: 0.45 },
});
