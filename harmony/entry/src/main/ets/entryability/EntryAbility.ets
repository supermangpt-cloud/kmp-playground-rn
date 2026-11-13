import { RNAbility } from '@rnoh/react-native-openharmony';

/**
 * The ability loads the native splash first. Splash.ets replaces itself with
 * pages/Index (the RN surface) after SPLASH_MILLIS.
 */
export default class EntryAbility extends RNAbility {
  override getPagePath() {
    return 'pages/Splash';
  }
}
