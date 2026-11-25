/**
 * The JS-facing half of the video: commands in, state out.
 *
 * State is polled (`getState`) instead of pushed as events, because events from
 * an ArkTS-backed custom component do not reach JS yet. The player itself lives
 * in `VideoSession`, so a page rebuild does not restart the media.
 */
import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { VideoSession } from './VideoSession';

export class VideoPlayerTurboModule extends TurboModule {
  constructor(ctx: TurboModuleContext) {
    super(ctx);
  }

  open(playerId: string, url: string): void {
    VideoSession.open(playerId, url, this.ctx.uiAbilityContext);
  }

  getState(playerId: string): object {
    return VideoSession.getState(playerId);
  }

  setPaused(playerId: string, paused: boolean): void {
    VideoSession.setPaused(playerId, paused);
  }

  seekTo(playerId: string, positionMs: number): void {
    VideoSession.seek(playerId, positionMs);
  }

  isPipSupported(): boolean {
    return VideoSession.isPipSupported();
  }

  isInPip(): boolean {
    return VideoSession.isInPip();
  }

  enterPip(): void {
    VideoSession.enterPip();
  }

  setFullscreen(fullscreen: boolean): void {
    VideoSession.setFullscreen(fullscreen);
  }

  close(playerId: string): void {
    VideoSession.close(playerId);
  }
}
