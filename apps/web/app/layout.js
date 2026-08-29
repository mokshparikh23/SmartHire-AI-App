import { Inter, Instrument_Serif } from 'next/font/google'
import './globals.css'

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Display face for headlines only. The contrast between a high-stroke serif
// and a neutral UI sans is what carries the editorial feel — using it for body
// copy would undo that.
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata = {
  title: 'Interview Assistant — AI Interview Copilot',
  description: 'Real-time answers during live interviews. Invisible to your interviewer.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  )
}
