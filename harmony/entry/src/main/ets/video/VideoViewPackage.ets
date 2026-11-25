/**
 * Registers both halves of the video feature: the ArkUI builder behind the
 * `VideoView` Fabric component, and the `VideoPlayer` TurboModule the page polls.
 */
import { ComponentBuilderContext, RNOHPackage } from '@rnoh/react-native-openharmony/ets';
import { RNPackage, TurboModulesFactory } from '@rnoh/react-native-openharmony/ts';
import type { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { VideoView } from '../generated/components/VideoView';
import { buildVideoView } from './VideoPreview';
import { VideoPlayerTurboModule } from './VideoPlayerTurboModule';

class VideoTurboModulesFactory extends TurboModulesFactory {
  createTurboModule(name: string): TurboModule | null {
    if (name === 'VideoPlayer') {
      return new VideoPlayerTurboModule(this.ctx);
    }
    return null;
  }

  hasTurboModule(name: string): boolean {
    return name === 'VideoPlayer';
  }
}

export class VideoViewPackage extends RNOHPackage {
  createTurboModulesFactory(ctx: TurboModuleContext): TurboModulesFactory {
    return new VideoTurboModulesFactory(ctx);
  }

  createWrappedCustomRNComponentBuilderByComponentNameMap(): Map<
    string,
    WrappedBuilder<[ComponentBuilderContext]>
  > {
    return new Map<string, WrappedBuilder<[ComponentBuilderContext]>>([
      [VideoView.NAME, wrapBuilder(buildVideoView)],
    ]);
  }
}
