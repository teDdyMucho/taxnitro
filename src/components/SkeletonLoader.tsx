import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle, Animated } from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({ width = '100%', height = 20, borderRadius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width as any, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

export function FolderSkeleton() {
  return (
    <View style={styles.folderSkeleton}>
      <SkeletonLoader height={100} borderRadius={16} style={{ marginBottom: 8 }} />
      <SkeletonLoader width="60%" height={14} borderRadius={6} style={{ marginBottom: 4 }} />
      <SkeletonLoader width="40%" height={12} borderRadius={6} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.bgElevated,
  },
  folderSkeleton: {
    flex: 1,
    padding: 4,
  },
});
