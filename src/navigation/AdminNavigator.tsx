import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { Profile } from '../db/profiles';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AdminDocumentsScreen } from '../screens/admin/AdminDocumentsScreen';
import { ClientListScreen } from '../screens/admin/ClientListScreen';
import { ClientDocumentsScreen } from '../screens/admin/ClientDocumentsScreen';
import { StaffManagementScreen } from '../screens/admin/StaffManagementScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { WorkflowDashboardScreen } from '../screens/admin/WorkflowDashboardScreen';
import { ReportsScreen } from '../screens/admin/ReportsScreen';
import { UEDashboardScreen } from '../screens/admin/UEDashboardScreen';

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminTab = 'Dashboard' | 'Documents' | 'Clients' | 'Staff' | 'Workflow' | 'Reports' | 'Profile';

interface NavItem {
  name: AdminTab;
  label: string;
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
  adminOnly?: boolean;
}

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', label: 'Dashboard', active: 'grid',          inactive: 'grid-outline' },
  { name: 'Documents', label: 'Documents', active: 'documents',     inactive: 'documents-outline' },
  { name: 'Clients',   label: 'Clients',   active: 'people',        inactive: 'people-outline' },
  { name: 'Staff',     label: 'Staff',     active: 'shield',        inactive: 'shield-outline', adminOnly: true },
  { name: 'Workflow',  label: 'Workflow',  active: 'git-branch',    inactive: 'git-branch-outline' },
  { name: 'Reports',   label: 'Financial Reports', active: 'analytics', inactive: 'analytics-outline' },
  { name: 'Profile',   label: 'Profile',   active: 'person',        inactive: 'person-outline' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkInitials(name: string) {
  return (name ?? 'S').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDEBAR_W       = 252;
const TAB_BAR_H       = 64;   // inner pill height (paddingVertical 10 + icon ~28 + label ~14 ≈ 64)
const TAB_CONTAINER_V = 8;    // extra vertical padding inside container

// ── Navigator ─────────────────────────────────────────────────────────────────

export function AdminNavigator({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isDesktop = width >= 1024;
  const isAdmin   = user?.role === 'admin';

  const [activeTab, setActiveTab]           = useState<AdminTab>('Dashboard');
  const [selectedClient, setSelectedClient] = useState<Profile | null>(null);
  // Set from the client's own page; cleared on the way back, which is what puts
  // that client back on screen.
  const [showDashboard, setShowDashboard] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const visibleItems = NAV_ITEMS.filter(i => !i.adminOnly || isAdmin);

  const handleTabPress = (name: AdminTab) => {
    setActiveTab(name);
    setSelectedClient(null);
    setShowDashboard(false);
  };

  const renderScreen = () => {
    if (activeTab === 'Clients' && selectedClient) {
      // Staff and admin see the whole report, internal tabs included.
      if (showDashboard) {
        return <UEDashboardScreen staffView onBack={() => setShowDashboard(false)} />;
      }
      return (
        <ClientDocumentsScreen
          client={selectedClient}
          onBack={() => setSelectedClient(null)}
          onOpenDashboard={() => setShowDashboard(true)}
        />
      );
    }
    switch (activeTab) {
      case 'Dashboard': return <AdminDashboardScreen onViewAllDocuments={() => setActiveTab('Documents')} />;
      case 'Documents': return <AdminDocumentsScreen />;
      case 'Clients':   return <ClientListScreen onSelectClient={c => { setSelectedClient(c); setShowDashboard(false); }} />;
      case 'Staff':     return <StaffManagementScreen />;
      case 'Workflow':  return <WorkflowDashboardScreen />;
      case 'Reports':   return <ReportsScreen onBack={() => handleTabPress('Dashboard')} />;
      case 'Profile':   return <ProfileScreen onLogout={onLogout} />;
    }
  };

  // ── Desktop layout ─────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={desk.root}>

        {/* ── Sidebar ── */}
        <View style={[
          desk.sidebar,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}>

          {/* Logo / branding (centered, enlarged) */}
          <View style={desk.logoArea}>
            <Image source={require('../../assets/main-logo.png')} style={{ width: 200, height: 88 }} resizeMode="contain" />
          </View>

          {/* Divider */}
          <View style={desk.divider} />

          {/* Section label */}
          <Text style={desk.sectionLabel}>NAVIGATION</Text>

          {/* Nav list */}
          <View style={desk.navList}>
            {visibleItems.map(item => {
              const isActive = activeTab === item.name;
              return (
                <TouchableOpacity
                  key={item.name}
                  style={[desk.navItem, isActive && desk.navItemActive]}
                  onPress={() => handleTabPress(item.name)}
                  activeOpacity={0.75}
                >
                  {/* Green left bar */}
                  {isActive && <View style={desk.navBar} />}

                  {/* Icon container */}
                  <View style={[desk.navIconWrap, isActive && desk.navIconWrapActive]}>
                    <Ionicons
                      name={isActive ? item.active : item.inactive}
                      size={17}
                      color={isActive ? '#E8B923' : '#A89880'}
                    />
                  </View>

                  {/* Label */}
                  <Text style={[desk.navLabel, isActive && desk.navLabelActive]}>
                    {item.label}
                  </Text>

                  {/* Active dot (right side) */}
                  {isActive && <View style={desk.navDot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flex: 1 }} />

          {/* Divider */}
          <View style={desk.divider} />

          {/* User card */}
          <View style={desk.userCard}>
            <LinearGradient
              colors={['#E8B923', '#B5905B']}
              style={desk.userAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={desk.userAvatarText}>{mkInitials(user?.name ?? 'S')}</Text>
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={desk.userName} numberOfLines={1}>{user?.name ?? 'Staff'}</Text>
              <Text style={desk.userEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowLogoutModal(true)} style={desk.logoutBtn} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={17} color="#A89880" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Main content ── */}
        <View style={desk.content}>
          <View style={{ flex: 1 }}>
            {renderScreen()}
          </View>
        </View>

        {/* ── Logout confirmation modal ── */}
        {showLogoutModal && (
          <View style={lo.overlay}>
            <View style={lo.card}>
              <LinearGradient colors={['rgba(232,185,35,0.15)', 'rgba(181,144,91,0.08)']} style={lo.iconWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name="log-out-outline" size={28} color="#E8B923" />
              </LinearGradient>
              <Text style={lo.title}>Sign Out</Text>
              <Text style={lo.sub}>Are you sure you want to sign out of your account?</Text>
              <View style={lo.row}>
                <TouchableOpacity style={lo.cancelBtn} onPress={() => setShowLogoutModal(false)}>
                  <Text style={lo.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={lo.signOutBtn} onPress={() => { setShowLogoutModal(false); onLogout(); }}>
                  <Ionicons name="log-out-outline" size={16} color="#3A3131" />
                  <Text style={lo.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── Mobile layout ───────────────────────────────────────────────────────────
  // Total nav height = pill + container padding + safe area bottom
  const navContainerPaddingBottom = insets.bottom + TAB_CONTAINER_V;
  const totalNavHeight = TAB_BAR_H + navContainerPaddingBottom + 16; // 16 = paddingTop of container

  return (
    <View style={mob.root}>

      {/* Screen content — paddingBottom so content clears the floating nav */}
      <View style={[mob.screenArea, { paddingBottom: totalNavHeight }]}>
        <View style={{ flex: 1 }}>
          {renderScreen()}
        </View>
      </View>

      {/* Floating pill nav container */}
      <View style={[
        mob.tabBarContainer,
        {
          paddingBottom: navContainerPaddingBottom,
          paddingHorizontal: 16,
        },
      ]}>
        <View style={mob.tabBar}>
          {visibleItems.map(item => {
            const isActive = activeTab === item.name;
            return (
              <TouchableOpacity
                key={item.name}
                style={mob.tabItem}
                onPress={() => handleTabPress(item.name)}
                activeOpacity={0.7}
              >
                {/* Icon */}
                <View style={[mob.tabIconWrap, isActive && mob.tabIconWrapActive]}>
                  <Ionicons
                    name={isActive ? item.active : item.inactive}
                    size={22}
                    color={isActive ? '#E8B923' : '#A89880'}
                  />
                </View>

                {/* Label */}
                <Text style={[mob.tabLabel, isActive && mob.tabLabelActive]}>
                  {item.label}
                </Text>

                {/* Active underline dot */}
                {isActive && <View style={mob.tabDot} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const lo = StyleSheet.create({
  overlay: { position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(28,23,19,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, width: 320, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E8E0D0', shadowColor: '#3A3131', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 12 },
  iconWrap: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { color: '#1C1713', fontSize: 20, fontWeight: '800' },
  sub: { color: '#A8998A', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 },
  cancelBtn: { flex: 1, backgroundColor: '#F5F0E8', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#E8E0D0' },
  cancelText: { color: '#6B5E52', fontWeight: '600', fontSize: 14 },
  signOutBtn: { flex: 1, backgroundColor: '#E8B923', borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  signOutText: { color: '#3A3131', fontWeight: '800', fontSize: 14 },
});

// ── Desktop ──

const desk = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#F8FAFC' },

  /* Sidebar */
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: '#3A3131',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    flexDirection: 'column',
  },

  /* Logo (centered) */
  logoArea: {
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, marginTop: 4,
  },
  logoIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  logoName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', lineHeight: 19 },
  logoSub:  { color: 'rgba(16,185,129,0.6)', fontSize: 11, fontWeight: '500', marginTop: 1 },

  /* Divider */
  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 14,
  },

  /* Section label */
  sectionLabel: {
    color: 'rgba(232,185,35,0.55)', fontSize: 10, fontWeight: '800',
    letterSpacing: 1.6, textTransform: 'uppercase',
    paddingHorizontal: 12, marginBottom: 8,
  },

  /* Nav list */
  navList: { gap: 3 },
  navItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, gap: 10,
    position: 'relative', overflow: 'hidden',
  },
  navItemActive: { backgroundColor: 'rgba(232,185,35,0.15)' },

  /* Left gold bar */
  navBar: {
    position: 'absolute', left: 0, top: 8, bottom: 8,
    width: 3, backgroundColor: '#E8B923', borderRadius: 2,
  },

  /* Icon wrap */
  navIconWrap: {
    width: 33, height: 33, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  navIconWrapActive: { backgroundColor: 'rgba(232,185,35,0.2)' },

  /* Label */
  navLabel:       { color: '#A89880', fontSize: 14, fontWeight: '500', flex: 1 },
  navLabelActive: { color: '#FFFFFF', fontWeight: '700' },

  /* Active dot on right */
  navDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8B923' },

  /* User card */
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4,
  },
  userAvatar: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  userName:  { color: '#F9FAFB', fontSize: 13, fontWeight: '700' },
  userEmail: { color: '#A89880', fontSize: 11 },
  logoutBtn: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  /* Content — fills the full remaining width next to the sidebar. */
  content: { flex: 1, backgroundColor: '#F8FAFC', overflow: 'hidden' as any },
});

// ── Mobile ──

const mob = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  /* Screen takes full space but with bottom padding to clear nav */
  screenArea: { flex: 1 },

  /* Floating pill container — absolutely positioned at bottom */
  tabBarContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingTop: 16,
    backgroundColor: 'transparent',
  },

  /* The pill itself */
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    flexDirection: 'row',
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },

  /* Each tab button */
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },

  /* Icon container */
  tabIconWrap: {
    width: 36, height: 30,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  tabIconWrapActive: { backgroundColor: 'rgba(232,185,35,0.15)' },

  /* Label */
  tabLabel:       { fontSize: 10, fontWeight: '600', color: '#A89880' },
  tabLabelActive: { color: '#E8B923', fontWeight: '800' },

  /* Gold underline dot for active tab */
  tabDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#E8B923',
    marginTop: 1,
  },
});
