import React, { useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useSessionStore } from '../store/sessionStore'
import { useInterviewSession } from '../hooks/useInterviewSession'
import InterviewSetup from './InterviewSetup'
import Dashboard from './Dashboard'
import Settings from './Settings'
import SessionPanel from '../components/overlay/SessionPanel'

export default function MainApp({ licenseData, onLogout }) {
  const interviewContext      = useSettingsStore((s) => s.interviewContext)
  const clearInterviewContext = useSettingsStore((s) => s.clearInterviewContext)
  const isRunning             = useSessionStore((s) => s.isRunning)
  const [page, setPage]       = useState('dashboard') // 'dashboard' | 'settings'

  // Mounted above every branch below, so the microphone and the answer stream
  // survive the switch into the floating panel. Moving this into a page
  // component would end the session the moment it starts.
  const session = useInterviewSession()

  if (!interviewContext.isSetup) {
    return <InterviewSetup onComplete={() => setPage('dashboard')} />
  }

  // Checked before `page`: otherwise opening Settings mid-interview would hide
  // the panel while the mic kept running.
  if (isRunning) {
    return <SessionPanel session={session} />
  }

  if (page === 'settings') {
    return <Settings onBack={() => setPage('dashboard')} />
  }

  return (
    <Dashboard
      session={session}
      licenseData={licenseData}
      onLogout={onLogout}
      onResetInterview={clearInterviewContext}
      onGoSettings={() => setPage('settings')}
    />
  )
}
