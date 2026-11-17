import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { bundleManager, common } from '@kit.AbilityKit';
import { deviceInfo } from '@kit.BasicServicesKit';

/** The five fields the capability page's 设备信息 row prints. */
export interface DeviceInfoPayload {
  model: string;
  systemName: string;
  systemVersion: string;
  appName: string;
  appVersion: string;
}

/**
 * The app's own ArkTS side of the platform-capability page.
 *
 * The three capabilities this module backs (device information, network status
 * and the storage directories) all need `@ohos.*` APIs that no React Native JS
 * module can reach on this device, so the readings live here and the JS side
 * only formats what came back. The implementations follow the KMP build's
 * already-verified ArkTS capabilities
 * (`harmonyApp/entry/src/main/ets/capabilities`), which is why the directory
 * notes and the 801 handling match it.
 *
 * Every method is asynchronous from JS's point of view: the C++ side registers
 * them with `ARK_ASYNC_METHOD_METADATA`, so returning a resolved promise is the
 * contract.
 */
export class CapabilityProbeTurboModule extends TurboModule {
  private context: common.UIAbilityContext;

  constructor(ctx: TurboModuleContext) {
    super(ctx);
    this.context = ctx.uiAbilityContext;
  }

  /**
   * The real device and app identity: `@ohos.deviceInfo` for the hardware and
   * `bundleManager` for this app. `displayVersion` is
   * "ALN-AL00 7.0.0.111(SP10C00E111R4P3)" — the model is already a field of its
   * own, so its prefix is stripped and the version kept.
   */
  readDeviceInfo(): Promise<DeviceInfoPayload> {
    const bundleInfo = bundleManager.getBundleInfoForSelfSync(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT,
    );
    const model = deviceInfo.productModel;
    const display = deviceInfo.displayVersion;
    const prefix = `${model} `;
    const systemVersion = display.startsWith(prefix)
      ? display.substring(prefix.length)
      : display;
    const payload: DeviceInfoPayload = {
      model: model,
      systemName: 'HarmonyOS',
      systemVersion: systemVersion,
      appName: this.appName(),
      appVersion: bundleInfo.versionName,
    };
    return Promise.resolve(payload);
  }

  /**
   * The application label is a resource reference on HarmonyOS
   * ("$string:app_name"), so it is resolved by its id; a resolution failure
   * falls back to the raw value rather than an empty app name.
   */
  private appName(): string {
    try {
      return this.context.resourceManager.getStringSync(
        this.context.applicationInfo.labelId,
      );
    } catch (error) {
      return this.context.applicationInfo.label;
    }
  }
}
