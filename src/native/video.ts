/**
 * The 视频播放 page's native half.
 *
 * `VideoView` draws the picture; this module reads the state that the page's
 * progress bar and buttons need. Polling instead of component events is
 * deliberate: an ArkTS-backed custom component cannot deliver events to JS on
 * HarmonyOS yet, and a module behaves the same on every platform.
 */
import {getTurboModule} from './turboModule';

export type VideoState = {
  /** False when no view is registered under this id (yet). */
  found: boolean;
  position: number;
  duration: number;
  playing: boolean;
  ended: boolean;
  buffering: boolean;
  error: string | null;
};

type NativeVideoPlayer = {
  getState: (playerId: string) => Promise<VideoState | null>;
  seekTo: (playerId: string, positionMs: number) => void;
};

function player(): NativeVideoPlayer | null {
  return getTurboModule<NativeVideoPlayer>('VideoPlayer');
}

/** State of the named player, or null when its view is gone. */
export async function getVideoState(playerId: string): Promise<VideoState | null> {
  const native = player();
  if (native === null || typeof native.getState !== 'function') {
    return null;
  }
  try {
    return await native.getState(playerId);
  } catch {
    return null;
  }
}

export function seekVideo(playerId: string, positionMs: number): void {
  const native = player();
  if (native !== null && typeof native.seekTo === 'function') {
    native.seekTo(playerId, positionMs);
  }
}

/** `mm:ss`, with hours only when the media has them. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
