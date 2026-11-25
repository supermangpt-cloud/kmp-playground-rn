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
  /** HarmonyOS opens the media itself; Android takes it as a prop. */
  open?: (playerId: string, url: string) => void;
  setPaused?: (playerId: string, paused: boolean) => void;
  close?: (playerId: string) => void;
  getState: (playerId: string) => Promise<VideoState | null>;
  seekTo: (playerId: string, positionMs: number) => void;
  isPipSupported: () => Promise<boolean>;
  isInPip: () => Promise<boolean>;
  enterPip: () => void;
  setFullscreen: (fullscreen: boolean) => void;
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

/** Tells the platform which media this player id should show. */
export function openVideo(playerId: string, url: string): void {
  const native = player();
  if (native !== null && typeof native.open === 'function') {
    native.open(playerId, url);
  }
}

export function setPausedVideo(playerId: string, paused: boolean): void {
  const native = player();
  if (native !== null && typeof native.setPaused === 'function') {
    native.setPaused(playerId, paused);
  }
}

/** The page is gone: let the platform release the media. */
export function closeVideo(playerId: string): void {
  const native = player();
  if (native !== null && typeof native.close === 'function') {
    native.close(playerId);
  }
}

/** Whether the platform offers the system picture-in-picture window. */
export async function isPipSupported(): Promise<boolean> {
  const native = player();
  if (native === null || typeof native.isPipSupported !== 'function') {
    return false;
  }
  try {
    return await native.isPipSupported();
  } catch {
    return false;
  }
}

/** True while the system shows this app in its picture-in-picture window. */
export async function isInPip(): Promise<boolean> {
  const native = player();
  if (native === null || typeof native.isInPip !== 'function') {
    return false;
  }
  try {
    return await native.isInPip();
  } catch {
    return false;
  }
}

export function enterPip(): void {
  const native = player();
  if (native !== null && typeof native.enterPip === 'function') {
    native.enterPip();
  }
}

/** Landscape + no system bars, or the reverse. */
export function setFullscreen(fullscreen: boolean): void {
  const native = player();
  if (native !== null && typeof native.setFullscreen === 'function') {
    native.setFullscreen(fullscreen);
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
