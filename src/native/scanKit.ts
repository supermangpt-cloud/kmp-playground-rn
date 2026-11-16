/**
 * JS side of the app's native `ScanKit` module (see
 * `harmony/entry/src/main/ets/scan/ScanKitTurboModule.ets`).
 *
 * `startScanner` is the main scan path: it opens the self-drawn ArkTS
 * `pages/ScanPage` (Scan Kit `customScan` on an XComponent surface) and
 * resolves when the page pops with a code, a cancel or a failure.
 * `startSystemScanner` opens Scan Kit's default scanning UI and is kept as a
 * separate explicit fallback. `decodeImage` runs Scan Kit's native still-image
 * decoder for the platform-capability page's album pick.
 */
import {getTurboModule} from './turboModule';

type NativeScanKit = {
  decodeImage: (uri: string) => Promise<{values?: string[]; error?: string}>;
  startScanner: () => Promise<{
    status?: string;
    value?: string;
    reason?: string;
  }>;
  startSystemScanner: () => Promise<{
    cancelled?: boolean;
    value?: string;
    error?: string;
  }>;
};

export type ImageDecodeOutcome =
  | {ok: true; values: string[]}
  | {ok: false; error: string};

export type SystemScanOutcome =
  | {ok: true; value: string}
  | {ok: false; cancelled: boolean; error?: string};

/** Result of the self-drawn scan page; `cancelled` is a plain user cancel. */
export type ScanOutcome =
  | {ok: true; value: string}
  | {ok: false; cancelled: boolean; error?: string};

function getScanKit(): NativeScanKit | null {
  const module = getTurboModule<NativeScanKit>('ScanKit');
  if (module === null || typeof module.decodeImage !== 'function') {
    return null;
  }
  return module;
}

export function isNativeScanAvailable(): boolean {
  return getScanKit() !== null;
}

/** Decodes every QR code in the image behind `uri`. */
export async function decodeImage(uri: string): Promise<ImageDecodeOutcome> {
  const scanKit = getScanKit();
  if (scanKit === null) {
    return {ok: false, error: 'ScanKit 模块没有注册'};
  }
  const result = await scanKit.decodeImage(uri);
  if (result.error !== undefined) {
    return {ok: false, error: result.error};
  }
  const values = result.values ?? [];
  if (values.length === 0) {
    return {ok: false, error: '图片里没有识别到二维码'};
  }
  return {ok: true, values};
}

/**
 * Opens the self-drawn ArkTS scanning page and resolves with what it found.
 *
 * The module is absent on Android/iOS (the page is HarmonyOS-only), so that
 * case is reported as a normal failure instead of a rejected promise; the list
 * page then shows the reason without treating it as a crash.
 */
export async function startScanner(): Promise<ScanOutcome> {
  const scanKit = getScanKit();
  if (scanKit === null || typeof scanKit.startScanner !== 'function') {
    return {ok: false, cancelled: false, error: '自绘扫码页只在鸿蒙版提供'};
  }
  try {
    const result = await scanKit.startScanner();
    const status = result.status ?? 'failed';
    if (status === 'ok') {
      const value = result.value ?? '';
      if (value.length === 0) {
        return {ok: false, cancelled: false, error: '扫码没有返回内容'};
      }
      return {ok: true, value};
    }
    if (status === 'cancelled') {
      return {ok: false, cancelled: true};
    }
    return {
      ok: false,
      cancelled: false,
      error: result.reason ?? `扫码失败（${status}）`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, cancelled: false, error: `扫码失败：${message}`};
  }
}

/** Opens the system scan page; `cancelled` means the user closed it. */
export async function startSystemScanner(): Promise<SystemScanOutcome> {
  const scanKit = getScanKit();
  if (scanKit === null || typeof scanKit.startSystemScanner !== 'function') {
    return {ok: false, cancelled: false, error: 'ScanKit 模块没有注册'};
  }
  const result = await scanKit.startSystemScanner();
  if (result.cancelled === true) {
    return {ok: false, cancelled: true, error: result.error};
  }
  if (result.value === undefined || result.value.length === 0) {
    return {ok: false, cancelled: false, error: '系统扫码没有返回内容'};
  }
  return {ok: true, value: result.value};
}
