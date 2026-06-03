import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  isPassword?: boolean;
  containerStyle?: ViewStyle;
}

export function InputField({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  isPassword = false,
  containerStyle,
  ...props
}: Props) {
  const [secureText, setSecureText] = useState(isPassword);
  const [focused, setFocused] = useState(false);

  const handleFocus = () => {
    setFocused(true);
    props.onFocus?.({} as any);
  };

  const handleBlur = () => {
    setFocused(false);
    props.onBlur?.({} as any);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.inputWrapperFocused,
          !!error && styles.inputWrapperError,
        ]}
      >
        {!!leftIcon && (
          <Ionicons
            name={leftIcon}
            size={18}
            color={focused ? '#E8B923' : Colors.textMuted}
            style={styles.leftIcon}
          />
        )}
        <TextInput
          style={[styles.input, leftIcon ? styles.inputWithLeft : undefined]}
          placeholderTextColor={Colors.textMuted}
          secureTextEntry={secureText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setSecureText(prev => !prev)}
            style={styles.rightIcon}
          >
            <Ionicons
              name={secureText ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        )}
        {!!rightIcon && !isPassword && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon}>
            <Ionicons name={rightIcon} size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgMid,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  inputWrapperFocused: {
    borderColor: '#E8B923',
    borderWidth: 1.5,
  },
  inputWrapperError: {
    borderColor: Colors.error,
  },
  leftIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 15,
    outlineWidth: 0,
  } as any,
  inputWithLeft: {
    paddingLeft: 10,
  },
  rightIcon: {
    padding: 14,
  },
  error: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 5,
    marginLeft: 4,
  },
});
