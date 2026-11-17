/**
 * JS side of `@react-native-oh-tpl/async-storage`'s HarmonyOS module.
 *
 * The package's own binding goes through RN 0.72's `TurboModuleRegistry`, which
 * checks the legacy `NativeModules` table before the turbo module proxy; on
 * RNOH that table answers every name with an empty stub, so the package ends up
 * with a module that has no methods. Asking `global.__turboModuleProxy`
 * directly reaches the ArkTS `RNCAsyncStorage` module registered by
 * `PackageProvider.ets`, the same route `src/native/imagePicker.ts` takes.
 *
 * `multiGet` / `multiSet` / `multiRemove` are the callback-style methods of that
 * module (its C++ package binds them with `ARK_METHOD_METADATA`).
 */
import {getTurboModule} from './turboModule';

type Pair = [string, string];

type NativeAsyncStorage = {
  multiGet: (
    keys: string[],
    callback: (error?: unknown, result?: Pair[] | null) => void,
  ) => void;
  multiSet: (pairs: Pair[], callback: (error?: unknown) => void) => void;
  multiRemove: (keys: string[], callback: (error?: unknown) => void) => void;
};

function getStorage(): NativeAsyncStorage | null {
  const module = getTurboModule<NativeAsyncStorage>('RNCAsyncStorage');
  if (
    module === null ||
    typeof module.multiGet !== 'function' ||
    typeof module.multiSet !== 'function' ||
    typeof module.multiRemove !== 'function'
  ) {
    return null;
  }
  return module;
}

function reasonOf(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const {message, code} = error as {message?: unknown; code?: unknown};
    if (typeof message === 'string' && message.length > 0) {
      return code === undefined
        ? message
        : `${message}（code ${String(code)}）`;
    }
  }
  return fallback;
}

function requireStorage(): NativeAsyncStorage {
  const storage = getStorage();
  if (storage === null) {
    throw new Error(
      'AsyncStorage 模块没有注册（RNCAsyncStorage 没有 multiGet/multiSet）',
    );
  }
  return storage;
}

/** Reads `key`; a key that was never written (or was removed) is `null`. */
export function getItem(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    requireStorage().multiGet([key], (error, result) => {
      if (error !== undefined && error !== null) {
        reject(new Error(reasonOf(error, '读取失败')));
        return;
      }
      const pair = result?.find(([storedKey]) => storedKey === key);
      // The HarmonyOS module answers a missing key with `[key, '']`.
      resolve(pair === undefined || pair[1] === '' ? null : pair[1]);
    });
  });
}

/** Writes `value` under `key`, replacing any earlier value. */
export function setItem(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    requireStorage().multiSet([[key, value]], error => {
      if (error !== undefined && error !== null) {
        reject(new Error(reasonOf(error, '写入失败')));
        return;
      }
      resolve();
    });
  });
}

/** Removes `key`; removing a missing key is still success. */
export function removeItem(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    requireStorage().multiRemove([key], error => {
      if (error !== undefined && error !== null) {
        reject(new Error(reasonOf(error, '删除失败')));
        return;
      }
      resolve();
    });
  });
}
