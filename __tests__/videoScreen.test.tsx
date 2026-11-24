/**
 * The 视频播放 page: chrome in React Native, picture native, state polled.
 *
 * The Fabric component is a host stub and the `VideoPlayer` module is faked, so
 * what is under test is the page's own behaviour — the clock, the buttons, the
 * buffering and error states, and that a seek goes to the right tag.
 *
 * @format
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import React from 'react';
import renderer from 'react-test-renderer';

jest.mock('../src/native/specs/VideoViewNativeComponent', () => 'VideoView');

const mockGetState = jest.fn<(playerId: string) => Promise<unknown>>();
const mockEnterPip = jest.fn();
const mockSetFullscreen = jest.fn();
const mockSeekTo = jest.fn<(playerId: string, positionMs: number) => void>();

jest.mock('../src/native/video', () => {
  const actual = jest.requireActual('../src/native/video');
  return {
    ...(actual as object),
    getVideoState: (playerId: string) => mockGetState(playerId),
    seekVideo: (playerId: string, positionMs: number) => mockSeekTo(playerId, positionMs),
    isPipSupported: () => Promise.resolve(true),
    isInPip: () => Promise.resolve(false),
    enterPip: () => mockEnterPip(),
    setFullscreen: (fullscreen: boolean) => mockSetFullscreen(fullscreen),
  };
});

import VideoScreen, {DEFAULT_VIDEO_URL} from '../src/screens/VideoScreen';
import {formatClock} from '../src/native/video';

type Tree = renderer.ReactTestRenderer;

function textOf(node: renderer.ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (current: renderer.ReactTestInstance | string | number) => {
    if (typeof current === 'string' || typeof current === 'number') {
      parts.push(String(current));
      return;
    }
    for (const child of current.children ?? []) {
      walk(child);
    }
  };
  walk(node);
  return parts.join('');
}

const hosts = (tree: Tree, id: string) =>
  tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id);

/** The component (not the host view) that carries a button's `onPress`. */
const pressable = (tree: Tree, id: string) =>
  tree.root.findAll(
    node => node.props?.testID === id && typeof node.props.onPress === 'function',
  )[0];

async function render(): Promise<Tree> {
  let tree: Tree | undefined;
  await renderer.act(async () => {
    tree = renderer.create(<VideoScreen onBack={() => {}} />);
  });
  return tree as Tree;
}

/** Waits for one polling tick (POLL_MS is 400ms in the page). */
async function settle(): Promise<void> {
  await renderer.act(async () => {
    await new Promise(resolve => setTimeout(resolve, 600));
  });
}

/** The id the page generated for its player. */
function playerIdOf(tree: Tree): string {
  return hosts(tree, 'video-surface')[0].props.playerId as string;
}

beforeEach(() => {
  mockGetState.mockReset();
  mockSeekTo.mockReset();
  mockGetState.mockResolvedValue({
    found: true,
    position: 12_000,
    duration: 52_000,
    playing: true,
    ended: false,
    buffering: false,
    error: null,
  });
});

describe('formatClock', () => {
  it('pads minutes and seconds, and grows an hours field', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(12_000)).toBe('00:12');
    expect(formatClock(3_723_000)).toBe('1:02:03');
  });
});

describe('VideoScreen', () => {
  it('draws its own header, controls and source', async () => {
    const tree = await render();

    expect(textOf(hosts(tree, 'video-back')[0])).toContain('‹ 返回');
    expect(textOf(hosts(tree, 'video-toggle')[0])).toBe('暂停');
    expect(textOf(hosts(tree, 'video-source')[0])).toBe(DEFAULT_VIDEO_URL);
    expect(hosts(tree, 'video-surface')).not.toHaveLength(0);

    renderer.act(() => tree.unmount());
  });

  it('polls the player and shows its position', async () => {
    const tree = await render();
    await settle();

    expect(mockGetState).toHaveBeenCalledWith(playerIdOf(tree));
    expect(textOf(hosts(tree, 'video-clock')[0])).toBe('00:12 / 00:52');

    renderer.act(() => tree.unmount());
  });

  it('pauses itself when the media ends and can restart', async () => {
    mockGetState.mockResolvedValue({
      found: true,
      position: 52_000,
      duration: 52_000,
      playing: false,
      ended: true,
      buffering: false,
      error: null,
    });
    const tree = await render();
    await settle();
    const playerId = playerIdOf(tree);

    expect(textOf(hosts(tree, 'video-toggle')[0])).toBe('播放');

    renderer.act(() => pressable(tree, 'video-restart').props.onPress());
    expect(mockSeekTo).toHaveBeenCalledWith(playerId, 0);
    expect(textOf(hosts(tree, 'video-toggle')[0])).toBe('暂停');

    renderer.act(() => tree.unmount());
  });

  it('offers 全屏 and 画中画, and hands both to the platform', async () => {
    const tree = await render();
    await settle();

    const fullscreen = pressable(tree, 'video-fullscreen');
    expect(textOf(fullscreen)).toBe('全屏');
    renderer.act(() => fullscreen.props.onPress());
    expect(mockSetFullscreen).toHaveBeenCalledWith(true);
    expect(textOf(pressable(tree, 'video-fullscreen'))).toBe('退出全屏');

    renderer.act(() => pressable(tree, 'video-pip').props.onPress());
    expect(mockEnterPip).toHaveBeenCalled();

    renderer.act(() => tree.unmount());
  });

  it('reports a playback error instead of crashing', async () => {
    mockGetState.mockResolvedValue({
      found: true,
      position: 0,
      duration: 0,
      playing: false,
      ended: false,
      buffering: false,
      error: 'ERROR_CODE_IO_BAD_HTTP_STATUS',
    });
    const tree = await render();
    await settle();

    expect(textOf(hosts(tree, 'video-error')[0])).toContain('ERROR_CODE_IO_BAD_HTTP_STATUS');
    expect(hosts(tree, 'video-buffering')).toHaveLength(0);

    renderer.act(() => tree.unmount());
  });
});
