/**
 * 视频播放: the page itself, drawn by React Native.
 *
 * The native half is one `VideoView` (ExoPlayer on Android, AVPlayer on
 * HarmonyOS); the header, the progress bar, the controls, 全屏 and 画中画 are all
 * views here, so the page matches the rest of the port instead of adopting a
 * platform player's chrome.
 *
 * Playback state comes from the `VideoPlayer` module polled a few times a second
 * — see `src/native/video.ts` for why it is not an event.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import VideoView from '../native/specs/VideoViewNativeComponent';
import {
  closeVideo,
  enterPip,
  formatClock,
  getVideoState,
  isInPip,
  isPipSupported,
  openVideo,
  seekVideo,
  setFullscreen,
  setPausedVideo,
} from '../native/video';
import {colors} from '../ui/theme';

/** A short, stable H.264 sample that plays on every platform. */
export const DEFAULT_VIDEO_URL = 'https://media.w3.org/2010/05/sintel/trailer.mp4';

const POLL_MS = 400;

type Props = {
  onBack: () => void;
  url?: string;
};

export default function VideoScreen({onBack, url}: Props): React.JSX.Element {
  const source = url ?? DEFAULT_VIDEO_URL;
  // Identifies this player to the native module; a Fabric host instance has no
  // React tag the page could read, so the id is generated here and passed down.
  const playerIdRef = useRef(`video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const playerId = playerIdRef.current;
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [fullscreen, setFullscreenFlag] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [inPip, setInPip] = useState(false);

  // Hand the media to the platform once, and take it back when the page leaves.
  useEffect(() => {
    openVideo(playerId, source);
    return () => closeVideo(playerId);
  }, [playerId, source]);

  useEffect(() => {
    setPausedVideo(playerId, paused);
  }, [playerId, paused]);

  useEffect(() => {
    let cancelled = false;
    isPipSupported().then(supported => {
      if (!cancelled) {
        setPipSupported(supported);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the page must not leave the window rotated or the bars hidden.
  useEffect(() => {
    return () => {
      setFullscreen(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const state = await getVideoState(playerId);
      if (cancelled) {
        return;
      }
      const pinned = await isInPip();
      if (!cancelled) {
        setInPip(pinned);
      }
      setUnreachable(state === null || !state.found);
      if (state === null || !state.found) {
        return;
      }
      setPosition(state.position);
      setDuration(state.duration);
      setBuffering(state.buffering);
      setError(state.error);
      if (state.ended) {
        setPaused(true);
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [playerId]);

  const togglePlay = useCallback(() => {
    setPaused(current => !current);
  }, []);

  const restart = useCallback(() => {
    seekVideo(playerId, 0);
    setPaused(false);
  }, [playerId]);

  const toggleFullscreen = useCallback(() => {
    setFullscreenFlag(current => {
      setFullscreen(!current);
      return !current;
    });
  }, []);

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  // In the system window the picture is the whole point: draw nothing else.
  if (inPip) {
    return (
      <View style={styles.pip}>
        <VideoView
          style={StyleSheet.absoluteFill}
          playerId={playerId}
          url={source}
          paused={paused}
          muted={false}
          loop={false}
          resizeMode="contain"
          testID="video-surface-pip"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="video-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
          testID="video-back">
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.heading}>视频播放</Text>
      </View>

      <View style={styles.stage}>
        <VideoView
          style={StyleSheet.absoluteFill}
          playerId={playerId}
          url={source}
          paused={paused}
          muted={false}
          loop={false}
          resizeMode="contain"
          testID="video-surface"
        />
        {buffering && error === null ? (
          <Text style={styles.overlayText} testID="video-buffering">
            正在缓冲…
          </Text>
        ) : null}
        {error === null ? null : (
          <Text style={styles.overlayText} testID="video-error">
            播放失败：{error}
          </Text>
        )}
      </View>

      <View style={styles.controls}>
        <Text style={styles.clock} testID="video-clock">
          {formatClock(position)} / {formatClock(duration)}
        </Text>
        <View style={styles.progressTrack} testID="video-progress">
          <View style={[styles.progressFill, {width: `${progress * 100}%`}]} />
        </View>
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? '播放' : '暂停'}
            onPress={togglePlay}
            style={({pressed}) => [styles.button, pressed && styles.pressed]}
            testID="video-toggle">
            <Text style={styles.buttonText}>{paused ? '播放' : '暂停'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重播"
            onPress={restart}
            style={({pressed}) => [styles.button, pressed && styles.pressed]}
            testID="video-restart">
            <Text style={styles.buttonText}>重播</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fullscreen ? '退出全屏' : '全屏'}
            onPress={toggleFullscreen}
            style={({pressed}) => [styles.button, pressed && styles.pressed]}
            testID="video-fullscreen">
            <Text style={styles.buttonText}>{fullscreen ? '退出全屏' : '全屏'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="画中画"
            disabled={!pipSupported}
            onPress={enterPip}
            style={({pressed}) => [
              styles.button,
              !pipSupported && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
            testID="video-pip">
            <Text style={styles.buttonText}>画中画</Text>
          </Pressable>
        </View>
      </View>

      {unreachable ? (
        <Text style={styles.source} testID="video-unreachable">
          读不到播放状态（VideoPlayer 模块未就绪）
        </Text>
      ) : null}
      <Text style={styles.source} testID="video-source">
        {source}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stage: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  overlayText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    textAlign: 'center',
    fontSize: 13,
    color: '#FFFFFF',
  },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  clock: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: colors.imagePlaceholder,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  source: {
    marginTop: 14,
    paddingHorizontal: 16,
    fontSize: 12,
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  pip: {
    flex: 1,
    backgroundColor: '#000000',
  },
  pressed: {
    opacity: 0.7,
  },
});
