/* eslint-disable no-bitwise -- UTF-8 encoding is defined in terms of bit operations */
/**
 * Minimal `TextEncoder` polyfill for Hermes.
 *
 * `qrcode@1.5.4` (react-native-qrcode-svg's encoder) calls
 * `new TextEncoder().encode(text)`. React Native 0.72's Hermes runtime does not
 * provide `TextEncoder` (the failure react-native-qrcode-svg's README links),
 * so every encode would throw and the page would claim the input is too long.
 *
 * Only `encode(string) -> Uint8Array` is implemented, which is the whole
 * surface the encoder uses. Installing it globally (instead of wrapping the
 * encoder call) also covers react-native-qrcode-svg's own `genMatrix` call.
 */
type TextEncoderLike = {encode: (input?: string) => Uint8Array};

type TextEncoderConstructor = new () => TextEncoderLike;

const globalObject = globalThis as unknown as {
  TextEncoder?: TextEncoderConstructor;
};

export class Utf8TextEncoder implements TextEncoderLike {
  encode(input: string = ''): Uint8Array {
    const bytes: number[] = [];
    for (let index = 0; index < input.length; index++) {
      let codePoint = input.charCodeAt(index);
      if (
        codePoint >= 0xd800 &&
        codePoint <= 0xdbff &&
        index + 1 < input.length
      ) {
        const next = input.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          codePoint = ((codePoint - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
          index++;
        }
      }
      if (codePoint < 0x80) {
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      } else if (codePoint < 0x10000) {
        bytes.push(
          0xe0 | (codePoint >> 12),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
      } else {
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
      }
    }
    return new Uint8Array(bytes);
  }
}

export function installTextEncoder(): TextEncoderConstructor {
  if (globalObject.TextEncoder === undefined) {
    globalObject.TextEncoder = Utf8TextEncoder;
  }
  return globalObject.TextEncoder;
}

installTextEncoder();
