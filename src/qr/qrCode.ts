/**
 * QR encoding, shared by the screen and the tests.
 *
 * The matrix comes from `qrcode`, the same encoder react-native-qrcode-svg
 * uses internally. Keeping the call here (instead of only inside the
 * component) gives the page two things the component does not expose: the QR
 * version for the `版本 N · M×M 模块` label, and a validation result it can
 * render instead of letting a too-long value throw during render.
 */
// Installs the Hermes `TextEncoder` missing from RN 0.72; `qrcode` needs it.
// Imported for its side effect before the first `create()` call.
import './textEncoder';

import {create} from 'qrcode';

/** Error-correction levels, in the standard L < M < Q < H order. */
export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export const QR_ERROR_CORRECTION_LEVELS: readonly QrErrorCorrection[] = [
  'L',
  'M',
  'Q',
  'H',
];

/** The mandatory four light modules a scanner needs around the code. */
export const QR_QUIET_ZONE_MODULES = 4;

/**
 * The maximum UTF-8 byte count at each level in 8-bit mode at version 40, the
 * largest version the QR specification defines. Same numbers as the KMP build
 * (`QrCapacity.maxBytes`), used only to explain an overflow.
 */
export const QR_MAX_BYTES: Readonly<Record<QrErrorCorrection, number>> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

export type QrCode = {
  /** QR version 1-40; the label shows it. */
  version: number;
  /** Modules per side (not including the quiet zone). */
  size: number;
  /** Row-major module bits: `true` = dark. Length is `size * size`. */
  modules: readonly boolean[];
};

export type QrEncoding = {ok: true; code: QrCode} | {ok: false; error: string};

/**
 * Encodes `text` at `level`. Blank input and input that does not fit are
 * returned as a message for the page, never thrown.
 */
export function encodeQr(text: string, level: QrErrorCorrection): QrEncoding {
  if (text.length === 0) {
    return {ok: false, error: '请输入要生成二维码的内容'};
  }
  try {
    const symbol = create(text, {errorCorrectionLevel: level});
    const size = symbol.modules.size;
    const modules: boolean[] = new Array(size * size);
    for (let i = 0; i < modules.length; i++) {
      modules[i] = symbol.modules.data[i] === 1;
    }
    return {
      ok: true,
      code: {version: symbol.version, size, modules},
    };
  } catch (error) {
    // `qrcode` throws this one message when the data does not fit; anything
    // else (for example a missing runtime global) must not be reported as an
    // overflow, so the page shows a different hint.
    if (isOverflowError(error)) {
      return {
        ok: false,
        error:
          `内容过长：共 ${utf8ByteLength(text)} 字节，超过纠错级别 ${level} ` +
          `最多 ${QR_MAX_BYTES[level]} 字节的容量`,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, error: `无法生成二维码：${message}`};
  }
}

function isOverflowError(error: unknown): boolean {
  return error instanceof Error && /too big to be stored/i.test(error.message);
}

/** The `版本 N · M×M 模块 + 4 模块静区` line, matching the KMP build. */
export function qrLabel(code: QrCode): string {
  const version = (code.size - 17) / 4;
  return `版本 ${version} · ${code.size}×${code.size} 模块 + ${QR_QUIET_ZONE_MODULES} 模块静区`;
}

/**
 * The quiet-zone prop for react-native-qrcode-svg, which measures the margin
 * in pixels rather than modules: four modules of the rendered code.
 */
export function qrQuietZonePixels(
  displaySize: number,
  moduleCount: number,
): number {
  return (displaySize / moduleCount) * QR_QUIET_ZONE_MODULES;
}

/**
 * UTF-8 byte length without `TextEncoder`, which Hermes in RN 0.72 does not
 * provide (react-native-qrcode-svg's own README links that failure).
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
        ? 3
        : 4;
  }
  return bytes;
}
