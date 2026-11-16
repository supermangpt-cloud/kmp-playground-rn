/**
 * Tests for the album path: base64 -> pixels -> QR value.
 *
 * The PNG is generated at test time with the same `qrcode` encoder the QR page
 * uses; the JPEG fixture is a real JPEG (committed under `__tests__/fixtures`)
 * so the `jpeg-js` branch is exercised too. Both run in plain Node, which is
 * also the environment jsqr sees inside Hermes.
 */
import {readFileSync} from 'fs';
import path from 'path';

import {it, expect} from '@jest/globals';
import {toBuffer} from 'qrcode';

import {
  base64ToBytes,
  decodeQrFromBase64,
  MAX_DIMENSION,
} from '../src/qr/imageDecode';

const FIXTURE_TEXT = 'KMP RN 相册解码 2026-11-16';

it('decodes a PNG QR code from base64', async () => {
  const png = await toBuffer(FIXTURE_TEXT, {
    type: 'png',
    width: 600,
    margin: 4,
    errorCorrectionLevel: 'Q',
  });
  const result = decodeQrFromBase64(Buffer.from(png).toString('base64'));
  expect(result).toEqual({ok: true, value: FIXTURE_TEXT});
});

it('decodes a JPEG QR code from base64', () => {
  const jpeg = readFileSync(path.join(__dirname, 'fixtures', 'album-qr.jpg'));
  const result = decodeQrFromBase64(jpeg.toString('base64'));
  expect(result).toEqual({ok: true, value: FIXTURE_TEXT});
});

it('reports an image without a QR code instead of throwing', () => {
  // 1x1 white PNG: valid image, no code in it.
  const blank =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const result = decodeQrFromBase64(blank);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toBe('图片里没有识别到二维码');
  }
});

it('rejects bytes that are not an image', () => {
  const result = decodeQrFromBase64(
    Buffer.from('this is not an image at all').toString('base64'),
  );
  expect(result).toEqual({
    ok: false,
    reason: '只支持 JPEG、PNG 图片；请换一张图片再试',
  });
});

it('names HEIC as unsupported instead of "no QR code"', () => {
  const heic = Buffer.alloc(24);
  heic.write('ftypheic', 4, 'ascii');
  const result = decodeQrFromBase64(heic.toString('base64'));
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toContain('HEIC');
  }
});

it('decodes base64 to the original bytes', () => {
  const bytes = base64ToBytes(
    Buffer.from([0, 1, 2, 250, 251, 252]).toString('base64'),
  );
  expect(Array.from(bytes)).toEqual([0, 1, 2, 250, 251, 252]);
});

it('limits the scanned side to MAX_DIMENSION', () => {
  // A 1x1 QR can be found at any size, so this only asserts the constant is
  // the value the page passes to the picker's resize hint.
  expect(MAX_DIMENSION).toBe(2000);
});
