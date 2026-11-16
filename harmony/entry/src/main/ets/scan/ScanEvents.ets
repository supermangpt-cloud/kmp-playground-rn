/**
 * Data shared by the ArkTS ScanPage and the ScanKit turbo module.
 *
 * The page and the module run in the same process, so the page reports its
 * outcome through a custom emitter event: the module subscribes before it pushes
 * the page and resolves the JS promise when the event arrives. Keeping the id in
 * one place stops the two ends from drifting apart.
 */
export const SCAN_RESULT_EVENT_ID: number = 0x5CA9;

/**
 * Outcome of `ScanKit.startScanner()`, also the object the page sends through
 * the emitter.
 *
 * `cancelled` is the user leaving the page without a code; `failed` carries a
 * reason when the camera could not start.
 */
export interface ScanPageResult {
  status: string;
  value?: string;
  reason?: string;
}
