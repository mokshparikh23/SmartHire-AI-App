import React, { useMemo } from 'react'
import { parseBlocks, splitInline } from '../../utils/markdown'

/* PREMIUM-UX 2026-08-31 ─────────────────────────────────────────────────────────
   The answer used to render as a bare React text child. `white-space: pre-wrap`
   was the entire formatting story in the product — so every `**bold**` the model
   emitted arrived as literal asterisks, every `- item` was a hyphen in the middle
   of a paragraph, and a fenced code block was three backticks followed by
   unindented proportional Inter. On a paid product that reads as broken.

   ── Why hand-rolled rather than a dependency ──────────────────────────────────

   react-markdown pulls remark and micromark — roughly 90 KB minified — and
   re-parses the whole document to an AST on every token. marked is smaller but
   hands back an HTML STRING, which means dangerouslySetInnerHTML: a script
   injection surface fed by model output, on a window that holds the user's
   licence key. Neither is worth it for the subset of markdown a short answer in
   a 720px panel can use. This costs about 2 KB.

   ── Three properties that make it correct, not merely cheap ───────────────────

   1. STREAMING-SAFE BY CONSTRUCTION — an unterminated fence renders as a code
      block immediately, and a trailing unmatched `**` is hidden rather than
      printed, so the answer never visibly rewrites itself. That logic lives in
      utils/markdown.js, where the replay harness can drive it.

   2. REACT ELEMENTS ONLY. No HTML string, no dangerouslySetInnerHTML, no
      sanitiser to get wrong.

   3. IT KEEPS — AND IMPROVES ON — THE ONE-LEAF-RENDER CONTRACT. AnswerPanel is
      the only subscriber to currentAnswer (see its header), and a token must
      cost one leaf render. parseBlocks returns FRESH objects every call, so the
      props handed to Block are PRIMITIVES; passing the block object would make
      React.memo's shallow compare fail on every block and buy nothing. With
      primitives, blocks 0..n-2 bail out of reconciliation and only the growing
      tail block re-renders. That is strictly cheaper than what it replaces,
      where one giant text node was rebuilt whole on every token.

   Parse cost is one split('\n') plus a handful of regexes per line, over an
   answer the prompt keeps short, at a rate already capped to ~60/s by the rAF
   coalescing in useInterviewSession.  */

function Inline({ text }) {
  const parts = splitInline(text)
  return parts.map((p, i) => {
    if (p.type === 'code')   return <code key={i}>{p.text}</code>
    if (p.type === 'strong') return <strong key={i}>{p.text}</strong>
    if (p.type === 'em')     return <em key={i}>{p.text}</em>
    return <React.Fragment key={i}>{p.text}</React.Fragment>
  })
}

/* PRIMITIVE PROPS ONLY — see property 3 above. */
const Block = React.memo(function Block({ type, text, n }) {
  switch (type) {
    case 'h':
      return <h3 className="ia-md-h"><Inline text={text} /></h3>
    case 'li':
      return (
        <div className="ia-md-li">
          <span className="ia-md-bullet">•</span>
          <span><Inline text={text} /></span>
        </div>
      )
    case 'oli':
      return (
        <div className="ia-md-li">
          <span className="ia-md-num">{n}.</span>
          <span><Inline text={text} /></span>
        </div>
      )
    case 'quote':
      return <div className="ia-md-quote"><Inline text={text} /></div>
    case 'pre':
      return <pre className="ia-md-pre">{text}</pre>
    case 'hr':
      return <div className="ia-md-hr" />
    case 'gap':
      return <div className="ia-md-gap" />
    default:
      return <p className="ia-md-p"><Inline text={text} /></p>
  }
})

export default function Markdown({ text }) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  return blocks.map((b, i) => <Block key={i} type={b.type} text={b.text} n={b.n} />)
}
