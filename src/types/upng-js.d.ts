/**
 * Type declarations for `upng-js`.
 *
 * HAND-WRITTEN: `upng-js@2.1.0` ships no TypeScript declarations. Only the
 * decode path the album scanner uses is declared.
 */
declare module 'upng-js' {
  export type UPNGImage = {
    width: number;
    height: number;
  };

  /** Decodes a PNG file into its frames/metadata. */
  export function decode(buffer: ArrayBuffer): UPNGImage;

  /** Converts a decoded image to RGBA buffers, one per frame. */
  export function toRGBA8(image: UPNGImage): ArrayBuffer[];
}
