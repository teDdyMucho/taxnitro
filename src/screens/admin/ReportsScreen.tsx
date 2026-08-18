import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Colors } from '../../constants/colors';

// The FTG Financial Report Generator is a large self-contained HTML tool served
// as a static asset from /financial-report.html (see public/). It takes over the
// WHOLE screen (over the app shell). A "Back to Admin" button injected inside the
// report's own sidebar posts a message back here to return to the app.
const REPORT_PATH = '/financial-report.html';

export function ReportsScreen({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();

  // Web: the report iframe posts { type: 'ftg-back-to-admin' } when its Back button
  // is clicked. Listen for it and return to the app.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onMessage = (e: MessageEvent) => {
      if (e?.data && e.data.type === 'ftg-back-to-admin') onBack?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onBack]);

  // Cover the entire viewport (over the sidebar) on web.
  const webFixed = Platform.OS === 'web'
    ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 } as any)
    : null;

  return (
    <View style={[s.root, webFixed, { paddingTop: Platform.OS === 'web' ? 0 : insets.top }]}>
      {Platform.OS === 'web'
        ? React.createElement('iframe', {
            src: REPORT_PATH,
            title: 'FTG Financial Report Generator',
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', backgroundColor: '#2C2320' },
          })
        : (
          <WebView
            source={{ uri: REPORT_PATH }}
            style={{ flex: 1, backgroundColor: '#2C2320' }}
            startInLoadingState
            onMessage={(e) => { if (e.nativeEvent.data === 'ftg-back-to-admin') onBack?.(); }}
            renderLoading={() => (
              <View style={s.loading}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            )}
          />
        )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2C2320' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
