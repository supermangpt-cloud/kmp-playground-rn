/**
 * The camera half of the 扫一扫 page on HarmonyOS, as an ArkUI custom component
 * inside the React Native tree.
 *
 * It owns only the Scan Kit preview surface: the header, the aiming frame, the
 * hint and 取消 are React Native views in `src/screens/ScanScreen.tsx`. That is
 * the whole point of this component — before it existed, the page was an ArkTS
 * `@Entry` page and its chrome could not follow the app's theme.
 *
 * Scan Kit still needs an `XComponent` SURFACE and a `customScan` session sized
 * in vp, exactly like `pages/ScanPage.ets` does; this file is that page with the
 * chrome removed and the result reported through the generated event emitter.
 */
import { customScan, scanBarcode, scanCore } from '@kit.ScanKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { ComponentBuilderContext } from '@rnoh/react-native-openharmony/ets';
import { ScannerView } from '../generated/components/ScannerView';

const DOMAIN = 0x0000;
const TAG = 'ScannerPreview';
const CAMERA_PERMISSION: Permissions = 'ohos.permission.CAMERA';

@Builder
export function buildScannerView(ctx: ComponentBuilderContext) {
  ScannerPreview({ rnComponentContext: ctx })
}

@Component
export struct ScannerPreview {
  /** Supplied by the package's builder; carries the instance and the tag. */
  public rnComponentContext!: ComponentBuilderContext;
  @State private phase: string = 'idle';
  @State private message: string = '';
  private controller: XComponentController = new XComponentController();
  private surfaceId: string = '';
  private previewWidth: number = 0;
  private previewHeight: number = 0;
  private running: boolean = false;
  private released: boolean = true;
  private finished: boolean = false;
  private emitter: ScannerView.EventEmitter | undefined = undefined;

  aboutToAppear(): void {
    this.emitter = new ScannerView.EventEmitter(
      this.rnComponentContext.rnComponentContext.rnInstance,
      this.rnComponentContext.tag,
    );
    this.phase = 'requesting';
    this.requestAccess();
  }

  aboutToDisappear(): void {
    this.finished = true;
    this.stopSession();
  }

  build() {
    Stack() {
      if (this.phase === 'scanning') {
        XComponent({
          id: 'scanner-preview-surface',
          type: XComponentType.SURFACE,
          controller: this.controller,
        })
          .width('100%')
          .height('100%')
          .onLoad(() => {
            this.surfaceId = this.controller.getXComponentSurfaceId();
            hilog.info(DOMAIN, TAG, 'surface %{public}s', this.surfaceId);
            this.startSession();
          })
          .onAreaChange((_old: Area, area: Area) => {
            this.previewWidth = Number(area.width);
            this.previewHeight = Number(area.height);
            this.startSession();
          })
          // Inside the React Native tree the ArkUI node is measured by a
          // FrameNode, and `onAreaChange` does not fire there; `onSizeChange`
          // does, and without a size Scan Kit cannot be given a ViewControl.
          .onSizeChange((_old: SizeOptions, size: SizeOptions) => {
            this.previewWidth = Number(size.width);
            this.previewHeight = Number(size.height);
            this.startSession();
          })
      } else {
        Text(this.phase === 'requesting' ? '正在申请相机权限…' : this.message)
          .fontColor('#FFFFFF')
          .fontSize(13)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#101010')
  }

  private context(): common.UIAbilityContext | undefined {
    const host = this.getUIContext().getHostContext();
    return host === undefined ? undefined : (host as common.UIAbilityContext);
  }

  private async requestAccess(): Promise<void> {
    const ctx = this.context();
    if (ctx === undefined) {
      this.fail('当前页面没有能力上下文');
      return;
    }
    const manager = abilityAccessCtrl.createAtManager();
    const granted =
      manager.checkAccessTokenSync(ctx.applicationInfo.accessTokenId, CAMERA_PERMISSION) ===
      abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    if (granted) {
      this.phase = 'scanning';
      return;
    }
    try {
      const result = await manager.requestPermissionsFromUser(ctx, [CAMERA_PERMISSION]);
      if (this.finished) {
        return;
      }
      if (result.authResults.length > 0 && result.authResults[0] === 0) {
        this.phase = 'scanning';
        return;
      }
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'permission failed: %{public}s', `${(error as BusinessError).message}`);
    }
    this.fail('未授予相机权限：请在系统设置中允许本 App 使用相机后重试');
  }

  private startSession(): void {
    if (this.finished || this.phase !== 'scanning' || this.surfaceId === '' || this.previewWidth <= 0) {
      return;
    }
    if (this.running) {
      return;
    }
    try {
      customScan.init({
        scanTypes: [scanCore.ScanType.QR_CODE],
        enableMultiMode: false,
      });
      this.released = false;
      const viewControl: customScan.ViewControl = {
        width: this.previewWidth,
        height: this.previewHeight,
        surfaceId: this.surfaceId,
      };
      this.running = true;
      customScan.start(viewControl, (error: BusinessError, data: Array<scanBarcode.ScanResult>) => {
        if (error) {
          this.running = false;
          this.fail(`相机预览失败：${error.message}`);
          return;
        }
        if (this.finished || data === undefined || data.length === 0) {
          return;
        }
        const value = data[0].originalValue;
        if (value.length === 0 || this.finished) {
          return;
        }
        // One code is enough: the page leaves as soon as it has the value.
        this.finished = true;
        this.stopSession();
        this.emitter?.emit('decoded', { value });
      });
      this.emitter?.emit('ready', { width: Math.round(this.previewWidth), height: Math.round(this.previewHeight) });
    } catch (error) {
      this.running = false;
      this.fail(`相机启动失败：${(error as BusinessError).message}`);
    }
  }

  private stopSession(): void {
    if (this.running) {
      try {
        customScan.stop();
      } catch (error) {
        hilog.warn(DOMAIN, TAG, 'stop failed: %{public}s', `${(error as BusinessError).message}`);
      }
    }
    if (!this.released) {
      try {
        customScan.release();
      } catch (error) {
        hilog.warn(DOMAIN, TAG, 'release failed: %{public}s', `${(error as BusinessError).message}`);
      }
      this.released = true;
    }
    this.running = false;
  }

  private fail(reason: string): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.message = reason;
    this.phase = 'failed';
    this.emitter?.emit('failed', { reason });
  }
}
