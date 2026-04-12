// ============================================================================
// KEEP IN SYNC WITH: GolfLabs.us/src/lib/kioskApi.ts
// ----------------------------------------------------------------------------
// The frontend manually mirrors the KioskSettings + KioskSettingsPatch shapes
// from this file. TypeScript can't cross-project this automatically, so any
// change here (adding a field, renaming, changing a type) MUST be paired with
// an edit to kioskApi.ts or the frontend will silently drop the field from
// its PATCH payloads. Look for the matching sync comment in that file.
// ============================================================================

import { z } from 'zod';

/**
 * Valid session-extension durations. The dashboard UI offers exactly
 * these buttons, and migration 063 enforces the same set with a CHECK
 * constraint on `kiosk_settings.extension_duration_options`.
 */
export const EXTENSION_DURATION_VALUES = [15, 30, 45, 60] as const;
export type ExtensionDuration = (typeof EXTENSION_DURATION_VALUES)[number];

/**
 * Server-authoritative settings for a single kiosk, merged from
 * `kiosk_settings` (new per-kiosk config) and `spaces` (existing
 * league mode and heartbeat columns). The kiosk binary receives this
 * shape verbatim from `/kiosk/settings/:installationId` and uses it
 * as its single source of truth.
 */
export interface KioskSettings {
  // Identity (sourced from kiosk_settings + spaces)
  spaceId: string;
  locationId: string;
  installationId: string | null;
  registeredAt: string | null;
  kioskVersion: string | null;

  // Read-only space metadata the kiosk displays
  spaceName: string;
  spaceNumber: number;

  // Heartbeat / reachability (lives on spaces.last_seen, spaces.kiosk_ip)
  lastSeen: string | null;
  kioskIp: string | null;

  // Door lock
  shellyIp: string | null;

  // Projector (DB9 RS-232)
  projectorControlEnabled: boolean;
  projectorSerialPort: string | null;
  projectorBaudRate: number;
  projectorOnCommand: string | null;
  projectorOffCommand: string | null;
  projectorKeepAliveGapMinutes: number;
  projectorPreStartMinutes: number;

  // League mode (lives on spaces.league_mode_*)
  leagueModeEnabled: boolean;
  leagueId: string | null;

  // Session extensions
  extensionsEnabled: boolean;
  extensionTriggerMinutes: number;
  extensionDurationOptions: ExtensionDuration[];

  // Location branding — the main kiosk UI injects this as a CSS
  // variable so the idle screen, overlays, and buttons adopt the
  // location's color. Sourced from location_settings.brand_primary_color.
  brandPrimaryColor: string;
}

/**
 * Payload returned by `/kiosk/locations/:locationId/spaces` during
 * self-registration. Includes only the fields the setup screens need
 * and the location's primary brand color so the picker can theme
 * itself before the kiosk is fully registered.
 */
export interface UnclaimedSpacesResponse {
  locationId: string;
  locationName: string;
  brandPrimaryColor: string;
  spaces: Array<{
    id: string;
    name: string;
    spaceNumber: number;
  }>;
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();

export const registerKioskSchema = z.object({
  installationId: uuid,
  spaceId: uuid,
  locationId: uuid,
  version: z.string().min(1).max(32),
});
export type RegisterKioskInput = z.infer<typeof registerKioskSchema>;

/**
 * Discriminated on presence — every field is optional because the
 * dashboard does partial updates, but at least one must be present
 * for the PATCH to be meaningful. Enforced in the service layer.
 */
export const updateKioskSettingsSchema = z
  .object({
    // IPv4 or hostname. Kept loose — validation is UX-level, the kiosk
    // will fail at connect time if the address is wrong.
    shellyIp: z.string().regex(/^[a-zA-Z0-9.\-_:]{1,253}$/).nullable().optional(),

    projectorControlEnabled: z.boolean().optional(),
    projectorSerialPort: z.string().min(1).max(32).nullable().optional(),
    projectorBaudRate: z
      .number()
      .int()
      .refine((n) => [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(n), {
        message: 'Invalid baud rate',
      })
      .optional(),
    projectorOnCommand: z.string().max(256).nullable().optional(),
    projectorOffCommand: z.string().max(256).nullable().optional(),
    projectorKeepAliveGapMinutes: z.number().int().min(0).max(1440).optional(),
    projectorPreStartMinutes: z.number().int().min(0).max(120).optional(),

    leagueModeEnabled: z.boolean().optional(),
    leagueId: uuid.nullable().optional(),

    extensionsEnabled: z.boolean().optional(),
    extensionTriggerMinutes: z.number().int().min(1).max(120).optional(),
    extensionDurationOptions: z
      .array(z.number().int().refine((n): n is ExtensionDuration => EXTENSION_DURATION_VALUES.includes(n as ExtensionDuration), {
        message: 'Duration must be 15, 30, 45, or 60',
      }))
      .min(1)
      .optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateKioskSettingsInput = z.infer<typeof updateKioskSettingsSchema>;

export const restartKioskSchema = z
  .object({ reason: z.string().max(200).optional() })
  .optional();

export class KioskError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'KioskError';
  }
}
