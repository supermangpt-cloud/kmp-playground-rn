/**
 * The scan page: camera preview, realtime QR decoding and the album fallback.
 *
 * Preview and realtime decoding both come from the HarmonyOS vision-camera
 * adaptation: its `codeScanner` prop drives Scan Kit's custom preview on an
 * `XComponent` surface, so decoding happens inside the native scan session
 * (frame processors do not exist on RNOH 0.72). JS only receives
 * `onCodeScanned` events through `DeviceEventEmitter`.
 *
 * The album path goes through the HarmonyOS image-picker adaptation, which
 * returns the chosen image as base64; `src/qr/imageDecode.ts` decodes it with
 * jsqr and pure-JS image decoders.
 *
 * Both adaptations are HarmonyOS-only, so `ScanScreen` loads the camera module
 * lazily (`src/native/cameraModule.ts`) and renders an explanation on the other
 * platforms instead of pulling a native module that is not linked there. If the
 * camera cannot start, the page says so and the album button stays usable.
 */
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {loadCameraModule} from '../native/cameraModule';
import type {CameraModule} from '../native/cameraModule';
import {launchImageLibrary} from '../native/imagePicker';
import {decodeQrFromBase64} from '../qr/imageDecode';
import {colors} from '../ui/theme';

type Props = {
  onBack: () => void;
};

type Outcome =
  | {kind: 'idle'}
  | {
      kind: 'scanned';
      value: string;
      type: string;
      source: 'camera' | 'album';
      /** Image size for album results, shown as evidence next to the value. */
      detail?: string;
    }
  | {kind: 'camera-error'; message: string};

export default function ScanScreen({onBack}: Props): JSX.Element {
  const camera = useMemo(() => loadCameraModule(), []);
  if (camera === null) {
    return <ScanUnsupportedScreen onBack={onBack} />;
  }
  return <ScanContent camera={camera} onBack={onBack} />;
}

function ScanUnsupportedScreen({onBack}: Props): JSX.Element {
  return (
    <View style={styles.screen} testID="scan-screen">
      <Header onBack={onBack} />
      <View style={styles.unsupported} testID="scan-unsupported">
        <Text style={styles.unsupportedTitle}>扫码页只在鸿蒙版提供</Text>
        <Text style={styles.unsupportedText}>
          相机预览和相册解码依赖鸿蒙的 Camera Kit / Scan Kit 与 image-picker
          适配，当前平台没有接入。
        </Text>
      </View>
    </View>
  );
}

function Header({onBack}: Props): JSX.Element {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回"
        onPress={onBack}
        style={({pressed}) => [styles.back, pressed && styles.pressed]}
        testID="scan-back">
        <Text style={styles.backText}>返回</Text>
      </Pressable>
      <Text style={styles.title}>扫码</Text>
    </View>
  );
}

function ScanContent({
  camera,
  onBack,
}: Props & {camera: CameraModule}): JSX.Element {
  const {Camera, useCodeScanner} = camera;
  const [outcome, setOutcome] = useState<Outcome>({kind: 'idle'});
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [albumBusy, setAlbumBusy] = useState(false);
  // The native scan session keeps running after the first hit, so identical
  // results arrive repeatedly; only the first one for a given value is shown.
  const lastValue = useRef<string | null>(null);

  const onCodeScanned = useCallback(
    (codes: Array<{type?: string; value?: string}>) => {
      const first = codes.find(
        code => typeof code.value === 'string' && code.value.length > 0,
      );
      if (first === undefined || first.value === undefined) {
        return;
      }
      if (first.value === lastValue.current) {
        return;
      }
      lastValue.current = first.value;
      setOutcome({
        kind: 'scanned',
        value: first.value,
        type: first.type ?? 'unknown',
        source: 'camera',
      });
    },
    [],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned,
  });

  const onCameraError = useCallback(
    (event: {nativeEvent?: {error?: string}}) => {
      setOutcome({
        kind: 'camera-error',
        message: event.nativeEvent?.error ?? '相机启动失败',
      });
    },
    [],
  );

  const rescan = useCallback(() => {
    lastValue.current = null;
    setAlbumError(null);
    setOutcome({kind: 'idle'});
  }, []);

  const pickFromAlbum = useCallback(async () => {
    setAlbumError(null);
    setAlbumBusy(true);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        // Downscale in the picker so the base64 buffer stays small; jsqr
        // scans whatever resolution comes back.
        maxWidth: 2000,
        maxHeight: 2000,
        includeBase64: true,
      });
      if (result.didCancel) {
        return;
      }
      if (result.errorCode !== undefined) {
        setAlbumError(
          `无法打开相册：${result.errorMessage ?? result.errorCode}`,
        );
        return;
      }
      const asset = result.assets?.[0];
      if (asset === undefined) {
        setAlbumError('没有拿到图片');
        return;
      }
      if (asset.base64 === undefined) {
        setAlbumError(
          '图片选择器没有返回 base64，无法在 JS 里解码这张图；' +
            `返回的 URI 是 ${asset.uri ?? '空'}`,
        );
        return;
      }
      const decoded = decodeQrFromBase64(asset.base64);
      if (!decoded.ok) {
        setAlbumError(decoded.reason);
        return;
      }
      lastValue.current = decoded.value;
      const detail =
        asset.width !== undefined && asset.height !== undefined
          ? `${asset.width}×${asset.height}`
          : undefined;
      setOutcome({
        kind: 'scanned',
        value: decoded.value,
        type: 'qr',
        source: 'album',
        detail,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAlbumError(`无法读取相册图片：${message}`);
    } finally {
      setAlbumBusy(false);
    }
  }, []);

  const cameraUnavailable = outcome.kind === 'camera-error';
  const cameraActive = outcome.kind !== 'scanned' && !albumBusy;

  return (
    <View style={styles.screen} testID="scan-screen">
      <Header onBack={onBack} />

      <View style={styles.previewWrap} testID="scan-preview">
        {cameraUnavailable ? (
          <View style={styles.cameraFallback} testID="scan-camera-unavailable">
            <Text style={styles.cameraFallbackTitle}>相机不可用</Text>
            <Text style={styles.cameraFallbackText}>{outcome.message}</Text>
            <Text style={styles.cameraFallbackText}>
              请用下面的「从相册选图」解析二维码。
            </Text>
          </View>
        ) : (
          <>
            <Camera
              style={StyleSheet.absoluteFill}
              isActive={cameraActive}
              preview={true}
              photo={false}
              video={false}
              audio={false}
              codeScanner={codeScanner}
              onError={onCameraError}
              testID="scan-camera"
            />
            <View pointerEvents="none" style={styles.frame} />
          </>
        )}
      </View>

      <View style={styles.footer}>
        {outcome.kind === 'scanned' ? (
          <View style={styles.resultCard} testID="scan-result">
            <Text style={styles.resultLabel}>
              {outcome.source === 'camera' ? '相机识别' : '相册识别'} ·{' '}
              {outcome.type}
              {outcome.detail === undefined ? '' : ` · ${outcome.detail}`}
            </Text>
            <Text style={styles.resultValue} selectable>
              {outcome.value}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="继续扫描"
              onPress={rescan}
              style={({pressed}) => [styles.primary, pressed && styles.pressed]}
              testID="scan-rescan">
              <Text style={styles.primaryText}>继续扫描</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.hint} testID="scan-status">
            {cameraUnavailable
              ? '相机没有启动，用的是相册解码'
              : '把二维码放进取景框，识别结果会显示在这里'}
          </Text>
        )}

        {albumError === null ? null : (
          <Text style={styles.error} testID="scan-album-error">
            {albumError}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="从相册选图"
          disabled={albumBusy}
          onPress={pickFromAlbum}
          style={({pressed}) => [
            styles.secondary,
            (pressed || albumBusy) && styles.pressed,
          ]}
          testID="scan-album">
          <Text style={styles.secondaryText}>
            {albumBusy ? '正在解析图片…' : '从相册选图'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  back: {
    paddingVertical: 4,
    paddingRight: 16,
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.6,
  },
  previewWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  frame: {
    position: 'absolute',
    top: '22%',
    left: '18%',
    right: '18%',
    bottom: '22%',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 16,
  },
  unsupported: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  unsupportedTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  unsupportedText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#D0D0D0',
    textAlign: 'center',
  },
  cameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  cameraFallbackTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cameraFallbackText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#D0D0D0',
    textAlign: 'center',
  },
  footer: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  hint: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  resultCard: {
    gap: 8,
  },
  resultLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  resultValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  error: {
    fontSize: 12,
    lineHeight: 18,
    color: '#B3261E',
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondary: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
