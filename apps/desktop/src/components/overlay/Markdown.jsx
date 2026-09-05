import React, { useMemo } from 'react'
import { parseBlocks, splitInline } from '../../utils/markdown'
// SCREEN-ANSWERS 2026-09-01: for the code block's copy button below.
import Icon from '../ui/Icon'

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
    // EMPHASIS 2026-09-01: <mark> and not a styled <span>. It is the element
    // that MEANS "relevant to what the reader is doing right now", so it is what
    // VoiceOver and Narrator announce as marked text — and this panel is read
    // under pressure by people who sometimes have a screen reader running.
    if (p.type === 'mark')   return <mark key={i} className="ia-md-mark">{p.text}</mark>
    if (p.type === 'strong') return <strong key={i}>{p.text}</strong>
    if (p.type === 'em')     return <em key={i}>{p.text}</em>
    return <React.Fragment key={i}>{p.text}</React.Fragment>
  })
}

/* SCREEN-ANSWERS 2026-09-01 ─ a code block you can get the code OUT of ─────────
   Copy was answer-wide only (⌘⇧C and the ⋮ menu), and in a coding interview the
   thing the candidate actually needs is THIS block in the shared editor — not the
   approach line and the dry run around it. Selecting it by hand meant dragging
   inside a ~310px scroller while someone watched.

   Its own component because it is the only block with state. Block below is
   memoised on primitive props precisely so a streamed token re-renders one leaf;
   a `copied` flag inside Block would have re-rendered every block on every copy.

   `window.electronAPI.copyText` is the same bridge Toolbar's Copy uses — there is
   no navigator.clipboard here, and no document.execCommand fallback worth having
   in a Chromium we control. */
const CodeBlock = React.memo(function CodeBlock({ text, lang }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef(0)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  const copy = () => {
    window.electronAPI?.copyText?.(text)
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="ia-md-code">
      <div className="ia-md-code-head">
        {/* Empty when the model omitted the info string. The label is not worth
            inventing — "code" tells the reader nothing they cannot see. */}
        <span className="ia-md-code-lang">{lang || ''}</span>
        <button
          type="button"
          className="ia-md-code-copy"
          onClick={copy}
          title="Copy this code"
          aria-label="Copy this code"
        >
          <Icon name={copied ? 'check' : 'copy'} size={12} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="ia-md-pre">{text}</pre>
    </div>
  )
})

/* PRIMITIVE PROPS ONLY — see property 3 above. */
const Block = React.memo(function Block({ type, text, n, lang }) {
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
    // case 'pre':
    //   return <pre className="ia-md-pre">{text}</pre>
    case 'pre':
      return <CodeBlock text={text} lang={lang} />
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
  // SCREEN-ANSWERS 2026-09-01: `lang` threaded through. Still a primitive, so the
  // memo above holds.
  // return blocks.map((b, i) => <Block key={i} type={b.type} text={b.text} n={b.n} />)
  return blocks.map((b, i) => <Block key={i} type={b.type} text={b.text} n={b.n} lang={b.lang} />)
}
