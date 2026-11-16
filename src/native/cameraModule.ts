/**
 * Loads the HarmonyOS camera module only where it exists.
 *
 * `@react-native-ohos/react-native-vision-camera` imports its native turbo
 * module at module scope, which throws on Android/iOS where that module is not
 * linked. The scan page is HarmonyOS-only (its preview is Camera Kit plus Scan
 * Kit's custom scan session), so the package is required lazily and only when
 * `Platform.OS === 'harmony'`; elsewhere the page renders an explanation
 * instead of crashing the app at startup.
 */
import {Platform} from 'react-native';

export type CameraModule =
  typeof import('@react-native-ohos/react-native-vision-camera');

export function loadCameraModule(): CameraModule | null {
  // RN's Platform type does not know the 'harmony' value RNOH reports.
  if ((Platform.OS as string) !== 'harmony') {
    return null;
  }
  return require('@react-native-ohos/react-native-vision-camera');
}
