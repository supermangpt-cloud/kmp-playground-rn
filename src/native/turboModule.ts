/**
 * Access to the JS-facing native modules behind the capability wrappers.
 *
 * On Android and iOS both the app's own modules (`CapabilityProbe`,
 * `ImageSave`, `WifiNetwork`) and the official libraries (async-storage,
 * clipboard, image picker, ble-plx) are registered in React Native's legacy
 * `NativeModules` table, so that table is the lookup here.
 *
 * HarmonyOS needs a different route: RNOH answers every name in that table
 * with an empty stub, so `turboModule.harmony.ts` asks `__turboModuleProxy`
 * directly instead. Metro picks that file for the `harmony` platform; the
 * wrappers are otherwise unchanged.
 */
import {NativeModules} from 'react-native';

export function getTurboModule<T>(name: string): T | null {
  const module = (NativeModules as unknown as Record<string, unknown>)[name];
  return (module as T | undefined) ?? null;
}
