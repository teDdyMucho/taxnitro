import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image,
  Platform, ActivityIndicator, Linking, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { listHowTos, type HowTo, type HowToAudience } from '../../db/sops';

// How-to: the procedures the help chat answers from, to read here, each with
// its narrated video where there is one. Camaree: "can we have Ai generate how
// to text and videos for SOPs for the team".
//
// What each person may read is the database's call, not this screen's: a
// client gets the client ones, Team One theirs, staff all of them. Staff can
// switch between the three, to see what a client or Team One is told.

const AUDIENCES: { key: HowToAudience; label: string }[] = [
  { key: 'internal', label: 'For staff' },
  { key: 'client',   label: 'For clients' },
  { key: 'team_one', label: 'For Team One' },
];

// The order topics are listed in, and what each is called.
const TOPICS: [string, string][] = [
  ['account',      'Getting started and your account'],
  ['dashboard',    'Dashboard'],
  ['requirements', 'Monthly documents'],
  ['uploads',      'Uploading'],
  ['documents',    'Documents and files'],
  ['messages',     'Messages'],
  ['updates',      'Updates for FTG'],
  ['clients',      'Clients'],
  ['team-one',     'Team One'],
  ['tax-nitro',    'Tax Nitro'],
  ['billing',      'Invoices'],
  ['reports',      'Reports'],
  ['staff',        'Staff and roles'],
  ['help',         'Getting help'],
];
const topicLabel = (k: string | null) => TOPICS.find(t => t[0] === k)?.[1] ?? 'More';
const topicRank = (k: string | null) => {
  const i = TOPICS.findIndex(t => t[0] === k);
  return i < 0 ? TOPICS.length : i;
};

// Each video's still sits beside it, under the same name.
const posterOf = (url: string) => url.replace(/\.mp4(\?.*)?$/i, '.jpg');

/** **bold** inside a line, the way the procedures name buttons. */
function Inline({ text, style }: { text: string; style: any }) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return (
    <Text style={style}>
      {parts.map((p, i) => (i % 2 === 1 ? <Text key={i} style={st.bold}>{p}</Text> : p))}
    </Text>
  );
}

/** A procedure's Markdown: paragraphs, "- " bullets, "1. " steps, indented sub-points. */
function Body({ text }: { text: string }) {
  return (
    <View>
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <View key={i} style={{ height: 10 }} />;
        const sub = /^\s{2,}- (.*)$/.exec(line);
        const bullet = /^- (.*)$/.exec(line);
        const step = /^(\d+)\. (.*)$/.exec(line);
        const lead = sub ? '◦' : bullet ? '•' : step ? `${step[1]}.` : null;
        const words = sub?.[1] ?? bullet?.[1] ?? step?.[2] ?? line;
        if (!lead) return <Inline key={i} text={words} style={st.para} />;
        return (
          <View key={i} style={[st.item, !!sub && { paddingLeft: 24 }]}>
            <Text style={[st.lead, !!step && st.leadStep]}>{lead}</Text>
            <Inline text={words} style={[st.para, { flex: 1 }]} />
          </View>
        );
      })}
    </View>
  );
}

/** The narrated video: a plain <video> on the web, where everyone uses the app. */
function Video({ url }: { url: string }) {
  if (Platform.OS !== 'web') {
    return (
      <TouchableOpacity style={st.watchBtn} onPress={() => Linking.openURL(url)} activeOpacity={0.85}>
        <Ionicons name="play-circle" size={18} color={Colors.primaryDeep} />
        <Text style={st.watchText}>Watch the video</Text>
      </TouchableOpacity>
    );
  }
  return React.createElement('video', {
    src: url,
    poster: posterOf(url),
    controls: true,
    preload: 'metadata',
    playsInline: true,
    style: { width: '100%', aspectRatio: '16 / 9', borderRadius: 16, backgroundColor: '#1C1713', display: 'block', outline: 'none' },
  });
}

function Header({ title, sub, onBack, backLabel }: { title: string; sub: string; onBack?: () => void; backLabel?: string }) {
  return (
    <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.header}>
      <View style={st.decor} pointerEvents="none" />
      {onBack && (
        <TouchableOpacity style={st.back} onPress={onBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
          <Text style={st.backText}>{backLabel ?? 'Back'}</Text>
        </TouchableOpacity>
      )}
      <Text style={st.headerTitle}>{title}</Text>
      <Text style={st.headerSub}>{sub}</Text>
    </LinearGradient>
  );
}

export function HowToScreen({ onBack }: {
  /** Shown where the page was opened from somewhere else, such as Profile on a phone. */
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isStaff = user?.role === 'staff' || user?.role === 'admin';
  const own: HowToAudience = isStaff ? 'internal' : user?.role === 'team_one' ? 'team_one' : 'client';

  const [items, setItems] = useState<HowTo[] | null>(null);
  const [audience, setAudience] = useState<HowToAudience>(own);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<HowTo | null>(null);

  useEffect(() => {
    let live = true;
    listHowTos().then(r => { if (live) setItems(r); });
    return () => { live = false; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (h: HowTo) => !q || h.title.toLowerCase().includes(q) || h.body.toLowerCase().includes(q)
      || h.tags.some(t => t.toLowerCase().includes(q));
    return (items ?? [])
      .filter(h => h.audience === audience && hit(h))
      .sort((a, b) => topicRank(a.category) - topicRank(b.category) || a.title.localeCompare(b.title));
  }, [items, audience, query]);

  const videos = shown.filter(h => h.video_url);
  const groups = useMemo(() => {
    const m = new Map<string, HowTo[]>();
    shown.forEach(h => m.set(topicLabel(h.category), [...(m.get(topicLabel(h.category)) ?? []), h]));
    return [...m.entries()];
  }, [shown]);
  const cardWidth = width >= 1280 ? '31.5%' : width >= 760 ? '48%' : '100%';

  // ── One how-to ──
  if (open) {
    return (
      <View style={st.root}>
        <Header title={open.title} sub={topicLabel(open.category)} onBack={() => setOpen(null)} backLabel="All how-tos" />
        <ScrollView contentContainerStyle={st.scroll}>
          <View style={[st.page, { maxWidth: 900 }]}>
            {!!open.video_url && <View style={st.videoWrap}><Video url={open.video_url} /></View>}
            <View style={st.card}>
              <View style={st.bodyPad}><Body text={open.body} /></View>
            </View>
            <Text style={st.foot}>Still stuck? Ask the assistant: the gold chat button at the bottom right.</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── All of them ──
  return (
    <View style={st.root}>
      <Header title="How-to" sub="Step-by-step guides, and short videos of each one." onBack={onBack} backLabel="Profile" />
      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
        <View style={st.page}>
          {isStaff && (
            <View style={st.chips}>
              {AUDIENCES.map(a => {
                const on = a.key === audience;
                const n = (items ?? []).filter(h => h.audience === a.key).length;
                return (
                  <TouchableOpacity key={a.key} style={[st.chip, on && st.chipOn]} onPress={() => setAudience(a.key)} activeOpacity={0.8}>
                    <Text style={[st.chipText, on && st.chipTextOn]}>{a.label}</Text>
                    <Text style={[st.chipCount, on && st.chipCountOn]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={st.search}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search how-tos…"
              placeholderTextColor={Colors.textMuted}
              style={[st.searchInput, { outlineWidth: 0 } as any]}
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {items === null ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
          ) : shown.length === 0 ? (
            <Text style={st.empty}>
              {query ? 'Nothing matches that. Try other words, or ask the assistant.' : 'No how-tos here yet.'}
            </Text>
          ) : (
            <>
              {videos.length > 0 && (
                <>
                  <Text style={st.section}>VIDEOS</Text>
                  <View style={st.grid}>
                    {videos.map(h => (
                      <TouchableOpacity key={h.slug} style={[st.videoCard, { width: cardWidth as any }]} onPress={() => setOpen(h)} activeOpacity={0.85}>
                        <View style={st.poster}>
                          <Image source={{ uri: posterOf(h.video_url!) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          <View style={st.play}><Ionicons name="play" size={18} color={Colors.primaryDeep} /></View>
                        </View>
                        <Text style={st.videoTitle} numberOfLines={2}>{h.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {groups.map(([topic, list]) => (
                <View key={topic}>
                  <Text style={st.section}>{topic.toUpperCase()}</Text>
                  <View style={st.card}>
                    {list.map((h, i) => (
                      <TouchableOpacity
                        key={h.slug}
                        style={[st.row, i < list.length - 1 && st.rowLine]}
                        onPress={() => setOpen(h)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={h.video_url ? 'play-circle-outline' : 'document-text-outline'}
                          size={18}
                          color={h.video_url ? Colors.primary : Colors.textMuted}
                        />
                        <Text style={st.rowTitle}>{h.title}</Text>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bgDeep },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, overflow: 'hidden', position: 'relative', gap: 4 },
  decor:  { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(232,185,35,0.06)', top: -70, right: -40 } as any,
  back:   { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 8 },
  backText:    { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.65)', fontSize: 13 },

  scroll: { paddingBottom: 110 },
  page:   { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16 },

  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  chipOn:      { backgroundColor: Colors.primaryDeep, borderColor: Colors.primaryDeep },
  chipText:    { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextOn:  { color: '#FFFFFF' },
  chipCount:   { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipCountOn: { color: Colors.primary },

  search:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  empty:       { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  section: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 22, marginBottom: 10 },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  videoCard:  { backgroundColor: Colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  poster:     { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#2C2320', alignItems: 'center', justifyContent: 'center' },
  // In a corner, so it does not cover the title on the video's opening card.
  play:       { position: 'absolute', left: 12, bottom: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  videoTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', padding: 12, lineHeight: 19 },

  card:     { backgroundColor: Colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLine:  { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowTitle: { flex: 1, color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },

  videoWrap: { marginBottom: 16 },
  bodyPad:   { padding: 20 },
  para:      { color: Colors.textPrimary, fontSize: 15, lineHeight: 23 },
  bold:      { fontWeight: '800' },
  item:      { flexDirection: 'row', gap: 10, marginBottom: 6 },
  lead:      { color: Colors.primaryDark, fontSize: 15, lineHeight: 23, fontWeight: '800', minWidth: 12 },
  leadStep:  { minWidth: 20 },
  foot:      { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 18 },

  watchBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: Colors.primary },
  watchText: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '800' },
});
