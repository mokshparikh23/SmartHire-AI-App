/**
 * This app's auth cookie: the name it writes, and the pattern that matches it.
 *
 * ADMIN SPLIT 2026-09-01 ─ the counterpart is apps/web/lib/auth-cookie.js, which
 * matches /^sb-.+-auth-token(\.\d+)?$/ — the @supabase/ssr default that app
 * writes. THE TWO MUST NOT BE SHARED, and that is the whole point of the split.
 *
 * Both files are used the same way: `jar.getAll().some(c => RE.test(c.name))`, a
 * scan of the WHOLE cookie jar by name rather than a lookup of one key. In
 * development the two apps share a jar, because cookies ignore ports. So if this
 * app carried apps/web's pattern, a request here with no session of its own
 * would still find apps/web's cookie, conclude a session had outlived its
 * account, and redirect to /auth/device-signout. Production, where the jars are
 * separate, would never reproduce it — a dev-only failure on the one origin
 * whose sign-in path is hardest to exercise.
 *
 * WHY THE NAME DOES NOT START WITH `sb-`. apps/web/proxy.js matches
 * /^sb-.+-auth-token(\.\d+)?$/ across the whole jar too. An `sb-` prefixed name
 * would match it in development, so apps/web's optimistic gate would see a
 * cookie it cannot use, build a client, get null from getSession() and bounce to
 * /login. Recoverable, but baffling. This spelling keeps the two
 * one-directionally clean.
 *
 * The `(\.\d+)?` is not decoration, and it is the part that gets dropped when
 * someone retypes this from memory. @supabase/ssr chunks a large session across
 * `<key>.0` / `<key>.1`, and without the suffix the halves of a big session
 * survive every attempt to clear it.
 *
 * DEFINED HERE RATHER THAN IN lib/supabase.js, even though that is where the
 * client that writes it lives, because this module is imported by proxy.js and
 * lib/auth.js — both server-side. Pointing the dependency the other way would
 * drag @supabase/ssr's BROWSER client into the server graph for the sake of one
 * string.
 */
export const AUTH_STORAGE_KEY = 'shai-admin-auth'

export const AUTH_COOKIE = new RegExp(`^${AUTH_STORAGE_KEY}(\\.\\d+)?$`)
