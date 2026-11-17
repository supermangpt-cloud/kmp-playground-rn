import { RNPackage, TurboModulesFactory } from '@rnoh/react-native-openharmony/ts';
import type { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { WifiNetworkTurboModule } from './WifiNetworkTurboModule';

/**
 * Registers the app's `WifiNetwork` module: the ArkTS Wi-Fi scan/connect path
 * behind the capability page's WiFi card.
 */
class WifiNetworkTurboModulesFactory extends TurboModulesFactory {
  createTurboModule(name: string): TurboModule | null {
    if (name === 'WifiNetwork') {
      return new WifiNetworkTurboModule(this.ctx);
    }
    return null;
  }

  hasTurboModule(name: string): boolean {
    return name === 'WifiNetwork';
  }
}

export class WifiNetworkPackage extends RNPackage {
  createTurboModulesFactory(ctx: TurboModuleContext): TurboModulesFactory {
    return new WifiNetworkTurboModulesFactory(ctx);
  }
}
