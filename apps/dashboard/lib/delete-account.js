/**
 * The word that has to be typed to delete an account, and the one function that
 * decides whether it was typed.
 *
 * ONE definition, imported by both halves. components/dashboard/DeleteAccountForm
 * decides whether to send the request and app/api/account/delete decides whether
 * to honour it, and "trim, then lower-case" is exactly the kind of rule that
 * drifts apart when it is written twice. If the browser accepts "Delete " and the
 * route refuses it, the user gets a 400 for a confirmation they typed correctly
 * by the only description they were ever given.
 *
 * WHAT THE WORD IS AND IS NOT. It is not a security control — it ships in the
 * client bundle and anyone who can reach the route can send it. It is a protocol
 * control, and it buys two things: an ACCIDENTAL call becomes structurally
 * impossible (a link prefetcher, a replayed fetch from devtools, a double
 * submit, a mis-wired button), and any future caller — a mobile app, a support
 * script — has to opt in deliberately rather than discovering that an empty body
 * works.
 *
 * LENIENT ON PURPOSE. The gate exists to prove deliberateness, not typing
 * accuracy. A capital D carries exactly as much intent as a small one, and
 * trailing whitespace from a paste or a phone keyboard is not a signal of
 * anything. The form says "Case does not matter" out loud so the leniency is a
 * stated rule rather than magic.
 */
export const DELETE_CONFIRM_WORD = 'delete'

export const matchesDeleteConfirmation = (value) =>
  String(value ?? '').trim().toLowerCase() === DELETE_CONFIRM_WORD
