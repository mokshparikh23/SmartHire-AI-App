/**
 * @supabase/ssr writes sb-<project-ref>-auth-token, chunked as .0/.1 when the
 * payload is large enough to split across cookies.
 *
 * DELETE-ACCOUNT 2026-09-01: lifted out of proxy.js, where it lived inline,
 * because two things now depend on it and they must not be allowed to disagree.
 * proxy.js decides whether a browser LOOKS signed in; app/api/account/delete
 * decides which cookies to expire so that it stops looking that way; and
 * lib/auth.js decides where to send a request whose cookie has outlived its
 * account.
 *
 * A regex that matches in one and not the others is the
 * /dashboard -> /login -> /dashboard loop that app/auth/device-signout/route.js
 * was written to escape — except worse, because after a deletion there is no
 * account left to sign back into. The `(\.\d+)?` is the part that gets dropped
 * when someone retypes this from memory, and dropping it means the chunked
 * halves of a large session survive every attempt to clear it.
 */
export const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/
