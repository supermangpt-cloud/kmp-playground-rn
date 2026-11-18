import { window } from '@kit.ArkUI';
import { customScan, scanBarcode, scanCore } from '@kit.ScanKit';
import {
  abilityAccessCtrl,
  bundleManager,
  common,
  Permissions,
  Want
} from '@kit.AbilityKit';
import { BusinessError, emitter } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ScanPageResult, SCAN_RESULT_EVENT_ID } from '../scan/ScanEvents';

const DOMAIN = 0x0000;
const TAG = 'ScanPage';
const CAMERA_PERMISSION: Permissions = 'ohos.permission.CAMERA';
// The Settings app's entry for this application, where a denied camera
// permission can be turned back on. Same target the KMP build uses.
const SETTINGS_BUNDLE = 'com.huawei.hmos.settings';
const SETTINGS_ABILITY = 'com.huawei.hmos.settings.MainAbility';

/** The page's own state; every branch of `build()` is one of these. */
enum ScanPhase {
  REQUESTING,
  SCANNING,
  DENIED,
  FAILED
}

/**
 * The self-drawn ArkTS scanning page.
 *
 * The camera preview is a Scan Kit `customScan` session rendered on an
 * `XComponent` surface, which is the same architecture as the KMP build
 * (`harmonyApp/entry/src/main/ets/scan/QrScan.ets`) and avoids
 * react-native-vision-camera's broken code-type mapping. The page is a real
 * `@Entry` page, not a view inside the RN tree, so the camera owns the whole
 * screen and releases it as soon as the page leaves.
 *
 * Flow: ask for `ohos.permission.CAMERA`; if granted, wait for the XComponent's
 * `onLoad` (surface id) and layout (vp width/height), then `customScan.init`
 * with the explicit `ScanType.QR_CODE` enum and `customScan.start`. A decoded
 * code stops the session, emits the result and calls `router.back()`. Cancel,
 * the system back gesture and a start failure end the page the same way.
 */
@Entry
@Component
struct ScanPage {
  @State phase: ScanPhase = ScanPhase.REQUESTING;
  @State failure: string = '';
  @State cameraWidth: number = 0;
  @State cameraHeight: number = 0;
  // The ability runs with setWindowLayoutFullScreen(true), so the page paints
  // under the status bar and the overlay owns that inset itself.
  @State topInset: number = 0;

  private controller: XComponentController = new XComponentController();
  private surfaceId: string = '';
  private running: boolean = false;
  private released: boolean = true;
  private starting: boolean = false;
  private finished: boolean = false;
  private paused: boolean = false;
  private stopPromise: Promise<void> = Promise.resolve();

  aboutToAppear(): void {
    this.applyWindowInsets();
    this.requestCameraAccess();
  }

  aboutToDisappear(): void {
    // Leaving the page for any reason must free the camera; customScan keeps
    // the camera occupied until stop() and release() run.
    this.stopScan();
  }

  onPageShow(): void {
    if (this.phase === ScanPhase.DENIED) {
      // Back from the Settings app: continue only when the permission was
      // actually granted there, otherwise keep the explanation on screen.
      this.recheckCameraAccess();
      return;
    }
    if (this.paused && this.phase === ScanPhase.SCANNING && !this.finished) {
      this.paused = false;
      hilog.info(DOMAIN, TAG, 'page shown again, restarting the scan session');
      this.startSession();
    }
  }

  onPageHide(): void {
    if (this.phase === ScanPhase.SCANNING && !this.finished) {
      this.paused = true;
      hilog.info(DOMAIN, TAG, 'page hidden, stopping the scan session');
      this.stopScan();
    }
  }

  onBackPress(): boolean {
    this.cancel();
    return true;
  }

  build() {
    Stack() {
      if (this.phase === ScanPhase.SCANNING) {
        this.scanningView();
      } else if (this.phase === ScanPhase.DENIED) {
        this.deniedView();
      } else if (this.phase === ScanPhase.FAILED) {
        this.failedView();
      } else {
        this.requestingView();
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#000000')
  }

  @Builder
  scanningView() {
    Stack({ alignContent: Alignment.TopStart }) {
      XComponent({
        id: 'scan-preview',
        type: XComponentType.SURFACE,
        controller: this.controller
      })
        .width('100%')
        .height('100%')
        .onLoad(() => {
          // The surface id is only available once the XComponent has loaded;
          // this is the value customScan needs to render the camera preview.
          this.surfaceId = this.controller.getXComponentSurfaceId();
          hilog.info(DOMAIN, TAG, 'XComponent surface id: %{public}s', this.surfaceId);
          this.startSession();
        })
        .onAreaChange((_old: Area, area: Area) => {
          // ViewControl must match the XComponent size or the preview stretches.
          // onAreaChange reports vp, which is also ViewControl's default unit.
          this.cameraWidth = Number(area.width);
          this.cameraHeight = Number(area.height);
          this.startSession();
        })

      Column() {
        Stack({ alignContent: Alignment.Center }) {
          Text('扫一扫')
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor('#FFFFFF')
          Row() {
            Button('取消')
              .fontSize(15)
              .fontColor('#FFFFFF')
              .backgroundColor('#4D000000')
              .height(36)
              .padding({ left: 18, right: 18 })
              .onClick(() => this.cancel())
              .accessibilityText('取消扫码')
            Blank()
          }
          .width('100%')
        }
        .width('100%')
        .padding({ left: 16, right: 16, top: 12 })

        Blank()

        Column()
          .width(240)
          .height(240)
          .borderRadius(16)
          .border({ width: 2, color: '#FFFFFF' })

        Text('将二维码放入框内，即可自动识别')
          .fontSize(14)
          .fontColor('#FFFFFF')
          .margin({ top: 16 })
          .textAlign(TextAlign.Center)

        Blank()
      }
      .width('100%')
      .height('100%')
      .padding({ top: this.topInset, bottom: 48 })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  requestingView() {
    Column({ space: 12 }) {
      LoadingProgress()
        .width(48)
        .height(48)
        .color('#FFFFFF')
      Text('正在打开相机…')
        .fontSize(15)
        .fontColor('#FFFFFF')
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }

  @Builder
  deniedView() {
    Column({ space: 16 }) {
      Text('需要相机权限')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .fontColor('#FFFFFF')
      Text('扫码需要使用相机。请允许相机权限，然后返回重试。')
        .fontSize(14)
        .lineHeight(22)
        .fontColor('#D0D0D0')
        .textAlign(TextAlign.Center)
        .padding({ left: 32, right: 32 })
      Button('去设置')
        .fontSize(15)
        .fontColor('#FFFFFF')
        .backgroundColor('#2563EB')
        .height(40)
        .width(180)
        .onClick(() => this.openSettings())
      Button('返回')
        .fontSize(15)
        .fontColor('#FFFFFF')
        .backgroundColor('#33000000')
        .height(40)
        .width(180)
        .onClick(() => this.cancel())
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }

  @Builder
  failedView() {
    Column({ space: 16 }) {
      Text('相机无法启动')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .fontColor('#FFFFFF')
      Text(this.failure)
        .fontSize(14)
        .lineHeight(22)
        .fontColor('#D0D0D0')
        .textAlign(TextAlign.Center)
        .padding({ left: 32, right: 32 })
      Button('重试')
        .fontSize(15)
        .fontColor('#FFFFFF')
        .backgroundColor('#2563EB')
        .height(40)
        .width(180)
        .onClick(() => this.retry())
      Button('返回')
        .fontSize(15)
        .fontColor('#FFFFFF')
        .backgroundColor('#33000000')
        .height(40)
        .width(180)
        .onClick(() => this.finish('failed', '', this.failure))
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }

  /**
   * Reads the status-bar inset so the overlay does not hide behind it.
   *
   * RNAbility sets `setWindowLayoutFullScreen(true)` for the whole window, which
   * is why the XComponent can paint edge to edge; the overlay is padded by the
   * system avoid area instead of assuming a fixed status-bar height.
   */
  private applyWindowInsets(): void {
    const context = this.abilityContext();
    if (context === undefined) {
      return;
    }
    window.getLastWindow(context).then((lastWindow: window.Window) => {
      const area = lastWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      this.topInset = px2vp(area.topRect.height);
      hilog.info(DOMAIN, TAG, 'status bar inset: %{public}d vp', this.topInset);
    }).catch((error: BusinessError) => {
      hilog.warn(DOMAIN, TAG, 'window insets unavailable: %{public}s', JSON.stringify(error));
    });
  }

  private async requestCameraAccess(): Promise<void> {
    // `requestPermissionsFromUser` can report success without the token
    // actually holding the permission (observed on RNOH 0.86: authResults[0]
    // came back 0 while `checkAccessTokenSync` still said denied, so the page
    // went straight to SCANNING and the preview stayed black with no dialog).
    // Trust the token check, and only ask when it really is missing.
    if (await this.hasPermission()) {
      this.phase = ScanPhase.SCANNING;
      this.startSession();
      return;
    }
    const granted = await this.requestPermission();
    if (this.finished) {
      return;
    }
    if (granted) {
      this.phase = ScanPhase.SCANNING;
      this.startSession();
    } else {
      hilog.warn(DOMAIN, TAG, 'camera permission denied');
      this.phase = ScanPhase.DENIED;
    }
  }

  private async recheckCameraAccess(): Promise<void> {
    const granted = await this.hasPermission();
    if (!granted || this.finished) {
      return;
    }
    hilog.info(DOMAIN, TAG, 'camera permission granted in Settings, starting');
    this.phase = ScanPhase.SCANNING;
    this.startSession();
  }

  private abilityContext(): common.UIAbilityContext | undefined {
    const host = this.getUIContext().getHostContext();
    return host === undefined ? undefined : host as common.UIAbilityContext;
  }

  private async requestPermission(): Promise<boolean> {
    const context = this.abilityContext();
    if (context === undefined) {
      return false;
    }
    try {
      const manager = abilityAccessCtrl.createAtManager();
      const result = await manager.requestPermissionsFromUser(context, [CAMERA_PERMISSION]);
      return result.authResults.length === 1 && result.authResults[0] === 0;
    } catch (error) {
      hilog.error(DOMAIN, TAG, 'permission request failed: %{public}s', JSON.stringify(error));
      return false;
    }
  }

  private async hasPermission(): Promise<boolean> {
    try {
      const info = bundleManager.getBundleInfoForSelfSync(
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION
      );
      const manager = abilityAccessCtrl.createAtManager();
      const status = manager.checkAccessTokenSync(info.appInfo.accessTokenId, CAMERA_PERMISSION);
      return status === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    } catch (error) {
      hilog.error(DOMAIN, TAG, 'permission check failed: %{public}s', JSON.stringify(error));
      return false;
    }
  }

  /**
   * Starts one customScan session on the current XComponent surface.
   *
   * Called from `onLoad`, `onAreaChange` and page-show; every call before the
   * surface id and the layout size are both known returns immediately, and the
   * later call that completes the pair does the work. `starting` keeps two
   * callbacks in the same frame from initialising twice.
   */
  private async startSession(): Promise<void> {
    if (this.finished || this.phase !== ScanPhase.SCANNING || this.running || this.starting) {
      return;
    }
    if (this.surfaceId.length === 0 || this.cameraWidth <= 0 || this.cameraHeight <= 0) {
      return;
    }
    this.starting = true;
    try {
      // A previous pause may still be releasing; do not init on top of it.
      await this.stopPromise;
      if (this.finished || this.phase !== ScanPhase.SCANNING) {
        return;
      }
      // Explicit enum, never an index: the vision-camera bug this page replaces
      // sent 'qr' through an off-by-one index and scanned UPC-A instead.
      customScan.init({
        scanTypes: [scanCore.ScanType.QR_CODE],
        enableMultiMode: false
      });
      this.released = false;
      const viewControl: customScan.ViewControl = {
        width: this.cameraWidth,
        height: this.cameraHeight,
        surfaceId: this.surfaceId
      };
      this.running = true;
      customScan.start(viewControl, (error: BusinessError, data: Array<scanBarcode.ScanResult>) => {
        if (error) {
          this.failSession(error);
          return;
        }
        if (this.finished || data === undefined || data.length === 0) {
          return;
        }
        const value = data[0].originalValue;
        if (value.length === 0) {
          return;
        }
        hilog.info(DOMAIN, TAG, 'scanned %{public}d chars', value.length);
        this.finish('ok', value, '');
      });
      hilog.info(
        DOMAIN,
        TAG,
        'customScan started on surface %{public}s (%{public}dx%{public}d vp)',
        this.surfaceId,
        this.cameraWidth,
        this.cameraHeight
      );
    } catch (error) {
      this.running = false;
      this.failSession(error as BusinessError);
    } finally {
      this.starting = false;
    }
  }

  private stopScan(): void {
    this.stopPromise = this.releaseCamera();
  }

  private async releaseCamera(): Promise<void> {
    if (this.running) {
      this.running = false;
      try {
        await customScan.stop();
        hilog.info(DOMAIN, TAG, 'customScan stopped');
      } catch (error) {
        hilog.warn(DOMAIN, TAG, 'customScan.stop failed: %{public}s', JSON.stringify(error));
      }
    }
    if (!this.released) {
      this.released = true;
      try {
        await customScan.release();
        hilog.info(DOMAIN, TAG, 'customScan released');
      } catch (error) {
        hilog.warn(DOMAIN, TAG, 'customScan.release failed: %{public}s', JSON.stringify(error));
      }
    }
  }

  private failSession(error: BusinessError): void {
    if (this.finished) {
      return;
    }
    hilog.error(DOMAIN, TAG, 'customScan failed: %{public}d %{public}s', error.code, error.message);
    this.failure = '相机无法启动（' + error.code + '），请稍后重试。';
    this.phase = ScanPhase.FAILED;
    this.stopScan();
  }

  private retry(): void {
    if (this.finished) {
      return;
    }
    this.failure = '';
    this.phase = ScanPhase.SCANNING;
    this.paused = false;
    // The failed state unmounted the XComponent, so the old surface id is dead.
    // The freshly mounted XComponent's onLoad supplies the new one and starts
    // the session; reusing the stale id would fail again.
    this.surfaceId = '';
  }

  private cancel(): void {
    this.finish('cancelled', '', '');
  }

  /**
   * Ends the page once: frees the camera, hands the outcome to the waiting
   * turbo module, then pops back to the RN surface.
   */
  private async finish(status: string, value: string, reason: string): Promise<void> {
    if (this.finished) {
      return;
    }
    this.finished = true;
    await this.releaseCamera();
    const result: ScanPageResult = { status: status };
    if (value.length > 0) {
      result.value = value;
    }
    if (reason.length > 0) {
      result.reason = reason;
    }
    hilog.info(DOMAIN, TAG, 'scan finished: %{public}s', JSON.stringify(result));
    emitter.emit({ eventId: SCAN_RESULT_EVENT_ID }, {
      data: { scanResult: JSON.stringify(result) }
    });
    this.getUIContext().getRouter().back();
  }

  /**
   * Opens this application's page in Settings so a denied camera permission can
   * be granted. The settings ability name differs between builds; a failure is
   * logged instead of crashing the page.
   */
  private openSettings(): void {
    const context = this.abilityContext();
    if (context === undefined) {
      return;
    }
    const want: Want = {
      bundleName: SETTINGS_BUNDLE,
      abilityName: SETTINGS_ABILITY,
      uri: 'application_info_entry',
      parameters: { pushParams: context.applicationInfo.name }
    };
    context.startAbility(want).catch((error: BusinessError) => {
      hilog.error(DOMAIN, TAG, 'settings page not opened: %{public}s', JSON.stringify(error));
    });
  }
}
