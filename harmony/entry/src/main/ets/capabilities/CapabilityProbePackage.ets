import { RNPackage, TurboModulesFactory } from '@rnoh/react-native-openharmony/ts';
import type { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { CapabilityProbeTurboModule } from './CapabilityProbeTurboModule';

/**
 * Registers the app's `CapabilityProbe` module: the ArkTS reads behind the
 * capability page's 设备信息 / 网络状态 / 存储目录 rows.
 */
class CapabilityProbeTurboModulesFactory extends TurboModulesFactory {
  createTurboModule(name: string): TurboModule | null {
    if (name === 'CapabilityProbe') {
      return new CapabilityProbeTurboModule(this.ctx);
    }
    return null;
  }

  hasTurboModule(name: string): boolean {
    return name === 'CapabilityProbe';
  }
}

export class CapabilityProbePackage extends RNPackage {
  createTurboModulesFactory(ctx: TurboModuleContext): TurboModulesFactory {
    return new CapabilityProbeTurboModulesFactory(ctx);
  }
}
