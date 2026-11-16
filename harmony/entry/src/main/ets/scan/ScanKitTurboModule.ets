import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { detectBarcode, scanBarcode, scanCore } from '@kit.ScanKit';
import { BusinessError, emitter } from '@kit.BasicServicesKit';
import { ScanPageResult, SCAN_RESULT_EVENT_ID } from './ScanEvents';

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
 * Scan Kit bridge for the app's three scan paths:
 *
 * - `startScanner()`: the main path. Pushes the self-drawn ArkTS `ScanPage`
 *   (Scan Kit's `customScan` on an XComponent surface) and resolves with
 *   `{status: 'ok' | 'cancelled' | 'failed', value?, reason?}` once the page
 *   reports back through the emitter event in `ScanEvents.ets`.
 * - `startSystemScanner()`: Scan Kit's default (system) scanning UI, kept as an
 *   explicit fallback and never used by the main flow.
 * - `decodeImage(uri)`: Scan Kit's native still-image decoder for the album
 *   path used by the platform-capability page.
 */
export class ScanKitTurboModule extends TurboModule {
  private context: TurboModuleContext;
  /** Guards against pushing a second ScanPage on top of the first. */
  private scanning: boolean = false;

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

  /**
   * Opens the self-drawn scan page and waits for its result.
   *
   * The listener is registered before the page is pushed, so a code found on
   * the page's first frames cannot race ahead of it. The page emits exactly
   * once; `emitter.off` keeps the module from leaking listeners across scans.
   */
  startScanner(): Promise<ScanPageResult> {
    if (this.scanning) {
      const busy: ScanPageResult = { status: 'failed', reason: '扫码页已经打开' };
      return Promise.resolve(busy);
    }
    this.scanning = true;
    return new Promise<ScanPageResult>((resolve: (result: ScanPageResult) => void) => {
      const handler = (event: emitter.EventData): void => {
        emitter.off(SCAN_RESULT_EVENT_ID, handler);
        this.scanning = false;
        const payload = event.data;
        const raw: string = payload === undefined ? '' : payload.scanResult;
        if (typeof raw !== 'string' || raw.length === 0) {
          resolve({ status: 'failed', reason: '扫码页没有返回结果' });
          return;
        }
        try {
          const result = JSON.parse(raw) as ScanPageResult;
          resolve({
            status: result.status,
            value: result.value,
            reason: result.reason,
          });
        } catch (error) {
          resolve({ status: 'failed', reason: '扫码结果无法解析' });
        }
      };

      emitter.on({ eventId: SCAN_RESULT_EVENT_ID }, handler);
      const uiContext = this.context.getUIContext();
      if (uiContext === null) {
        emitter.off(SCAN_RESULT_EVENT_ID, handler);
        this.scanning = false;
        resolve({ status: 'failed', reason: '没有可用的 UI 上下文' });
        return;
      }
      uiContext.getRouter().pushUrl({ url: 'pages/ScanPage' }).catch((error: BusinessError) => {
        emitter.off(SCAN_RESULT_EVENT_ID, handler);
        this.scanning = false;
        resolve({
          status: 'failed',
          reason: `无法打开扫码页：${error.code} ${error.message}`,
        });
      });
    });
  }

  startSystemScanner(): Promise<SystemScanResult> {
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
