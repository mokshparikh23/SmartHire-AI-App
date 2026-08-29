// Brand marks for the meeting platforms named in the compatibility band on the
// landing page.
//
// These live here rather than in components/ui/Icon.jsx on purpose. That file's
// whole contract is a monochrome currentColor stroke path on a 24x24 box, with a
// hardcoded four-name list deciding fill-vs-stroke. Vendor marks are solid,
// multi-path shapes and would fight it.
//
// Right now each mark is a monogram, not the vendor's real logo. Two reasons, and
// which one wins is a design call worth making deliberately:
//
//   1. Real marks have to come from the vendors' own brand pages (linked per entry
//      below). Approximating a trademarked logo from memory produces something
//      subtly wrong, and at 30px subtly wrong reads as cheap.
//   2. The monochrome treatment may actually be the better final answer. globals.css
//      opens with an explicit directive -- "one ink, one warm paper, one hairline,
//      one accent... the accent appears only on links and small marks". Six
//      full-colour logos would instantly be the loudest thing on the page.
//
// To swap in a real mark: drop the vendor's <path> elements into that platform's
// MARKS entry, normalised to a 0 0 48 48 viewBox. Nothing on the page changes.

const MARKS = {
  // https://brand.zoom.us
  zoom: null,
  // https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks
  teams: null,
  // https://about.google/brand-resource-center/
  meet: null,
  // https://www.webex.com/brand.html
  webex: null,
  // https://www.larksuite.com/en_us/brand
  lark: null,
  // https://aws.amazon.com/architecture/icons/
  chime: null,
}

const MONOGRAMS = {
  zoom: 'Z',
  teams: 'T',
  meet: 'M',
  webex: 'W',
  lark: 'L',
  chime: 'C',
}

export function PlatformMark({ name, size = 30 }) {
  const mark = MARKS[name]
  const monogram = MONOGRAMS[name]

  // Silent miss on an unknown name, matching Icon.jsx's behaviour.
  if (!mark && !monogram) return null

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      {mark ?? (
        <text
          x="24"
          y="24"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="26"
          fontWeight="600"
          fill="currentColor"
        >
          {monogram}
        </text>
      )}
    </svg>
  )
}

export default PlatformMark
