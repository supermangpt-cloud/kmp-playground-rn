/**
 * Direct access to turbo modules registered by the HarmonyOS adaptations.
 *
 * RN 0.72's `TurboModuleRegistry` checks the legacy `NativeModules` table
 * before the turbo module proxy, and RNOH answers every name from that table
 * with an empty stub. Asking `global.__turboModuleProxy` directly reaches the
 * ArkTS modules registered by `PackageProvider.ets`.
 */
type TurboModuleProxy = (name: string) => unknown;

export function getTurboModule<T>(name: string): T | null {
  const proxy = (global as unknown as {__turboModuleProxy?: TurboModuleProxy})
    .__turboModuleProxy;
  if (typeof proxy !== 'function') {
    return null;
  }
  try {
    const module = proxy(name);
    return (module as T) ?? null;
  } catch {
    return null;
  }
}
