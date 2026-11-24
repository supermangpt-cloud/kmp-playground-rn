/**
 * The 扫一扫 page, drawn by React Native.
 *
 * Only the preview and the decode are native (`ScannerView`, a Fabric
 * component): the header, the aiming frame, the hint and 取消 are ordinary
 * views here, so the screen follows the app's theme the way the rest of the port
 * does. HarmonyOS keeps its ArkTS page — this screen is the Android path.
 */
import React, {useCallback, useRef, useState} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ScannerView from '../native/specs/ScannerViewNativeComponent';
import {colors} from '../ui/theme';

type Props = {
  onBack: () => void;
  /** A QR was read; called once per scan. */
  onDecoded: (value: string) => void;
  /** The camera could not start. */
  onFailed: (reason: string) => void;
};

/**
 * True when this build draws the scan page in React Native instead of opening
 * the platform's own page. Android has the Fabric `ScannerView`; HarmonyOS uses
 * its ArkTS page, and iOS has no scanner at all.
 */
export function canDrawScannerInReactNative(): boolean {
  // Android and HarmonyOS both have the native `ScannerView` now; iOS has no
  // scanner, so its 扫一扫 chip keeps reporting that the page is unavailable.
  // Android only for now: on HarmonyOS the ArkUI preview draws correctly but the
  // decode event does not reach JS yet (`Couldn't find ComponentJSIBinder` is
  // gone, the event still does not arrive), so that platform keeps the ArkTS
  // page until the bridge is sorted out.
  const os: string = Platform.OS;
  return os === 'android';
}

export default function ScanScreen({
  onBack,
  onDecoded,
  onFailed,
}: Props): React.JSX.Element {
  // The camera keeps decoding every frame; the page must act on the first one
  // only, or a code held in front of the lens would fire dozens of times.
  const handled = useRef(false);
  const handleDecoded = useCallback(
    (event: {nativeEvent: {value: string}}) => {
      if (handled.current) {
        return;
      }
      handled.current = true;
      onDecoded(event.nativeEvent.value);
    },
    [onDecoded],
  );

  const handleFailed = useCallback(
    (event: {nativeEvent: {reason: string}}) => {
      if (handled.current) {
        return;
      }
      handled.current = true;
      onFailed(event.nativeEvent.reason);
    },
    [onFailed],
  );

  return (
    <View style={styles.screen} testID="scan-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
          testID="scan-back">
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.heading}>扫一扫</Text>
      </View>

      <View style={styles.preview}>
        <ScannerView
          style={StyleSheet.absoluteFill}
          facing="back"
          onDecoded={handleDecoded}
          onFailed={handleFailed}
          testID="scan-preview"
        />
        {/* The frame is RN's: the native side only supplies pixels. */}
        <View pointerEvents="none" style={styles.frameLayer}>
          <View style={styles.frame} testID="scan-frame" />
          <Text style={styles.hint} testID="scan-hint">
            将二维码放入框内，即可自动识别
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消扫码"
          onPress={onBack}
          style={({pressed}) => [styles.cancel, pressed && styles.pressed]}
          testID="scan-cancel">
          <Text style={styles.cancelText}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

const FRAME_SIZE = 240;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#101010',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  preview: {
    flex: 1,
    overflow: 'hidden',
  },
  frameLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
    backgroundColor: 'transparent',
  },
  hint: {
    marginTop: 16,
    fontSize: 13,
    color: '#DDDDDD',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  cancel: {
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
});
