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
import { AdminNavigator } from './AdminNavigator';
import { getUnreadCount } from '../db/notifications';

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

  useEffect(() => {
    if (!user?.id) return;
    getUnreadCount(user.id).then(setUnreadCount);
    supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
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

  const renderScreen = () => {
    switch (activeTab) {
      case 'Dashboard':     return <DashboardScreen />;
      case 'Documents':     return <DocumentsScreen />;
      case 'Notifications': return <NotificationsScreen />;
      case 'Profile':       return <ProfileScreen onLogout={onLogout} />;
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
                  onPress={() => setActiveTab(item.name)}
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
          </View>
        </View>
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
                onPress={() => setActiveTab(item.name)}
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

export function AppNavigator() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
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
    if (authView === 'landing') {
      return <LandingScreen onGetStarted={() => setAuthView('login')} />;
    }
    if (authView === 'login') {
      return <LoginScreen onLoginSuccess={() => {}} onNavigateRegister={() => setAuthView('register')} />;
    }
    return <RegisterScreen onRegisterSuccess={() => setAuthView('login')} onNavigateLogin={() => setAuthView('login')} />;
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
