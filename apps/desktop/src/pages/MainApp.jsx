import React from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useInterviewSession } from '../hooks/useInterviewSession'
import Launcher from './Launcher'
import SessionPanel from '../components/overlay/SessionPanel'

/*
  SETUP-TO-WEB 2026-08-30

  The app is two screens now: pick an interview, or run one.

  What this used to branch on, kept for reference:

  // import { useSettingsStore } from '../store/settingsStore'
  // import InterviewSetup from './InterviewSetup'
  // import Dashboard from './Dashboard'
  // import Settings from './Settings'
  //
  // const interviewContext      = useSettingsStore((s) => s.interviewContext)
  // const clearInterviewContext = useSettingsStore((s) => s.clearInterviewContext)
  // const [page, setPage]       = useState('dashboard')
  //
  // if (!interviewContext.isSetup) {
  //   return <InterviewSetup onComplete={() => setPage('dashboard')} />
  // }
  // if (isRunning) return <SessionPanel session={session} />
  // if (page === 'settings') return <Settings onBack={() => setPage('dashboard')} />
  // return <Dashboard ... />

  InterviewSetup's three steps moved to /dashboard/interviews on the web.
  Dashboard's post-session review moved there too. Settings was two controls —
  model and overlay opacity — which now live in the launcher's ⋮ menu. The three
  files remain on disk, unrouted, per this repo's keep-don't-delete convention.
*/
export default function MainApp({ licenseData, onLogout }) {
  const isRunning = useSessionStore((s) => s.isRunning)

  // Mounted above the branch below, so the microphone and the answer stream
  // survive the switch into the floating panel. Moving this into a page
  // component would end the session the moment it starts.
  const session = useInterviewSession()

  if (isRunning) return <SessionPanel session={session} />

  return (
    <Launcher
      session={session}
      licenseData={licenseData}
      onLogout={onLogout}
    />
  )
}
