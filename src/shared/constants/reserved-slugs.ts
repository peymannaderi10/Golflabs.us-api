/**
 * Canonical list of subdomain slugs that MUST NOT be assigned to tenants.
 *
 * This constant is the single source of truth for the TypeScript layer.
 * The SQL layer mirrors it via `public.is_reserved_slug()` — keep both in
 * sync when adding new entries (see migration 058).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
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

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
