/* eslint-disable no-bitwise -- PNG deflate/CRC/Adler-32 are bit arithmetic. */
/**
 * Turns a QR matrix into a PNG, entirely in JS.
 *
 * The save flow needs PNG bytes, and the RN side has no writable file API.
 * `react-native-svg`'s `toDataURL` exists on the HarmonyOS adaptation, but it
 * needs the SVG mounted and a native view tag, so the platform-capability row
 * (which has no QR on screen) could not use it. Encoding the matrix here keeps
 * both entry points — the QR page and the capability row — on one code path,
 * and makes the result testable: `__tests__/qrPng.test.ts` decodes the PNG and
 * scans it back with jsqr.
 *
 * The encoding is deliberately the simplest valid PNG: 8-bit grayscale, filter
 * 0 on every scanline, and zlib's stored (uncompressed) deflate blocks. That
 * avoids dragging a compressor into the bundle; a version-2 code is ~150 KB of
 * base64, which the bridge carries fine. The scale is chosen from the matrix
 * size so a version-40 code does not turn into megabytes.
 */
import {QrCode, QR_QUIET_ZONE_MODULES} from './qrCode';

/** Side length the module size aims for before clamping. */
const TARGET_SIDE_PIXELS = 660;

/** A module smaller than this produces soft edges scanners dislike. */
const MIN_MODULE_PIXELS = 3;

/** The on-screen code is 220 px; 12 px per module keeps the file crisp. */
const MAX_MODULE_PIXELS = 12;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type QrPngOptions = {
  /** Pixels per QR module; derived from the code size when omitted. */
  modulePixels?: number;
};

/**
 * Pixels per module for this matrix: about `TARGET_SIDE_PIXELS` wide, clamped
 * so tiny codes stay sharp and huge codes stay small enough for the bridge.
 */
export function qrModulePixels(
  moduleCount: number,
  targetSidePixels: number = TARGET_SIDE_PIXELS,
): number {
  const modules = moduleCount + QR_QUIET_ZONE_MODULES * 2;
  const fitted = Math.round(targetSidePixels / modules);
  return Math.min(MAX_MODULE_PIXELS, Math.max(MIN_MODULE_PIXELS, fitted));
}

/** The PNG as raw bytes: 8-bit grayscale, quiet zone included. */
export function qrPngBytes(
  code: QrCode,
  options: QrPngOptions = {},
): Uint8Array {
  const modulePixels = options.modulePixels ?? qrModulePixels(code.size);
  if (!Number.isInteger(modulePixels) || modulePixels < 1) {
    throw new Error(`每模块像素数无效：${String(modulePixels)}`);
  }
  if (code.modules.length !== code.size * code.size) {
    throw new Error(
      `二维码矩阵不完整：${code.modules.length} 个模块，应为 ${
        code.size * code.size
      } 个`,
    );
  }

  const quiet = QR_QUIET_ZONE_MODULES;
  const side = (code.size + quiet * 2) * modulePixels;
  // One filter byte (0 = None) in front of each scanline.
  const stride = side + 1;
  const raw = new Uint8Array(stride * side);
  raw.fill(0xff);
  for (let y = 0; y < side; y++) {
    raw[y * stride] = 0;
  }

  for (let row = 0; row < code.size; row++) {
    for (let column = 0; column < code.size; column++) {
      if (code.modules[row * code.size + column] !== true) {
        continue;
      }
      const x0 = (quiet + column) * modulePixels;
      const y0 = (quiet + row) * modulePixels;
      for (let y = y0; y < y0 + modulePixels; y++) {
        const line = y * stride + 1 + x0;
        raw.fill(0x00, line, line + modulePixels);
      }
    }
  }

  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, side);
  writeUint32BE(ihdr, 4, side);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  return concatBytes([
    new Uint8Array(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibStored(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

/** The PNG as standard base64, ready for the native save module. */
export function qrPngBase64(code: QrCode, options: QrPngOptions = {}): string {
  return base64Encode(qrPngBytes(code, options));
}

/** Wraps `data` in a zlib stream of stored (BTYPE=00) deflate blocks. */
function zlibStored(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.length / 0xffff));
  const out = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  out[0] = 0x78; // deflate, 32K window
  out[1] = 0x01; // no preset dictionary, fastest compression level
  let offset = 0;
  let wrote = 2;
  for (let block = 0; block < blockCount; block++) {
    const length = Math.min(0xffff, data.length - offset);
    out[wrote++] = block === blockCount - 1 ? 1 : 0; // BFINAL, BTYPE=00
    out[wrote++] = length & 0xff;
    out[wrote++] = (length >>> 8) & 0xff;
    out[wrote++] = ~length & 0xff;
    out[wrote++] = (~length >>> 8) & 0xff;
    out.set(data.subarray(offset, offset + length), wrote);
    wrote += length;
    offset += length;
  }
  writeUint32BE(out, wrote, adler32(data));
  wrote += 4;
  return out.subarray(0, wrote);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32BE(out, 0, data.length);
  let crc = 0xffffffff;
  for (let i = 0; i < type.length; i++) {
    const byte = type.charCodeAt(i) & 0xff;
    out[4 + i] = byte;
    crc = crc32Byte(crc, byte);
  }
  out.set(data, 8);
  for (let i = 0; i < data.length; i++) {
    crc = crc32Byte(crc, data[i]);
  }
  writeUint32BE(out, 8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return out;
}

let crcTable: Uint32Array | undefined;

function crc32Byte(crc: number, byte: number): number {
  if (crcTable === undefined) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let value = n;
      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[n] = value >>> 0;
    }
  }
  return (crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint32BE(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    parts.push(
      BASE64_ALPHABET[a >>> 2] +
        BASE64_ALPHABET[((a & 0x03) << 4) | (b >>> 4)] +
        (i + 1 < bytes.length
          ? BASE64_ALPHABET[((b & 0x0f) << 2) | (c >>> 6)]
          : '=') +
        (i + 2 < bytes.length ? BASE64_ALPHABET[c & 0x3f] : '='),
    );
  }
  return parts.join('');
}
