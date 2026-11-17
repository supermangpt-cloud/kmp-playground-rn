/**
 * JS side of the app's `ImageSave` module: writing a generated PNG into the
 * system album (`photoAccessHelper.createAsset` on HarmonyOS, MediaStore on
 * Android, PHPhotoLibrary on iOS).
 *
 * The module answers with a result object instead of rejecting for the two
 * expected failures (permission denied, asset not writable), because the page
 * has to distinguish "the user said no, offer 去设置" from "the platform failed,
 * show the reason". A rejection would flatten both into an opaque Error; the
 * structured answer keeps the flow honest.
 *
 * A build without the module (for example a platform the app has not been
 * ported to) gets null from `getTurboModule`, and the pages report that the
 * save path is unavailable instead of pretending it ran.
 */
import {getTurboModule} from './turboModule';

export type ImageSaveResult =
  | {saved: true; uri: string; title: string}
  | {saved: false; permissionDenied: boolean; reason: string};

type NativeSavePayload = {
  saved?: unknown;
  uri?: unknown;
  title?: unknown;
  permissionDenied?: unknown;
  reason?: unknown;
};

type NativeImageSave = {
  /** `base64` is a complete PNG; `title` is shown as the asset name. */
  saveImage: (base64: string, title: string) => Promise<unknown>;
};

/** Whether this platform's save module is registered in this build. */
export function isImageSaveAvailable(): boolean {
  const module = getTurboModule<NativeImageSave>('ImageSave');
  return module !== null && typeof module.saveImage === 'function';
}

function requireModule(): NativeImageSave {
  const module = getTurboModule<NativeImageSave>('ImageSave');
  if (module === null || typeof module.saveImage !== 'function') {
    throw new Error(
      'ImageSave 模块没有注册（saveImage 不存在）；本平台没有相册写入实现',
    );
  }
  return module;
}

/**
 * Writes one PNG (base64, no data-URL prefix) into the album and returns what
 * the platform reported. Rejects only when the module is missing or the native
 * answer does not follow the contract.
 */
export async function savePngToAlbum(
  base64: string,
  title: string,
): Promise<ImageSaveResult> {
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error('没有可保存的 PNG 内容');
  }
  if (typeof title !== 'string' || title.length === 0) {
    throw new Error('保存到相册需要一个文件名');
  }

  const module = requireModule();
  let payload: unknown;
  try {
    payload = await module.saveImage(base64, title);
  } catch (error) {
    throw new Error(`保存到相册失败：${messageOf(error)}`);
  }
  return asResult(payload);
}

function asResult(payload: unknown): ImageSaveResult {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('保存到相册返回了无法识别的结果');
  }
  const value = payload as NativeSavePayload;
  if (value.saved === true) {
    if (typeof value.uri !== 'string' || value.uri.length === 0) {
      throw new Error('保存到相册成功但没有返回相册 URI');
    }
    if (typeof value.title !== 'string' || value.title.length === 0) {
      throw new Error('保存到相册成功但没有返回文件名');
    }
    return {saved: true, uri: value.uri, title: value.title};
  }
  if (value.saved === false) {
    return {
      saved: false,
      permissionDenied: value.permissionDenied === true,
      reason:
        typeof value.reason === 'string' && value.reason.length > 0
          ? value.reason
          : '平台没有给出失败原因',
    };
  }
  throw new Error(`保存到相册返回了无法识别的结果：${JSON.stringify(payload)}`);
}

function messageOf(error: unknown): string {
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
  return String(error);
}

/**
 * The asset title, e.g. `KMP-RN-QR-20261117-180300`. createAsset rejects a
 * handful of path characters but accepts letters, digits, `-` and spaces; this
 * form avoids all of them and stays unique enough to find in the album.
 */
export function qrSaveTitle(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
      date.getSeconds(),
    )}`;
  return `KMP-RN-QR-${stamp}`;
}
