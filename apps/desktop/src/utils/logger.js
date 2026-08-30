/* SEGMENTATION 2026-08-30 ─────────────────────────────────────────────────────
   This file was a 0-byte stub. It is filled first, before any behaviour changes,
   because there is no test runner in either workspace — so for anything that
   happens inside a live session, this IS the instrument. A timing change you
   cannot read back is a timing change you cannot judge.

   Design constraints, in order:

   1. OFF BY DEFAULT, AND FREE WHEN OFF. Called from the VAD path, which runs on
      every animation frame. An enabled check that allocates, or an argument that
      is built before the call decides to drop it, is not acceptable there — so
      the payload is passed as a value, never as an eagerly-formatted string.

   2. NODE-SAFE. scripts/segment-replay.mjs imports the segmentation modules from
      bare node, where `localStorage` is not merely empty but UNDEFINED, and
      touching it is a ReferenceError rather than a falsy read. Every host-object
      access here is guarded for that reason, not for tidiness.

   3. A RING, NOT A STREAM. The interesting part of a session is the ten seconds
      before something went wrong, and by then the console has scrolled. Keeping
      the last N entries per tag means the evidence is still there to dump after
      the fact. */

/** Entries kept per tag. Two hundred covers several minutes of segmentation. */
const RING_SIZE = 200

/** tag -> { entries: [], head: number } */
const rings = new Map()

/** null = not yet resolved. Otherwise a Set of enabled tags, or ALL. */
let enabled = null
const ALL = Symbol('all-tags')

/**
 * Reads the enable list once, from whichever of the two sources exists.
 *
 * Vite replaces `import.meta.env.DEV` at build time; under bare node
 * `import.meta.env` is simply undefined, which the optional chain handles.
 */
function resolveEnabled() {
  const set = new Set()

  try {
    if (import.meta?.env?.DEV) return ALL
  } catch { /* import.meta.env is not reachable in every host */ }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ia.debug')
      if (raw === '1' || raw === 'true' || raw === '*') return ALL
      if (raw) raw.split(',').forEach((t) => set.add(t.trim()))
    }
  } catch { /* private mode, or storage disabled */ }

  return set
}

function isOn(tag) {
  if (enabled === null) enabled = resolveEnabled()
  return enabled === ALL || enabled.has(tag)
}

function ringFor(tag) {
  let ring = rings.get(tag)
  if (!ring) { ring = { entries: [], head: 0 }; rings.set(tag, ring) }
  return ring
}

/**
 * A tagged logger.
 *
 * @param   {string} tag  short and greppable — 'seg', 'gen', 'vad'
 * @returns {(event: string, data?: object) => void}
 *
 * Usage is deliberately (event, data) rather than a formatted string: the data
 * stays structured in the ring, so a dump can be read as a table instead of as
 * prose that has to be parsed back.
 */
export function createLogger(tag) {
  return (event, data) => {
    if (!isOn(tag)) return

    const ring = ringFor(tag)
    // performance.now() rather than Date.now(): every timestamp this file is
    // used to reason about is a duration between two frames, and the monotonic
    // clock is the one the VAD and the aggregator already measure in.
    const at = typeof performance !== 'undefined' ? performance.now() : 0
    ring.entries[ring.head] = { at: Math.round(at), event, ...data }
    ring.head = (ring.head + 1) % RING_SIZE

    // eslint-disable-next-line no-console
    console.debug(`[${tag}] ${event}`, data ?? '')
  }
}

/**
 * Turns tags on for this page without a reload.
 *
 * @param {string} csv  comma-separated tags, or '*' for everything
 */
export function enableLogTags(csv) {
  if (!csv || csv === '*') { enabled = ALL; return }
  enabled = new Set(csv.split(',').map((t) => t.trim()).filter(Boolean))
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('ia.debug', csv)
  } catch { /* storage disabled; the in-memory setting still applies */ }
}

/**
 * The last RING_SIZE entries for a tag, oldest first.
 *
 * Read this after a session rather than watching DevTools live — the whole point
 * of the ring is that the interesting window has usually already scrolled past.
 */
export function dumpLog(tag) {
  const ring = rings.get(tag)
  if (!ring) return []
  const { entries, head } = ring
  return entries.length < RING_SIZE
    ? entries.slice()
    : [...entries.slice(head), ...entries.slice(0, head)]
}

// Reachable from the DevTools console during a real session, which is the only
// place most of this is ever read: window.__iaLog.dump('seg')
try {
  if (typeof window !== 'undefined') {
    window.__iaLog = { dump: dumpLog, enable: enableLogTags, tags: () => [...rings.keys()] }
  }
} catch { /* not a browser */ }
