import React, { useState, useEffect } from 'react'
import MainApp from '@/pages/MainApp'
import LicenseGate from '@/pages/LicenseGate'

export default function App() {
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

  // Loading screen
  if (checking) {
    return (
      <div style={{
        width: '100%', height: '100vh',
        background: '#fff', borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill="white"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>Checking license...</p>
        </div>
      </div>
    )
  }

  if (!licensed) {
    return <LicenseGate onActivated={handleActivated} notice={gateNotice} />
  }

  return <MainApp licenseData={licenseData} onLogout={handleLogout} />
}
