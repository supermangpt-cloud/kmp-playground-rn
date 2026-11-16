/**
 * The QR encoding layer is pure JS, so these tests run without rendering.
 * They cover the three ticket requirements (levels differ, empty input does
 * not generate, same input is deterministic) plus the label the page shows.
 */
import {describe, expect, it} from '@jest/globals';

import {Utf8TextEncoder} from '../src/qr/textEncoder';
import {
  encodeQr,
  qrLabel,
  qrQuietZonePixels,
  QR_MAX_BYTES,
  utf8ByteLength,
} from '../src/qr/qrCode';

const VALUE = 'https://example.com';

function matrix(level: 'L' | 'M' | 'Q' | 'H') {
  const result = encodeQr(VALUE, level);
  if (!result.ok) {
    throw new Error(`expected ${level} to encode, got: ${result.error}`);
  }
  return result.code;
}

describe('encodeQr', () => {
  it('uses a larger matrix for a stronger error-correction level', () => {
    const low = matrix('L');
    const high = matrix('H');

    expect(high.size).toBeGreaterThan(low.size);
    // Version and size are two views of the same value: size = 17 + 4 * version.
    expect(high.size).toBe(17 + 4 * high.version);
    expect(low.size).toBe(17 + 4 * low.version);
  });

  it('does not generate a matrix for empty input', () => {
    const result = encodeQr('', 'M');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('请输入');
    }
  });

  it('is deterministic for the same input and level', () => {
    const first = matrix('M');
    const second = matrix('M');

    expect(second.version).toBe(first.version);
    expect(second.size).toBe(first.size);
    expect(second.modules).toEqual(first.modules);
    expect(first.modules).toHaveLength(first.size * first.size);
  });

  it('reports a message instead of throwing when the text does not fit', () => {
    // Level H holds 1273 bytes at version 40; 2000 ASCII characters do not fit.
    const result = encodeQr('x'.repeat(2000), 'H');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('内容过长');
      expect(result.error).toContain(String(QR_MAX_BYTES.H));
    }
  });
});

describe('qrLabel', () => {
  it('shows the version, module count and quiet zone', () => {
    const code = matrix('M');

    expect(qrLabel(code)).toBe(
      `版本 ${code.version} · ${code.size}×${code.size} 模块 + 4 模块静区`,
    );
  });
});

describe('qrQuietZonePixels', () => {
  it('maps four modules of the rendered code to pixels', () => {
    // A 200px code of 25 modules has 8px modules, so its quiet zone is 32px.
    expect(qrQuietZonePixels(200, 25)).toBe(32);
  });
});

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes without TextEncoder', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('二维码')).toBe(9);
    expect(utf8ByteLength('🙂')).toBe(4);
  });
});

describe('Utf8TextEncoder', () => {
  it('encodes UTF-8 bytes like the standard TextEncoder', () => {
    // "a" + 二维码 + 🙂 as UTF-8.
    expect(Array.from(new Utf8TextEncoder().encode('a二维码🙂'))).toEqual([
      0x61, 0xe4, 0xba, 0x8c, 0xe7, 0xbb, 0xb4, 0xe7, 0xa0, 0x81, 0xf0, 0x9f,
      0x99, 0x82,
    ]);
  });
});
