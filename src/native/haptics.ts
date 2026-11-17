/**
 * JS side of the app's `CapabilityProbe` haptics method.
 *
 * The native side owns the platform's vibration details (the motor query and
 * `usage` switch on HarmonyOS, `VibrationEffect` on Android, the taptic engine
 * on iOS). It returns a note when the normal path had to fall back; the row
 * prints that note so a disabled system switch is never mistaken for a broken
 * button. A device without a motor rejects with a sentence instead of doing
 * nothing.
 */
import {getTurboModule} from './turboModule';

/** The three strengths the KMP page offers. */
export type HapticStrength = 'light' | 'medium' | 'heavy';

export type HapticResult = {
  /** True when the system accepted at least one vibration call. */
  fired: boolean;
  /** Non-empty when the tap fell back to another `usage`. */
  note?: string;
};

type NativeHaptics = {
  vibrateHaptic: (strength: string) => Promise<unknown>;
};

function requireHaptics(): NativeHaptics {
  const module = getTurboModule<NativeHaptics>('CapabilityProbe');
  if (module === null || typeof module.vibrateHaptic !== 'function') {
    throw new Error('CapabilityProbe 模块没有注册（vibrateHaptic 不存在）');
  }
  return module;
}

function reasonOf(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const {message, code} = error as {message?: unknown; code?: unknown};
    if (typeof message === 'string' && message.length > 0) {
      return code === undefined
        ? message
        : `${message}（code ${String(code)}）`;
    }
  }
  return fallback;
}

/** Triggers one tap; rejects when nothing could be fired. */
export async function vibrate(strength: HapticStrength): Promise<HapticResult> {
  let payload: unknown;
  try {
    payload = await requireHaptics().vibrateHaptic(strength);
  } catch (error) {
    throw new Error(reasonOf(error, '触发震动失败'));
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('震动模块没有返回结果');
  }
  const {fired, note} = payload as {fired?: unknown; note?: unknown};
  if (typeof fired !== 'boolean') {
    throw new Error('震动模块返回了无法识别的结果');
  }
  if (!fired) {
    throw new Error('震动没有被系统执行');
  }
  if (note !== undefined && typeof note !== 'string') {
    throw new Error('震动模块返回了无法识别的说明');
  }
  return {
    fired: true,
    note: note === undefined || note === '' ? undefined : note,
  };
}
