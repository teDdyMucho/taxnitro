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
