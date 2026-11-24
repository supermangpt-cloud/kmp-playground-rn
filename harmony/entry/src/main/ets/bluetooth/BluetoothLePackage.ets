/**
 * Registers {@link BluetoothLeTurboModule} so `TurboModuleRegistry.get(
 * 'BluetoothLe')` resolves it from JS.
 *
 * Written against `@ohos.bluetooth.ble` directly instead of the adapted
 * ble-plx har: that har ships a prebuilt C++ linked against the RNOH 0.72
 * codegen, and its scan-type mapping resolved names by array index.
 */
import { RNPackage, TurboModulesFactory } from '@rnoh/react-native-openharmony/ts';
import type { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { BluetoothLeTurboModule } from './BluetoothLeTurboModule';

class BluetoothLeTurboModulesFactory extends TurboModulesFactory {
  createTurboModule(name: string): TurboModule | null {
    if (name === 'BluetoothLe') {
      return new BluetoothLeTurboModule(this.ctx);
    }
    return null;
  }

  hasTurboModule(name: string): boolean {
    return name === 'BluetoothLe';
  }
}

export class BluetoothLePackage extends RNPackage {
  createTurboModulesFactory(ctx: TurboModuleContext): TurboModulesFactory {
    return new BluetoothLeTurboModulesFactory(ctx);
  }
}
