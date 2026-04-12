"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KioskService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
const kiosk_types_1 = require("./kiosk.types");
function toExtensionDurations(raw) {
    return raw.filter((n) => kiosk_types_1.EXTENSION_DURATION_VALUES.includes(n));
}
function extractBrandColor(row) {
    var _a, _b, _c, _d;
    return (_d = (_c = (_b = (_a = row.spaces) === null || _a === void 0 ? void 0 : _a.locations) === null || _b === void 0 ? void 0 : _b.location_settings) === null || _c === void 0 ? void 0 : _c.brand_primary_color) !== null && _d !== void 0 ? _d : '158 100% 33%';
}
function formatSettings(row) {
    return {
        spaceId: row.space_id,
        locationId: row.spaces.location_id,
        installationId: row.installation_id,
        registeredAt: row.registered_at,
        kioskVersion: row.kiosk_version,
        spaceName: row.spaces.name,
        spaceNumber: row.spaces.space_number,
        lastSeen: row.spaces.last_seen,
        kioskIp: row.spaces.kiosk_ip,
        shellyIp: row.shelly_ip,
        projectorControlEnabled: row.projector_control_enabled,
        projectorSerialPort: row.projector_serial_port,
        projectorBaudRate: row.projector_baud_rate,
        projectorOnCommand: row.projector_on_command,
        projectorOffCommand: row.projector_off_command,
        projectorKeepAliveGapMinutes: row.projector_keep_alive_gap_minutes,
        projectorPreStartMinutes: row.projector_pre_start_minutes,
        leagueModeEnabled: row.spaces.league_mode_active,
        leagueId: row.spaces.league_mode_league_id,
        extensionsEnabled: row.extensions_enabled,
        extensionTriggerMinutes: row.extension_trigger_minutes,
        extensionDurationOptions: toExtensionDurations(row.extension_duration_options),
        brandPrimaryColor: extractBrandColor(row),
    };
}
const KIOSK_SETTINGS_SELECT = `
  space_id,
  installation_id,
  registered_at,
  kiosk_version,
  shelly_ip,
  projector_control_enabled,
  projector_serial_port,
  projector_baud_rate,
  projector_on_command,
  projector_off_command,
  projector_keep_alive_gap_minutes,
  projector_pre_start_minutes,
  extensions_enabled,
  extension_trigger_minutes,
  extension_duration_options,
  spaces!inner (
    id,
    location_id,
    space_number,
    name,
    last_seen,
    kiosk_ip,
    league_mode_active,
    league_mode_league_id,
    locations!inner (
      location_settings ( brand_primary_color )
    )
  )
`;
class KioskService {
    constructor(socketService) {
        this.socketService = socketService;
    }
    // -------------------------------------------------------------------------
    // Kiosk-authenticated (X-Kiosk-Key)
    // -------------------------------------------------------------------------
    /**
     * List spaces at a location whose kiosk_settings row has no
     * installation_id — i.e. no kiosk has claimed this space yet. Used
     * by the setup wizard's space picker screen.
     */
    listUnclaimedSpacesForLocation(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!locationId)
                throw new kiosk_types_1.KioskError('Location ID is required', 400);
            const { data: location, error: locationError } = yield database_1.supabase
                .from('locations')
                .select('id, name, location_settings!inner(brand_primary_color, kiosk_feature_enabled)')
                .eq('id', locationId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .single();
            if (locationError || !location) {
                throw new kiosk_types_1.KioskError('Location not found', 404);
            }
            const locSettings = location.location_settings;
            if (!(locSettings === null || locSettings === void 0 ? void 0 : locSettings.kiosk_feature_enabled)) {
                throw new kiosk_types_1.KioskError('Kiosk feature not enabled for this location', 403);
            }
            const { data: rows, error: spacesError } = yield database_1.supabase
                .from('spaces')
                .select('id, name, space_number, kiosk_settings!inner(installation_id)')
                .eq('location_id', locationId)
                .is('deleted_at', null)
                .is('kiosk_settings.installation_id', null)
                .order('space_number', { ascending: true });
            if (spacesError) {
                logger_1.logger.error({ err: spacesError, locationId }, 'Failed to list unclaimed spaces');
                throw new kiosk_types_1.KioskError('Failed to list spaces', 500);
            }
            const brandPrimaryColor = (_a = locSettings.brand_primary_color) !== null && _a !== void 0 ? _a : '158 100% 33%';
            return {
                locationId: location.id,
                locationName: location.name,
                brandPrimaryColor,
                spaces: (rows !== null && rows !== void 0 ? rows : []).map((r) => ({
                    id: r.id,
                    name: r.name,
                    spaceNumber: r.space_number,
                })),
            };
        });
    }
    /**
     * Race-safe claim of a space for an installation. Mirrors the
     * Stripe Connect `getOrCreateAccount` conditional-UPDATE pattern:
     * the UPDATE only succeeds when `installation_id` is NULL or
     * already matches this installation (idempotent re-register after
     * a config.json restore). Anyone else racing for the same space
     * gets a 409.
     */
    registerKiosk(input) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify the space actually belongs to the claimed location. Defends
            // against a rogue or misconfigured kiosk trying to claim a space in a
            // different tenant by sending a mismatched pair.
            const { data: space, error: spaceError } = yield database_1.supabase
                .from('spaces')
                .select('id, location_id')
                .eq('id', input.spaceId)
                .is('deleted_at', null)
                .single();
            if (spaceError || !space)
                throw new kiosk_types_1.KioskError('Space not found', 404);
            if (space.location_id !== input.locationId) {
                logger_1.logger.warn({ input, actualLocationId: space.location_id }, 'Kiosk registration attempted with mismatched location');
                throw new kiosk_types_1.KioskError('Space does not belong to that location', 400);
            }
            // Gate on the kiosk feature flag — a location owner must opt in via
            // location_settings.kiosk_feature_enabled before any kiosk binary can
            // register against their spaces.
            const { data: locSettings, error: locSettingsError } = yield database_1.supabase
                .from('location_settings')
                .select('kiosk_feature_enabled')
                .eq('location_id', input.locationId)
                .maybeSingle();
            if (locSettingsError) {
                logger_1.logger.error({ err: locSettingsError, locationId: input.locationId }, 'Failed to load location_settings for kiosk gate');
                throw new kiosk_types_1.KioskError('Failed to verify kiosk feature', 500);
            }
            if (!(locSettings === null || locSettings === void 0 ? void 0 : locSettings.kiosk_feature_enabled)) {
                throw new kiosk_types_1.KioskError('Kiosk feature not enabled for this location', 403);
            }
            // Conditional claim. `.or()` makes this idempotent for the same
            // installation id — a kiosk re-running setup after a config file
            // restore can reclaim its own row without error.
            const { data: claimed, error: claimError } = yield database_1.supabase
                .from('kiosk_settings')
                .update({
                installation_id: input.installationId,
                registered_at: new Date().toISOString(),
                kiosk_version: input.version,
            })
                .eq('space_id', input.spaceId)
                .or(`installation_id.is.null,installation_id.eq.${input.installationId}`)
                .select(KIOSK_SETTINGS_SELECT)
                .maybeSingle();
            if (claimError) {
                logger_1.logger.error({ err: claimError, input }, 'Kiosk registration conditional update failed');
                throw new kiosk_types_1.KioskError('Failed to register kiosk', 500);
            }
            if (!claimed) {
                throw new kiosk_types_1.KioskError('Space is already claimed by another kiosk', 409);
            }
            return formatSettings(claimed);
        });
    }
    /**
     * Boot / reconnect fetch. Returns 404 if the installation has been
     * cleared from the dashboard — the kiosk interprets 404 as "you've
     * been reset" and drops back into the setup wizard.
     */
    getSettingsByInstallation(installationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('kiosk_settings')
                .select(KIOSK_SETTINGS_SELECT)
                .eq('installation_id', installationId)
                .maybeSingle();
            if (error) {
                logger_1.logger.error({ err: error, installationId }, 'Failed to load kiosk settings by installation');
                throw new kiosk_types_1.KioskError('Failed to load settings', 500);
            }
            if (!data) {
                throw new kiosk_types_1.KioskError('Installation not found or cleared', 404);
            }
            return formatSettings(data);
        });
    }
    // -------------------------------------------------------------------------
    // Employee-authenticated (dashboard)
    // -------------------------------------------------------------------------
    getSettingsBySpace(spaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('kiosk_settings')
                .select(KIOSK_SETTINGS_SELECT)
                .eq('space_id', spaceId)
                .maybeSingle();
            if (error) {
                logger_1.logger.error({ err: error, spaceId }, 'Failed to load kiosk settings by space');
                throw new kiosk_types_1.KioskError('Failed to load settings', 500);
            }
            if (!data)
                throw new kiosk_types_1.KioskError('Space not found', 404);
            return formatSettings(data);
        });
    }
    /**
     * Partial update from the dashboard. Splits the patch across
     * `kiosk_settings` (new fields) and `spaces` (legacy league mode
     * columns) and broadcasts `kiosk_settings_updated` to the
     * space-scoped socket room so the kiosk re-renders in real time.
     */
    updateSettings(spaceId, patch) {
        return __awaiter(this, void 0, void 0, function* () {
            // Look up location id up front — we need it for the broadcast
            // and the partial unique constraint verification.
            const { data: space, error: spaceError } = yield database_1.supabase
                .from('spaces')
                .select('id, location_id')
                .eq('id', spaceId)
                .is('deleted_at', null)
                .single();
            if (spaceError || !space)
                throw new kiosk_types_1.KioskError('Space not found', 404);
            // Tenant isolation for league assignment. The `leagues` table is
            // global, so a caller with owner/admin rights at tenant A could
            // otherwise PATCH a space with a leagueId belonging to tenant B.
            // The FK constraint only enforces existence, not ownership. Verify
            // the league actually belongs to this space's location before we
            // let it through.
            if (patch.leagueId !== undefined && patch.leagueId !== null) {
                const { data: league, error: leagueError } = yield database_1.supabase
                    .from('leagues')
                    .select('id, location_id')
                    .eq('id', patch.leagueId)
                    .is('deleted_at', null)
                    .maybeSingle();
                if (leagueError) {
                    logger_1.logger.error({ err: leagueError, leagueId: patch.leagueId }, 'Failed to verify league ownership');
                    throw new kiosk_types_1.KioskError('Failed to verify league', 500);
                }
                if (!league) {
                    throw new kiosk_types_1.KioskError('League not found', 404);
                }
                if (league.location_id !== space.location_id) {
                    logger_1.logger.warn({ spaceId, leagueId: patch.leagueId, spaceLocation: space.location_id, leagueLocation: league.location_id }, 'Blocked cross-tenant league assignment attempt');
                    throw new kiosk_types_1.KioskError('League does not belong to this location', 400);
                }
            }
            // Build a snake_case JSONB payload for the RPC. Only fields the
            // caller explicitly set are forwarded — the SQL function uses
            // `p_patch ? 'key'` to distinguish "leave unchanged" from "set to
            // null". This keeps PATCH semantics consistent with the HTTP layer.
            const FIELD_MAP = {
                shellyIp: 'shelly_ip',
                projectorControlEnabled: 'projector_control_enabled',
                projectorSerialPort: 'projector_serial_port',
                projectorBaudRate: 'projector_baud_rate',
                projectorOnCommand: 'projector_on_command',
                projectorOffCommand: 'projector_off_command',
                projectorKeepAliveGapMinutes: 'projector_keep_alive_gap_minutes',
                projectorPreStartMinutes: 'projector_pre_start_minutes',
                extensionsEnabled: 'extensions_enabled',
                extensionTriggerMinutes: 'extension_trigger_minutes',
                extensionDurationOptions: 'extension_duration_options',
                leagueModeEnabled: 'league_mode_enabled',
                leagueId: 'league_id',
            };
            const rpcPatch = {};
            for (const [k, v] of Object.entries(patch)) {
                if (v !== undefined)
                    rpcPatch[FIELD_MAP[k]] = v;
            }
            // Atomic two-table update via the plpgsql function added in
            // migration 064. The function runs in a single implicit transaction
            // so kiosk_settings and spaces can never drift out of sync.
            const { error: rpcError } = yield database_1.supabase.rpc('update_kiosk_settings_tx', {
                p_space_id: spaceId,
                p_patch: rpcPatch,
            });
            if (rpcError) {
                logger_1.logger.error({ err: rpcError, spaceId, patch }, 'update_kiosk_settings_tx RPC failed');
                throw new kiosk_types_1.KioskError('Failed to update kiosk settings', 500);
            }
            // Fetch fresh, broadcast, return.
            const fresh = yield this.getSettingsBySpace(spaceId);
            this.broadcastSettingsUpdate(space.location_id, spaceId, fresh);
            return fresh;
        });
    }
    triggerRestart(spaceId_1) {
        return __awaiter(this, arguments, void 0, function* (spaceId, reason = 'admin_triggered') {
            const { data: space, error } = yield database_1.supabase
                .from('spaces')
                .select('id, location_id')
                .eq('id', spaceId)
                .is('deleted_at', null)
                .single();
            if (error || !space)
                throw new kiosk_types_1.KioskError('Space not found', 404);
            if (this.socketService) {
                this.socketService.broadcastToSpace(space.location_id, spaceId, 'kiosk_restart', {
                    reason,
                    spaceId,
                    timestamp: new Date().toISOString(),
                });
            }
        });
    }
    /**
     * Null out the installation_id + identity fields for a space,
     * freeing it for a fresh install to claim. Used when an operator
     * replaces the bay PC. Broadcasts a restart so the old (dying)
     * kiosk, if still running, exits gracefully rather than sitting on
     * stale creds.
     */
    clearInstallation(spaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: space, error: spaceError } = yield database_1.supabase
                .from('spaces')
                .select('id, location_id')
                .eq('id', spaceId)
                .is('deleted_at', null)
                .single();
            if (spaceError || !space)
                throw new kiosk_types_1.KioskError('Space not found', 404);
            const { data: cleared, error } = yield database_1.supabase
                .from('kiosk_settings')
                .update({
                installation_id: null,
                registered_at: null,
                kiosk_version: null,
            })
                .eq('space_id', spaceId)
                .select('space_id')
                .maybeSingle();
            if (error) {
                logger_1.logger.error({ err: error, spaceId }, 'Failed to clear kiosk installation');
                throw new kiosk_types_1.KioskError('Failed to clear installation', 500);
            }
            if (!cleared) {
                throw new kiosk_types_1.KioskError('Kiosk settings row not found for space', 404);
            }
            // Kick the (possibly still-running) old kiosk so it falls back
            // into the setup wizard on restart.
            yield this.triggerRestart(spaceId, 'installation_cleared').catch(() => {
                /* non-fatal — the old kiosk may already be offline */
            });
            return this.getSettingsBySpace(spaceId);
        });
    }
    // -------------------------------------------------------------------------
    // Broadcast helpers
    // -------------------------------------------------------------------------
    broadcastSettingsUpdate(locationId, spaceId, settings) {
        if (!this.socketService)
            return;
        this.socketService.broadcastToSpace(locationId, spaceId, 'kiosk_settings_updated', settings);
    }
}
exports.KioskService = KioskService;
