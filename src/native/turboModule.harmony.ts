/**
 * HarmonyOS lookup for the JS-facing native modules.
 *
 * RNOH answers names through `TurboModuleRegistry`, the same table React
 * Native itself reads. Asking it directly (instead of the legacy
 * `NativeModules` table) is what the platform expects since RN 0.76: the
 * legacy table only carries modules registered with the old interop layer,
 * and none of this app's modules or its adapted libraries are.
 */
import {TurboModuleRegistry} from 'react-native';

type TurboModule = object;

export function getTurboModule<T>(name: string): T | null {
  try {
    // `get` returns null instead of throwing when the module is absent, which
    // is what every caller here already handles.
    const module = TurboModuleRegistry.get<TurboModule>(name);
    return (module as T | null) ?? null;
  } catch {
    return null;
  }
}
