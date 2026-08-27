import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { getAllClients, type Profile } from '../../db/profiles';
import { dashboardForClient, type ClientDashboard } from '../../lib/clientDashboards';
import { ClientDashboardScreen } from './ClientDashboardScreen';

// Financial Reports — the clients whose dashboard has been built.
//
// A dashboard is made from a client's own workbook, so this lists whoever
// actually has one rather than every client on the books.
//
// The list shows even when only one client has a dashboard. Opening straight
// into it would save a tap, but this tab used to go directly to one client's
// report and that is the thing being fixed: the button leads to whoever has a
// dashboard, and you pick.

interface WithDashboard {
  client: Profile;
  dashboard: ClientDashboard;
}

const mkInitials = (name: string) =>
  (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

export function FinancialReportsScreen({ onBack }: { onBack?: () => void }) {
  const [rows, setRows] = useState<WithDashboard[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getAllClients().then(clients => {
      if (!live) return;
      const withDash = clients
        .map(client => ({ client, dashboard: dashboardForClient(client) }))
        .filter((r): r is WithDashboard => r.dashboard != null);
      setRows(withDash);
    });
    return () => { live = false; };
  }, []);

  if (rows == null) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const open = rows.find(r => r.client.id === openId);
  if (open) {
    // Staff and admin see the whole report, internal tabs included. Back always
    // returns to the list, because that is where it was opened from.
    return (
      <ClientDashboardScreen
        dashboard={open.dashboard}
        staffView
        onBack={() => setOpenId(null)}
        backLabel="Back to Financial Reports"
      />
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <Text style={s.title}>Financial Reports</Text>
        <Text style={s.sub}>
          Restated statements, the live forecast model and the monthly commentary,
          built from each client's own workbook. Pick a client to open theirs.
        </Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={s.body}>
        {rows.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="stats-chart-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No dashboards built yet</Text>
            <Text style={s.emptyText}>
              A dashboard is built from a client's own workbook. Once one is ready,
              name the client in lib/clientDashboards.ts and they appear here.
            </Text>
          </View>
        ) : (
          rows.map(({ client, dashboard }) => (
            <TouchableOpacity
              key={client.id}
              style={s.card}
              activeOpacity={0.85}
              onPress={() => setOpenId(client.id)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.cardName} numberOfLines={1}>{client.full_name || 'Client'}</Text>
                <Text style={s.cardMeta} numberOfLines={1}>{client.email}</Text>
                <View style={s.pill}>
                  <Ionicons name="stats-chart-outline" size={13} color={Colors.primaryDeep} />
                  <Text style={s.pillText}>{dashboard.label}</Text>
                </View>
              </View>

              {/*
                The client's own mark, running off the right edge and dissolving
                back into the card — the gradient is laid over it left to right,
                opaque where the text is and clear at the edge, so there is no
                line where one stops and the other starts.

                2G3B Eats has no mark in their workbook, so their row shows the
                same shape with their initials instead of an empty space.
              */}
              <View style={s.bleed} pointerEvents="none">
                {dashboard.cardLogo ? (
                  <Image source={dashboard.cardLogo} style={s.bleedImg} resizeMode="cover" />
                ) : (
                  <Text style={s.bleedInitials}>{mkInitials(client.full_name)}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgDeep },
  header: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 22 },
  title: { color: Colors.white, fontSize: 23, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, lineHeight: 19, marginTop: 6, maxWidth: 640 },
  body: { padding: 20, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, paddingLeft: 22, paddingVertical: 22, minHeight: 132,
    // The mark runs to the edge, so it is clipped to the rounded corners.
    overflow: 'hidden',
  },
  // Full height and hard against the right edge, so the mark bleeds off it.
  // Full height, hard against the right edge, and given the same proportions as
  // the image it holds — so the mark fills the row's height and is never cropped
  // at any screen width. The fade into the card is part of the image itself.
  bleed: {
    alignSelf: 'stretch', marginVertical: -22, marginLeft: 8,
    aspectRatio: 700 / 260,
    alignItems: 'center', justifyContent: 'center',
  },
  bleedImg: { width: '100%', height: '100%' },
  bleedInitials: { fontSize: 44, fontWeight: '800', color: Colors.border, letterSpacing: 2 },
  cardName: { fontSize: 15.5, fontWeight: '700', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: Colors.primary, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6,
    marginTop: 12,
  },
  pillText: { color: Colors.primaryDeep, fontSize: 11.5, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 420 },
});
