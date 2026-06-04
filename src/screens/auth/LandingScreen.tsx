import { nativeDriver } from '../../constants/platform';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props { onGetStarted: () => void }

// ── Floating particles (fixed positions — no Math.random) ─────────────────────

const PARTICLES = [
  { id: 0, top: 8,  left: 14, size: 2.5, dur: 6000, del: 0,    op: 0.30 },
  { id: 1, top: 22, left: 72, size: 2.0, dur: 8000, del: 1200, op: 0.22 },
  { id: 2, top: 45, left: 88, size: 3.0, dur: 7000, del: 2400, op: 0.35 },
  { id: 3, top: 60, left: 24, size: 2.0, dur: 9000, del: 800,  op: 0.25 },
  { id: 4, top: 75, left: 56, size: 3.5, dur: 6500, del: 3000, op: 0.20 },
  { id: 5, top: 35, left: 42, size: 2.0, dur: 8500, del: 1600, op: 0.18 },
  { id: 6, top: 90, left: 80, size: 2.5, dur: 7500, del: 2000, op: 0.30 },
  { id: 7, top: 12, left: 60, size: 2.0, dur: 9500, del: 500,  op: 0.22 },
];

// ── 3D Tilt Card ──────────────────────────────────────────────────────────────

function TiltCard({
  children, style, maxTilt = 10,
}: { children: React.ReactNode; style?: any; maxTilt?: number }) {
  const rotX  = useRef(new Animated.Value(0)).current;
  const rotY  = useRef(new Animated.Value(0)).current;
  const scaleA = useRef(new Animated.Value(1)).current;

  const handleMove = (e: any) => {
    if (Platform.OS !== 'web') return;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    if (!rect) return;
    const tx = ((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)) * -maxTilt;
    const ty = ((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)) * maxTilt;
    Animated.parallel([
      Animated.spring(rotX, { toValue: tx, damping: 8,  stiffness: 220, useNativeDriver: nativeDriver }),
      Animated.spring(rotY, { toValue: ty, damping: 8,  stiffness: 220, useNativeDriver: nativeDriver }),
      Animated.spring(scaleA, { toValue: 1.04, damping: 12, stiffness: 200, useNativeDriver: nativeDriver }),
    ]).start();
  };

  const handleLeave = () => {
    Animated.parallel([
      Animated.spring(rotX, { toValue: 0, damping: 14, stiffness: 180, useNativeDriver: nativeDriver }),
      Animated.spring(rotY, { toValue: 0, damping: 14, stiffness: 180, useNativeDriver: nativeDriver }),
      Animated.spring(scaleA, { toValue: 1, damping: 14, stiffness: 180, useNativeDriver: nativeDriver }),
    ]).start();
  };

  const rx = rotX.interpolate({ inputRange: [-maxTilt, maxTilt], outputRange: [`-${maxTilt}deg`, `${maxTilt}deg`] });
  const ry = rotY.interpolate({ inputRange: [-maxTilt, maxTilt], outputRange: [`-${maxTilt}deg`, `${maxTilt}deg`] });

  return (
    <Animated.View
      style={[style, { transform: [{ perspective: 900 }, { rotateX: rx }, { rotateY: ry }, { scale: scaleA }] }]}
      {...(Platform.OS === 'web' ? { onMouseMove: handleMove, onMouseLeave: handleLeave } as any : {})}
    >
      {children}
    </Animated.View>
  );
}

// ── Section Reveal (IntersectionObserver) ─────────────────────────────────────

function useSectionReveal(opts?: { onVisible?: () => void }) {
  const ref = useRef<any>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const y       = useRef(new Animated.Value(70)).current;
  const rotX    = useRef(new Animated.Value(0)).current;   // 0 → 1 mapped to deg
  const onVisRef = useRef(opts?.onVisible);
  onVisRef.current = opts?.onVisible;

  const trigger = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }),
      Animated.spring(y,       { toValue: 0, damping: 22, stiffness: 75, useNativeDriver: nativeDriver }),
      Animated.spring(rotX,    { toValue: 1, damping: 24, stiffness: 70, useNativeDriver: nativeDriver }),
    ]).start(() => onVisRef.current?.());
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      opacity.setValue(1); y.setValue(0); rotX.setValue(1);
      onVisRef.current?.();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { trigger(); observer.disconnect(); } },
      { threshold: 0.08 }
    );
    if (ref.current) observer.observe(ref.current as Element);
    return () => observer.disconnect();
  }, []);

  const rotXDeg = rotX.interpolate({ inputRange: [0, 1], outputRange: ['22deg', '0deg'] });
  return { ref, opacity, y, rotXDeg };
}

// ── Feature Card ──────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc, opacity, ty }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string; desc: string;
  opacity: Animated.Value; ty: Animated.Value;
}) {
  return (
    <Animated.View style={[s.featureWrap, { opacity, transform: [{ translateY: ty }] }]}>
      <TiltCard style={{ flex: 1 }}>
        <View style={s.featureCard}>
          {/* animated gold top border */}
          <LinearGradient colors={['#E8B923', '#B5905B', 'transparent']} style={s.featureTopBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
          <LinearGradient colors={['rgba(232,185,35,0.09)', 'rgba(8,14,30,0.7)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <View style={s.featureContent}>
            <LinearGradient colors={['#E8B923', '#B5905B']} style={s.featureIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name={icon} size={20} color="#2C2320" />
            </LinearGradient>
            <Text style={s.featureTitle}>{title}</Text>
            <Text style={s.featureDesc}>{desc}</Text>
          </View>
        </View>
      </TiltCard>
    </Animated.View>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  { icon: 'document-text',    title: 'Document Hub',        desc: 'All your financial documents organized in one secure place. Access anytime, anywhere.' },
  { icon: 'shield-checkmark', title: 'Bank-Level Security', desc: '256-bit SSL encryption and MFA keep every file protected end-to-end.' },
  { icon: 'flash',            title: 'Real-time Sync',      desc: 'Instant updates across all devices. Never work with outdated files again.' },
  { icon: 'notifications',    title: 'Smart Alerts',        desc: 'Intelligent notifications for uploads, reviews, and all document activity.' },
  { icon: 'lock-closed',      title: 'Private & Compliant', desc: 'Full compliance with financial data regulations. Your data stays yours.' },
  { icon: 'people',           title: 'Team Access',         desc: 'Granular permission controls. Right access, right people, right time.' },
];

// ── Landing Screen ────────────────────────────────────────────────────────────

export function LandingScreen({ onGetStarted }: Props) {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;

  // ── Scroll tracking ──────────────────────────────────────────────────────
  const scrollY = useRef(new Animated.Value(0)).current;

  // ── Orbs ─────────────────────────────────────────────────────────────────
  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb3Y = useRef(new Animated.Value(0)).current;
  const orb1S = useRef(new Animated.Value(1)).current;
  const orb2S = useRef(new Animated.Value(1)).current;

  // ── Particles ─────────────────────────────────────────────────────────────
  const particleAnims = useRef(PARTICLES.map(() => new Animated.Value(0))).current;

  // ── Hero entrance ─────────────────────────────────────────────────────────
  const heroOp  = useRef(new Animated.Value(0)).current;
  const heroTY  = useRef(new Animated.Value(50)).current;
  const subOp   = useRef(new Animated.Value(0)).current;
  const subTY   = useRef(new Animated.Value(30)).current;
  const ctaOp   = useRef(new Animated.Value(0)).current;
  const cardOp  = useRef(new Animated.Value(0)).current;
  const cardTY  = useRef(new Animated.Value(50)).current;

  // ── Preview card continuous 3D sway ──────────────────────────────────────
  const swayY = useRef(new Animated.Value(-12)).current;
  const swayX = useRef(new Animated.Value(3)).current;

  // ── Scroll-driven parallax interpolations ────────────────────────────────
  const orb1ParallaxY   = scrollY.interpolate({ inputRange: [0, 1400], outputRange: [0, -320], extrapolate: 'clamp' });
  const orb2ParallaxY   = scrollY.interpolate({ inputRange: [0, 1400], outputRange: [0, -180], extrapolate: 'clamp' });
  const heroParallaxY   = scrollY.interpolate({ inputRange: [0, 700],  outputRange: [0, -100], extrapolate: 'clamp' });
  const heroParallaxOp  = scrollY.interpolate({ inputRange: [0, 500],  outputRange: [1, 0.15], extrapolate: 'clamp' });
  const scrollCardTilt  = scrollY.interpolate({ inputRange: [0, 600],  outputRange: [0, 18],   extrapolate: 'clamp' });
  const scrollBarParallax = scrollY.interpolate({ inputRange: [0, 800], outputRange: [0, -40],  extrapolate: 'clamp' });

  // ── Section IntersectionObserver reveals ─────────────────────────────────
  const featureAnims = useRef(FEATURES.map(() => ({
    opacity: new Animated.Value(0),
    y: new Animated.Value(50),
  }))).current;

  const featuresSection = useSectionReveal({
    onVisible: () => {
      Animated.sequence([
        Animated.delay(200),
        Animated.stagger(110, featureAnims.map(a =>
          Animated.parallel([
            Animated.timing(a.opacity, { toValue: 1, duration: 700, useNativeDriver: nativeDriver }),
            Animated.spring(a.y, { toValue: 0, damping: 18, stiffness: 80, useNativeDriver: nativeDriver }),
          ])
        )),
      ]).start();
    },
  });

  const statsSection = useSectionReveal();
  const ctaSection   = useSectionReveal();

  // ── Scroll down bounce indicator ─────────────────────────────────────────
  const bounceDot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Orb float + scale
    const float = (v: Animated.Value, r: number, dur: number, del: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: -r, duration: dur, delay: del, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        Animated.timing(v, { toValue: 0,  duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      ])).start();

    const pulse = (v: Animated.Value, to: number, dur: number, del: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: to, duration: dur, delay: del, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        Animated.timing(v, { toValue: 1,  duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      ])).start();

    float(orb1Y, 50, 9000, 0);
    float(orb2Y, 30, 12000, 4000);
    float(orb3Y, 20, 7500, 2000);
    pulse(orb1S, 1.22, 8000, 1000);
    pulse(orb2S, 1.14, 10000, 3000);

    // Particles
    PARTICLES.forEach((p, i) => float(particleAnims[i], 22, p.dur, p.del));

    // Preview card sway
    Animated.loop(Animated.sequence([
      Animated.timing(swayY, { toValue: 12,  duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      Animated.timing(swayY, { toValue: -12, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(swayX, { toValue: 9, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      Animated.timing(swayX, { toValue: 2, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
    ])).start();

    // Scroll down bounce
    Animated.loop(Animated.sequence([
      Animated.timing(bounceDot, { toValue: 10, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
      Animated.timing(bounceDot, { toValue: 0,  duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
    ])).start();

    // Hero entrance sequence — 800ms initial hold so page starts dark
    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(heroOp, { toValue: 1, duration: 1000, useNativeDriver: nativeDriver }),
        Animated.spring(heroTY, { toValue: 0, damping: 20, stiffness: 65, useNativeDriver: nativeDriver }),
      ]),
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(subOp, { toValue: 1, duration: 800, useNativeDriver: nativeDriver }),
        Animated.spring(subTY, { toValue: 0, damping: 20, stiffness: 65, useNativeDriver: nativeDriver }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(ctaOp,  { toValue: 1, duration: 700, useNativeDriver: nativeDriver }),
        Animated.timing(cardOp, { toValue: 1, duration: 900, useNativeDriver: nativeDriver }),
        Animated.spring(cardTY, { toValue: 0, damping: 18, stiffness: 60, useNativeDriver: nativeDriver }),
      ]),
    ]).start();
  }, []);

  // 3D preview card combined rotation
  const swayYInterp = swayY.interpolate({ inputRange: [-12, 12], outputRange: ['-12deg', '12deg'] });
  const swayXInterp = swayX.interpolate({ inputRange: [2, 9], outputRange: ['2deg', '9deg'] });
  const scrollTiltInterp = scrollCardTilt.interpolate({ inputRange: [0, 18], outputRange: ['0deg', '18deg'] });

  return (
    <View style={s.root}>
      {/* ── Background gradient ──────────────────────────────────────────── */}
      <LinearGradient
        colors={['#020817', '#0b1224', '#16090340', '#020817']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* ── CSS grid dot pattern (web only) ─────────────────────────────── */}
      {Platform.OS === 'web' && (
        <View style={{
          ...StyleSheet.absoluteFillObject,
          backgroundImage: 'radial-gradient(rgba(232,185,35,0.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        } as any} />
      )}

      {/* ── Depth orbs (parallax) ────────────────────────────────────────── */}
      <Animated.View style={[s.orb, s.orb1, {
        transform: [
          { translateY: Animated.add(orb1Y, orb1ParallaxY) },
          { scale: orb1S },
        ],
      }]} />
      <Animated.View style={[s.orb, s.orb2, {
        transform: [
          { translateY: Animated.add(orb2Y, orb2ParallaxY) },
          { scale: orb2S },
        ],
      }]} />
      <Animated.View style={[s.orb, s.orb3, { transform: [{ translateY: orb3Y }] }]} />

      {/* ── Floating particles ───────────────────────────────────────────── */}
      {PARTICLES.map((p, i) => (
        <Animated.View
          key={p.id}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: '#E8B923',
            top: `${p.top}%` as any,
            left: `${p.left}%` as any,
            opacity: p.op,
            transform: [{ translateY: particleAnims[i] }],
          }}
        />
      ))}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        {/* ── Navbar ──────────────────────────────────────────────────────── */}
        <View style={s.nav}>
          <Image source={require('../../../assets/main-logo.png')} style={{ width: 155, height: 50 }} resizeMode="contain" />
          <TouchableOpacity style={s.navBtn} onPress={onGetStarted} activeOpacity={0.85}>
            <Text style={s.navBtnText}>Sign In</Text>
            <Ionicons name="arrow-forward" size={13} color="#E8B923" />
          </TouchableOpacity>
        </View>

        {/* ══════════════════════════ HERO ════════════════════════════════ */}
        <Animated.View style={[s.hero, isWide && s.heroWide, {
          opacity: heroParallaxOp,
          transform: [{ translateY: heroParallaxY }],
        }]}>

          {/* Left column */}
          <View style={[s.heroLeft, isWide && { flex: 1, paddingRight: 48 }]}>
            <Animated.View style={{ opacity: heroOp, transform: [{ translateY: heroTY }] }}>
              <View style={s.badge}>
                <View style={s.badgePulse} />
                <Text style={s.badgeText}>Finance Therapy Group</Text>
              </View>
              <Text style={s.headline}>
                Your Financial{'\n'}Documents,{'\n'}
                {Platform.OS === 'web' ? (
                  <Text style={{
                    color: '#E8B923',
                    ...({ backgroundImage: 'linear-gradient(135deg,#E8B923,#FFD700,#B5905B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as any),
                  }}>Secured.</Text>
                ) : (
                  <Text style={{ color: '#E8B923' }}>Secured.</Text>
                )}
              </Text>
            </Animated.View>

            <Animated.View style={{ opacity: subOp, transform: [{ translateY: subTY }] }}>
              <Text style={s.sub}>
                The all-in-one portal to access, manage, and track all your important documents with bank-level security and real-time sync.
              </Text>
            </Animated.View>

            <Animated.View style={{ opacity: ctaOp }}>
              <View style={s.ctaRow}>
                <TouchableOpacity style={s.btnPrimary} onPress={onGetStarted} activeOpacity={0.85}>
                  <Text style={s.btnPrimaryText}>Get Started</Text>
                  <Ionicons name="arrow-forward" size={16} color="#2C2320" />
                </TouchableOpacity>
                <TouchableOpacity style={s.btnGhost} activeOpacity={0.7}>
                  <Text style={s.btnGhostText}>Learn More</Text>
                </TouchableOpacity>
              </View>
              <View style={s.statsRow}>
                {[['256-bit', 'SSL Encrypted'], ['99.9%', 'Uptime SLA'], ['50k+', 'Docs Secured']].map(([v, l]) => (
                  <View key={l} style={s.statItem}>
                    <Text style={s.statVal}>{v}</Text>
                    <Text style={s.statLabel}>{l}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </View>

          {/* Right column: 3D floating preview card */}
          {isWide && (
            <Animated.View style={[s.heroRight, { opacity: cardOp, transform: [{ translateY: cardTY }] }]}>
              <Animated.View style={{
                transform: [
                  { perspective: 1100 },
                  { rotateY: swayYInterp },
                  { rotateX: swayXInterp },
                ],
              }}>
                {/* outer glow ring */}
                <View style={s.cardGlowRing}>
                  <View style={s.previewCard}>
                    <LinearGradient colors={['#E8B923', '#B5905B', 'transparent']} style={s.previewTopLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                    <LinearGradient colors={['rgba(232,185,35,0.10)', 'rgba(8,14,30,0.98)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                    <View style={s.previewInner}>
                      <View style={s.previewHeader}>
                        <LinearGradient colors={['#E8B923', '#B5905B']} style={s.previewLogoBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                          <Ionicons name="document-text" size={17} color="#2C2320" />
                        </LinearGradient>
                        <View>
                          <Text style={s.previewTitle}>Document Portal</Text>
                          <Text style={s.previewSub}>3 documents</Text>
                        </View>
                        <View style={[s.previewLiveDot, { marginLeft: 'auto' as any }]}>
                          <Text style={{ color: '#16A34A', fontSize: 9, fontWeight: '700' }}>● LIVE</Text>
                        </View>
                      </View>
                      {[
                        { name: 'Tax Return 2024.pdf',  status: 'Viewed',  color: '#16A34A' },
                        { name: 'W-2 Form.pdf',         status: 'New',     color: '#E8B923' },
                        { name: '1099-INT.pdf',         status: 'Pending', color: '#D97706' },
                      ].map(doc => (
                        <View key={doc.name} style={s.previewRow}>
                          <Ionicons name="document-outline" size={13} color="rgba(255,255,255,0.4)" />
                          <Text style={s.previewDocName} numberOfLines={1}>{doc.name}</Text>
                          <View style={[s.previewChip, { backgroundColor: `${doc.color}22`, borderColor: `${doc.color}55` }]}>
                            <Text style={[s.previewChipText, { color: doc.color }]}>{doc.status}</Text>
                          </View>
                        </View>
                      ))}
                      <View style={s.previewDivider} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={s.previewFooterL}>Updated just now</Text>
                        <Text style={s.previewFooterR}>View All →</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Animated.View>
            </Animated.View>
          )}
        </Animated.View>

        {/* Scroll down indicator */}
        <Animated.View style={[s.scrollIndicator, { transform: [{ translateY: bounceDot }] }]}>
          <Ionicons name="chevron-down" size={20} color="rgba(232,185,35,0.5)" />
          <Ionicons name="chevron-down" size={20} color="rgba(232,185,35,0.25)" style={{ marginTop: -10 }} />
        </Animated.View>

        {/* ══════════════════════════ FEATURES ════════════════════════════ */}
        <Animated.View
          ref={featuresSection.ref}
          style={[s.section, {
            opacity: featuresSection.opacity,
            transform: [
              { translateY: featuresSection.y },
              { perspective: 1200 },
              { rotateX: featuresSection.rotXDeg },
            ],
          }]}
        >
          <Text style={s.sectionTag}>Everything You Need</Text>
          <Text style={s.sectionTitle}>Built for financial clarity</Text>
          <Text style={s.sectionSub}>Powerful tools to manage, track, and secure your financial documents.</Text>
          <View style={[s.featuresGrid, isWide && s.featuresGridWide]}>
            {FEATURES.map((f, i) => (
              <FeatureCard
                key={f.title}
                icon={f.icon}
                title={f.title}
                desc={f.desc}
                opacity={featureAnims[i].opacity}
                ty={featureAnims[i].y}
              />
            ))}
          </View>
        </Animated.View>

        {/* ══════════════════════════ STATS ═══════════════════════════════ */}
        <Animated.View
          ref={statsSection.ref}
          style={[s.statsSection, {
            opacity: statsSection.opacity,
            transform: [
              { translateY: statsSection.y },
              { translateY: scrollBarParallax },
            ],
          }]}
        >
          <LinearGradient
            colors={['rgba(232,185,35,0.08)', 'rgba(181,144,91,0.04)', 'rgba(232,185,35,0.08)']}
            style={s.statsBar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {[
              { icon: 'shield-checkmark' as any, val: '256-bit', label: 'SSL Encryption' },
              { icon: 'flash' as any,            val: '< 1s',    label: 'Sync Speed' },
              { icon: 'people' as any,           val: '50k+',    label: 'Docs Secured' },
              { icon: 'checkmark-circle' as any, val: '99.9%',   label: 'Uptime SLA' },
            ].map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 && <View style={s.statsDivider} />}
                <View style={s.statsItem}>
                  <LinearGradient colors={['#E8B923', '#B5905B']} style={s.statsIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Ionicons name={stat.icon} size={18} color="#2C2320" />
                  </LinearGradient>
                  <Text style={s.statsVal}>{stat.val}</Text>
                  <Text style={s.statsLabel}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </LinearGradient>
        </Animated.View>

        {/* ══════════════════════════ HOW IT WORKS ═════════════════════════ */}
        <Animated.View style={[s.section, {
          opacity: statsSection.opacity,
          transform: [{ translateY: statsSection.y }],
        }]}>
          <Text style={s.sectionTag}>Simple Process</Text>
          <Text style={s.sectionTitle}>How it works</Text>
          <View style={[s.stepsRow, isWide && s.stepsRowWide]}>
            {[
              { n: '01', icon: 'person-add' as any,    title: 'Create Account',    desc: 'Sign up with your email. Your admin sets up your secure portal.' },
              { n: '02', icon: 'cloud-upload' as any,  title: 'Documents Uploaded', desc: 'Your advisor uploads your financial documents securely.' },
              { n: '03', icon: 'notifications' as any, title: 'Get Notified',       desc: 'Receive instant alerts. Review, download, and track everything.' },
            ].map((step, i) => (
              <TiltCard key={step.n} style={s.stepCard} maxTilt={7}>
                <LinearGradient colors={['rgba(232,185,35,0.08)', 'rgba(8,14,30,0.5)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <View style={s.stepNumberBadge}>
                  <Text style={s.stepNumber}>{step.n}</Text>
                </View>
                <LinearGradient colors={['#E8B923', '#B5905B']} style={s.stepIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name={step.icon} size={22} color="#2C2320" />
                </LinearGradient>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepDesc}>{step.desc}</Text>
                {i < 2 && isWide && (
                  <View style={s.stepArrow}>
                    <Ionicons name="arrow-forward" size={16} color="rgba(232,185,35,0.4)" />
                  </View>
                )}
              </TiltCard>
            ))}
          </View>
        </Animated.View>

        {/* ══════════════════════════ TRUST BAR ═══════════════════════════ */}
        <View style={s.trustBar}>
          {[
            { icon: 'shield-checkmark' as any, label: 'SOC 2 Compliant' },
            { icon: 'lock-closed' as any,      label: 'End-to-End Encrypted' },
            { icon: 'eye-off' as any,           label: 'Zero-Knowledge Access' },
            { icon: 'checkmark-circle' as any,  label: '99.9% Uptime' },
          ].map(t => (
            <View key={t.label} style={s.trustItem}>
              <Ionicons name={t.icon} size={14} color="#E8B923" />
              <Text style={s.trustText}>{t.label}</Text>
            </View>
          ))}
        </View>

        {/* ══════════════════════════ CTA ════════════════════════════════ */}
        <Animated.View
          ref={ctaSection.ref}
          style={[s.ctaSection, {
            opacity: ctaSection.opacity,
            transform: [
              { translateY: ctaSection.y },
              { perspective: 1200 },
              { rotateX: ctaSection.rotXDeg },
            ],
          }]}
        >
          <TiltCard maxTilt={5}>
            <LinearGradient
              colors={['rgba(232,185,35,0.12)', 'rgba(181,144,91,0.06)', 'rgba(232,185,35,0.08)']}
              style={s.ctaBox}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Animated border top */}
              <LinearGradient colors={['#E8B923', '#B5905B', '#E8B923']} style={s.ctaTopBorder} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
              <Text style={s.ctaTitle}>Ready to secure your documents?</Text>
              <Text style={s.ctaSub}>Join thousands of clients who trust Finance Therapy Group.</Text>
              <TouchableOpacity style={[s.btnPrimary, { alignSelf: 'center', marginTop: 32 }]} onPress={onGetStarted} activeOpacity={0.85}>
                <Text style={s.btnPrimaryText}>Sign In Now</Text>
                <Ionicons name="arrow-forward" size={16} color="#2C2320" />
              </TouchableOpacity>
            </LinearGradient>
          </TiltCard>
        </Animated.View>

        {/* ══════════════════════════ FOOTER ══════════════════════════════ */}
        <View style={s.footer}>
          <Text style={s.footerText}>© 2024 Finance Therapy Group · Trusted · Secure · Real-time</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020817',
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as any } : {}),
  },

  orb: { position: 'absolute', borderRadius: 9999 },
  orb1: { width: 900, height: 900, backgroundColor: 'rgba(232,185,35,0.055)', top: -320, left: -260 },
  orb2: { width: 650, height: 650, backgroundColor: 'rgba(181,144,91,0.052)', bottom: 40,  right: -200 },
  orb3: { width: 350, height: 350, backgroundColor: 'rgba(232,185,35,0.032)', top: '40%' as any, left: '32%' as any },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(232,185,35,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.3)',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  navBtnText: { color: '#E8B923', fontSize: 14, fontWeight: '600' },

  // Hero
  hero: { paddingHorizontal: 32, paddingVertical: 90, gap: 48 },
  heroWide: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 72 },
  heroLeft: { gap: 0 },
  heroRight: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: 'rgba(232,185,35,0.1)', borderWidth: 1, borderColor: 'rgba(232,185,35,0.28)',
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 24,
  },
  badgePulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E8B923' },
  badgeText: { color: '#E8B923', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  headline: {
    color: '#ffffff',
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 74,
    letterSpacing: -2,
    marginBottom: 24,
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 17,
    lineHeight: 28,
    maxWidth: 500,
    marginBottom: 36,
  },

  ctaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' as any, marginBottom: 36 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E8B923', borderRadius: 12,
    paddingHorizontal: 26, paddingVertical: 14,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 10,
  },
  btnPrimaryText: { color: '#2C2320', fontWeight: '800', fontSize: 15 },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 26, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnGhostText: { color: 'rgba(255,255,255,0.65)', fontWeight: '600', fontSize: 15 },

  statsRow: { flexDirection: 'row', gap: 32 },
  statItem: { gap: 3 },
  statVal: { color: '#E8B923', fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.38)', fontSize: 12 },

  scrollIndicator: {
    alignItems: 'center', paddingBottom: 16, marginTop: -24,
  },

  // Preview card
  cardGlowRing: {
    padding: 1,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.3)',
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  previewCard: {
    width: 320, borderRadius: 22,
    overflow: 'hidden' as any,
    backgroundColor: 'rgba(8,14,30,0.97)',
  },
  previewTopLine: { height: 3 },
  previewInner: { padding: 22 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  previewLogoBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  previewTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  previewSub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 },
  previewLiveDot: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(22,163,74,0.15)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)' },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  previewDocName: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  previewChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  previewChipText: { fontSize: 10, fontWeight: '700' },
  previewDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 14 },
  previewFooterL: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  previewFooterR: { color: '#E8B923', fontSize: 11, fontWeight: '600' },

  // Sections
  section: { paddingHorizontal: 40, paddingVertical: 80, alignItems: 'center' },
  sectionTag: { color: '#E8B923', fontSize: 11, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase' as any, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: -1, marginBottom: 12, textAlign: 'center' },
  sectionSub: { color: 'rgba(255,255,255,0.42)', fontSize: 16, textAlign: 'center', marginBottom: 48, maxWidth: 480, lineHeight: 26 },

  // Feature cards
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap' as any, gap: 16, justifyContent: 'center', width: '100%' },
  featuresGridWide: { maxWidth: 1100 },
  featureWrap: { minWidth: 240, maxWidth: 340, flex: 1 },
  featureCard: {
    flex: 1, borderRadius: 20, overflow: 'hidden' as any,
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.18)',
    backgroundColor: 'rgba(8,14,30,0.6)',
  },
  featureTopBar: { height: 3 },
  featureContent: { padding: 24, gap: 10 },
  featureIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  featureTitle: { color: 'rgba(255,255,255,0.95)', fontSize: 15, fontWeight: '700' },
  featureDesc: { color: 'rgba(255,255,255,0.42)', fontSize: 13, lineHeight: 20 },

  // Stats
  statsSection: { paddingHorizontal: 40, paddingVertical: 20 },
  statsBar: {
    flexDirection: 'row', flexWrap: 'wrap' as any,
    justifyContent: 'center', gap: 0,
    borderRadius: 20, paddingVertical: 28, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.18)',
  },
  statsItem: { alignItems: 'center', flex: 1, minWidth: 140, gap: 6 },
  statsIconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statsVal: { color: '#E8B923', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statsLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  statsDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'stretch' },

  // How it works
  stepsRow: { flexDirection: 'column', gap: 16, width: '100%', maxWidth: 900 },
  stepsRowWide: { flexDirection: 'row', alignItems: 'stretch' },
  stepCard: {
    flex: 1, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.18)',
    backgroundColor: 'rgba(8,14,30,0.6)',
    overflow: 'hidden' as any,
    position: 'relative',
  },
  stepNumberBadge: {
    position: 'absolute', top: 20, right: 20,
    backgroundColor: 'rgba(232,185,35,0.1)',
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.2)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  stepNumber: { color: '#E8B923', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  stepIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  stepTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  stepDesc: { color: 'rgba(255,255,255,0.42)', fontSize: 13, lineHeight: 20 },
  stepArrow: { position: 'absolute', right: -14, top: '50%' as any, zIndex: 10 },

  // Trust bar
  trustBar: {
    flexDirection: 'row', flexWrap: 'wrap' as any, justifyContent: 'center',
    gap: 28, paddingVertical: 28, paddingHorizontal: 40,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 40, marginBottom: 40,
  },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustText: { color: 'rgba(255,255,255,0.52)', fontSize: 13, fontWeight: '500' },

  // CTA
  ctaSection: { paddingHorizontal: 40, paddingBottom: 60 },
  ctaBox: {
    borderRadius: 24, paddingVertical: 64, paddingHorizontal: 40,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.2)',
    overflow: 'hidden' as any,
  },
  ctaTopBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  ctaTitle: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1, textAlign: 'center', marginBottom: 12 },
  ctaSub: { color: 'rgba(255,255,255,0.45)', fontSize: 16, textAlign: 'center', lineHeight: 26 },

  footer: {
    paddingVertical: 24, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerText: { color: 'rgba(255,255,255,0.2)', fontSize: 12, letterSpacing: 0.5 },
});
