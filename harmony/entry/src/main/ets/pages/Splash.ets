import { router } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0000;

/**
 * How long the splash stays. Mirrors SplashActivity.SPLASH_MILLIS on Android
 * and SplashViewController.m on iOS; keep the three equal.
 */
export const SPLASH_MILLIS: number = 1000;

/**
 * Native launch splash (logo and app name), the first page EntryAbility loads.
 * After SPLASH_MILLIS it replaces itself with pages/Index, the RN surface, so
 * back on the product list leaves the app instead of returning here. Back
 * during the splash leaves the app as usual and cancels the timer.
 */
@Entry
@Component
struct Splash {
  private timer: number = -1;

  aboutToAppear() {
    this.timer = setTimeout(() => {
      this.timer = -1;
      router.replaceUrl({ url: 'pages/Index' }).catch((err: Error) => {
        hilog.error(DOMAIN, 'Splash', 'Failed to open Index: %{public}s', JSON.stringify(err));
      });
    }, SPLASH_MILLIS);
  }

  aboutToDisappear() {
    if (this.timer !== -1) {
      clearTimeout(this.timer);
      this.timer = -1;
    }
  }

  build() {
    Column() {
      // Text-only logo: the ticket asks for solid colours and text, no image.
      Stack() {
        Text('KMP')
          .fontSize(32)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FFFFFF')
      }
      .width(120)
      .height(120)
      .backgroundColor('#2563EB')
      .borderRadius(24)

      Text($r('app.string.splash_title'))
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .fontColor('#212121')
        .margin({ top: 20 })

      Text($r('app.string.splash_subtitle'))
        .fontSize(14)
        .fontColor('#757575')
        .margin({ top: 6 })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .backgroundColor('#FFFFFF')
  }
}
