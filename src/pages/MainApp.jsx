import React, { useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import InterviewSetup from './InterviewSetup'
import Dashboard from './Dashboard'
import Settings from './Settings'

export default function MainApp({ licenseData, onLogout }) {
  const interviewContext      = useSettingsStore((s) => s.interviewContext)
  const clearInterviewContext = useSettingsStore((s) => s.clearInterviewContext)
  const [page, setPage]       = useState('dashboard') // 'dashboard' | 'settings'

  // If interview not set up yet → show setup screen first
  if (!interviewContext.isSetup) {
    return <InterviewSetup onComplete={() => setPage('dashboard')} />
  }

  if (page === 'settings') {
    return <Settings onBack={() => setPage('dashboard')} />
  }

  return (
    <Dashboard
      licenseData={licenseData}
      onLogout={onLogout}
      onResetInterview={clearInterviewContext}
      onGoSettings={() => setPage('settings')}
    />
  )
}