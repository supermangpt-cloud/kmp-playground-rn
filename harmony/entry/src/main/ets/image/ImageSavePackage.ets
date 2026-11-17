import { RNPackage, TurboModulesFactory } from '@rnoh/react-native-openharmony/ts';
import type { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { ImageSaveTurboModule } from './ImageSaveTurboModule';

/**
 * Registers the app's `ImageSave` module: the ArkTS album write behind the QR
 * page's 保存到相册 button and the capability page's 保存图片到相册 row.
 */
class ImageSaveTurboModulesFactory extends TurboModulesFactory {
  createTurboModule(name: string): TurboModule | null {
    if (name === 'ImageSave') {
      return new ImageSaveTurboModule(this.ctx);
    }
    return null;
  }

  hasTurboModule(name: string): boolean {
    return name === 'ImageSave';
  }
}

export class ImageSavePackage extends RNPackage {
  createTurboModulesFactory(ctx: TurboModuleContext): TurboModulesFactory {
    return new ImageSaveTurboModulesFactory(ctx);
  }
}
