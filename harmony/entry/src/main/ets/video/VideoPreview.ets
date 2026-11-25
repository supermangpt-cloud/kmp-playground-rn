/**
 * The camera-free half of the 视频播放 page: an XComponent the shared session
 * draws into.
 *
 * Nothing is created or released here. The session owns the player, so React
 * Native can re-render or rebuild this node without the media reloading — which
 * is what keeps playback continuous when the page comes back from picture-in-
 * picture.
 */
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ComponentBuilderContext } from '@rnoh/react-native-openharmony/ets';
import { VideoSession } from './VideoSession';

const DOMAIN = 0x0000;
const TAG = 'RnVideo';

@Builder
export function buildVideoView(_ctx: ComponentBuilderContext) {
  VideoSurface()
}

@Component
struct VideoSurface {
  private controller: XComponentController = new XComponentController();

  aboutToAppear(): void {
    VideoSession.attach(this.controller);
  }

  aboutToDisappear(): void {
    VideoSession.detach();
  }

  build() {
    // Wrapped in a Stack the way the scan preview is: an XComponent that is the
    // direct root of a custom component never receives a size from the React
    // Native layout, so it stays 0x0 and draws nothing.
    Stack() {
      XComponent({
      id: 'rn-video-surface',
      type: XComponentType.SURFACE,
      controller: this.controller,
    })
      .width('100%')
      .height('100%')
      .onLoad(() => {
        VideoSession.bindSurface(this.controller.getXComponentSurfaceId());
      })
      .onSizeChange((_old: SizeOptions, size: SizeOptions) => {
        hilog.info(DOMAIN, TAG, 'surface size %{public}sx%{public}s',
          `${size.width}`, `${size.height}`);
        if (size.width !== undefined && Number(size.width) > 0) {
          try {
            VideoSession.bindSurface(this.controller.getXComponentSurfaceId());
          } catch (error) {
            hilog.warn(DOMAIN, TAG, 'surface query failed: %{public}s',
              `${(error as BusinessError).message}`);
          }
        }
      })
    }
    .width('100%')
    .height('100%')
  }
}
