// Brand marks for the platforms named in the compatibility band on the landing
// page.
//
// These live here rather than in components/ui/Icon.jsx on purpose. That file's
// whole contract is a monochrome currentColor stroke path on a 24x24 box, with a
// hardcoded four-name list deciding fill-vs-stroke. Vendor marks are solid,
// multi-path shapes and would fight it.
//
// LOGOS 2026-08-30: real marks landed for every platform in the band, from
// assets the user supplied. The note that stood here argued for monograms on two
// grounds; the first is now moot and the second was overruled:
//
//   1. "Real marks have to come from the vendors' own brand pages. Approximating
//      a trademarked logo from memory produces something subtly wrong, and at
//      30px subtly wrong reads as cheap." Still the rule, but there is nothing
//      left to approximate — every mark below is vendor vector data, pasted
//      verbatim. The one exception is zoom's camera glyph; see its entry.
//   2. "The monochrome treatment may actually be the better final answer.
//      globals.css opens with an explicit directive -- 'one ink, one warm paper,
//      one hairline, one accent... the accent appears only on links and small
//      marks'. Six full-colour logos would instantly be the loudest thing on the
//      page." OVERRULED — full colour was the call.
//
// MONOGRAMS is kept even though nothing falls back to it today. It is the reason
// an unknown or newly-added platform degrades to a letter instead of a hole.
//
// HOW THE NORMALISING TRANSFORMS BELOW WERE DERIVED. Each vendor ships its mark
// on its own viewBox, and the artwork rarely fills it. So rather than rescale the
// path data by hand -- which loses fidelity and is unreviewable -- each mark is
// pasted VERBATIM and wrapped in one <g transform> that maps its content bounding
// box (not its viewBox) into a 44x44 area centred in the 48x48 box. The 2px
// margin is what keeps a wide mark and a tall mark reading as the same size.
//
// WHY THE GRADIENTS LIVE IN PlatformMarkDefs AND NOT IN EACH MARK. Teams and
// Webex are gradient logos, and the platforms strip renders PLATFORMS TWICE so
// its marquee can loop seamlessly. Inline <defs> would therefore put two of every
// gradient id in the document — invalid, and a trap the moment two vendors ship
// the same generic id (Teams' really are called "a" through "l"). So every id is
// namespaced `pm-<platform>-*` and every gradient is emitted once, by a component
// the page mounts a single time. A mark rendered without <PlatformMarkDefs /> in
// the document paints its gradient fills as nothing — see the export below.

const MARKS = {
  // https://brand.zoom.us
  //
  // THE ONE DRAWN MARK ON THIS LIST, and the only place rule 1 is bent. Zoom's
  // vector asset arrived as the "zoom" WORDMARK (114x26, a 4.4:1 letterform
  // lockup). Every other slot in the band is a square glyph, and a wordmark
  // scaled to fit 48px wide is 11px tall — it would read as a smudge beside
  // seven full-height marks, and the card already prints the word "Zoom" in
  // 17px next to it. So the square slot gets Zoom's other official mark, the
  // camera glyph on their #0B5CFF ground, built from primitives.
  //
  // The real wordmark is kept below rather than discarded: if the band ever
  // moves to a wide lockup rail, this is the asset to switch to, and it beats
  // the drawn glyph on authenticity.
  //
  // <g transform="translate(-1.79 12.7) scale(0.3860)">   {/* 114x26 -> 44 wide */}
  //   <path fill="#0B5CFF" d="M23.698 25.292H3.595c-1.33 0-2.59-.697-3.203-1.889a3.48 3.48 0 0 1 .63-4.068L15.01 5.361H4.992A4.985 4.985 0 0 1 0 .374h18.519c1.328 0 2.59.698 3.202 1.89a3.48 3.48 0 0 1-.63 4.068L7.104 20.305h11.602c2.76 0 4.992 2.23 4.992 4.987M103.258 0a9.66 9.66 0 0 0-7.241 3.234A9.7 9.7 0 0 0 88.777 0c-5.35 0-9.71 4.561-9.71 9.889v15.403c2.759 0 4.99-2.23 4.99-4.987V9.838c0-2.57 1.994-4.749 4.55-4.851a4.746 4.746 0 0 1 4.923 4.732v10.586a4.985 4.985 0 0 0 4.991 4.987V9.838c0-2.57 1.994-4.749 4.549-4.851a4.746 4.746 0 0 1 4.924 4.732v10.586a4.985 4.985 0 0 0 4.991 4.987V9.89c-.017-5.33-4.378-9.89-9.727-9.89m-54.38 12.833c0 7.081-5.759 12.834-12.846 12.834s-12.845-5.753-12.845-12.834S28.962 0 36.032 0s12.846 5.753 12.846 12.833m-4.992 0c0-4.323-3.527-7.846-7.854-7.846s-7.854 3.523-7.854 7.846 3.527 7.847 7.854 7.847 7.854-3.523 7.854-7.847m32.676 0c0 7.081-5.758 12.834-12.845 12.834S50.87 19.914 50.87 12.833 56.646 0 63.716 0s12.846 5.753 12.846 12.833m-4.992 0c0-4.323-3.526-7.846-7.853-7.846-4.328 0-7.855 3.523-7.855 7.846s3.527 7.847 7.854 7.847c4.328 0 7.854-3.523 7.854-7.847" />
  // </g>
  zoom: (
    <>
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#0B5CFF" />
      <rect x="10.4" y="17" width="17.2" height="14" rx="3.2" fill="#FFFFFF" />
      <path
        d="M27.6 21.9 L35.3 16.9 C36.5 16.1 38.1 17 38.1 18.4 L38.1 29.6 C38.1 31 36.5 31.9 35.3 31.1 L27.6 26.1 Z"
        fill="#FFFFFF"
      />
    </>
  ),

  // https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks
  //
  // Source viewBox "4 4 36 38"; artwork fills it exactly, x[4,40] y[4,42].
  // 44/38 = 1.157895 — the HEIGHT is the constraining side here.
  //
  // All twelve paths are kept, including the seven fill-opacity sheen layers
  // that repeat an underlying shape with a softer gradient over it. They are
  // nearly invisible at this size, but they are three lines each and dropping
  // them would mean deciding which of a vendor's layers are load-bearing —
  // exactly the judgement that produces a subtly-wrong logo.
  teams: (
    <g transform="translate(-1.474 -2.632) scale(1.157895)">
      <path fill="url(#pm-teams-a)" d="M21.9999 20h12c3.3137 0 6 2.6863 6 6v10c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6V26c0-3.3137-2.6863-6-6-6" />
      <path fill="url(#pm-teams-b)" d="M7.99988 24c0-3.3137 2.68632-6 6.00002-6h8c3.3137 0 6 2.6863 6 6v12c0 3.3137 2.6863 6 6 6l-16.0001-.0001c-5.5228 0-9.99992-4.4771-9.99992-10z" />
      <path fill="url(#pm-teams-c)" fillOpacity=".7" d="M7.99988 24c0-3.3137 2.68632-6 6.00002-6h8c3.3137 0 6 2.6863 6 6v12c0 3.3137 2.6863 6 6 6l-16.0001-.0001c-5.5228 0-9.99992-4.4771-9.99992-10z" />
      <path fill="url(#pm-teams-d)" fillOpacity=".7" d="M7.99988 24c0-3.3137 2.68632-6 6.00002-6h8c3.3137 0 6 2.6863 6 6v12c0 3.3137 2.6863 6 6 6l-16.0001-.0001c-5.5228 0-9.99992-4.4771-9.99992-10z" />
      <path fill="url(#pm-teams-e)" d="M32.9999 18c2.7614 0 5-2.2386 5-5s-2.2386-5-5-5-5 2.2386-5 5 2.2386 5 5 5" />
      <path fill="url(#pm-teams-f)" fillOpacity=".46" d="M32.9999 18c2.7614 0 5-2.2386 5-5s-2.2386-5-5-5-5 2.2386-5 5 2.2386 5 5 5" />
      <path fill="url(#pm-teams-g)" fillOpacity=".4" d="M32.9999 18c2.7614 0 5-2.2386 5-5s-2.2386-5-5-5-5 2.2386-5 5 2.2386 5 5 5" />
      <path fill="url(#pm-teams-h)" d="M17.9999 16c3.3137 0 6-2.6863 6-6 0-3.31371-2.6863-6-6-6s-6 2.68629-6 6c0 3.3137 2.6863 6 6 6" />
      <path fill="url(#pm-teams-i)" fillOpacity=".6" d="M17.9999 16c3.3137 0 6-2.6863 6-6 0-3.31371-2.6863-6-6-6s-6 2.68629-6 6c0 3.3137 2.6863 6 6 6" />
      <path fill="url(#pm-teams-j)" fillOpacity=".5" d="M17.9999 16c3.3137 0 6-2.6863 6-6 0-3.31371-2.6863-6-6-6s-6 2.68629-6 6c0 3.3137 2.6863 6 6 6" />
      <rect width="16" height="16" x="4" y="23" fill="url(#pm-teams-k)" rx="3.25" />
      <rect width="16" height="16" x="4" y="23" fill="url(#pm-teams-l)" fillOpacity=".7" rx="3.25" />
      <path fill="#fff" d="M15.4792 28.1054h-2.4471v7.466h-2.0648v-7.466H8.52014v-1.6768h6.95906z" />
    </g>
  ),

  // https://about.google/brand-resource-center/
  //
  // Source viewBox 0 0 32 32; artwork occupies x[3,29] y[5,27]. 44/26 = 1.692308.
  meet: (
    <g transform="translate(-3.077 -3.077) scale(1.692308)">
      <path fill="#00AC47" d="M24,21.45V25a2.0059,2.0059,0,0,1-2,2H9V21h9V16Z" />
      <polygon fill="#31A950" points="24 11 24 21.45 18 16 18 11 24 11" />
      <polygon fill="#EA4435" points="9 5 9 11 3 11 9 5" />
      <rect width="6" height="11" x="3" y="11" fill="#4285F4" />
      <path fill="#FFBA00" d="M24,7v4h-.5L18,16V11H9V5H22A2.0059,2.0059,0,0,1,24,7Z" />
      <path fill="#0066DA" d="M9,21v6H5a2.0059,2.0059,0,0,1-2-2V21Z" />
      <path fill="#00AC47" d="M29,8.26V23.74a.9989.9989,0,0,1-1.67.74L24,21.45,18,16l5.5-5,.5-.45,3.33-3.03A.9989.9989,0,0,1,29,8.26Z" />
      <polygon fill="#188038" points="24 10.55 24 21.45 18 16 23.5 11 24 10.55" />
    </g>
  ),

  // https://www.webex.com/brand.html
  //
  // Source viewBox "58.17 111.5 396.5 289", which its own clipPath matches
  // exactly. 44/396.5 = 0.110971 — width constrains.
  //
  // THE ONLY MARK HERE THAT IS NOT COMPLETE, and the reason is worth stating.
  // The supplied file draws its TWO shapes thirty times over: the green swoosh
  // once with a linear gradient and then eight more times, each a copy of the
  // identical path tinted by another radial overlay, and the blue swoosh the
  // same way another twenty. Those overlays are sub-pixel shading at 48px, and
  // carrying them would mean thirty gradient definitions for shading nobody can
  // see. Kept: the two base shapes, verbatim, with the green's real gradient.
  // The geometry is exact; only the sheen is gone.
  //
  // The clipPath is dropped with it — its rect is the artwork's own bounding
  // box, so it clips nothing that is drawn.
  webex: (
    <g transform="translate(-4.455 -4.408) scale(0.110971)">
      <path fill="url(#pm-webex-swoosh)" d="M181.196 399.355C107.777 399.355 82.7889 306.377 77.1898 288.289C63.1288 242.869 58.8543 201.956 58.4018 197.662C55.7908 172.887 75.6339 155.647 97.412 155.647C113.902 155.647 133.04 165.531 135.575 189.513C136.015 193.547 139.367 228.336 151.227 266.243C163.603 305.805 176.733 321.019 186.188 321.019C201.457 321.019 210.773 281.747 219.009 244.353C225.077 216.804 231.636 189.043 244.585 164.383C267.114 121.483 301.157 111.5 330.567 111.5C395.055 111.5 427.331 186.319 427.331 205.704C427.331 238.099 400.946 246.362 389.51 246.362C364.497 246.362 356.018 229.579 348.881 214.869C342.462 201.635 335.757 190.631 327.089 190.631C324.241 190.631 321.601 192.076 319.16 194.561C297.615 216.489 290.391 331.205 247.313 375.049C223.431 399.355 197.446 399.355 181.196 399.355Z" />
      <path fill="#316AFF" d="M415.439 155.647C412.532 155.647 409.608 155.921 406.74 156.487C420.372 176.171 427.193 196.792 427.193 205.702C427.193 238.097 400.807 246.36 389.371 246.36C380.447 246.36 373.629 244.222 368.224 240.806C368.174 241.008 368.124 241.21 368.074 241.412C366.466 247.842 365.198 254.878 363.002 261.726C358.78 274.892 353.085 289.932 347.003 301.57C340.448 314.116 333.958 321.457 326.222 321.072C317.425 320.634 310.292 309.279 301.427 277.186C298.568 266.838 295.921 255.493 293.467 244.353C287.382 216.722 279.912 188.937 267.14 164.383C246.28 124.282 210.694 111.5 182.284 111.5C155.937 111.5 136.253 123.991 120.79 139.729C116.516 144.079 111.849 149.938 107.16 156.825C120.647 160.078 133.4 170.244 135.437 189.511C135.838 193.185 138.653 222.361 148.109 256.172C150.822 247.695 154.778 235.141 163.969 214.869C168.473 205.585 172.538 199.463 176.205 195.73C179.569 192.307 182.598 190.893 185.325 190.893C188.266 190.893 198.309 193.589 208.086 227.945C220.211 270.547 229.235 338.348 263.614 374.347C278.777 390.227 299.997 400.5 329.406 400.5C355.211 400.5 376.725 389.119 392.065 373.288C417.286 347.256 431.106 304.216 436.035 288.289C450.063 242.978 453.992 201.998 454.449 197.662C457.06 172.887 436.217 155.647 415.439 155.647Z" />
    </g>
  ),

  // https://www.larksuite.com/en_us/brand
  //
  // Source viewBox "62.16 94.5 407.87 324.19"; artwork fills it. 44/407.87 =
  // 0.107877 — width constrains. Four flat fills, no gradients, nothing dropped.
  //
  // The third path is two hairline slivers the vendor ships as a separate fill;
  // it collapses to nothing at this size but costs one line to keep honest.
  lark: (
    <g transform="translate(-4.706 -3.679) scale(0.107877)">
      <path fill="#00D6B9" d="M274.18 264.785q.515-.517 1.03-1.027c.685-.688 1.372-1.258 2.056-1.945l1.37-1.372 4.118-4.113 5.598-5.601 4.8-4.797 4.575-4.457 4.796-4.688 4.344-4.344 6.059-6.054c1.14-1.145 2.285-2.29 3.543-3.317 2.168-2.054 4.457-4 6.855-5.828 2.172-1.715 4.344-3.312 6.516-4.914 3.082-2.172 6.398-4.344 9.71-6.285 3.204-1.941 6.63-3.656 10.06-5.371 3.199-1.602 6.515-2.973 9.827-4.23 1.829-.684 3.774-1.372 5.602-2.055.914-.344 1.941-.688 2.856-.914-8.57-33.715-24.227-64.575-45.258-90.86-4.114-5.14-10.399-8.113-17.028-8.113H130.754c-3.203 0-4.457 4-1.945 5.941 59.543 43.66 109.144 99.887 145.03 164.801 0-.226.227-.34.34-.457" />
      <path fill="#3370FF" d="M204.79 418.691c90.288 0 169.03-49.828 210.058-123.543 1.488-2.628 2.859-5.257 4.23-7.882q-3.087 6-6.86 11.312l-2.741 3.77c-1.141 1.488-2.399 2.972-3.657 4.457-1.03 1.144-2.058 2.285-3.086 3.316-2.058 2.172-4.343 4.227-6.629 6.172a53 53 0 0 1-3.886 3.2c-1.598 1.144-3.086 2.284-4.684 3.429-1.031.683-2.058 1.371-3.086 1.941-1.144.684-2.172 1.258-3.316 1.942a131 131 0 0 1-6.969 3.543c-2.059.918-4.117 1.828-6.289 2.515-2.285.801-4.57 1.602-6.969 2.285-3.543.914-7.086 1.715-10.742 2.286-2.629.457-5.258.687-8 .914-2.86.23-5.601.23-8.457.23-3.086 0-6.289-.23-9.488-.57a83 83 0 0 1-7.086-1.031c-2.055-.34-4.113-.801-6.168-1.258-1.031-.227-2.176-.57-3.203-.797-2.973-.8-6.055-1.602-9.028-2.516-1.488-.457-2.972-.914-4.457-1.258-2.172-.683-4.457-1.37-6.629-2.058-1.828-.57-3.656-1.14-5.37-1.711q-2.573-.86-5.145-1.715c-1.14-.344-2.285-.8-3.543-1.144-1.371-.457-2.856-1.028-4.227-1.485-1.027-.344-2.058-.687-2.972-1.027-1.942-.688-4-1.488-5.942-2.172-1.144-.457-2.285-.914-3.43-1.258-1.484-.57-3.085-1.144-4.57-1.828-1.601-.687-3.203-1.258-4.8-1.945-1.028-.457-2.06-.797-3.087-1.258-1.257-.57-2.628-1.027-3.886-1.598-1.028-.457-1.942-.8-2.969-1.258l-3.086-1.37c-.914-.344-1.832-.801-2.746-1.145a44 44 0 0 1-2.512-1.14c-.8-.345-1.715-.802-2.515-1.145-.914-.344-1.715-.801-2.512-1.141-1.031-.457-2.172-1.031-3.203-1.484-1.14-.575-2.285-1.032-3.426-1.602-1.258-.574-2.402-1.144-3.66-1.715-1.027-.457-2.055-1.027-3.082-1.484-54.172-26.973-102.172-63.086-143.09-106.746-2.055-2.172-5.71-.684-5.71 2.289l.112 154.398v12.57c0 7.317 3.543 14.06 9.598 18.172 38.172 24.801 83.773 39.543 132.914 39.543" />
      <path fill="#133C9A" d="M414.84 295.188c0 .113-.113.113-.113.226zl.8-1.489c-.343.457-.574 1.028-.8 1.488m3.793-7.05.226-.457.114-.23q-.17.513-.34.687" />
      <path fill="#133C9A" d="M470.035 201.121c-18.285-9.031-38.86-14.059-60.687-14.059-12.914 0-25.485 1.829-37.371 5.141-1.372.344-2.743.8-4.114 1.258-.914.344-1.941.574-2.855.914-1.945.688-3.774 1.375-5.602 2.059-3.316 1.257-6.629 2.742-9.828 4.23-3.43 1.598-6.742 3.426-10.058 5.371a128 128 0 0 0-9.715 6.285c-2.285 1.602-4.457 3.2-6.512 4.914a154 154 0 0 0-6.86 5.828c-1.14 1.141-2.398 2.172-3.542 3.313l-6.055 6.059-4.344 4.343-4.8 4.684-4.57 4.46-4.802 4.798-11.086 11.086c-.687.687-1.37 1.37-2.058 1.945l-1.028 1.027c-.457.457-1.027 1.028-1.601 1.485-.57.57-1.14 1.031-1.711 1.601a244.4 244.4 0 0 1-49.828 35.313c1.027.457 2.168 1.027 3.199 1.488.8.34 1.715.797 2.512 1.14.8.344 1.715.801 2.515 1.145.801.344 1.602.684 2.516 1.14.914.345 1.828.802 2.742 1.145l3.086 1.371c1.027.457 1.942.801 2.969 1.258 1.258.57 2.629 1.028 3.887 1.598 1.03.46 2.058.8 3.086 1.258 1.601.687 3.199 1.258 4.8 1.945 1.485.57 3.086 1.14 4.57 1.828 1.145.457 2.286.914 3.43 1.258 1.946.684 4 1.484 5.946 2.172a81 81 0 0 1 2.968 1.027c1.371.457 2.856 1.028 4.23 1.485 1.141.343 2.286.8 3.544 1.14q2.567.86 5.14 1.719c1.829.57 3.657 1.14 5.372 1.71 2.171.688 4.457 1.376 6.628 2.06 1.489.457 2.973.914 4.457 1.257 2.973.914 5.942 1.715 9.032 2.512 1.027.344 2.168.574 3.199.8 2.055.458 4.113.915 6.172 1.259 2.398.457 4.683.8 7.082 1.03 3.203.34 6.402.571 9.488.571 2.856 0 5.715 0 8.457-.23 2.63-.227 5.371-.457 8-.914 3.656-.57 7.2-1.371 10.742-2.286 2.399-.683 4.688-1.37 6.973-2.285 2.172-.8 4.227-1.601 6.285-2.515 2.399-1.028 4.684-2.285 6.973-3.543 1.14-.57 2.168-1.258 3.312-1.942 1.028-.687 2.059-1.257 3.086-1.945 1.602-1.027 3.2-2.168 4.684-3.426a52 52 0 0 0 3.887-3.203c2.289-1.941 4.457-4 6.628-6.168 1.032-1.031 2.06-2.172 3.086-3.316 1.258-1.485 2.516-2.969 3.657-4.457.918-1.258 1.828-2.512 2.742-3.77 2.515-3.543 4.8-7.316 6.86-11.199l2.284-4.688 21.145-42.171v.113c6.742-14.742 16.226-28.113 27.656-39.426" />
    </g>
  ),

  // https://aws.amazon.com/architecture/icons/
  //
  // Source viewBox 0 0 256 256; artwork fills it, x[0,255.29] y[0,255.19].
  // 44/255.29 = 0.172353. Twenty-four flat polygons, nothing dropped — the three
  // tones (#C9EBEC highlight, #00B3BB, #00868C) are what make the pinwheel read
  // as folded rather than flat.
  chime: (
    <g transform="translate(2 2) scale(0.172353)">
      <polygon fill="#C9EBEC" points="168.360585 123.454439 168.360585 94.6325854 157.633561 100.027317 168.360585 123.466927" />
      <polygon fill="#C9EBEC" points="194.95961 103.448976 239.478634 58.942439 168.360585 94.6325854" />
      <polygon fill="#C9EBEC" points="168.360585 129.298732 159.369366 153.48761 159.394341 153.462634 179.774439 133.082537 192.349659 158.120585 255.288195 158.120585" />
      <polygon fill="#00868C" points="168.360585 94.6325854 168.360585 123.454439 255.288195 123.454439 194.95961 103.448976 168.360585 94.6325854" />
      <polygon fill="#00B3BB" points="168.360585 123.454439 168.360585 123.466927 168.360585 129.298732 255.288195 158.120585 255.288195 123.454439" />
      <polygon fill="#C9EBEC" points="131.946146 168.273171 160.605659 168.273171 151.789268 194.872195 196.345756 239.441171 155.273366 157.58361" />
      <polygon fill="#00868C" points="159.394341 153.462634 220.846829 214.92761 192.349659 158.120585 179.774439 133.082537" />
      <polygon fill="#00B3BB" points="159.394341 153.462634 159.369366 153.48761 155.273366 157.58361 196.345756 239.441171 220.846829 214.92761" />
      <polygon fill="#C9EBEC" points="101.750634 159.269463 101.77561 159.306927 122.155707 179.687024 97.1176585 192.249756 97.1176585 255.188293 125.952 168.273171" />
      <polygon fill="#00868C" points="131.946146 168.273171 131.783805 168.273171 131.783805 255.188293 151.789268 194.872195 160.605659 168.273171" />
      <polygon fill="#00B3BB" points="131.783805 168.273171 125.952 168.273171 97.1176585 255.188293 131.783805 255.188293" />
      <polygon fill="#C9EBEC" points="60.3160976 151.739317 15.809561 196.258341 86.915122 160.568195" />
      <polygon fill="#C9EBEC" points="86.915122 131.733854 86.915122 160.568195 97.6546341 155.173463 86.915122 131.733854" />
      <polygon fill="#00868C" points="101.77561 159.306927 40.3106341 220.759415 97.1176585 192.249756 122.155707 179.687024" />
      <polygon fill="#00B3BB" points="101.77561 159.306927 101.750634 159.269463 97.6546341 155.173463 86.915122 160.568195 86.915122 160.568195 86.915122 160.568195 15.809561 196.258341 40.3106341 220.759415" />
      <polygon fill="#C9EBEC" points="95.9188293 101.700683 95.8938537 101.738146 75.5012683 122.118244 62.9385366 97.0801951 0 97.0801951 86.915122 125.902049" />
      <polygon fill="#00868C" points="86.915122 160.568195 86.915122 160.568195 86.915122 131.733854 0 131.733854 60.3160976 151.739317 86.915122 160.568195" />
      <polygon fill="#00B3BB" points="86.915122 131.733854 86.915122 131.733854 86.915122 125.902049 0 97.0801951 0 131.733854" />
      <polygon fill="#C9EBEC" points="123.342049 86.9276098 94.6700488 86.9276098 103.498927 60.3285854 58.942439 15.7596098 100.014829 97.6046829" />
      <polygon fill="#00868C" points="95.8938537 101.738146 34.428878 40.2731707 62.9385366 97.0801951 75.5012683 122.118244" />
      <polygon fill="#00B3BB" points="95.8938537 101.738146 95.9188293 101.700683 100.014829 97.6046829 58.942439 15.7596098 34.428878 40.2731707" />
      <polygon fill="#C9EBEC" points="153.537561 95.9188293 153.500098 95.8938537 133.12 75.5137561 158.158049 62.9510244 158.158049 0.0124878049 129.336195 86.9276098" />
      <polygon fill="#00868C" points="123.342049 86.9276098 123.50439 86.9276098 123.50439 0.0124878049 103.498927 60.3285854 94.6700488 86.9276098" />
      <polygon fill="#00B3BB" points="123.50439 86.9276098 129.336195 86.9276098 158.158049 0.0124878049 123.50439 0.0124878049" />
      <polygon fill="#00868C" points="153.500098 95.8938537 214.965073 34.4413659 158.158049 62.9510244 133.12 75.5137561" />
      <polygon fill="#00B3BB" points="153.500098 95.8938537 153.537561 95.9188293 157.633561 100.027317 168.360585 94.6325854 168.360585 94.6325854 239.478634 58.942439 214.965073 34.4413659" />
    </g>
  ),

  // https://joinsuperset.com
  //
  // The supplied asset was the full 829x232 logotype: the two-chevron symbol
  // followed by the "superset" wordmark in #4A4A4A. Only the SYMBOL is used --
  // the four paths below are lifted unmodified from that file (Fill-1 inside its
  // own translate(19,6) group, then Fill-4, Fill-6, Fill-8). A wordmark three
  // times wider than it is tall cannot survive a 30px square slot.
  //
  // Fill-1 shipped clipped by a <mask> whose polygon is 0,0 -> 195.29,187.73.
  // That mask is dropped here rather than carried into a shared component: the
  // path's own extremes work out to x[0,195.29] y[0,187.73] once the beziers are
  // evaluated (the out-of-range numbers in the data are control points, not
  // points on the curve), so the mask was only ever trimming overshoot that does
  // not exist. Dropping it also avoids a defs id that would collide across marks.
  //
  // Content bounding box across the four paths: x[19,279] y[6,226]. 44/260 =
  // 0.169231.
  superset: (
    <g transform="translate(-1.215 4.370) scale(0.169231)">
      <g transform="translate(19 6)">
        <path
          fill="#317CF1"
          d="M192.79736,85.6280832 L103.417536,174.841241 C86.2058673,192.020814 58.3002478,192.020814 41.0885795,174.841241 L12.90856,146.714723 C-4.30310829,129.535149 -4.30310829,101.681565 12.90856,84.5019919 L95.0803649,2.4834132 C98.3980234,-0.828058883 103.777028,-0.828058883 107.094687,2.4834132 C110.412345,5.79488528 110.412345,11.1638599 107.094687,14.475332 L24.922882,96.4939107 C14.3465307,107.05054 14.3465307,124.166175 24.922882,134.722804 L53.1029015,162.849322 C63.6792527,173.405951 80.8268624,173.405951 91.4032137,162.849322 L180.783038,73.6361645 C184.100697,70.3246924 189.479701,70.3246924 192.79736,73.6361645 C196.115019,76.9476365 196.115019,82.3166112 192.79736,85.6280832"
        />
      </g>
      <path
        fill="#5B4EEB"
        d="M59.4655405,129.510671 C56.1713523,126.198886 56.1789579,120.836177 59.4836038,117.534875 L141.587322,35.4712213 C144.891018,32.1689665 150.239676,32.1775437 153.533865,35.4893289 L153.534815,35.4893289 C156.829004,38.8020671 156.820447,44.1638234 153.516752,47.4651252 L71.4120826,129.528779 C68.1083874,132.831034 62.7597286,132.822456 59.4655405,129.510671"
      />
      <path
        fill="#317CF1"
        d="M236.530026,105.49435 C239.830614,108.81377 239.822041,114.186342 236.511927,117.495258 L157.440681,196.523437 C154.130567,199.832352 148.771516,199.824713 145.470927,196.505292 L145.469974,196.505292 C142.169386,193.186827 142.177959,187.814256 145.488073,184.50534 L224.560272,105.476206 C227.870386,102.16729 233.229437,102.175885 236.530026,105.49435"
      />
      <path
        fill="#5B4EEB"
        d="M84.4896687,141.848561 L175.524011,50.9034787 C192.745535,33.6988404 220.667134,33.6988404 237.888658,50.9034787 L266.083857,79.0719881 C283.305381,96.2766264 283.305381,124.170848 266.083857,141.375486 L183.865956,223.512772 C180.546397,226.829076 175.164312,226.829076 171.843797,223.512772 C168.525196,220.196469 168.525196,214.820617 171.843797,211.503358 L254.062655,129.366071 C264.645063,118.79404 264.645063,101.653434 254.062655,91.0814029 L225.867456,62.9128934 C215.285049,52.3408621 198.12762,52.3408621 187.545212,62.9128934 L96.5108703,153.857976 C93.191312,157.174279 87.809227,157.174279 84.4896687,153.857976 C81.1701104,150.541672 81.1701104,145.164865 84.4896687,141.848561"
      />
    </g>
  ),

  // https://leetcode.com — the mark as shipped on their own site.
  //
  // Source viewBox 0 0 24 24; artwork occupies x[2,22] y[0,24]. This one is
  // taller than it is wide, so the 44 fits the HEIGHT: 44/24 = 1.833333.
  leetcode: (
    <g transform="translate(2 2) scale(1.833333)">
      <path
        fill="#B3B1B0"
        d="M22 14.355c0-.742-.564-1.346-1.26-1.346H10.676c-.696 0-1.26.604-1.26 1.346s.563 1.346 1.26 1.346H20.74c.696.001 1.26-.603 1.26-1.346z"
      />
      <path
        fill="#E7A41F"
        d="m3.482 18.187 4.313 4.361c.973.979 2.318 1.452 3.803 1.452 1.485 0 2.83-.512 3.805-1.494l2.588-2.637c.51-.514.492-1.365-.039-1.9-.531-.535-1.375-.553-1.884-.039l-2.676 2.607c-.462.467-1.102.662-1.809.662s-1.346-.195-1.81-.662l-4.298-4.363c-.463-.467-.696-1.15-.696-1.863 0-.713.233-1.357.696-1.824l4.285-4.38c.463-.467 1.116-.645 1.822-.645s1.346.195 1.809.662l2.676 2.606c.51.515 1.354.497 1.885-.038.531-.536.549-1.387.039-1.901l-2.588-2.636a4.994 4.994 0 0 0-2.392-1.33l-.034-.007 2.447-2.503c.512-.514.494-1.366-.037-1.901-.531-.535-1.376-.552-1.887-.038l-10.018 10.1C2.509 11.458 2 12.813 2 14.311c0 1.498.509 2.896 1.482 3.876z"
      />
      <path
        fill="#070706"
        d="M8.115 22.814a2.109 2.109 0 0 1-.474-.361c-1.327-1.333-2.66-2.66-3.984-3.997-1.989-2.008-2.302-4.937-.786-7.32a6 6 0 0 1 .839-1.004L13.333.489c.625-.626 1.498-.652 2.079-.067.56.563.527 1.455-.078 2.066-.769.776-1.539 1.55-2.309 2.325-.041.122-.14.2-.225.287-.863.876-1.75 1.729-2.601 2.618-.111.116-.262.186-.372.305-1.423 1.423-2.863 2.83-4.266 4.272-1.135 1.167-1.097 2.938.068 4.127 1.308 1.336 2.639 2.65 3.961 3.974.067.067.136.132.204.198.468.303.474 1.25.183 1.671-.321.465-.74.75-1.333.728-.199-.006-.363-.086-.529-.179z"
      />
    </g>
  ),
}

const MONOGRAMS = {
  zoom: 'Z',
  teams: 'T',
  meet: 'M',
  webex: 'W',
  lark: 'L',
  chime: 'C',
  superset: 'S',
  leetcode: 'L',
}

/**
 * Every gradient any mark above references, emitted exactly once.
 *
 * Mount this ONCE, anywhere in the document, on any page that renders a gradient
 * mark (teams, webex). Without it those marks paint their gradient fills as
 * nothing and render as empty space — not as a fallback monogram, because the
 * component has a mark and cannot tell that its paint server is missing.
 *
 * The <svg> is zero-sized and absolutely positioned rather than `display: none`.
 * A referenced paint server inside a display:none subtree has a history of not
 * resolving; taking it out of flow at 0x0 is the shape of this trick that has
 * always worked. `aria-hidden` because there is nothing here to announce.
 *
 * Coordinates carry over unchanged even though the gradients are defined in a
 * different <svg> from the paths that use them: `gradientUnits="userSpaceOnUse"`
 * resolves against the user space of the REFERENCING element, which for every
 * mark above is inside its normalising <g transform> — i.e. still the vendor's
 * own coordinate system, which is what these numbers were authored against.
 */
export function PlatformMarkDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute' }}
    >
      <defs>
        <radialGradient id="pm-teams-a" cx="0" cy="0" r="1" gradientTransform="matrix(13.4784 0 0 33.2694 39.7967 22.1739)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a98aff" />
          <stop offset=".14" stopColor="#8c75ff" />
          <stop offset=".565" stopColor="#5f50e2" />
          <stop offset=".9" stopColor="#3c2cb8" />
        </radialGradient>
        <radialGradient id="pm-teams-b" cx="0" cy="0" r="1" gradientTransform="rotate(68.1539 -7.71566095 14.71355834)scale(32.752 33.1231)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#85c2ff" />
          <stop offset=".69" stopColor="#7588ff" />
          <stop offset="1" stopColor="#6459fe" />
        </radialGradient>
        <linearGradient id="pm-teams-c" x1="20.5936" x2="20.5936" y1="18" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset=".801159" stopColor="#6864f6" stopOpacity="0" />
          <stop offset="1" stopColor="#5149de" />
        </linearGradient>
        <radialGradient id="pm-teams-d" cx="0" cy="0" r="1" gradientTransform="rotate(113.326 8.09285255 17.64474501)scale(19.2186 15.4273)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#bd96ff" />
          <stop offset=".686685" stopColor="#bd96ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pm-teams-e" cx="0" cy="0" r="1" gradientTransform="matrix(0 -10 12.6216 0 32.9999 11.5714)" gradientUnits="userSpaceOnUse">
          <stop offset=".268201" stopColor="#6868f7" />
          <stop offset="1" stopColor="#3923b1" />
        </radialGradient>
        <radialGradient id="pm-teams-f" cx="0" cy="0" r="1" gradientTransform="rotate(40.0516 -.03068196 44.8729095)scale(7.14629 10.3363)" gradientUnits="userSpaceOnUse">
          <stop offset=".270711" stopColor="#a1d3ff" />
          <stop offset=".813393" stopColor="#a1d3ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pm-teams-g" cx="0" cy="0" r="1" gradientTransform="rotate(-41.6581 32.11799918 -43.41948423)scale(8.51275 20.8824)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e3acfd" />
          <stop offset=".816041" stopColor="#9fa2ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pm-teams-h" cx="0" cy="0" r="1" gradientTransform="matrix(0 -12 15.146 0 17.9999 8.28571)" gradientUnits="userSpaceOnUse">
          <stop offset=".268201" stopColor="#8282ff" />
          <stop offset="1" stopColor="#3923b1" />
        </radialGradient>
        <radialGradient id="pm-teams-i" cx="0" cy="0" r="1" gradientTransform="rotate(40.0516 -3.15465147 21.41641466)scale(8.57554 12.4035)" gradientUnits="userSpaceOnUse">
          <stop offset=".270711" stopColor="#a1d3ff" />
          <stop offset=".813393" stopColor="#a1d3ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pm-teams-j" cx="0" cy="0" r="1" gradientTransform="rotate(-41.6581 20.38180375 -26.51566158)scale(10.2153 25.0589)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e3acfd" />
          <stop offset=".816041" stopColor="#9fa2ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pm-teams-k" cx="0" cy="0" r="1" gradientTransform="rotate(45 -25.76345597 16.32842712)scale(22.6274)" gradientUnits="userSpaceOnUse">
          <stop offset=".046875" stopColor="#688eff" />
          <stop offset=".946875" stopColor="#230f94" />
        </radialGradient>
        <radialGradient id="pm-teams-l" cx="0" cy="0" r="1" gradientTransform="matrix(0 11.2 -13.0702 0 12 32.6)" gradientUnits="userSpaceOnUse">
          <stop offset=".570647" stopColor="#6965f6" stopOpacity="0" />
          <stop offset="1" stopColor="#8f8fff" />
        </radialGradient>

        {/* Webex's `paint0_linear`, renamed for the namespace. */}
        <linearGradient id="pm-webex-swoosh" x1="387.159" y1="195.957" x2="127.733" y2="280.919" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5CEE64" />
          <stop offset="1" stopColor="#00BBFF" />
        </linearGradient>
      </defs>
    </svg>
  )
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
