/**
 * Per-platform overrides for the capability rows' status.
 *
 * `src/data/capabilities.ts` keeps the base definitions and the HarmonyOS
 * statuses (the platform the page was originally built and verified on). This
 * file is the Android profile: the official cross-platform libraries and the
 * app's own Android modules implement every row, so the one HarmonyOS-only
 * limitation (clipboard reads behind the PasteButton) no longer applies.
 *
 * Metro picks `capabilityCatalog.ios.ts` or `capabilityCatalog.harmony.ts` on
 * those platforms; this file is also the one TypeScript type-checks.
 */
import type {CapabilityStatus} from './capabilities';

export type CapabilityStatusOverride = {
  status: CapabilityStatus;
  limitation?: string;
};

export const CAPABILITY_STATUS_OVERRIDES: Readonly<
  Record<string, CapabilityStatusOverride>
> = {
  clipboard: {status: 'available'},
};
