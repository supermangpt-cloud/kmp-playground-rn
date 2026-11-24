/**
 * The camera preview the 扫一扫 page draws with, as a Fabric component.
 *
 * Only the preview and the decode are native: the header, the aiming frame, the
 * hint and 取消 are ordinary React Native views in `ScanScreen`, so the screen
 * follows the app's theme instead of the platform's.
 */
import type {HostComponent, ViewProps} from 'react-native';
import type {DirectEventHandler, Int32} from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

/** A QR was read; `value` is its raw text. */
type DecodedEvent = Readonly<{value: string}>;

/** The preview could not start; `reason` is shown to the user. */
type FailedEvent = Readonly<{reason: string}>;

export interface NativeProps extends ViewProps {
  /** Which camera to use; defaults to the back one. */
  facing?: string;
  /** Fires once per successful decode. */
  onDecoded?: DirectEventHandler<DecodedEvent>;
  /** Fires when the camera or the decoder cannot run. */
  onFailed?: DirectEventHandler<FailedEvent>;
  /** Reported so the page can tell "still warming up" from "dead". */
  onReady?: DirectEventHandler<Readonly<{width: Int32; height: Int32}>>;
}

export default codegenNativeComponent<NativeProps>(
  'ScannerView',
) as HostComponent<NativeProps>;
