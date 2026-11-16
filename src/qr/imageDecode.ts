/**
 * Decodes a QR code from an image the user picked from the album.
 *
 * The picker (`react-native-image-picker`) returns the image as base64, so the
 * bytes are decoded here with pure-JS decoders: `jpeg-js` for JPEG, `upng-js`
 * for PNG and `jsqr` for the QR detection itself. None of them needs a native
 * adaptation. HEIC/HEIF is not supported by either decoder and is reported as
 * such instead of being silently treated as "no QR code".
 *
 * The scan is two-stage so the common case is fast: `jsqr` first runs on a
 * `SCAN_DIMENSION`-pixel copy (800 px: a sixth of the pixels of 2000 px) with
 * `inversionAttempts: 'dontInvert'` (halves the work again, and our codes are
 * dark-on-light). Only when that misses is the image scanned again at
 * `MAX_DIMENSION`. `jsqr` scans every pixel sequentially in Hermes, so this
 * matters: 2000 px + inverted-attempt fallback took seconds on a phone
 * screenshot, 800 px without inversion takes well under a second.
 */
import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import UPNG from 'upng-js';

/** Fast-path longest side. Most screenshots contain a large code. */
export const SCAN_DIMENSION = 800;

/** Fallback longest side for small codes in a large photo. */
export const MAX_DIMENSION = 2000;

export type ImageDecodeResult =
  | {ok: true; value: string}
  | {ok: false; reason: string};

type DecodedImage = {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
};

export function decodeQrFromBase64(base64: string): ImageDecodeResult {
  const decoded = decodeImageBytes(base64);
  if (!decoded.ok) {
    return decoded;
  }
  const image = decoded.image;

  const first = scan(image, SCAN_DIMENSION);
  if (first !== null) {
    return {ok: true, value: first};
  }
  const second = scan(image, MAX_DIMENSION);
  if (second !== null) {
    return {ok: true, value: second};
  }
  return {ok: false, reason: '图片里没有识别到二维码'};
}

type DecodedBytes =
  | {ok: true; image: DecodedImage}
  | {ok: false; reason: string};

function decodeImageBytes(base64: string): DecodedBytes {
  const bytes = base64ToBytes(base64);
  if (bytes.length === 0) {
    return {ok: false, reason: '图片内容为空'};
  }

  const kind = detectImageKind(bytes);
  try {
    if (kind === 'jpeg') {
      const raw = jpeg.decode(bytes, {useTArray: true});
      return {
        ok: true,
        image: {width: raw.width, height: raw.height, data: raw.data},
      };
    }
    if (kind === 'png') {
      const png = UPNG.decode(toArrayBuffer(bytes));
      const rgba = UPNG.toRGBA8(png)[0];
      return {
        ok: true,
        image: {
          width: png.width,
          height: png.height,
          data: new Uint8Array(rgba),
        },
      };
    }
    return {ok: false, reason: unsupportedKindMessage(kind)};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, reason: `图片解码失败：${message}`};
  }
}

/** Runs jsqr on a copy whose longest side is at most `maxDimension`. */
function scan(image: DecodedImage, maxDimension: number): string | null {
  const scaled = downscale(image, maxDimension);
  try {
    const result = jsQR(
      new Uint8ClampedArray(
        scaled.data.buffer,
        scaled.data.byteOffset,
        scaled.data.byteLength,
      ),
      scaled.width,
      scaled.height,
      {inversionAttempts: 'dontInvert'},
    );
    if (result === null || result.data.length === 0) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

type ImageKind = 'jpeg' | 'png' | 'heic' | 'unknown';

function detectImageKind(bytes: Uint8Array): ImageKind {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  // HEIF brands sit in the ISO-BMFF `ftyp` box: "....ftypheic" / "heix" /
  // "mif1" / "msf1".
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
  ) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) {
      return 'heic';
    }
  }
  return 'unknown';
}

function unsupportedKindMessage(kind: ImageKind): string {
  if (kind === 'heic') {
    return (
      '这张图是 HEIC/HEIF 格式，纯 JS 解码器不支持；' +
      '请从相册选择 JPEG 或 PNG 图片（截图通常是 PNG）'
    );
  }
  return '只支持 JPEG、PNG 图片；请换一张图片再试';
}

function downscale(image: DecodedImage, maxDimension: number): DecodedImage {
  const longestSide = Math.max(image.width, image.height);
  if (longestSide <= maxDimension) {
    return image;
  }
  const scale = maxDimension / longestSide;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale));
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      data[targetIndex] = image.data[sourceIndex];
      data[targetIndex + 1] = image.data[sourceIndex + 1];
      data[targetIndex + 2] = image.data[sourceIndex + 2];
      data[targetIndex + 3] = image.data[sourceIndex + 3];
    }
  }
  return {width, height, data};
}

/**
 * Base64 to bytes without `atob`/`Buffer`, which Hermes in RN 0.72 does not
 * provide. Tolerates a `data:` URL prefix and embedded newlines, both of which
 * pickers have been seen to add.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const commaIndex = base64.indexOf(',');
  const raw =
    base64.startsWith('data:') && commaIndex !== -1
      ? base64.slice(commaIndex + 1)
      : base64;
  const clean = raw.replace(/[\s=]/g, '');
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) {
    lookup[alphabet.charCodeAt(i)] = i;
  }

  const length = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(length);
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? lookup[code] : -1;
    if (value < 0) {
      continue;
    }
    // Bit packing is the point of a base64 decoder.
    /* eslint-disable no-bitwise */
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex++] = (buffer >> bits) & 0xff;
    }
    /* eslint-enable no-bitwise */
  }
  return bytes.subarray(0, byteIndex);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
