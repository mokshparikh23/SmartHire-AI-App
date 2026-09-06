import React from 'react'

/**
 * Line icons, replacing the emoji this app used throughout.
 *
 * Emoji render differently on every OS, carry their own colour that fights the
 * palette, and sit off the text baseline. These inherit currentColor and the
 * stroke width, so they sit correctly on a green header, a dark glass panel, or
 * a white card without further work.
 */
const PATHS = {
  mic:        <><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><path d="M12 18v4" /></>,
  // SYSTEM-AUDIO 2026-08-30: the capture toggle needs to distinguish "listening
  // to system output" from "listening to the room", so a speaker reads where a
  // second mic glyph would not.
  speaker:    <><path d="M11 4.5 6.5 8.5H3.5v7h3l4.5 4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18.5 6a8 8 0 0 1 0 12" /></>,
  keyboard:   <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01M17 9.5h.01M8 13h8" /></>,
  check:      <path d="m4.5 12.5 5 5 10-11" />,
  close:      <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  copy:       <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" /></>,
  arrowLeft:  <><path d="M20 12H5" /><path d="m11 6-6 6 6 6" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  chevronL:   <path d="m14 6-6 6 6 6" />,
  chevronR:   <path d="m10 6 6 6-6 6" />,
  gear:       <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 18.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H8.9a1.7 1.7 0 0 0 1.03-1.56V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8.9a1.7 1.7 0 0 0 1.56 1.03H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.03z" /></>,
  reset:      <><path d="M3 12a9 9 0 1 0 2.6-6.36" /><path d="M3 4v5h5" /></>,
  eyeOff:     <><path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 4" /><path d="M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.5-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" /></>,
  stop:       <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />,
  sparkle:    <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.3l-1.8-5.7L4.5 10.8 10.2 9z" />,
  bulb:       <><path d="M9.5 17.5h5" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 1 3.6 10.8c-.5.4-.8 1-.85 1.7h-5.5c-.05-.7-.35-1.3-.85-1.7A6 6 0 0 1 12 3z" /></>,
  file:       <><path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" /><path d="M13.5 3v5.5H19" /></>,
  upload:     <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" /></>,
  warning:    <><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4.5" /><path d="M12 17.2h.01" /></>,
  lock:       <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  bolt:       <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />,
  pen:        <><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5l-4 1 1-4z" /><path d="M14.5 5.5l3 3" /></>,
  robot:      <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4.5V8" /><circle cx="12" cy="3.5" r="1.2" /><path d="M9 13h.01M15 13h.01" /><path d="M9.5 16.5h5" /></>,
  send:       <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  play:       <path d="M8 5.5 18.5 12 8 18.5z" />,
  plus:       <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  clock:      <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></>,
  inbox:      <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 4.5h13l2.5 8.5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></>,

  /* REDESIGN 2026-08-29: the new overlay chrome. The reference design marks the
     question and answer with 💬 and ⭐; these replace them for the reason at the
     top of this file — emoji render differently on every OS, carry their own
     colour, and sit off the baseline. */
  monitor:    <><rect x="2.5" y="4" width="19" height="13" rx="2.5" /><path d="M8.5 21h7" /><path d="M12 17v4" /></>,
  camera:     <><path d="M4.5 7.5h3l1.5-2.5h6l1.5 2.5h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" /><circle cx="12" cy="13" r="3.4" /></>,
  chat:       <><path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-5.4A7.5 7.5 0 1 1 20.5 12.5z" /></>,
  move:       <><path d="M12 3v18" /><path d="M3 12h18" /><path d="m9 6 3-3 3 3" /><path d="m9 18 3 3 3-3" /><path d="m6 9-3 3 3 3" /><path d="m18 9 3 3-3 3" /></>,
  collapse:   <><path d="M4 9h5V4" /><path d="M20 9h-5V4" /><path d="M4 15h5v5" /><path d="M20 15h-5v5" /></>,
  expand:     <><path d="M9 4H4v5" /><path d="M15 4h5v5" /><path d="M9 20H4v-5" /><path d="M15 20h5v-5" /></>,
  dots:       <><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>,
  thumbUp:    <><path d="M7 10.5v9" /><path d="M11 3.5 9.5 8.2a2 2 0 0 1-.4.8L7 10.5v9h9.6a2.5 2.5 0 0 0 2.4-1.9l1.4-6a2 2 0 0 0-2-2.5H14V5.5a2 2 0 0 0-3-2z" /></>,
  thumbDown:  <><path d="M7 13.5v-9" /><path d="M11 20.5 9.5 15.8a2 2 0 0 0-.4-.8L7 13.5v-9h9.6a2.5 2.5 0 0 1 2.4 1.9l1.4 6a2 2 0 0 1-2 2.5H14v3a2 2 0 0 1-3 2z" /></>,
  trash:      <><path d="M4 6.5h16" /><path d="M9.5 6.5V4.5h5v2" /><path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" /></>,
}

export default function Icon({ name, size = 16, strokeWidth = 1.6, style, ...rest }) {
  const path = PATHS[name]
  if (!path) return null

  const filled = name === 'bolt' || name === 'sparkle' || name === 'play' || name === 'stop'

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
      style={{ flexShrink: 0, display: 'block', ...style }}
      {...rest}
    >
      {path}
    </svg>
  )
}
