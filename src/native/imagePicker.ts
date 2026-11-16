/**
 * Direct access to the HarmonyOS image-picker turbo module.
 *
 * `react-native-image-picker`'s JS wrapper is not used: it decides between
 * "turbo module" and the legacy `NativeModules` table with
 * `global.__turboModuleProxy != null`, and RN 0.72's `TurboModuleRegistry`
 * checks `NativeModules[name]` *first*. On RNOH the legacy table answers every
 * name with an empty stub, so the wrapper silently ends up with a module that
 * has no `launchImageLibrary` method. Asking the turbo module proxy directly
 * reaches the ArkTS module registered by the package's HarmonyOS adaptation.
 */
import {getTurboModule} from './turboModule';

type PickerOptions = {
  mediaType?: 'photo' | 'video' | 'mixed';
  includeBase64?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  selectionLimit?: number;
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
 * Rejects when the HarmonyOS module is not registered, so the page can show
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
      picker!.launchImageLibrary(options, result => {
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
