/**
 * The video player, kept outside the page that shows it.
 *
 * The React Native page re-renders freely (and the Fabric component behind it can
 * be torn down and built again), so the `AVPlayer`, the picture-in-picture
 * controller and the current surface live here instead of inside the component:
 * a component only attaches and detaches, and playback survives either way.
 *
 * Playback state is read by polling [getState] rather than through events, because
 * events from an ArkTS-backed custom component do not reach JS yet (see
 * docs/features/scan.md).
 */
import { media } from '@kit.MediaKit';
import { PiPWindow, window } from '@kit.ArkUI';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0000;
const TAG = 'RnVideo';

/** Mirrors the shape `src/native/video.ts` expects. */
export interface VideoState {
  found: boolean;
  position: number;
  duration: number;
  playing: boolean;
  ended: boolean;
  buffering: boolean;
  error: string | null;
}

class VideoSessionImpl {
  private player: media.AVPlayer | undefined = undefined;
  private playerId: string = '';
  private url: string = '';
  private context: common.UIAbilityContext | undefined = undefined;
  private controller: XComponentController | undefined = undefined;
  private surfaceId: string = '';
  private boundSurfaceId: string = '';
  private pip: PiPWindow.PiPController | undefined = undefined;
  private pipRunning: boolean = false;
  private wantPlaying: boolean = true;
  private error: string | null = null;
  private released: boolean = true;
  /** True between 'initialized' and prepare(), which waits for a surface. */
  private needsPrepare: boolean = false;

  /** Opens the media for this player id; re-opening the same one is a no-op. */
  open(playerId: string, url: string, context: common.UIAbilityContext): void {
    this.context = context;
    if (this.player !== undefined && this.playerId === playerId && this.url === url) {
      return;
    }
    if (this.player !== undefined) {
      this.closePlayer();
    }
    this.playerId = playerId;
    this.url = url;
    this.error = null;
    media.createAVPlayer()
      .then((player: media.AVPlayer) => {
        this.player = player;
        this.released = false;
        this.boundSurfaceId = '';
        this.registerListeners(player);
        hilog.info(DOMAIN, TAG, 'opening %{public}s', url);
        player.url = url;
      })
      .catch((err: BusinessError) => {
        this.error = err.message;
        hilog.error(DOMAIN, TAG, 'createAVPlayer failed: %{public}s', err.message);
      });
  }

  /** The page's XComponent appeared. */
  attach(controller: XComponentController): void {
    this.controller = controller;
    this.surfaceId = controller.getXComponentSurfaceId();
    const rect = controller.getXComponentSurfaceRect();
    hilog.info(DOMAIN, TAG, 'attach surface %{public}s rect %{public}sx%{public}s @ %{public}s,%{public}s',
      this.surfaceId, `${rect.surfaceWidth}`, `${rect.surfaceHeight}`,
      `${rect.offsetX}`, `${rect.offsetY}`);
    this.bindSurface(this.surfaceId);
    this.createPip();
  }

  /** The page's XComponent went away; the media stays open. */
  detach(): void {
    this.controller = undefined;
    this.boundSurfaceId = '';
  }

  bindSurface(surfaceId: string): void {
    const player = this.player;
    if (player === undefined || surfaceId === '' || this.boundSurfaceId === surfaceId) {
      return;
    }
    const state = player.state;
    if (state === 'idle' || state === 'released') {
      // The state listener applies the stored id once the media is initialized.
      this.surfaceId = surfaceId;
      return;
    }
    try {
      player.surfaceId = surfaceId;
      this.boundSurfaceId = surfaceId;
      hilog.info(DOMAIN, TAG, 'surface bound: %{public}s', surfaceId);
      this.prepareIfWaiting(player);
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'surface bind failed: %{public}s',
        `${(error as BusinessError).message}`);
    }
  }

  getState(playerId: string): VideoState {
    const player = this.player;
    if (player === undefined || playerId !== this.playerId) {
      return {
        found: false, position: 0, duration: 0, playing: false,
        ended: false, buffering: false, error: null,
      };
    }
    const state = player.state;
    const duration = Number(player.duration);
    return {
      found: true,
      position: Number(player.currentTime),
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      playing: state === 'playing',
      ended: state === 'completed',
      buffering: state === 'initialized' || state === 'prepared' || state === 'idle',
      error: this.error,
    };
  }

  setPaused(playerId: string, paused: boolean): void {
    if (playerId !== this.playerId) {
      return;
    }
    if (paused) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    this.wantPlaying = true;
    const player = this.player;
    if (player !== undefined && player.state === 'paused') {
      player.play((err: BusinessError) => {
        if (err) {
          hilog.error(DOMAIN, TAG, 'play failed: %{public}s', err.message);
        }
      });
    }
  }

  pause(): void {
    this.wantPlaying = false;
    const player = this.player;
    if (player !== undefined && player.state === 'playing') {
      player.pause((err: BusinessError) => {
        if (err) {
          hilog.error(DOMAIN, TAG, 'pause failed: %{public}s', err.message);
        }
      });
    }
  }

  seek(playerId: string, positionMs: number): void {
    const player = this.player;
    if (player === undefined || playerId !== this.playerId) {
      return;
    }
    // AVPlayer.seek takes a mode and returns nothing; it cannot fail loudly.
    player.seek(Math.max(0, positionMs), media.SeekMode.SEEK_PREV_SYNC);
  }

  isPipSupported(): boolean {
    return PiPWindow.isPiPEnabled();
  }

  isInPip(): boolean {
    return this.pipRunning;
  }

  enterPip(): void {
    const pip = this.pip;
    const context = this.context;
    if (pip === undefined || context === undefined) {
      hilog.error(DOMAIN, TAG, 'enterPip before the window exists');
      return;
    }
    pip.startPiP()
      .then(() => {
        hilog.info(DOMAIN, TAG, 'pip started');
        return context.moveAbilityToBackground();
      })
      .catch((err: BusinessError) =>
        hilog.error(DOMAIN, TAG, 'startPiP failed: %{public}d %{public}s', err.code, err.message));
  }

  /** The app came back while the small window was still up. */
  onAppForeground(): void {
    if (!this.pipRunning) {
      return;
    }
    hilog.info(DOMAIN, TAG, 'foreground while pinned: closing the window');
    this.pip?.stopPiP().catch(() => {});
    this.pipRunning = false;
  }

  setFullscreen(fullscreen: boolean): void {
    const context = this.context;
    if (context === undefined) {
      return;
    }
    window.getLastWindow(context)
      .then((main: window.Window) => {
        main.setPreferredOrientation(fullscreen
          ? window.Orientation.USER_ROTATION_LANDSCAPE
          : window.Orientation.USER_ROTATION_PORTRAIT);
        main.setWindowSystemBarEnable(fullscreen ? [] : ['status', 'navigation']);
      })
      .catch((err: BusinessError) =>
        hilog.error(DOMAIN, TAG, 'fullscreen failed: %{public}s', err.message));
  }

  /** The page is gone for good; release the media. */
  close(playerId: string): void {
    if (playerId !== this.playerId) {
      return;
    }
    if (this.pipRunning) {
      // The page went away because the small window took over; releasing now
      // would delete the window (the system reports requestDelete) and leave the
      // page with a dead player when it comes back.
      hilog.info(DOMAIN, TAG, 'close ignored while pinned');
      return;
    }
    this.playerId = '';
    this.closePlayer();
  }

  private closePlayer(): void {
    this.pip?.stopPiP().catch(() => {});
    this.pip = undefined;
    this.pipRunning = false;
    const player = this.player;
    this.player = undefined;
    if (player === undefined || this.released) {
      return;
    }
    this.released = true;
    player.release(() => {});
    hilog.info(DOMAIN, TAG, 'player released');
  }

  private createPip(): void {
    const context = this.context;
    const controller = this.controller;
    if (context === undefined || controller === undefined) {
      return;
    }
    if (!PiPWindow.isPiPEnabled() || this.pip !== undefined) {
      return;
    }
    const rect = controller.getXComponentSurfaceRect();
    const config: PiPWindow.PiPConfiguration = {
      context: context,
      componentController: controller,
      templateType: PiPWindow.PiPTemplateType.VIDEO_PLAY,
      contentWidth: rect.surfaceWidth !== undefined ? rect.surfaceWidth : 640,
      contentHeight: rect.surfaceHeight !== undefined ? rect.surfaceHeight : 360,
    };
    PiPWindow.create(config)
      .then((pip: PiPWindow.PiPController) => {
        this.pip = pip;
        pip.on('stateChange', (state: PiPWindow.PiPState, reason: string) => {
          hilog.info(DOMAIN, TAG, 'pip state %{public}d reason %{public}s', state, reason);
          if (state === PiPWindow.PiPState.STARTED) {
            this.pipRunning = true;
            this.bindSurface(this.surfaceId);
          } else if (state === PiPWindow.PiPState.STOPPED ||
            state === PiPWindow.PiPState.ABOUT_TO_RESTORE ||
            state === PiPWindow.PiPState.ERROR) {
            this.pipRunning = false;
            this.bindSurface(this.surfaceId);
          }
        });
        pip.on('controlPanelActionEvent', (event: PiPWindow.PiPActionEventType, status?: number) => {
          if (event === 'playbackStateChanged') {
            if (status === 1) {
              this.play();
            } else {
              this.pause();
            }
          }
        });
        pip.setAutoStartEnabled(true);
        hilog.info(DOMAIN, TAG, 'pip controller created');
      })
      .catch((err: BusinessError) =>
        hilog.error(DOMAIN, TAG, 'pip create failed: %{public}s', err.message));
  }

  /** Prepares once both the media and a surface are ready. */
  private prepareIfWaiting(player: media.AVPlayer): void {
    if (!this.needsPrepare || this.boundSurfaceId === '' || player.state !== 'initialized') {
      return;
    }
    this.needsPrepare = false;
    player.prepare((err: BusinessError) => {
      if (err) {
        this.error = err.message;
        hilog.error(DOMAIN, TAG, 'prepare failed: %{public}s', err.message);
      }
    });
  }

  private registerListeners(player: media.AVPlayer): void {
    player.on('stateChange', (state: string) => {
      hilog.info(DOMAIN, TAG, 'stateChange %{public}s', state);
      if (state === 'initialized') {
        if (this.surfaceId !== '') {
          player.surfaceId = this.surfaceId;
          this.boundSurfaceId = this.surfaceId;
        }
        // Preparing without a surface makes AVPlayer treat the media as audio
        // only: `prepared` then reports 0x0 and the page stays black. Wait for
        // the XComponent instead.
        this.needsPrepare = true;
        this.prepareIfWaiting(player);
      } else if (state === 'prepared') {
        hilog.info(DOMAIN, TAG, 'prepared %{public}dx%{public}d', player.width, player.height);
        if (player.width > 0 && player.height > 0) {
          this.pip?.updateContentSize(player.width, player.height);
        }
        if (this.wantPlaying) {
          player.play((_err: BusinessError) => {});
        }
      } else if (state === 'error') {
        this.error = '播放器进入错误状态';
      }
    });
    player.on('error', (error: BusinessError) => {
      this.error = error.message;
      hilog.error(DOMAIN, TAG, 'player error: %{public}s', error.message);
    });
  }
}

/** One player per process; every video page borrows it. */
export const VideoSession: VideoSessionImpl = new VideoSessionImpl();
