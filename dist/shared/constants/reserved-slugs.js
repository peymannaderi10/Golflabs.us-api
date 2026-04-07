"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESERVED_SLUGS = void 0;
exports.isReservedSlug = isReservedSlug;
/**
 * Canonical list of subdomain slugs that MUST NOT be assigned to tenants.
 *
 * This constant is the single source of truth for the TypeScript layer.
 * The SQL layer mirrors it via `public.is_reserved_slug()` — keep both in
 * sync when adding new entries (see migration 058).
 */
exports.RESERVED_SLUGS = new Set([
    'app',
    'www',
    'api',
    'admin',
    'dashboard',
    'staging',
    'dev',
    'mail',
    'ftp',
    'smtp',
    'employee',
    'kiosk',
    'support',
    'help',
    'auth',
    'billing',
    'status',
    'docs',
    'blog',
    'cdn',
    'static',
]);
function isReservedSlug(slug) {
    return exports.RESERVED_SLUGS.has(slug.toLowerCase());
}
