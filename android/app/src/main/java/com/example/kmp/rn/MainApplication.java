package com.example.kmp.rn;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.soloader.SoLoader;
import java.io.IOException;
import com.facebook.react.soloader.OpenSourceMergedSoMapping;
import com.facebook.react.ReactHost;
import com.facebook.react.defaults.DefaultReactHost;
import com.example.kmp.rn.capabilities.CapabilityModulesPackage;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {

  private final ReactNativeHost mReactNativeHost =
      new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          @SuppressWarnings("UnnecessaryLocalVariable")
          List<ReactPackage> packages = new PackageList(this).getPackages();
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // packages.add(new MyReactNativePackage());
          // The app's own capability modules (CapabilityProbe / ImageSave /
          // WifiNetwork) are not npm packages, so they are registered here.
          packages.add(new CapabilityModulesPackage());
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }
      };

  @SuppressWarnings("deprecation")
  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  /**
   * RN 0.86 is bridgeless: `ReactInstanceManager.createReactContext` throws, so
   * the host object the activity talks to has to be the ReactHost. The
   * ReactNativeHost above is kept only because `getDefaultReactHost` takes it to
   * read the package list.
   */
  @Override
  public ReactHost getReactHost() {
    return DefaultReactHost.INSTANCE.getDefaultReactHost(this, mReactNativeHost, null);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    // RN 0.76+ merges the per-feature JNI libraries into libreactnative.so.
    // Passing the merged-SO mapping is what lets SoLoader resolve names like
    // `libreact_featureflagsjni.so`; the old `init(this, false)` call made the
    // process die on the first lookup.
    try {
      SoLoader.init(this, OpenSourceMergedSoMapping.INSTANCE);
    } catch (IOException failed) {
      throw new RuntimeException("SoLoader 初始化失败", failed);
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      DefaultNewArchitectureEntryPoint.load();
    }
  }
}
