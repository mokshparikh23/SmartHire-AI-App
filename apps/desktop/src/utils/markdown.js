/* PREMIUM-UX 2026-08-31 ─────────────────────────────────────────────────────────
   The parser behind components/overlay/Markdown.jsx, split out from it.

   Split for one reason: scripts/segment-replay.mjs is plain node and cannot
   parse JSX, so anything left inside the component is untestable without adding
   a build step to the only test in the repo. The rendering — which node maps to
   which element — stays there; every decision that can be wrong lives here.

   DELIBERATELY IMPORTLESS, the same discipline utils/utterance.js states for
   itself. Nothing here touches React or the DOM.

   THE HARD PART IS STREAMING, not markdown. Text arrives one token at a time, so
   at any instant the document is a valid PREFIX of itself and almost never valid
   markdown. Two rules follow, and they are what the fixtures assert:

     - an unterminated fence renders as a code block NOW, not as three literal
       backticks that reflow into a block a second later;
     - a trailing unmatched `**` or `` ` `` is HIDDEN, not printed, so the reader
       never watches "**Time complexity" turn into bold text when the closing
       marker lands.

   Both are about the same thing: the answer must never visibly rewrite itself.  */

/* Inline rules, in priority order. `code` first so that `**` inside backticks is
   not read as emphasis. `open` is the same marker unterminated at the very end
   of the text — the half-streamed case. */
const INLINE_RULES = [
  { type: 'code',   re: /`([^`]+)`/,                  open: /`([^`]*)$/ },
  { type: 'strong', re: /\*\*([^*]+)\*\*/,            open: /\*\*([^*]*)$/ },
  { type: 'em',     re: /(?<!\*)\*([^*]+)\*(?!\*)/,   open: /(?<!\*)\*([^*]*)$/ },
]

/**
 * One line → a flat list of { type: 'text'|'code'|'strong'|'em', text }.
 *
 * Iterative rather than recursive: the recursion this replaced was bounded only
 * by the number of markers on a line, which is fine for a short answer and
 * needlessly fragile for a pasted one.
 */
export function splitInline(text) {
  const out = []
  let rest = typeof text === 'string' ? text : ''

  for (;;) {
    if (!rest) break

    let best = null
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest)
      if (m && (!best || m.index < best.m.index)) best = { m, rule }
    }

    if (!best) break

    const { m, rule } = best
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) })
    out.push({ type: rule.type, text: m[1] })
    rest = rest.slice(m.index + m[0].length)
  }

  if (rest) {
    /* PREMIUM-UX 2026-08-31 ─ drop a HALF-ARRIVED closing marker first ─────────
       Found by the "growing text never loses what it already showed" fixture,
       which is the whole reason that fixture exists.

       "Use **memoisation**" streams through the intermediate state
       "Use **memoisation*" — the first of the two closing asterisks has landed,
       the second has not. At that instant nothing matches a CLOSED rule, and the
       only OPEN match is the lone trailing `*`, whose content is empty. So the
       leading `**` was emitted as literal text for exactly one frame and then
       vanished when the second asterisk arrived.

       One frame is enough to see, and it is precisely the visible rewrite this
       parser exists to prevent. A trailing run of marker characters that closes
       nothing is a marker still arriving: drop it, then scan what is left. */
    const trimmed = rest.replace(/[*`]+$/, '')

    if (!trimmed) {
      // The remainder was nothing but a half-arrived marker.
    } else {
      /* Nothing closed left. If the remainder ends in an OPEN marker, emit what
         it has accumulated in the marker's own style and drop the marker. */
      let opened = null
      for (const rule of INLINE_RULES) {
        const m = rule.open.exec(trimmed)
        if (m && (!opened || m.index < opened.m.index)) opened = { m, rule }
      }

      if (opened) {
        const { m, rule } = opened
        if (m.index > 0) out.push({ type: 'text', text: trimmed.slice(0, m.index) })
        if (m[1]) out.push({ type: rule.type, text: m[1] })
      } else {
        out.push({ type: 'text', text: trimmed })
      }
    }
  }

  return out
}

/**
 * Text → a flat list of { type, text, n? }.
 *
 * FLAT, not a tree. A list item is its own block rather than a child of a list
 * node, because a tree would make every item's React identity depend on its
 * parent — which defeats the per-block memo that keeps a streamed token to one
 * leaf render. Consecutive `li` blocks read as a list visually, which is all the
 * grouping this needs.
 */
export function parseBlocks(text) {
  const lines = (typeof text === 'string' ? text : '').split('\n')
  const blocks = []
  let fence = null

  for (const line of lines) {
    if (fence !== null) {
      if (/^\s*```/.test(line)) { blocks.push({ type: 'pre', text: fence }); fence = null }
      else fence += (fence ? '\n' : '') + line
      continue
    }

    if (/^\s*```/.test(line)) { fence = ''; continue }
    if (!line.trim()) { blocks.push({ type: 'gap', text: '' }); continue }
    if (/^\s*(?:---|___|\*\*\*)\s*$/.test(line)) { blocks.push({ type: 'hr', text: '' }); continue }

    let m
    if ((m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'h', text: m[2] })
    } else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      blocks.push({ type: 'quote', text: m[1] })
    } else if ((m = /^\s*(?:[-*•])\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'li', text: m[1] })
    } else if ((m = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'oli', text: m[2], n: m[1] })
    } else {
      blocks.push({ type: 'p', text: line })
    }
  }

  // Render an unterminated fence as a code block immediately. See the header.
  if (fence !== null) blocks.push({ type: 'pre', text: fence })

  // Trailing blank lines are an artefact of streaming, not part of the answer.
  while (blocks.length && blocks[blocks.length - 1].type === 'gap') blocks.pop()
  return blocks
}
