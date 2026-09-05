import { createBrowserClient } from '@supabase/ssr'
import { AUTH_STORAGE_KEY } from '@/lib/auth-cookie'

/**
 * The browser Supabase client, and THE ONLY createBrowserClient CALL IN THIS APP.
 *
 * ADMIN SPLIT 2026-09-01 ─ that exclusivity is load-bearing, not tidiness.
 *
 * @supabase/ssr caches a module-level `cachedBrowserClient` and returns it for
 * every subsequent call, IGNORING the options passed
 * (createBrowserClient.js:8-13). So if any path in this app reaches
 * createBrowserClient without the cookieOptions below — a component copied over
 * from apps/web, a stray second helper — whichever call runs first wins for the
 * lifetime of the page, and it would lock in the DEFAULT storage key. From then
 * on this app reads and writes apps/web's cookie, silently, and the split is
 * gone with no error anywhere.
 *
 * The phase gate, and it is worth keeping in the runbook:
 *
 *     grep -rn "createBrowserClient" apps/admin --include=*.js --include=*.jsx
 *
 * must return exactly one hit, and it must be this file.
 *
 * WHY A DIFFERENT NAME AT ALL. Cookies ignore ports. localhost:3000 and
 * localhost:3003 are one cookie origin, so with the default name this app would
 * reuse apps/web's session in development — its own /login would be unreachable,
 * every bug in it invisible, and the first sighting would be in production,
 * where the hosts differ and every admin is suddenly signed out. Naming them
 * apart makes dev behave like prod, and makes a *.vercel.app preview behave that
 * way too, which host-only scoping cannot (vercel.app is on the Public Suffix
 * List, so nothing there is cookie-isolated from anything else).
 *
 * WHY NOT `sb-admin-auth-token`. apps/web/proxy.js matches
 * /^sb-.+-auth-token(\.\d+)?$/ across the whole jar. An sb- prefixed name would
 * match it in development, so apps/web's optimistic gate would see a cookie it
 * cannot use, build a client, get null from getSession(), and bounce to /login.
 * Recoverable, but baffling. A non-sb- prefix makes the two one-directionally
 * clean.
 *
 * The counterpart is apps/web/lib/supabase.js, which takes no options and
 * therefore keeps writing the @supabase/ssr default. Do not "harmonise" them.
 *
 * The name itself lives in lib/auth-cookie.js, beside the regex that has to
 * match it — see the note there for why the dependency points that way.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookieOptions: { name: AUTH_STORAGE_KEY } }
  )
}
