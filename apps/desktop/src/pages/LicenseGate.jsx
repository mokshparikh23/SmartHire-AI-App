import React, { useState } from 'react'

export default function LicenseGate({ onActivated, notice }) {
  const [key, setKey]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleActivate = async () => {
    if (!key.trim()) return
    setLoading(true)
    setError('')

    try {
      const trimmed = key.trim()
      const result = await window.electronAPI.validateLicense(trimmed)
      if (result.valid) {
        onActivated({ data: result, key: trimmed })
      } else {
        setError(result.reason || 'Invalid license key')
      }
    } catch (e) {
      setError('Could not connect to server. Check internet connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      width: '100%', height: '100vh',
      background: '#ffffff',
      borderRadius: 16,
      border: '1px solid #e5e7eb',
      boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
      fontFamily: "'Inter', -apple-system, sans-serif",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Drag bar */}
      <div style={{
        height: 44, background: '#f9fafb',
        borderBottom: '1px solid #f3f4f6',
        WebkitAppRegion: 'drag', flexShrink: 0
      }} />

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 28px'
      }}>
        {/* Notice */}
        {notice && (
          <div style={{
            width: '100%', background: '#fff7ed',
            border: '1px solid #fed7aa', borderRadius: 8,
            padding: '8px 12px', marginBottom: 14,
            fontSize: 11, color: '#c2410c', textAlign: 'center'
          }}>
            {notice}
          </div>
        )}
        {/* Logo */}
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill="white"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6, textAlign: 'center' }}>
          Activate Interview Assistant
        </h1>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 24, textAlign: 'center', lineHeight: 1.6 }}>
          Enter your license key to unlock the app.{'\n'}
          Get a key at <span style={{ color: '#6366f1' }}>interview-assistant.com</span>
        </p>

        {/* Input */}
        <input
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleActivate()}
          placeholder="IA-XXXX-XXXX-XXXX-XXXX"
          style={{
            width: '100%', padding: '10px 14px',
            border: error ? '1.5px solid #ef4444' : '1.5px solid #e5e7eb',
            borderRadius: 10, fontSize: 13,
            fontFamily: 'monospace', color: '#374151',
            outline: 'none', marginBottom: 8,
            background: '#f9fafb', textAlign: 'center',
            letterSpacing: '0.05em'
          }}
        />

        {/* Error */}
        {error && (
          <div style={{
            width: '100%', background: '#fef2f2',
            border: '1px solid #fee2e2', borderRadius: 8,
            padding: '8px 12px', marginBottom: 12,
            fontSize: 11, color: '#ef4444', textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/* Activate button */}
        <button
          onClick={handleActivate}
          disabled={loading || !key.trim()}
          style={{
            width: '100%', padding: '11px 0',
            background: loading || !key.trim()
              ? '#e5e7eb'
              : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            border: 'none', borderRadius: 10,
            color: loading || !key.trim() ? '#9ca3af' : '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', marginBottom: 16
          }}
        >
          {loading ? 'Validating...' : 'Activate'}
        </button>

        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
          Don't have a key?{' '}
          <a
            href="https://your-site.vercel.app/signup"
            style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}
          >
            Buy a license
          </a>
        </p>
      </div>
    </div>
  )
}
