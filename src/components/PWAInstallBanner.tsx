import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { nativeDriver } from '../constants/platform';

export function PWAInstallBanner() {
  const [show, setShow]           = useState(false);
  const [installed, setInstalled] = useState(false);
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onAvailable = () => {
      setShow(true);
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 0, duration: 380, useNativeDriver: nativeDriver }),
        Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: nativeDriver }),
      ]).start();
    };

    const onInstalled = () => {
      setInstalled(true);
      dismiss();
    };

    window.addEventListener('pwaInstallAvailable', onAvailable);
    window.addEventListener('pwaInstalled',        onInstalled);
    return () => {
      window.removeEventListener('pwaInstallAvailable', onAvailable);
      window.removeEventListener('pwaInstalled',        onInstalled);
    };
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideY,  { toValue: 80, duration: 280, useNativeDriver: nativeDriver }),
      Animated.timing(opacity, { toValue: 0,  duration: 280, useNativeDriver: nativeDriver }),
    ]).start(() => setShow(false));
  };

  const install = async () => {
    const fn = (window as any).__pwaInstallPrompt;
    if (!fn) return;
    const accepted = await fn();
    if (accepted) dismiss();
  };

  if (!show || installed) return null;

  return (
    <Animated.View style={[s.banner, { transform: [{ translateY: slideY }], opacity }]}>
      <View style={s.iconWrap}>
        <Ionicons name="phone-portrait-outline" size={22} color="#E8B923" />
      </View>
      <View style={s.text}>
        <Text style={s.title}>Install FTG App</Text>
        <Text style={s.sub}>Add to home screen for quick access</Text>
      </View>
      <TouchableOpacity style={s.installBtn} onPress={install} activeOpacity={0.85}>
        <Text style={s.installText}>Install</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.closeBtn} onPress={dismiss} activeOpacity={0.7}>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute' as any,
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: '#3A3131',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 999,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(232,185,35,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  text: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sub:   { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  installBtn: {
    backgroundColor: '#E8B923',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  installText: { color: '#3A3131', fontSize: 13, fontWeight: '800' },
  closeBtn: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
});
