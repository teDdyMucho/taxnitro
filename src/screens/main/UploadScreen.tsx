import { nativeDriver } from '../../constants/platform';
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { mockFolders } from '../../data/mockData';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';

type UploadState = 'idle' | 'picking' | 'previewing' | 'uploading' | 'success' | 'error';

interface PickedFile {
  name: string;
  size?: number;
  uri: string;
  mimeType?: string;
}

export function UploadScreen() {
  const [state, setState] = useState<UploadState>('idle');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const insets = useSafeAreaInsets();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setFile({
        name: asset.name,
        size: asset.size,
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
      setState('previewing');
    } catch (err) {
      Alert.alert('Error', 'Could not pick document.');
    }
  };

  const simulateUpload = async () => {
    if (!selectedFolder) {
      Alert.alert('Select Folder', 'Please select a destination folder before uploading.');
      return;
    }
    setState('uploading');
    progressAnim.setValue(0);

    const stages = [0.2, 0.45, 0.7, 0.9, 1.0];
    for (let i = 0; i < stages.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      Animated.spring(progressAnim, { toValue: stages[i], damping: 20, stiffness: 80, useNativeDriver: false }).start();
      setProgress(Math.round(stages[i] * 100));
    }

    await new Promise(r => setTimeout(r, 300));
    setState('success');
    Animated.spring(successScale, { toValue: 1, damping: 12, stiffness: 120, useNativeDriver: nativeDriver }).start();
  };

  const reset = () => {
    setState('idle');
    setFile(null);
    setSelectedFolder(null);
    setProgress(0);
    progressAnim.setValue(0);
    successScale.setValue(0);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mime?: string) => {
    if (mime?.includes('pdf')) return { icon: 'document-text' as const, color: Colors.error };
    if (mime?.includes('spreadsheet') || mime?.includes('excel')) return { icon: 'grid' as const, color: Colors.viewed };
    if (mime?.includes('word') || mime?.includes('document')) return { icon: 'document' as const, color: Colors.newDoc };
    if (mime?.includes('image')) return { icon: 'image' as const, color: Colors.notViewed };
    return { icon: 'document-outline' as const, color: Colors.textMuted };
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Upload Document</Text>
        <Text style={styles.headerSubtitle}>Add files to your document portal</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {state === 'success' && (
          <Animated.View style={[styles.successContainer, { transform: [{ scale: successScale }], opacity: successScale }]}>
            <LinearGradient
              colors={['rgba(34,197,94,0.15)', 'rgba(34,197,94,0.05)']}
              style={styles.successCard}
            >
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.viewed} />
              </View>
              <Text style={styles.successTitle}>Upload Complete!</Text>
              <Text style={styles.successSubtitle}>
                {file?.name} has been successfully uploaded to your document portal.
              </Text>
              <Button title="Upload Another" onPress={reset} fullWidth size="lg" style={{ marginTop: 8 }} />
            </LinearGradient>
          </Animated.View>
        )}

        {state === 'uploading' && (
          <Card style={styles.uploadingCard}>
            <View style={styles.uploadingIcon}>
              <Ionicons name="cloud-upload" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.uploadingTitle}>Uploading...</Text>
            <Text style={styles.uploadingFile} numberOfLines={1}>{file?.name}</Text>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
                <LinearGradient
                  colors={[Colors.primary, Colors.viewed]}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </Animated.View>
            </View>
            <Text style={styles.progressText}>{progress}% complete</Text>
          </Card>
        )}

        {state === 'idle' && (
          <>
            <TouchableOpacity style={styles.dropZone} onPress={pickDocument} activeOpacity={0.8}>
              <LinearGradient
                colors={['rgba(37,99,235,0.08)', 'rgba(37,99,235,0.03)']}
                style={styles.dropZoneGradient}
              >
                <View style={styles.dropIcon}>
                  <LinearGradient
                    colors={[Colors.primary, Colors.primaryDark]}
                    style={styles.dropIconGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="cloud-upload-outline" size={32} color={Colors.white} />
                  </LinearGradient>
                </View>
                <Text style={styles.dropTitle}>Select Document</Text>
                <Text style={styles.dropSubtitle}>PDF, XLSX, DOCX, images and more</Text>
                <View style={styles.dropButton}>
                  <Ionicons name="folder-open-outline" size={16} color={Colors.primary} />
                  <Text style={styles.dropButtonText}>Browse Files</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Supported Formats</Text>
            <View style={styles.formatsRow}>
              {[
                { ext: 'PDF', color: Colors.error },
                { ext: 'XLSX', color: Colors.viewed },
                { ext: 'DOCX', color: Colors.newDoc },
                { ext: 'JPG', color: Colors.notViewed },
                { ext: 'PNG', color: Colors.notViewed },
              ].map(f => (
                <View key={f.ext} style={[styles.formatBadge, { borderColor: `${f.color}40` }]}>
                  <Text style={[styles.formatText, { color: f.color }]}>{f.ext}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {state === 'previewing' && file && (
          <>
            <Card style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.sectionLabel}>Selected File</Text>
                <TouchableOpacity onPress={reset} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={20} color={Colors.error} />
                </TouchableOpacity>
              </View>
              <View style={styles.filePreview}>
                <View style={[styles.fileIconBg, { backgroundColor: `${getFileIcon(file.mimeType).color}15` }]}>
                  <Ionicons name={getFileIcon(file.mimeType).icon} size={30} color={getFileIcon(file.mimeType).color} />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
                  <Text style={styles.fileSize}>{formatSize(file.size)}</Text>
                  <Text style={styles.fileType}>{file.mimeType || 'Unknown type'}</Text>
                </View>
              </View>
            </Card>

            <Text style={styles.sectionLabel}>Select Destination Folder</Text>
            <View style={styles.foldersGrid}>
              {mockFolders.map(folder => (
                <TouchableOpacity
                  key={folder.id}
                  style={[styles.folderOption, selectedFolder === folder.id && styles.folderOptionSelected]}
                  onPress={() => setSelectedFolder(folder.id)}
                >
                  <Ionicons name="folder" size={22} color={selectedFolder === folder.id ? Colors.primary : Colors.textMuted} />
                  <Text style={[styles.folderOptionText, selectedFolder === folder.id && styles.folderOptionTextSelected]} numberOfLines={2}>
                    {folder.name}
                  </Text>
                  {selectedFolder === folder.id && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title={selectedFolder ? 'Upload Document' : 'Select a Folder First'}
              onPress={simulateUpload}
              fullWidth
              size="lg"
              disabled={!selectedFolder}
              style={selectedFolder ? { marginTop: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 } : { marginTop: 8 }}
            />

            <TouchableOpacity style={styles.cancelBtn} onPress={reset}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  header: { backgroundColor: Colors.bgDark, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' },
  headerSubtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 3 },
  content: { padding: 16, gap: 16 },
  dropZone: { borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(37,99,235,0.3)', borderStyle: 'dashed' },
  dropZoneGradient: { padding: 40, alignItems: 'center' },
  dropIcon: { marginBottom: 16, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  dropIconGradient: { width: 68, height: 68, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dropTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  dropSubtitle: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20 },
  dropButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(37,99,235,0.15)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)' },
  dropButtonText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  sectionLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
  formatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: Colors.bgCard },
  formatText: { fontSize: 12, fontWeight: '700' },
  previewCard: {},
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  removeBtn: {},
  filePreview: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  fileIconBg: { width: 60, height: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4, lineHeight: 20 },
  fileSize: { color: Colors.textMuted, fontSize: 12, marginBottom: 2 },
  fileType: { color: Colors.textMuted, fontSize: 11 },
  foldersGrid: { gap: 8 },
  folderOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  folderOptionSelected: { borderColor: Colors.primary, backgroundColor: 'rgba(37,99,235,0.08)' },
  folderOptionText: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  folderOptionTextSelected: { color: Colors.textPrimary, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: Colors.textMuted, fontSize: 14 },
  uploadingCard: { alignItems: 'center', padding: 32 },
  uploadingIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  uploadingTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 6 },
  uploadingFile: { color: Colors.textMuted, fontSize: 13, marginBottom: 24, maxWidth: '80%', textAlign: 'center' },
  progressBar: { width: '100%', height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  successContainer: { borderRadius: 20, overflow: 'hidden' },
  successCard: { alignItems: 'center', padding: 32, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' },
  successIcon: { marginBottom: 16 },
  successTitle: { color: Colors.textPrimary, fontSize: 24, fontWeight: '700', marginBottom: 10 },
  successSubtitle: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
});
