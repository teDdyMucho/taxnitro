import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, Image, Dimensions, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { DashboardScreen } from '../screens/main/DashboardScreen';
import { DocumentsScreen } from '../screens/main/DocumentsScreen';
import { NotificationsScreen } from '../screens/main/NotificationsScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
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
  const isDesktop = width >= 768;

  const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

  // ── Mobile web: bottom tab bar (same as native app) ──────────────────────────
  if (!isDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDeep }}>
        {/* Screen content */}
        <View style={{ flex: 1 }}>{renderScreen()}</View>

        {/* Bottom tab bar */}
        <View style={mob.tabBar}>
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
                    color={isActive ? Colors.tabActive : Colors.tabInactive}
                  />
                  {item.name === 'Notifications' && unreadCount > 0 && (
                    <View style={tabStyles.badge}>
                      <Text style={tabStyles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[mob.tabLabel, isActive && mob.tabLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // ── Desktop web: sidebar layout ───────────────────────────────────────────────
  return (
    <View style={web.root}>
      <View style={web.sidebar}>
        <View style={web.logoWrap}>
          <LinearGradient colors={[Colors.primary, Colors.accent]} style={web.logoIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={web.logoEmoji}>⚡</Text>
          </LinearGradient>
          <View>
            <Text style={web.logoName}>Finance</Text>
            <Text style={web.logoSub}>Therapy Group</Text>
          </View>
        </View>

        <View style={web.divider} />

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
                  <Ionicons name={isActive ? item.active : item.inactive} size={18} color={isActive ? Colors.primary : Colors.textMuted} />
                  {item.name === 'Notifications' && unreadCount > 0 && (
                    <View style={web.navBadge}><Text style={web.navBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>
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

        <View style={web.sidebarUser}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={web.sidebarAvatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.accent]} style={web.sidebarAvatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={web.sidebarAvatarText}>{mkInitials(user?.name ?? 'U')}</Text>
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={web.sidebarUserName} numberOfLines={1}>{user?.name ?? 'User'}</Text>
            <Text style={web.sidebarUserEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
          <TouchableOpacity onPress={onLogout} style={web.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={web.content}>{renderScreen()}</View>
    </View>
  );
}

// ── Mobile bottom tab layout ──────────────────────────────────────────────────

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
          backgroundColor: Colors.bgDark,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          elevation: 20,
          shadowColor: Colors.black,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
        },
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
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
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDeep, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 14 }}>Loading…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    if (authView === 'login') {
      return <LoginScreen onLoginSuccess={() => {}} onNavigateRegister={() => setAuthView('register')} />;
    }
    return <RegisterScreen onRegisterSuccess={() => setAuthView('login')} onNavigateLogin={() => setAuthView('login')} />;
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

const web = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.bgDeep,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: Colors.bgDark,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingVertical: 24,
    paddingHorizontal: 16,
    flexDirection: 'column',
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
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
  logoName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800', lineHeight: 18 },
  logoSub:  { color: Colors.textMuted,   fontSize: 11, fontWeight: '500' },
  divider:  { height: 1, backgroundColor: Colors.border, marginVertical: 16 },
  navList:  { gap: 4 },
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
    backgroundColor: 'rgba(37,99,235,0.12)',
  },
  navActiveBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    backgroundColor: Colors.primary,
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
    backgroundColor: 'rgba(37,99,235,0.15)',
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
  navBadgeText:  { color: Colors.white, fontSize: 8, fontWeight: '800' },
  navLabel:      { color: Colors.textMuted,   fontSize: 14, fontWeight: '500', flex: 1 },
  navLabelActive:{ color: Colors.textPrimary, fontWeight: '700' },
  navPill: {
    backgroundColor: Colors.error,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  navPillText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  sidebarUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  sidebarAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarAvatarText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  sidebarUserName:  { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  sidebarUserEmail: { color: Colors.textMuted,   fontSize: 11 },
  logoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgMid,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
    overflow: 'hidden' as any,
  },
});

const mob = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgDark,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 60,
    paddingBottom: 6,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.tabInactive,
  },
  tabLabelActive: {
    color: Colors.tabActive,
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
    borderColor: Colors.bgDark,
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
});
