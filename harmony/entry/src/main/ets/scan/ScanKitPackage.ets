import { RNPackage, TurboModulesFactory } from '@rnoh/react-native-openharmony/ts';
import type { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { ScanKitTurboModule } from './ScanKitTurboModule';

/** Registers the app's Scan Kit bridge as the `ScanKit` turbo module. */
class ScanKitTurboModulesFactory extends TurboModulesFactory {
  createTurboModule(name: string): TurboModule | null {
    if (name === 'ScanKit') {
      return new ScanKitTurboModule(this.ctx);
    }
    return null;
  }

  hasTurboModule(name: string): boolean {
    return name === 'ScanKit';
  }
}

export class ScanKitPackage extends RNPackage {
  createTurboModulesFactory(ctx: TurboModuleContext): TurboModulesFactory {
    return new ScanKitTurboModulesFactory(ctx);
  }
}
