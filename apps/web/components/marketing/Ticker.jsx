/**
 * Two rows of sample follow-ups scrolling in opposite directions.
 *
 * REDESIGN 2026-08-30: ported from the reference design's ticker. The content is
 * the interviewer's side of it — the follow-ups the copilot suggests and the
 * hedges it picks up on — rather than the reference's list of questions a
 * candidate might be asked.
 *
 * A server component: there is no state and no effect here. The loop is pure CSS
 * (see `.ticker-row` in globals.css), which also means the global
 * prefers-reduced-motion rule stops it without this file knowing anything about
 * that.
 *
 * Each row's items are rendered TWICE. The keyframe translates by exactly -50%,
 * so the second copy is what occupies the viewport at the moment the first wraps
 * — that is what makes the loop seamless rather than jumping.
 */

const LINES = [
  '“Improved a lot” — ask for the number, before and after.',
  'They said “we”. Ask which part was theirs.',
  '“It went smoothly” across a billing migration. Ask what broke.',
  'Four months on that team [resume] — ask what they owned.',
  'The JD asks for on-call. They have not mentioned it once.',
  'They described the fix. Ask how they found the cause.',
  '“Best practice” — ask which one, and where it failed them.',
  'Ask who disagreed with the decision, and what they said.',
  'No numbers yet in eight minutes. Ask for one.',
  '“We deprecated it” — ask what replaced it and who migrated.',
  'They skipped the outcome. Ask what happened after launch.',
  'Ask what they would do differently with the same brief.',
]

function Row({ items, reverse = false }) {
  const rendered = [...items, ...items]

  return (
    <div className={`ticker-row ${reverse ? 'rev mt-6' : ''}`} aria-hidden={reverse}>
      {rendered.map((line, i) => (
        <span
          key={i}
          className="whitespace-nowrap px-12 text-[17px] font-medium text-line transition-colors duration-300 hover:text-muted"
        >
          {line}
        </span>
      ))}
    </div>
  )
}

export default function Ticker() {
  return (
    <div className="border-y border-line-soft py-16 sm:py-20">
      <p className="mono text-center text-[13px] uppercase tracking-[0.2em] text-faint">
        The kind of thing it catches
      </p>

      {/*
        The mask fades both edges into the page background. A gradient overlay
        would need to know the section's background colour; `mask-image` does
        not, so this keeps working if the band is ever moved onto canvas.
      */}
      <div
        className="ticker relative mt-8 overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(90deg, transparent, #000 9rem, #000 calc(100% - 9rem), transparent)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent, #000 9rem, #000 calc(100% - 9rem), transparent)',
        }}
      >
        <Row items={LINES.slice(0, 7)} />
        <Row items={LINES.slice(5)} reverse />
      </div>
    </div>
  )
}
