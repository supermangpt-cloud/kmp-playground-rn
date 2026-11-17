/**
 * The QR page: text, error-correction level and the live code.
 *
 * The matrix is computed in `src/qr/qrCode.ts` (same encoder as
 * react-native-qrcode-svg), so the page can show the QR version and replace a
 * thrown encoder error with a one-line hint. Rendering is react-native-svg via
 * react-native-qrcode-svg; the four-module quiet zone is passed in pixels,
 * which is the unit that component uses.
 *
 * Save to album writes the generated matrix as a PNG through the app's own
 * `ImageSave` ArkTS module (`photoAccessHelper.createAsset` behind the
 * WRITE_IMAGEVIDEO ACL). `docs/features/qrcode.md` records the permission and
 * the device verification.
 */
import React, {useCallback, useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import QRCode from '@react-native-oh-tpl/react-native-qrcode-svg';

import {
  encodeQr,
  qrLabel,
  qrQuietZonePixels,
  QR_ERROR_CORRECTION_LEVELS,
  QrErrorCorrection,
} from '../qr/qrCode';
import {qrPngBase64} from '../qr/qrPng';
import {qrSaveTitle, savePngToAlbum} from '../native/imageSave';
import {
  openAlbumWritePermissionSettings,
  permissionAdvice,
} from '../native/permissions';
import {colors} from '../ui/theme';

const DEFAULT_VALUE = 'https://example.com';

/** Side length of the rendered code, quiet zone included. */
const CODE_SIZE = 220;

type Props = {
  onBack: () => void;
};

type SaveState = {
  saving: boolean;
  /** `denied` means the platform refused the album permission, not a failure. */
  denied?: boolean;
  message?: string;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function QrCodeScreen({onBack}: Props): JSX.Element {
  const [text, setText] = useState(DEFAULT_VALUE);
  const [level, setLevel] = useState<QrErrorCorrection>('M');
  const [save, setSave] = useState<SaveState>({saving: false});

  const encoding = useMemo(() => encodeQr(text, level), [text, level]);
  const code = encoding.ok ? encoding.code : null;

  /**
   * 「保存到相册」: encode the matrix to a PNG in JS, then let the native module
   * request WRITE_IMAGEVIDEO, create the asset and write the bytes. The result
   * object distinguishes a refusal (show 去设置) from a platform failure.
   */
  const saveToAlbum = useCallback(async () => {
    if (encoding.ok !== true || save.saving) {
      return;
    }
    setSave({saving: true});
    try {
      const base64 = qrPngBase64(encoding.code);
      const result = await savePngToAlbum(base64, qrSaveTitle());
      if (result.saved) {
        setSave({saving: false, message: '已保存到相册'});
      } else if (result.permissionDenied) {
        setSave({
          saving: false,
          denied: true,
          message: permissionAdvice('denied'),
        });
      } else {
        setSave({saving: false, message: `保存失败：${result.reason}`});
      }
    } catch (error) {
      setSave({saving: false, message: `保存失败：${messageOf(error)}`});
    }
  }, [encoding, save.saving]);

  /** 「去设置」 after a denial; the platform will not show its dialog again. */
  const openSaveSettings = useCallback(async () => {
    try {
      await openAlbumWritePermissionSettings();
      setSave(current => ({
        ...current,
        message: '已打开系统设置页；回到 App 后重新点「保存到相册」',
      }));
    } catch (error) {
      setSave(current => ({
        ...current,
        message: `打开设置失败：${messageOf(error)}`,
      }));
    }
  }, []);

  return (
    <View style={styles.screen} testID="qr-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={onBack}
          style={({pressed}) => [styles.back, pressed && styles.pressed]}
          testID="qr-back">
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>二维码</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>要生成二维码的内容</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          testID="qr-input"
        />

        <View style={styles.levelRow}>
          <Text style={styles.levelLabel}>纠错级别</Text>
          {QR_ERROR_CORRECTION_LEVELS.map(option => {
            const selected = option === level;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{selected}}
                accessibilityLabel={`纠错级别 ${option}`}
                onPress={() => setLevel(option)}
                style={({pressed}) => [
                  styles.levelChip,
                  selected && styles.levelChipSelected,
                  pressed && styles.pressed,
                ]}
                testID={`qr-level-${option}`}>
                <Text
                  style={[
                    styles.levelChipText,
                    selected && styles.levelChipTextSelected,
                  ]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {code === null ? (
          <Text style={styles.error} testID="qr-error">
            {encoding.ok ? '' : encoding.error}
          </Text>
        ) : (
          <>
            <View style={styles.codeCard} testID="qr-code">
              <QRCode
                value={text}
                size={CODE_SIZE}
                ecl={level}
                color="#000000"
                backgroundColor="#FFFFFF"
                quietZone={qrQuietZonePixels(CODE_SIZE, code.size)}
              />
            </View>
            <Text style={styles.meta} testID="qr-meta">
              {qrLabel(code)}
            </Text>
          </>
        )}

        <View style={styles.saveSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="保存到相册"
            accessibilityState={{disabled: save.saving || code === null}}
            disabled={save.saving || code === null}
            onPress={saveToAlbum}
            style={({pressed}) => [
              styles.saveButton,
              code === null && styles.saveButtonDisabled,
              pressed && styles.pressed,
            ]}
            testID="qr-save">
            <Text style={styles.saveButtonText} testID="qr-save-label">
              {save.saving ? '保存中…' : '保存到相册'}
            </Text>
          </Pressable>
          <Text style={styles.saveHint} testID="qr-save-result">
            {save.message ?? '保存为 PNG 并写入系统相册'}
          </Text>
          {save.denied === true ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="打开相册写入权限设置"
              onPress={openSaveSettings}
              style={({pressed}) => [
                styles.saveSettingsButton,
                pressed && styles.pressed,
              ]}
              testID="qr-save-settings">
              <Text style={styles.saveSettingsText}>去设置</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  back: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
  },
  title: {
    marginLeft: 'auto',
    marginRight: 12,
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    alignItems: 'stretch',
  },
  label: {
    marginTop: 4,
    marginBottom: 6,
    color: colors.textSecondary,
    fontSize: 12,
  },
  input: {
    minHeight: 64,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  levelLabel: {
    marginRight: 10,
    color: colors.textSecondary,
    fontSize: 12,
  },
  levelChip: {
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  levelChipSelected: {
    backgroundColor: colors.accent,
  },
  levelChipText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  levelChipTextSelected: {
    color: colors.surface,
  },
  codeCard: {
    alignSelf: 'center',
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 8,
  },
  meta: {
    marginTop: 8,
    alignSelf: 'center',
    color: colors.textHint,
    fontSize: 11,
  },
  error: {
    marginTop: 24,
    color: '#C62828',
    fontSize: 14,
    textAlign: 'center',
  },
  saveSection: {
    marginTop: 24,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 14,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    backgroundColor: colors.divider,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '600',
  },
  saveHint: {
    marginTop: 8,
    color: colors.textHint,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  saveSettingsButton: {
    alignSelf: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  saveSettingsText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
