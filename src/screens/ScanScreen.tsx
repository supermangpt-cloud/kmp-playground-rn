/**
 * The scan page: camera preview, realtime QR decoding and two fallbacks.
 *
 * Preview and realtime decoding come from the HarmonyOS vision-camera
 * adaptation: its `codeScanner` prop drives Scan Kit's custom preview on an
 * `XComponent` surface, so decoding happens inside the native scan session
 * (frame processors do not exist on RNOH 0.72). JS only receives
 * `onCodeScanned` events through `DeviceEventEmitter`.
 *
 * Scan Kit's custom preview is less forgiving than the system scanner on
 * reflective screens, so the page also offers:
 * - 「用系统扫码」: Scan Kit's default scanning UI, the most reliable path;
 * - 「从相册选图」: image-picker + native Scan Kit image decoding (fast), with
 *   the pure-JS `jsqr` path as the fallback when the native module is absent.
 *
 * Both adaptations are HarmonyOS-only, so `ScanScreen` loads the camera module
 * lazily (`src/native/cameraModule.ts`) and renders an explanation on the other
 * platforms instead of pulling a native module that is not linked there. If the
 * camera cannot start, the page says so and the fallbacks stay usable.
 */
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {loadCameraModule} from '../native/cameraModule';
import type {CameraModule} from '../native/cameraModule';
import {launchImageLibrary} from '../native/imagePicker';
import {
  decodeImage,
  isNativeScanAvailable,
  startSystemScan,
} from '../native/scanKit';
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
      source: 'camera' | 'album' | 'system';
      /** Image size + decoder + duration for album results. */
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
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [albumBusy, setAlbumBusy] = useState(false);
  const [systemBusy, setSystemBusy] = useState(false);
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
    setFallbackError(null);
    setOutcome({kind: 'idle'});
  }, []);

  const pickFromAlbum = useCallback(async () => {
    lastValue.current = null;
    setFallbackError(null);
    setAlbumBusy(true);
    // The image-picker callback is asynchronous; `busy` keeps the buttons
    // disabled until the decode below finishes.
    try {
      const nativeDecodeAvailable = isNativeScanAvailable();
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        maxWidth: 2000,
        maxHeight: 2000,
        // Native decoding reads the cache file directly; only the JS fallback
        // needs the (memory-heavy) base64 of the original image.
        includeBase64: !nativeDecodeAvailable,
      });
      if (result.didCancel) {
        return;
      }
      if (result.errorCode !== undefined) {
        setFallbackError(
          `无法打开相册：${result.errorMessage ?? result.errorCode}`,
        );
        return;
      }
      const asset = result.assets?.[0];
      if (asset === undefined) {
        setFallbackError('没有拿到图片');
        return;
      }
      const nativeStartedAt = Date.now();
      if (nativeDecodeAvailable && asset.uri !== undefined) {
        const native = await decodeImage(asset.uri);
        if (native.ok) {
          if (__DEV__) {
            console.log(
              `[scan] album decode method=scankit ms=${
                Date.now() - nativeStartedAt
              }`,
            );
          }
          lastValue.current = native.values[0];
          setOutcome({
            kind: 'scanned',
            value: native.values[0],
            type: 'qr',
            source: 'album',
            detail: imageDetail(
              asset.width,
              asset.height,
              'ScanKit',
              Date.now() - nativeStartedAt,
            ),
          });
          return;
        }
        if (__DEV__) {
          console.log(
            `[scan] album scankit failed ms=${Date.now() - nativeStartedAt}: ${
              native.error
            }`,
          );
        }
      }

      if (asset.base64 === undefined) {
        setFallbackError(
          '图片选择器没有返回 base64，无法在 JS 里解码这张图；' +
            `返回的 URI 是 ${asset.uri ?? '空'}`,
        );
        return;
      }
      const startedAt = Date.now();
      const decoded = decodeQrFromBase64(asset.base64);
      const elapsed = Date.now() - startedAt;
      if (__DEV__) {
        console.log(
          `[scan] album decode method=jsqr ms=${elapsed} ok=${decoded.ok}`,
        );
      }
      if (!decoded.ok) {
        setFallbackError(decoded.reason);
        return;
      }
      lastValue.current = decoded.value;
      setOutcome({
        kind: 'scanned',
        value: decoded.value,
        type: 'qr',
        source: 'album',
        detail: imageDetail(asset.width, asset.height, 'jsqr', elapsed),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFallbackError(`无法读取相册图片：${message}`);
    } finally {
      setAlbumBusy(false);
    }
  }, []);

  const openSystemScan = useCallback(async () => {
    lastValue.current = null;
    setFallbackError(null);
    setSystemBusy(true);
    const startedAt = Date.now();
    try {
      const result = await startSystemScan();
      if (__DEV__) {
        console.log(
          `[scan] system scan ms=${Date.now() - startedAt} ok=${result.ok}`,
        );
      }
      if (!result.ok) {
        // A plain user cancel is silent; a cancel that carries an error (for
        // example Scan Kit's 1000500001) is reported.
        if (result.error !== undefined) {
          setFallbackError(result.error);
        }
        return;
      }
      lastValue.current = result.value;
      setOutcome({
        kind: 'scanned',
        value: result.value,
        type: 'qr',
        source: 'system',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFallbackError(`系统扫码失败：${message}`);
    } finally {
      setSystemBusy(false);
    }
  }, []);

  const cameraUnavailable = outcome.kind === 'camera-error';
  const cameraActive = outcome.kind !== 'scanned' && !albumBusy && !systemBusy;
  const busy = albumBusy || systemBusy;

  let statusText: string;
  if (cameraUnavailable) {
    statusText = '相机没有启动，请用系统扫码或相册解码';
  } else if (outcome.kind === 'idle') {
    statusText =
      '正在扫描 · 对准二维码保持 10–20cm，别晃动；扫不动就用系统扫码';
  } else {
    statusText = '';
  }

  return (
    <View style={styles.screen} testID="scan-screen">
      <Header onBack={onBack} />

      <View style={styles.previewWrap} testID="scan-preview">
        {cameraUnavailable ? (
          <View style={styles.cameraFallback} testID="scan-camera-unavailable">
            <Text style={styles.cameraFallbackTitle}>相机不可用</Text>
            <Text style={styles.cameraFallbackText}>{outcome.message}</Text>
            <Text style={styles.cameraFallbackText}>
              请用下面的「用系统扫码」或「从相册选图」。
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
              {outcome.source === 'camera'
                ? '相机识别'
                : outcome.source === 'system'
                ? '系统扫码'
                : '相册识别'}{' '}
              · {outcome.type}
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
            {statusText}
          </Text>
        )}

        {fallbackError === null ? null : (
          <Text style={styles.error} testID="scan-fallback-error">
            {fallbackError}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="用系统扫码"
          disabled={busy}
          onPress={openSystemScan}
          style={({pressed}) => [
            styles.primary,
            (pressed || busy) && styles.pressed,
          ]}
          testID="scan-system">
          <Text style={styles.primaryText}>
            {systemBusy ? '正在打开系统扫码…' : '用系统扫码（识别率最好）'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="从相册选图"
          disabled={busy}
          onPress={pickFromAlbum}
          style={({pressed}) => [
            styles.secondary,
            (pressed || busy) && styles.pressed,
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

function imageDetail(
  width: number | undefined,
  height: number | undefined,
  method: string,
  milliseconds: number,
): string {
  const size =
    width !== undefined && height !== undefined ? `${width}×${height} · ` : '';
  return `${size}${method} ${milliseconds}ms`;
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
