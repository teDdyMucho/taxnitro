import { Platform } from 'react-native';

// useNativeDriver must be false on web
export const nativeDriver = Platform.OS !== 'web';
