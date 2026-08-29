/**
 * Line icons, replacing the emoji the app used throughout.
 *
 * Emoji render differently on every OS, carry their own colour, and sit off the
 * text baseline — which is most of why the old pages read as unfinished. These
 * inherit currentColor and stroke width, so they sit correctly in any context.
 */
const PATHS = {
  mic: <><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><path d="M12 18v4" /></>,
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />,
  shield: <path d="M12 2.5 20 6v6c0 4.5-3.2 8.5-8 9.5-4.8-1-8-5-8-9.5V6z" />,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9" /><path d="M17 12v3" /><path d="M20.5 12v2" /></>,
  chart: <><path d="M3 21h18" /><path d="M6 21V10" /><path d="M12 21V4" /><path d="M18 21v-7" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M19.5 12a7.5 7.5 0 0 0-.13-1.36l2-1.55-2-3.46-2.35.95a7.5 7.5 0 0 0-2.35-1.36L14.3 2.8h-4l-.37 2.42A7.5 7.5 0 0 0 7.58 6.58L5.23 5.63l-2 3.46 2 1.55a7.5 7.5 0 0 0 0 2.72l-2 1.55 2 3.46 2.35-.95a7.5 7.5 0 0 0 2.35 1.36l.37 2.42h4l.37-2.42a7.5 7.5 0 0 0 2.35-1.36l2.35.95 2-3.46-2-1.55c.09-.44.13-.9.13-1.36z" /></>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 5.5a3.5 3.5 0 0 1 0 6.8" /><path d="M18.5 20a6 6 0 0 0-3-5.2" /></>,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></>,
  download: <><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20.5h16" /></>,
  apple: <><path d="M16.3 12.6c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.6-1.9-1.5-.2-3 .9-3.8.9s-2-.9-3.2-.9c-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8 2.2-1.2 3-2.4c.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.4-1-2.3-3.9z" /><path d="M14.4 4.8c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4z" /></>,
  windows: <><path d="M3 6.2 10 5.2v6.3H3z" /><path d="M11.5 5v6.5H21V3.8z" /><path d="M3 12.5h7v6.3L3 17.8z" /><path d="M11.5 12.5H21v7.7l-9.5-1.3z" /></>,
  sparkle: <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.3l-1.8-5.7L4.5 10.8 10.2 9z" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  eye: <><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  file: <><path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" /><path d="M13.5 3v5.5H19" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>,
  logout: <><path d="M14 4.5h4.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  // A credit is an hour, so the marks for it are a coin and a glass — not a
  // currency symbol, which would imply a price rather than a balance.
  coin: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10" /><path d="M14.6 9.6A2.7 2.7 0 0 0 12 7.9c-1.6 0-2.7.85-2.7 2s1 1.75 2.7 2.05 2.7.9 2.7 2.05-1.1 2-2.7 2a2.7 2.7 0 0 1-2.6-1.7" /></>,
  hourglass: <><path d="M6.5 3h11" /><path d="M6.5 21h11" /><path d="M17 3v4.2L12 12l5 4.8V21" /><path d="M7 3v4.2L12 12l-5 4.8V21" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" /><path d="M12 8v13" /><path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5" /><path d="M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5" /></>,
  infinity: <path d="M6.5 15.5a3.5 3.5 0 1 1 0-7c3.5 0 4 7 7.5 7a3.5 3.5 0 1 0 0-7c-3.5 0-4 7-7.5 7z" />,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 4.5h13l2.5 8.5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></>,
}

export default function Icon({ name, size = 20, strokeWidth = 1.5, className = '', ...rest }) {
  const path = PATHS[name]
  if (!path) return null

  // Solid marks read better filled; the rest are strokes.
  const filled = name === 'bolt' || name === 'sparkle' || name === 'apple' || name === 'windows'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {path}
    </svg>
  )
}

/** The product mark, used in the nav and sidebars. */
export function Logo({ size = 32, className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-ink text-paper ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon name="mic" size={Math.round(size * 0.55)} strokeWidth={1.75} />
    </span>
  )
}
