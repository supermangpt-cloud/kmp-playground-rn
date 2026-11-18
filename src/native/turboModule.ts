/**
 * Access to the JS-facing native modules behind the capability wrappers.
 *
 * `TurboModuleRegistry` is the supported lookup on every platform since
 * RN 0.76; the legacy `NativeModules` table only carries modules that opted
 * into its interop layer, and neither this app's modules nor the adapted
 * libraries did. `get` returns null for an absent module, which is what the
 * callers here already handle.
 */
import {TurboModuleRegistry} from 'react-native';

type TurboModule = object;

export function getTurboModule<T>(name: string): T | null {
  try {
    const module = TurboModuleRegistry.get<TurboModule>(name);
    return (module as T | null) ?? null;
  } catch {
    return null;
  }
}
