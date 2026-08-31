/**
 * Numbered section opener: [01] · HOW IT WORKS, then the headline.
 *
 * EXTRACTED 2026-08-30: this was a local function inside app/page.jsx. The
 * comparison page opens its sections the same way, and a second copy of a
 * component whose whole job is "every section opens identically" is the exact
 * drift this file exists to prevent — the same reason CONTROL and TH were lifted
 * into packages/ui/src/index.jsx. The original declaration is kept commented in
 * app/page.jsx, per the convention in this repo.
 *
 * `dark` is for the ink panels, where the marker's border and the lede have to
 * invert. `center` is used by the sections that are wider than their heading.
 *
 * SPLIT 2026-09-01 ─ WHAT `no` MEANS NOW.
 *
 * It is the section's position WITHIN ITS OWN PAGE, and every page restarts at
 * 01. That is not a new convention: /compare has numbered its own sections
 * 01–04 since the day it shipped, and the landing page's continuous 01–07 was
 * the anomaly — it was the spine of one long scroll, and a reader arriving
 * directly on /features and being told "03 · Features" is being informed about
 * two sections they never saw and cannot navigate to.
 *
 * Not auto-numbered from a counter, deliberately. This is a Server Component
 * rendered inside Reveal's children, so a counter would need a client provider;
 * it would renumber silently when a section is added or conditionally rendered;
 * and — the real objection — the numbers would stop being visible in the diff.
 * Write them at the call site.
 *
 * Omit `no` entirely for sections that are not part of the argument: the FAQ,
 * and appendix-style sections like /compare's "where these numbers came from".
 * A page hero never uses this component at all — it renders an <h2>, and a
 * page's <h1> belongs outside it.
 */
export default function SectionMark({ no, label, title, lede, center = false, dark = false }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <div className={`marker ${center ? 'justify-center' : ''}`}>
        {no && (
          <span className={`marker-no ${dark ? 'border-paper/25 text-paper/75' : ''}`}>{no}</span>
        )}
        <span className={`marker-label ${dark ? 'text-paper/45' : ''}`}>{label}</span>
      </div>
      <h2 className={`hl mt-6 text-[clamp(1.9rem,3.4vw,2.75rem)] ${dark ? 'text-paper' : 'text-ink'}`}>
        {title}
      </h2>
      {lede && (
        <p className={`mt-4 text-[17px] leading-relaxed ${dark ? 'text-paper/60' : 'text-muted'}`}>
          {lede}
        </p>
      )}
    </div>
  )
}
