import {
  AnyJSBundleProvider,
  ComponentBuilderContext,
  FileJSBundleProvider,
  MetroJSBundleProvider,
  ResourceJSBundleProvider,
  RNApp,
  RNOHErrorDialog,
  RNOHCoreContext,
  RNOHLogger,
  TraceJSBundleProviderDecorator
} from '@rnoh/react-native-openharmony';
import { getRNOHPackages } from '../PackageProvider';
import { WebView, WEB_VIEW } from '@react-native-oh-tpl/react-native-webview';

/**
 * The only custom ArkTS component in this app is the WebView adaptation's
 * `RNCWebView`; register it under the component name RN sends from JS.
 */
@Builder
export function buildCustomRNComponent(ctx: ComponentBuilderContext) {
  if (ctx.componentName === WEB_VIEW) {
    WebView({
      ctx: ctx.rnComponentContext,
      tag: ctx.tag,
    });
  }
}

const wrappedCustomRNComponentBuilder = wrapBuilder(buildCustomRNComponent);

@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private rnohCoreContext: RNOHCoreContext | undefined = undefined;
  @State shouldShow: boolean = false;
  private logger!: RNOHLogger;

  aboutToAppear() {
    this.logger = this.rnohCoreContext!.logger.clone('Index');
    const stopTracing = this.logger.clone('aboutToAppear').startTracing();
    this.shouldShow = true;
    stopTracing();
  }

  onBackPress(): boolean | undefined {
    // RNAbility always terminates or backgrounds the app on back. Let RN decide
    // first, and only consume the press when RN handled it.
    this.rnohCoreContext!.dispatchBackPress();
    return true;
  }

  build() {
    Column() {
      if (this.rnohCoreContext && this.shouldShow) {
        if (this.rnohCoreContext?.isDebugModeEnabled) {
          RNOHErrorDialog({ ctx: this.rnohCoreContext });
        }
        RNApp({
          rnInstanceConfig: {
            name: 'KmpPlaygroundRn',
            createRNPackages: getRNOHPackages,
            enableNDKTextMeasuring: true,
            enableBackgroundExecutor: false,
            enableCAPIArchitecture: true,
            arkTsComponentNames: []
          },
          initialProps: {} as Record<string, string>,
          appKey: 'KmpPlaygroundRn',
          wrappedCustomRNComponentBuilder: wrappedCustomRNComponentBuilder,
          onSetUp: (rnInstance) => {
            rnInstance.enableFeatureFlag('ENABLE_RN_INSTANCE_CLEAN_UP');
          },
          jsBundleProvider: new TraceJSBundleProviderDecorator(
            new AnyJSBundleProvider([
              // Development: Metro serves the bundle.
              new MetroJSBundleProvider(),
              // Debugging: a bundle pushed into the app sandbox.
              new FileJSBundleProvider('/data/storage/el2/base/files/bundle.harmony.js'),
              // Installed app: the bundle packaged by `npm run dev`.
              new ResourceJSBundleProvider(
                this.rnohCoreContext.uiAbilityContext.resourceManager,
                'bundle.harmony.js'
              )
            ]),
            this.rnohCoreContext.logger
          )
        });
      }
    }
    .height('100%')
    .width('100%')
  }
}
