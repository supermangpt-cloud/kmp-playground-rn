/**
 * The video surface the 视频播放 page draws with, as a Fabric component.
 *
 * Only the picture is native: the header, the progress bar, the controls, 全屏
 * and 画中画 are React Native views in `VideoScreen`, so the page follows the
 * app's theme instead of a platform player's chrome.
 *
 * There are deliberately no events here. Playback state is read through the
 * `VideoPlayer` TurboModule instead, because events from an ArkTS-backed custom
 * component do not reach JS on HarmonyOS yet (see docs/features/scan.md); a
 * polling module works on all three platforms today.
 */
import type {HostComponent, ViewProps} from 'react-native';
import type {DirectEventHandler, Int32} from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface NativeProps extends ViewProps {
  /** The media to play; http(s) or file URL. */
  url?: string;
  /**
   * Ties this view to the `VideoPlayer` module.
   *
   * A React tag would be the obvious key, but a Fabric host instance does not
   * expose one to JS, so the page generates an id and passes it down; the module
   * then finds the player by that id.
   */
  playerId?: string;
  /** Stop at the current frame while true. */
  paused?: boolean;
  /** Play without sound. */
  muted?: boolean;
  /** Restart from the beginning when the media ends. */
  loop?: boolean;
  /** `contain` letterboxes, `cover` crops; both keep the picture undistorted. */
  resizeMode?: string;
  /** Fires when the platform player reports the media's size. */
  onVideoSize?: DirectEventHandler<Readonly<{width: Int32; height: Int32}>>;
}

export default codegenNativeComponent<NativeProps>(
  'VideoView',
) as HostComponent<NativeProps>;
