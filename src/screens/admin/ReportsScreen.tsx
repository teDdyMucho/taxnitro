import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';

// The FTG Financial Report Generator is a large self-contained HTML tool served
// as a static asset from /financial-report.html (see public/). It opens in a NEW
// browser tab/window so it has the full screen to work with (and this app stays open).
const REPORT_PATH = '/financial-report.html';

function reportUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${REPORT_PATH}`;
  }
  return REPORT_PATH;
}

function openReport() {
  const url = reportUrl();
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

export function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === 'web' ? 0 : insets.top;

  // Auto-open the report in a new tab the first time this screen is shown.
  const openedRef = useRef(false);
  useEffect(() => {
    if (!openedRef.current) { openedRef.current = true; openReport(); }
  }, []);

  return (
    <View style={[s.root, { paddingTop: pt }]}>
      {/* Header */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <View style={s.headerIconWrap}>
          <Ionicons name="analytics-outline" size={18} color="#E8B923" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Financial Reports</Text>
          <Text style={s.sub}>Generate monthly reports, financial models & CFO checkups</Text>
        </View>
      </LinearGradient>

      {/* Landing — opens in a new browser tab */}
      <View style={s.body}>
        <View style={s.iconCircle}>
          <Ionicons name="open-outline" size={40} color="#E8B923" />
        </View>
        <Text style={s.bodyTitle}>Report Generator opens in a new tab</Text>
        <Text style={s.bodySub}>
          The FTG Financial Report Generator runs in its own browser tab so it has the full
          screen to work with. If it didn't open (or you closed it), use the button below.
        </Text>
        <TouchableOpacity style={s.openBtn} onPress={openReport} activeOpacity={0.85}>
          <Ionicons name="open-outline" size={18} color="#3A3131" />
          <Text style={s.openBtnText}>Open Report Generator</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(232,185,35,0.15)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  sub:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 1 },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  iconCircle: { width: 88, height: 88, borderRadius: 28, backgroundColor: 'rgba(232,185,35,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(232,185,35,0.3)' },
  bodyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  bodySub:   { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 460 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    backgroundColor: '#E8B923', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  openBtnText: { color: '#3A3131', fontSize: 15, fontWeight: '800' },
});
