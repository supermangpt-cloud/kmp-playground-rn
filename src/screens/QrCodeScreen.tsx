/**
 * The QR page: text, error-correction level and the live code.
 *
 * The matrix is computed in `src/qr/qrCode.ts` (same encoder as
 * react-native-qrcode-svg), so the page can show the QR version and replace a
 * thrown encoder error with a one-line hint. Rendering is react-native-svg via
 * react-native-qrcode-svg; the four-module quiet zone is passed in pixels,
 * which is the unit that component uses.
 *
 * Save to album is not available in this RN stack. The button reports the
 * reason instead of pretending success; `docs/features/qrcode.md` records what
 * was tested and what a future dependency would have to provide.
 */
import React, {useMemo, useState} from 'react';
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
import {colors} from '../ui/theme';

const DEFAULT_VALUE = 'https://example.com';

/** Side length of the rendered code, quiet zone included. */
const CODE_SIZE = 220;

/** What the save button says. The full reason is in docs/features/qrcode.md. */
const SAVE_UNAVAILABLE_REASON =
  '本版本不支持保存到相册：camera-roll 适配包无法在 RNOH 0.72.140 上编译，' +
  '且没有把 PNG 写进应用沙箱的文件能力。详见 docs/features/qrcode.md。';

type Props = {
  onBack: () => void;
};

export default function QrCodeScreen({onBack}: Props): JSX.Element {
  const [text, setText] = useState(DEFAULT_VALUE);
  const [level, setLevel] = useState<QrErrorCorrection>('M');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const encoding = useMemo(() => encodeQr(text, level), [text, level]);
  const code = encoding.ok ? encoding.code : null;

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
            onPress={() => setSaveMessage(SAVE_UNAVAILABLE_REASON)}
            style={({pressed}) => [
              styles.saveButton,
              styles.saveButtonDisabled,
              pressed && styles.pressed,
            ]}
            testID="qr-save">
            <Text style={styles.saveButtonText}>保存到相册</Text>
          </Pressable>
          <Text style={styles.saveHint} testID="qr-save-result">
            {saveMessage ?? '保存到相册在本版本不可用'}
          </Text>
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
  },
  saveButtonDisabled: {
    backgroundColor: colors.divider,
  },
  saveButtonText: {
    color: colors.textHint,
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
  pressed: {
    opacity: 0.6,
  },
});
