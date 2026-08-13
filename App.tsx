import 'react-native-gesture-handler';
import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { PWAInstallBanner } from './src/components/PWAInstallBanner';

// Remove browser focus outline from all inputs globally on web
if (Platform.OS === 'web') {
  const style = document.createElement('style');
  style.textContent = `
    input:focus, textarea:focus, select:focus { outline: none !important; box-shadow: none !important; }
    * { -webkit-tap-highlight-color: transparent; }

    /* Scroll panels tagged with dataSet={{ ftgscroll: 'y' }} keep a visible
       scrollbar in the FTG palette instead of the raw OS one. overflow:auto —
       it appears only when the content actually overflows. */
    [data-ftgscroll] { overflow-y: auto; scrollbar-width: thin; scrollbar-color: #D8C9A8 #F5F0E8; }
    [data-ftgscroll]::-webkit-scrollbar { width: 10px; }
    [data-ftgscroll]::-webkit-scrollbar-track { background: #F5F0E8; border-radius: 8px; }
    [data-ftgscroll]::-webkit-scrollbar-thumb {
      background: #D8C9A8; border-radius: 8px; border: 2px solid #F5F0E8;
    }
    [data-ftgscroll]::-webkit-scrollbar-thumb:hover { background: #B5905B; }
  `;
  document.head.appendChild(style);
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" backgroundColor="transparent" translucent />
          <AppNavigator />
          <PWAInstallBanner />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#3A3131',
  },
});
