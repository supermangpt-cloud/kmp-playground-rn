/**
 * JS side of the app's native `ScanKit` module (see
 * `harmony/entry/src/main/ets/scan/ScanKitTurboModule.ets`).
 *
 * `decodeImage` runs Scan Kit's native still-image decoder on a picked image;
 * `startSystemScan` opens Scan Kit's default UI, whose recognition rate is the
 * platform's best, as the fallback for the in-page preview scanner.
 */
import {getTurboModule} from './turboModule';

type NativeScanKit = {
  decodeImage: (uri: string) => Promise<{values?: string[]; error?: string}>;
  startSystemScan: () => Promise<{
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

/** Opens the system scan page; `cancelled` means the user closed it. */
export async function startSystemScan(): Promise<SystemScanOutcome> {
  const scanKit = getScanKit();
  if (scanKit === null) {
    return {ok: false, cancelled: false, error: 'ScanKit 模块没有注册'};
  }
  const result = await scanKit.startSystemScan();
  if (result.cancelled === true) {
    return {ok: false, cancelled: true, error: result.error};
  }
  if (result.value === undefined || result.value.length === 0) {
    return {ok: false, cancelled: false, error: '系统扫码没有返回内容'};
  }
  return {ok: true, value: result.value};
}
