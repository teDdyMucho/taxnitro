import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';

// The n8n chatbot flow. It receives one message at a time plus who sent it, and
// answers with the assistant's reply.
const WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/chatbot';

// Don't let a stalled flow leave the bubble spinning forever.
const REPLY_TIMEOUT_MS = 30000;

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The assistant writes Markdown, so **Upload** arrives with its asterisks.
 * Rendering them raw looks broken, and telling the model not to emphasise at
 * all loses the button names it is pointing at — so draw the bold instead.
 *
 * Deliberately only **bold**: that is all the assistant uses in practice, and
 * a fuller Markdown parser is a dependency this one widget does not need.
 */
function renderText(text: string, baseStyle: any, boldStyle: any) {
  // Split on **…**, keeping the captured inner text. Odd indexes are the bold
  // pieces, even ones the plain text between them.
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length === 1) return <Text style={baseStyle}>{text}</Text>;

  return (
    <Text style={baseStyle}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <Text key={i} style={boldStyle}>{part}</Text>
          : <Text key={i}>{part}</Text>
      )}
    </Text>
  );
}

// What an empty conversation opens with — on first load and after a reset.
// Staff get a different opening because they reach a different desk: they
// report faults in the system, clients ask about their own documents.
const welcomeMessage = (isStaff: boolean): Message => ({
  id: newId(),
  role: 'bot',
  text: isStaff
    ? 'Hi! Ask me how something works, or report a bug and I\'ll raise a ticket.'
    : 'Hi! Ask me anything about your documents or your account.',
});

// What n8n answers with when the Webhook node is set to "Respond immediately"
// — an acknowledgement that the flow started, never the assistant's words.
// Shown as a bot reply it would read as gibberish, so it counts as "no reply".
const ACK = /^workflow was started$/i;

// Field names a "Respond to Webhook" node tends to put the answer in, in the
// order we'd rather find them. Anything else nested (n8n's own `[{json:{…}}]`
// wrapper, say) is searched afterwards.
const REPLY_KEYS = ['reply', 'output', 'message', 'text', 'answer', 'response', 'result'];

/**
 * n8n nodes are free to name the answer field, so accept the shapes a
 * "Respond to Webhook" node usually produces rather than one exact key:
 * a bare string, `{reply}`/`{output}`/…, or those wrapped in arrays/objects.
 */
function replyFrom(payload: unknown): string {
  if (typeof payload === 'string') {
    const text = payload.trim();
    return ACK.test(text) ? '' : text;
  }
  if (Array.isArray(payload)) return payload.map(replyFrom).find(Boolean) ?? '';
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;

    // A known answer field, held directly on this object.
    for (const key of REPLY_KEYS) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim() && !ACK.test(value.trim())) return value.trim();
    }

    // Otherwise descend through every nested value, whatever its key is.
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        const nested = replyFrom(value);
        if (nested) return nested;
      }
    }
  }
  return '';
}

export function ChatWidget() {
  const { user } = useAuth();
  const { width, height } = useWindowDimensions();
  const isNarrow = width < 480;

  const isStaff = user?.role === 'staff' || user?.role === 'admin';

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [welcomeMessage(isStaff)]);

  const scrollRef = useRef<ScrollView>(null);
  // One id per browser session, so the flow can keep conversation context.
  const sessionRef = useRef(newId());

  useEffect(() => {
    if (open) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, open, sending]);

  // Start over. The session id changes too, so the flow's memory does not carry
  // the old conversation into the new one — otherwise it still believes it has
  // already raised a ticket and will not raise another.
  const reset = useCallback(() => {
    if (sending) return;
    sessionRef.current = newId();
    setInput('');
    setMessages([welcomeMessage(isStaff)]);
  }, [sending, isStaff]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setMessages(prev => [...prev, { id: newId(), role: 'user', text }]);
    setSending(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPLY_TIMEOUT_MS);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          sessionId: sessionRef.current,
          userId: user?.id ?? null,
          email: user?.email ?? null,
          name: user?.name ?? null,
          // Which support desk this belongs to. Staff and admin report faults
          // in the system; clients ask about their own documents. The flow
          // routes the ticket on this, so it decides which Slack channel and
          // which set of procedures the assistant may read from.
          role: user?.role ?? 'client',
          sentAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = await res.text();
      let reply = '';
      try {
        reply = replyFrom(JSON.parse(raw));
      } catch {
        reply = raw.trim();   // flow answered with plain text
      }

      setMessages(prev => [...prev, {
        id: newId(),
        role: 'bot',
        // No reply means the n8n Webhook node is set to "Respond immediately";
        // the message did arrive, there just isn't an answer to show.
        text: reply || 'Got it — your message was sent.',
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'bot',
        text: "Sorry — I couldn't reach the assistant. Please try again.",
      }]);
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
  }, [input, sending, user?.id, user?.email, user?.name]);

  // Enter sends, Shift+Enter makes a new line (web only — keyPress has no
  // modifier info on native).
  const onKeyPress = (e: any) => {
    if (Platform.OS !== 'web') return;
    if (e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
      e.preventDefault?.();
      send();
    }
  };

  const panelHeight = Math.min(520, height - 140);

  return (
    <>
      {open && (
        <View
          style={[
            s.panel,
            isNarrow
              ? { left: 12, right: 12, bottom: 88, height: panelHeight }
              : { right: 24, bottom: 96, width: 360, height: panelHeight },
          ]}
        >
          <LinearGradient
            colors={['#3A3131', '#2C2320']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.header}
          >
            <View style={s.headerIcon}>
              <Ionicons name="chatbubble-ellipses" size={16} color="#3A3131" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>{isStaff ? 'Support' : 'Assistant'}</Text>
              <Text style={s.headerSub}>Typically replies in a moment</Text>
            </View>
            <TouchableOpacity
              onPress={reset}
              style={s.headerBtn}
              disabled={sending}
              accessibilityLabel="Start a new conversation"
            >
              <Ionicons name="refresh" size={17} color={sending ? '#6B5E52' : '#A89880'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpen(false)} style={s.headerBtn} accessibilityLabel="Close chat">
              <Ionicons name="close" size={18} color="#A89880" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView
            ref={scrollRef}
            style={s.log}
            contentContainerStyle={s.logContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map(m => (
              <View key={m.id} style={[s.bubbleRow, m.role === 'user' && s.bubbleRowUser]}>
                <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleBot]}>
                  {renderText(
                    m.text,
                    [s.bubbleText, m.role === 'user' && s.bubbleTextUser],
                    s.bubbleBold,
                  )}
                </View>
              </View>
            ))}
            {sending && (
              <View style={s.bubbleRow}>
                <View style={[s.bubble, s.bubbleBot, s.typing]}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={s.typingText}>Typing…</Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              onKeyPress={onKeyPress}
              onSubmitEditing={send}
              placeholder="Type a message…"
              placeholderTextColor={Colors.textMuted}
              multiline
              blurOnSubmit={false}
              editable={!sending}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnOff]}
              onPress={send}
              disabled={!input.trim() || sending}
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={16} color={!input.trim() || sending ? Colors.textMuted : '#3A3131'} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom-right. On narrow screens it rides above the floating pill tab
          bar, which is ~64px tall plus the safe-area inset, instead of over it. */}
      <TouchableOpacity
        style={[s.fab, isNarrow ? { right: 16, bottom: 96 } : { right: 24, bottom: 24 }]}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.85}
        accessibilityLabel={open ? 'Close chat' : 'Open chat'}
      >
        <LinearGradient
          colors={['#E8B923', '#B5905B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.fabInner}
        >
          <Ionicons name={open ? 'close' : 'chatbubble-ellipses'} size={24} color="#3A3131" />
        </LinearGradient>
      </TouchableOpacity>
    </>
  );
}

const shadow = Platform.select({
  web: { boxShadow: '0 12px 32px rgba(28,23,19,0.22)' } as any,
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
});

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    zIndex: 1000,
    ...shadow,
  },
  fabInner: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  panel: {
    position: 'absolute',
    zIndex: 1000,
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...shadow,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  headerSub: { color: '#A89880', fontSize: 11, marginTop: 1 },
  headerBtn: { padding: 4 },

  log: { flex: 1, backgroundColor: Colors.bgDeep },
  logContent: { padding: 12, gap: 8 },

  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  bubbleBot: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderTopRightRadius: 4,
  },
  bubbleText: { fontSize: 13, lineHeight: 19, color: Colors.textPrimary },
  bubbleTextUser: { color: '#3A3131', fontWeight: '500' },
  bubbleBold: { fontWeight: '700' },

  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 12, color: Colors.textMuted },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.bgCard,
  },
  input: {
    flex: 1,
    maxHeight: 96,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.bgMid,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: 13,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null),
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: Colors.borderLight },
});
