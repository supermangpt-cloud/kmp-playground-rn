/**
 * Type declarations for `qrcode`, the encoder behind react-native-qrcode-svg.
 *
 * HAND-WRITTEN: the `qrcode@1.5.4` package ships no TypeScript declarations
 * (`@types/qrcode` is a separate package). Only the small surface this app
 * uses is declared: `create(text, {errorCorrectionLevel})` returns the module
 * matrix and the version the label shows.
 */
declare module 'qrcode' {
  export type QRCodeErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  export type QRCodeSymbol = {
    /** QR version (1-40) chosen for the data and error-correction level. */
    version: number;
    modules: {
      /** Modules per side; the matrix is `size × size`. */
      size: number;
      /** Row-major module bits: 1 = dark, 0 = light. */
      data: Uint8Array;
    };
  };

  export function create(
    text: string,
    options?: {errorCorrectionLevel?: QRCodeErrorCorrectionLevel},
  ): QRCodeSymbol;

  export function toBuffer(
    text: string,
    options?: {errorCorrectionLevel?: QRCodeErrorCorrectionLevel} & {
      type?: 'png' | 'svg';
      width?: number;
      margin?: number;
    },
  ): Promise<Uint8Array>;
}
