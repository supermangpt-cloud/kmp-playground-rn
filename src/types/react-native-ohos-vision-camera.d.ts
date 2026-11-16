/**
 * Type declarations for the HarmonyOS adaptation package.
 *
 * HAND-WRITTEN: `@react-native-ohos/react-native-vision-camera@4.0.3`
 * ships only `src/` and the HarmonyOS har, although its package.json points
 * `types` at `lib/typescript/index.d.ts` (not published), so TypeScript cannot
 * infer the module. Only the surface this app uses is declared: the `Camera`
 * view, the code-scanner hook and the device/permission hooks. Re-check these
 * declarations when the package version changes.
 */
declare module '@react-native-ohos/react-native-vision-camera' {
  import type {ComponentType} from 'react';
  import type {
    NativeSyntheticEvent,
    StyleProp,
    ViewProps,
    ViewStyle,
  } from 'react-native';

  export type CodeType =
    | 'code-128'
    | 'code-39'
    | 'code-93'
    | 'codabar'
    | 'ean-13'
    | 'ean-8'
    | 'itf'
    | 'upc-e'
    | 'upc-a'
    | 'qr'
    | 'pdf-417'
    | 'aztec'
    | 'data-matrix';

  export interface CodeScannerFrame {
    width: number;
    height: number;
  }

  export interface Code {
    type?: CodeType | 'unknown';
    value?: string;
    frame?: {x: number; y: number; width: number; height: number};
    corners?: Array<{x: number; y: number}>;
  }

  export interface CodeScanner {
    codeTypes?: CodeType[];
    onCodeScanned: (codes: Code[], frame: CodeScannerFrame) => void;
  }

  export type CameraPosition = 'front' | 'back' | 'external';

  export interface CameraDevice {
    id: string;
    position?: CameraPosition;
    name?: string;
    hasFlash?: boolean;
    hasTorch?: boolean;
  }

  export interface CameraProps extends ViewProps {
    style?: StyleProp<ViewStyle>;
    device?: CameraDevice;
    isActive: boolean;
    preview?: boolean;
    photo?: boolean;
    video?: boolean;
    audio?: boolean;
    torch?: 'on' | 'off';
    zoom?: number;
    enableZoomGesture?: boolean;
    resizeMode?: 'cover' | 'contain';
    codeScanner?: CodeScanner;
    onInitialized?: () => void;
    onStarted?: () => void;
    onStopped?: () => void;
    onError?: (event: NativeSyntheticEvent<{error: string}>) => void;
  }

  export const Camera: ComponentType<CameraProps>;

  export function useCodeScanner(codeScanner: CodeScanner): CodeScanner;

  export function useCameraDevice(
    position: CameraPosition,
    filter?: unknown,
  ): CameraDevice | undefined;

  export function useCameraDevices(): CameraDevice[];

  export function useCameraPermission(): {
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
  };
}
