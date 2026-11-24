/**
 * Direct access to the `ImagePicker` native module, shared by all platforms.
 *
 * Android and iOS use the official `react-native-image-picker` module. Its JS
 * wrapper is not used because on RNOH it decides between "turbo module" and the
 * legacy `NativeModules` table with `global.__turboModuleProxy != null`, and
 * RN 0.72's `TurboModuleRegistry` checks `NativeModules[name]` *first*; RNOH
 * answers every legacy name with an empty stub, so the wrapper would silently
 * end up with a module that has no `launchImageLibrary` method. Asking the
 * module directly works on every platform.
 */
import {getTurboModule} from './turboModule';

type PickerOptions = {
  mediaType?: 'photo' | 'video' | 'mixed';
  includeBase64?: boolean;
  includeExtra?: boolean;
  videoQuality?: 'low' | 'medium' | 'high';
  cameraType?: 'back' | 'front';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  selectionLimit?: number;
  saveToPhotos?: boolean;
  durationLimit?: number;
};

/** Every key ImagePicker 7.0.3's Android `Options` reads, at its default. */
const PICKER_DEFAULTS: PickerOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  includeBase64: false,
  includeExtra: false,
  videoQuality: 'high',
  cameraType: 'back',
  quality: 1,
  maxHeight: 0,
  maxWidth: 0,
  saveToPhotos: false,
  durationLimit: 0,
};

export type PickerAsset = {
  uri?: string;
  base64?: string;
  width?: number;
  height?: number;
  type?: string;
  fileName?: string;
  fileSize?: number;
};

export type PickerResult = {
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets?: PickerAsset[];
};

type NativeImagePicker = {
  launchImageLibrary: (
    options: PickerOptions,
    callback: (result: PickerResult) => void,
  ) => void;
};

/**
 * Opens the system photo picker and resolves with the chosen image.
 *
 * Rejects when the platform's module is not registered, so the page can show
 * the reason instead of a silently empty picker.
 */
export function launchImageLibrary(
  options: PickerOptions,
): Promise<PickerResult> {
  const picker = getTurboModule<NativeImagePicker>('ImagePicker');
  if (picker === null || typeof picker.launchImageLibrary !== 'function') {
    return Promise.reject(
      new Error('ImagePicker 模块没有注册（launchImageLibrary 不存在）'),
    );
  }

  return new Promise((resolve, reject) => {
    try {
      // react-native-image-picker 7.0.3 reads every key of its Options
      // unconditionally (`options.getBoolean("includeBase64")` and friends), and
      // under the bridgeless architecture a missing key throws
      // `NoSuchKeyException` instead of returning a default. The wrapper
      // therefore always sends the full set, with the library's own defaults.
      picker!.launchImageLibrary({...PICKER_DEFAULTS, ...options}, result => {
        if (result === undefined || result === null) {
          resolve({didCancel: true});
          return;
        }
        resolve(result);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reject(new Error(`打开相册失败：${message}`));
    }
  });
}
