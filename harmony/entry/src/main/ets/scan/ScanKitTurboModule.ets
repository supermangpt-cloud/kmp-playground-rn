import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { detectBarcode, scanBarcode, scanCore } from '@kit.ScanKit';
import { BusinessError } from '@kit.BasicServicesKit';

/** Decoded text of an image; `values` is empty when no code was found. */
interface ImageScanResult {
  values: string[];
  error?: string;
}

/** Result of the system scan page: `cancelled` also covers user dismissal. */
interface SystemScanResult {
  cancelled: boolean;
  value?: string;
  error?: string;
}

/**
 * Scan Kit bridge for the two cases the native preview scanner cannot cover:
 *
 * - `decodeImage(uri)`: decode a still image (album pick) with Scan Kit's
 *   native image decoder instead of jsqr. Milliseconds instead of seconds for
 *   a phone screenshot, and it understands more formats than the pure-JS
 *   decoders.
 * - `startSystemScan()`: open Scan Kit's default (system) scanning UI, which
 *   has the platform's best recognition rate, and return its result. Used as
 *   the "always works" fallback next to the in-page preview scanner.
 */
export class ScanKitTurboModule extends TurboModule {
  private context: TurboModuleContext;

  constructor(ctx: TurboModuleContext) {
    super(ctx);
    this.context = ctx;
  }

  decodeImage(uri: string): Promise<ImageScanResult> {
    const options: scanBarcode.ScanOptions = {
      scanTypes: [scanCore.ScanType.QR_CODE],
      enableMultiMode: true,
    };
    const inputImage: detectBarcode.InputImage = { uri: uri };
    return detectBarcode
      .decode(inputImage, options)
      .then((results: Array<scanBarcode.ScanResult>): ImageScanResult => {
        const values: string[] = [];
        for (const result of results) {
          if (result.originalValue.length > 0) {
            values.push(result.originalValue);
          }
        }
        return { values: values };
      })
      .catch((error: BusinessError): ImageScanResult => {
        return {
          values: [],
          error: `Scan Kit 图片识码失败：${error.code} ${error.message}`,
        };
      });
  }

  startSystemScan(): Promise<SystemScanResult> {
    const options: scanBarcode.ScanOptions = {
      scanTypes: [scanCore.ScanType.QR_CODE],
      enableMultiMode: false,
      enableAlbum: true,
    };
    return scanBarcode
      .startScanForResult(this.context.uiAbilityContext, options)
      .then((result: scanBarcode.ScanResult): SystemScanResult => {
        return { cancelled: false, value: result.originalValue };
      })
      .catch((error: BusinessError): SystemScanResult => {
        if (error.code === 1000500002) {
          return { cancelled: true };
        }
        return {
          cancelled: true,
          error: `系统扫码失败：${error.code} ${error.message}`,
        };
      });
  }
}
