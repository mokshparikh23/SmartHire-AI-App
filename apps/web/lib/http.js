/**
 * Shared response helpers for the routes the desktop app calls.
 *
 * Extracted from lib/ai.js so the session routes can use them without importing
 * the AI module. lib/ai.js re-exports both, so nothing that already imported
 * them from there had to change.
 */

/**
 * The desktop renderer calls the AI routes from file:// (origin "null") in a
 * packaged build, so those routes have to be open. The licence key in the body
 * is what actually authorises the call.
 *
 * The session routes do NOT need this — they are called from the Electron main
 * process via Node fetch, which is not subject to CORS at all, exactly like
 * /api/license/validate already is.
 */
export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function jsonError(reason, status, extra) {
  return Response.json({ error: reason, ...extra }, { status, headers: CORS })
}
