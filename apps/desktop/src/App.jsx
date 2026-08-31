import React, { useState, useEffect } from 'react'
import MainApp from '@/pages/MainApp'
import LicenseGate from '@/pages/LicenseGate'

export default function App() {
  /* PREMIUM-UX 2026-08-31: hold the boot screen back for 200ms. On a transparent
     window a flash of NOTHING is invisible, whereas a flash of anything is a
     strobe — and a licence check served from electron-store usually resolves
     well inside this. */
  const BOOT_PAINT_DELAY_MS = 200
  const [showChecking, setShowChecking] = React.useState(false)
  React.useEffect(() => {
    const id = setTimeout(() => setShowChecking(true), BOOT_PAINT_DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  const [licensed, setLicensed]   = useState(false)
  const [checking, setChecking]   = useState(true)
  const [licenseData, setLicenseData] = useState(null)
  const [licenseKey, setLicenseKey]   = useState(null)
  const [webUrl, setWebUrl]           = useState(null)
  const [gateNotice, setGateNotice]   = useState('')

  useEffect(() => {
    checkLicense()
    window.electronAPI?.getWebUrl?.().then(setWebUrl).catch(() => {})
  }, [])

  const checkLicense = async () => {
    try {
      const saved = await window.electronAPI?.getLicense?.()
      if (!saved?.key) { setChecking(false); return }
      setLicenseKey(saved.key)

      // Re-validate every 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      if (saved.lastValidated && saved.lastValidated > oneDayAgo && saved.data?.valid) {
        setLicenseData(saved.data)
        setLicensed(true)
        setChecking(false)
        return
      }

      // Re-validate against server
      const result = await window.electronAPI?.validateLicense?.(saved.key)
      if (result?.valid) {
        setLicenseData(result)
        setLicensed(true)
      }
    } catch (e) {
      console.error('License check error:', e)
    } finally {
      setChecking(false)
    }
  }

  const handleActivated = ({ data, key }) => {
    setLicenseData(data)
    setLicenseKey(key)
    setLicensed(true)
    setGateNotice('')
  }

  const handleLogout = async (reason) => {
    await window.electronAPI?.clearLicense?.()
    setLicensed(false)
    setLicenseData(null)
    setLicenseKey(null)
    if (reason) setGateNotice(reason)
    else setGateNotice('')
  }

  // Realtime license revocation (SSE)
  useEffect(() => {
    if (!licensed || !licenseKey || !webUrl) return
    const url = `${webUrl}/api/license/stream?licenseKey=${encodeURIComponent(licenseKey)}`
    const es = new EventSource(url)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg?.type === 'license_revoked' || msg?.valid === false) {
          const reason = msg?.reason || 'Access denied. Your license was revoked.'
          handleLogout(reason)
        }
      } catch {}
    }
    es.onerror = () => {}
    return () => es.close()
  }, [licensed, licenseKey, webUrl])

  // Fallback: periodic re-validation in case SSE is down
  useEffect(() => {
    if (!licensed || !licenseKey) return
    const id = setInterval(async () => {
      try {
        const result = await window.electronAPI?.validateLicense?.(licenseKey)
        if (result?.valid) {
          setLicenseData(result)
          return
        }
        if (result?.valid === false) {
          const reason = result?.reason || 'Access denied. Your license was revoked.'
          handleLogout(reason)
        }
      } catch {}
    }, 10000)
    return () => clearInterval(id)
  }, [licensed, licenseKey])

  /* PREMIUM-UX 2026-08-31 ─ a white card, in a dark-glass app ─────────────────
     This was a #fff card with a #e5e7eb border and an indigo-violet gradient
     mark, flashed on every cold start of an application whose every other
     surface is dark translucent glass. For a quarter of a second the app looked
     like a different product.

     Two changes. It uses .ia-glass and the existing .ia-gate-mark, so there is
     one mark in the app rather than two. And it does not paint AT ALL for the
     first 200ms: on a transparent window a flash of NOTHING is invisible,
     whereas a flash of anything is a strobe — and a licence check that resolves
     from electron-store usually finishes well inside that.

     The string is fixed too. "Checking license..." used three ASCII dots where
     every other wait in the app uses a real ellipsis.

  if (checking) {
    return (
      <div style={{ width: '100%', height: '100vh', background: '#fff', borderRadius: 16, … }}>
        …indigo gradient mark…
        <p style={{ fontSize: 12, color: '#9ca3af' }}>Checking license...</p>
      </div>
    )
  }  */
  if (checking) {
    if (!showChecking) return null
    return (
      <div className="ia-glass ia-boot">
        <div className="ia-gate-mark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill="currentColor"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="ia-boot-note">Checking your licence…</p>
      </div>
    )
  }

  if (!licensed) {
    return <LicenseGate onActivated={handleActivated} notice={gateNotice} />
  }

  return <MainApp licenseData={licenseData} onLogout={handleLogout} />
}
