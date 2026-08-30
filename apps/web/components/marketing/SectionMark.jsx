/**
 * Numbered section opener: [01] · HOW IT WORKS, then the headline.
 *
 * EXTRACTED 2026-08-30: this was a local function inside app/page.jsx. The
 * comparison page opens its sections the same way, and a second copy of a
 * component whose whole job is "every section opens identically" is the exact
 * drift this file exists to prevent — the same reason CONTROL and TH were lifted
 * into components/ui/index.jsx. The original declaration is kept commented in
 * app/page.jsx, per the convention in this repo.
 *
 * `dark` is for the ink panels, where the marker's border and the lede have to
 * invert. `center` is used by the sections that are wider than their heading.
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
