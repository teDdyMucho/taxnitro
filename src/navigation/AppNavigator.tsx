import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, Image, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { LandingScreen } from '../screens/auth/LandingScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { DashboardScreen } from '../screens/main/DashboardScreen';
import { DocumentsScreen } from '../screens/main/DocumentsScreen';
import { NotificationsScreen } from '../screens/main/NotificationsScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { UEDashboardScreen } from '../screens/admin/UEDashboardScreen';
import { dashboardForClient } from '../lib/clientDashboards';
import { AdminNavigator } from './AdminNavigator';
import { getUnreadCount } from '../db/notifications';
import { ClientUploadModal } from '../components/ClientUploadModal';
import { MonthlyQuestionnaireModal } from '../components/MonthlyQuestionnaireModal';
import { isQuestionnaireDone } from '../db/questionnaire';
import { monthOf } from '../db/requirements';
import { IDLE_TIMEOUT_MS } from '../hooks/useIdleLogout';

export type MainTabParamList = {
  Dashboard: undefined;
  Documents: undefined;
  Notifications: undefined;
  Profile: undefined;
};

type TabName = keyof MainTabParamList;

const MainTab = createBottomTabNavigator<MainTabParamList>();

const NAV_ITEMS: { name: TabName; label: string; active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'Dashboard',     label: 'Dashboard',      active: 'grid',          inactive: 'grid-outline' },
  { name: 'Documents',     label: 'Documents',      active: 'folder',        inactive: 'folder-outline' },
  { name: 'Notifications', label: 'Notifications',  active: 'notifications', inactive: 'notifications-outline' },
  { name: 'Profile',       label: 'Profile',        active: 'person',        inactive: 'person-outline' },
];

// ── Web layout (responsive: sidebar on desktop, bottom tabs on mobile) ─────────

function WebLayout({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= 1024;

  const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Opened from the client's own profile, and closed by the screen's back button.
  const [showDashboard, setShowDashboard] = useState(false);

  // ── The monthly questionnaire ──────────────────────────────────────────────
  // Bookkeeping and CFO clients answer a short set of questions before they
  // start uploading for the month; it tells us what to look for in their books.
  // Tax-only clients are not asked.
  const month = monthOf();
  const asksQuestionnaire = (user?.services ?? []).some(sv => sv === 'BK' || sv === 'CFO');
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  // null while unknown — the gate must not fire on a guess.
  const [questionnaireDone, setQuestionnaireDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.email || !asksQuestionnaire) { setQuestionnaireDone(true); return; }
    let live = true;
    isQuestionnaireDone(user.email, month).then(done => { if (live) setQuestionnaireDone(done); });
    return () => { live = false; };
  }, [user?.email, asksQuestionnaire, month]);

  // Asking comes first, but only once we know the answer — an unread state
  // must not block someone who has already filled it in.
  const startUpload = () => {
    if (questionnaireDone === false) setQuestionnaireOpen(true);
    else setUploadOpen(true);
  };
  // Checked here as well as in the profile that offers it. Hiding the way in is
  // not the same as refusing to render: this screen holds one client's books, so
  // whether it draws at all is decided from who is signed in, not from state.
  const myDashboard = dashboardForClient(user);

  useEffect(() => {
    if (!user?.id) return;
    getUnreadCount(user.id).then(setUnreadCount);
    supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url); });

    const channel = supabase
      .channel(`badge_web:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnreadCount(c => c + 1))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => getUnreadCount(user.id).then(setUnreadCount))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const mkInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Leaving Profile closes the dashboard, so coming back lands on the profile
  // itself rather than wherever the last visit left off.
  const goTab = (name: TabName) => { setActiveTab(name); setShowDashboard(false); };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Dashboard':     return <DashboardScreen />;
      case 'Documents':     return <DocumentsScreen />;
      case 'Notifications': return <NotificationsScreen />;
      case 'Profile':
        // The client's own report — without the internal working tabs.
        if (showDashboard && myDashboard) {
          return <UEDashboardScreen onBack={() => setShowDashboard(false)} backLabel="Back to Profile" />;
        }
        return <ProfileScreen onLogout={onLogout} onOpenDashboard={() => setShowDashboard(true)} />;
    }
  };

  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';

  // ── Mobile web: floating pill bottom tab bar ──────────────────────────────────
  if (!isDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDeep }}>
        {/* Screen content */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>{renderScreen()}</View>
        </View>

        {/* Floating pill tab bar */}
        <View style={[mob.pillOuter, { paddingBottom: insets.bottom + 8 }]}>
          <View style={mob.pillInner}>
            {NAV_ITEMS.map(item => {
              const isActive = activeTab === item.name;
              return (
                <TouchableOpacity
                  key={item.name}
                  style={mob.tabItem}
                  onPress={() => goTab(item.name)}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons
                      name={isActive ? item.active : item.inactive}
                      size={22}
                      color={isActive ? '#E8B923' : '#A89880'}
                    />
                    {item.name === 'Notifications' && unreadCount > 0 && (
                      <View style={tabStyles.badge}>
                        <Text style={tabStyles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[mob.tabLabel, isActive && mob.tabLabelActive]}>{item.label}</Text>
                  {isActive && <View style={mob.activeDot} />}
                </TouchableOpacity>
              );
            })}
            {/* Upload action */}
            <TouchableOpacity style={mob.tabItem} onPress={startUpload} activeOpacity={0.7}>
              <Ionicons name="cloud-upload-outline" size={22} color="#E8B923" />
              <Text style={[mob.tabLabel, { color: '#E8B923' }]}>Upload</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ClientUploadModal visible={uploadOpen} onClose={() => setUploadOpen(false)} />
      <MonthlyQuestionnaireModal
        visible={questionnaireOpen}
        month={month}
        onClose={() => setQuestionnaireOpen(false)}
        onSubmitted={() => { setQuestionnaireDone(true); setUploadOpen(true); }}
      />
      </View>
    );
  }

  // ── Desktop web: premium dark sidebar layout ──────────────────────────────────
  return (
    <View style={web.root}>
      <View style={web.sidebar}>
        {/* Logo area */}
        <View style={web.logoWrap}>
          <Image source={require('../../assets/main-logo.png')} style={{ width: 140, height: 56 }} resizeMode="contain" />
        </View>

        {/* Portal label — only for staff/admin */}
        {isStaffOrAdmin && (
          <View style={web.portalLabelWrap}>
            <Text style={web.portalLabel}>
              {user?.role === 'admin' ? 'ADMIN PORTAL' : 'CLIENT PORTAL'}
            </Text>
          </View>
        )}

        <View style={web.divider} />

        {/* Nav items */}
        <View style={web.navList}>
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.name;
            return (
              <TouchableOpacity
                key={item.name}
                style={[web.navItem, isActive && web.navItemActive]}
                onPress={() => goTab(item.name)}
                activeOpacity={0.8}
              >
                {isActive && <View style={web.navActiveBar} />}
                <View style={[web.navIconWrap, isActive && web.navIconWrapActive]}>
                  <Ionicons
                    name={isActive ? item.active : item.inactive}
                    size={18}
                    color={isActive ? '#E8B923' : '#A89880'}
                  />
                  {item.name === 'Notifications' && unreadCount > 0 && (
                    <View style={web.navBadge}>
                      <Text style={web.navBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[web.navLabel, isActive && web.navLabelActive]}>{item.label}</Text>
                {item.name === 'Notifications' && unreadCount > 0 && (
                  <View style={web.navPill}><Text style={web.navPillText}>{unreadCount}</Text></View>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Upload — the single client upload entry point */}
          <TouchableOpacity style={web.uploadBtn} onPress={startUpload} activeOpacity={0.85}>
            <Ionicons name="cloud-upload-outline" size={18} color="#3A3131" />
            <Text style={web.uploadBtnText}>Upload</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }} />
        <View style={web.divider} />

        {/* Bottom user section */}
        <View style={web.sidebarUser}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={web.sidebarAvatar} />
          ) : (
            <LinearGradient
              colors={['#E8B923', '#B5905B']}
              style={web.sidebarAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={web.sidebarAvatarText}>{mkInitials(user?.name ?? 'U')}</Text>
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={web.sidebarUserName} numberOfLines={1}>{user?.name ?? 'User'}</Text>
            <Text style={web.sidebarUserEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowLogoutModal(true)} style={web.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color='#A89880' />
          </TouchableOpacity>
        </View>
      </View>

      <View style={web.content}>
        <View style={{ flex: 1 }}>{renderScreen()}</View>
      </View>

      {/* Logout Confirmation Modal */}
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

      <ClientUploadModal visible={uploadOpen} onClose={() => setUploadOpen(false)} />
      <MonthlyQuestionnaireModal
        visible={questionnaireOpen}
        month={month}
        onClose={() => setQuestionnaireOpen(false)}
        onSubmitted={() => { setQuestionnaireDone(true); setUploadOpen(true); }}
      />
    </View>
  );
}

// ── Mobile bottom tab layout (native React Navigation) ───────────────────────

function MobileTabs({ onLogout }: { onLogout: () => void }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getUnreadCount(user.id).then(setUnreadCount);

    const channel = supabase
      .channel(`badge:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnreadCount(c => c + 1))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => getUnreadCount(user.id).then(setUnreadCount))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 12,
          height: 65 + insets.bottom,
          borderRadius: 28,
          marginHorizontal: 16,
          marginBottom: insets.bottom > 0 ? 8 : 0,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#E8B923',
        tabBarInactiveTintColor: '#A89880',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ color, focused, size }) => {
          const item = NAV_ITEMS.find(i => i.name === route.name);
          if (!item) return null;
          return (
            <View style={{ position: 'relative' }}>
              <Ionicons name={focused ? item.active : item.inactive} size={size} color={color} />
              {route.name === 'Notifications' && unreadCount > 0 && (
                <View style={tabStyles.badge}>
                  <Text style={tabStyles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
          );
        },
      })}
    >
      <MainTab.Screen name="Dashboard" component={DashboardScreen} />
      <MainTab.Screen name="Documents" component={DocumentsScreen} />
      <MainTab.Screen name="Notifications" component={NotificationsScreen} />
      <MainTab.Screen name="Profile" options={{ tabBarLabel: 'Profile' }}>
        {() => <ProfileScreen onLogout={onLogout} />}
      </MainTab.Screen>
    </MainTab.Navigator>
  );
}

// ── App Navigator ─────────────────────────────────────────────────────────────

// ── Idle sign-out notice ─────────────────────────────────────────────────────
// Shown over the signed-out screen so an unexplained return to the landing page
// reads as a security measure rather than a bug.

function IdleSignOutModal({ onDismiss }: { onDismiss: () => void }) {
  const minutes = Math.round(IDLE_TIMEOUT_MS / 60000);
  return (
    <View style={idle.overlay}>
      <View style={idle.card}>
        <LinearGradient
          colors={['rgba(232,185,35,0.18)', 'rgba(181,144,91,0.10)']}
          style={idle.iconWrap}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="lock-closed-outline" size={28} color="#E8B923" />
        </LinearGradient>

        <Text style={idle.title}>Signed out for your security</Text>
        <Text style={idle.sub}>
          There was no activity for {minutes} minutes, so we ended the session to keep
          your financial documents private.
        </Text>

        <View style={idle.divider} />

        <View style={idle.list}>
          <View style={idle.listRow}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#B5905B" />
            <Text style={idle.listText}>
              This protects your documents on shared or unattended devices.
            </Text>
          </View>
          <View style={idle.listRow}>
            <Ionicons name="checkmark-circle-outline" size={15} color="#B5905B" />
            <Text style={idle.listText}>
              Nothing was lost — anything you already uploaded is saved.
            </Text>
          </View>
          <View style={idle.listRow}>
            <Ionicons name="time-outline" size={15} color="#B5905B" />
            <Text style={idle.listText}>
              Sign in again to pick up where you left off.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={idle.btn} onPress={onDismiss} activeOpacity={0.85}>
          <Ionicons name="log-in-outline" size={16} color="#3A3131" />
          <Text style={idle.btnText}>Sign in again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const idle = StyleSheet.create({
  overlay: {
    position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(20,16,13,0.72)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24, zIndex: 1000,
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
    width: '100%', maxWidth: 380, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#E8E0D0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28, shadowRadius: 30, elevation: 18,
  },
  iconWrap: {
    width: 68, height: 68, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  title: { color: '#1C1713', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#6B5E52', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#E8E0D0', width: '100%', marginVertical: 6 },
  list: { gap: 9, width: '100%' },
  listRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  listText: { flex: 1, color: '#6B5E52', fontSize: 12.5, lineHeight: 18 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14,
    width: '100%', marginTop: 8,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32, shadowRadius: 10, elevation: 5,
  },
  btnText: { color: '#3A3131', fontWeight: '800', fontSize: 14 },
});

export function AppNavigator() {
  const { isAuthenticated, isLoading, logout, user, signOutReason, clearSignOutReason } = useAuth();
  const [authView, setAuthView] = useState<'landing' | 'login' | 'register'>(
    Platform.OS === 'web' ? 'landing' : 'login'
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDeep, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 14 }}>Loading…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    // Dismissing goes straight to the sign-in form — that is what they need next.
    const notice = signOutReason === 'idle' ? (
      <IdleSignOutModal onDismiss={() => { clearSignOutReason(); setAuthView('login'); }} />
    ) : null;

    if (authView === 'landing') {
      return (
        <View style={{ flex: 1 }}>
          <LandingScreen onGetStarted={() => setAuthView('login')} />
          {notice}
        </View>
      );
    }
    if (authView === 'login') {
      return (
        <View style={{ flex: 1 }}>
          <LoginScreen onLoginSuccess={() => {}} onNavigateRegister={() => setAuthView('register')} />
          {notice}
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <RegisterScreen onRegisterSuccess={() => setAuthView('login')} onNavigateLogin={() => setAuthView('login')} />
        {notice}
      </View>
    );
  }

  // Staff and admin get the admin portal
  if (user?.role === 'staff' || user?.role === 'admin') {
    return <AdminNavigator onLogout={logout} />;
  }

  if (Platform.OS === 'web') {
    return <WebLayout onLogout={logout} />;
  }

  return (
    <NavigationContainer>
      <MobileTabs onLogout={logout} />
    </NavigationContainer>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 240;

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

const web = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.bgDeep,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#3A3131',
    borderRightWidth: 0,
    paddingVertical: 24,
    paddingHorizontal: 16,
    flexDirection: 'column',
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 20 },
  logoName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  portalLabelWrap: {
    paddingHorizontal: 4,
    marginTop: 6,
    marginBottom: 4,
  },
  portalLabel: {
    color: '#E8B923',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 16,
  },
  navList: { gap: 2 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: 'rgba(232,185,35,0.15)',
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E8B923',
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  uploadBtnText: { color: '#3A3131', fontSize: 14, fontWeight: '800' },
  navActiveBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    backgroundColor: '#E8B923',
    borderRadius: 2,
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  navIconWrapActive: {
    backgroundColor: 'rgba(232,185,35,0.15)',
  },
  navBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  navBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
  navLabel: {
    color: '#A89880',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  navLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  navPill: {
    backgroundColor: Colors.error,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  navPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  sidebarUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
  },
  sidebarAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sidebarUserName:  { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  sidebarUserEmail: { color: '#A89880', fontSize: 11 },
  logoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
    overflow: 'hidden' as any,
  },
});

const mob = StyleSheet.create({
  // Floating pill container
  pillOuter: {
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  pillInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#A89880',
  },
  tabLabelActive: {
    color: '#E8B923',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8B923',
  },
});

const tabStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
});
