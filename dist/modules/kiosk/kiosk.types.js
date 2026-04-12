"use strict";
// ============================================================================
// KEEP IN SYNC WITH: GolfLabs.us/src/lib/kioskApi.ts
// ----------------------------------------------------------------------------
// The frontend manually mirrors the KioskSettings + KioskSettingsPatch shapes
// from this file. TypeScript can't cross-project this automatically, so any
// change here (adding a field, renaming, changing a type) MUST be paired with
// an edit to kioskApi.ts or the frontend will silently drop the field from
// its PATCH payloads. Look for the matching sync comment in that file.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.KioskError = exports.restartKioskSchema = exports.updateKioskSettingsSchema = exports.registerKioskSchema = exports.EXTENSION_DURATION_VALUES = void 0;
const zod_1 = require("zod");
/**
 * Valid session-extension durations. The dashboard UI offers exactly
 * these buttons, and migration 063 enforces the same set with a CHECK
 * constraint on `kiosk_settings.extension_duration_options`.
 */
exports.EXTENSION_DURATION_VALUES = [15, 30, 45, 60];
// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------
const uuid = zod_1.z.string().uuid();
exports.registerKioskSchema = zod_1.z.object({
    installationId: uuid,
    spaceId: uuid,
    locationId: uuid,
    version: zod_1.z.string().min(1).max(32),
});
/**
 * Discriminated on presence — every field is optional because the
 * dashboard does partial updates, but at least one must be present
 * for the PATCH to be meaningful. Enforced in the service layer.
 */
exports.updateKioskSettingsSchema = zod_1.z
    .object({
    // IPv4 or hostname. Kept loose — validation is UX-level, the kiosk
    // will fail at connect time if the address is wrong.
    shellyIp: zod_1.z.string().regex(/^[a-zA-Z0-9.\-_:]{1,253}$/).nullable().optional(),
    projectorControlEnabled: zod_1.z.boolean().optional(),
    projectorSerialPort: zod_1.z.string().min(1).max(32).nullable().optional(),
    projectorBaudRate: zod_1.z
        .number()
        .int()
        .refine((n) => [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(n), {
        message: 'Invalid baud rate',
    })
        .optional(),
    projectorOnCommand: zod_1.z.string().max(256).nullable().optional(),
    projectorOffCommand: zod_1.z.string().max(256).nullable().optional(),
    projectorKeepAliveGapMinutes: zod_1.z.number().int().min(0).max(1440).optional(),
    projectorPreStartMinutes: zod_1.z.number().int().min(0).max(120).optional(),
    leagueModeEnabled: zod_1.z.boolean().optional(),
    leagueId: uuid.nullable().optional(),
    extensionsEnabled: zod_1.z.boolean().optional(),
    extensionTriggerMinutes: zod_1.z.number().int().min(1).max(120).optional(),
    extensionDurationOptions: zod_1.z
        .array(zod_1.z.number().int().refine((n) => exports.EXTENSION_DURATION_VALUES.includes(n), {
        message: 'Duration must be 15, 30, 45, or 60',
    }))
        .min(1)
        .optional(),
})
    .strict()
    .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
});
exports.restartKioskSchema = zod_1.z
    .object({ reason: zod_1.z.string().max(200).optional() })
    .optional();
class KioskError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'KioskError';
    }
}
exports.KioskError = KioskError;
