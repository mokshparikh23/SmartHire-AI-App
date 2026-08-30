import React, { useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import '../styles/overlay.css'   // pulls in glass.css

/*
  SETUP-TO-WEB 2026-08-30: restyled from the white/indigo card to the same glass
  surface as the launcher and the overlay. The activation logic is unchanged.

  Two things fixed while moving it:

  - The "Buy a license" link was a plain <a href> to a hardcoded
    https://your-site.vercel.app/signup. In a frameless Electron window that
    navigates the APP away from the renderer, leaving the user staring at a web
    page with no way back. It opens in the real browser now, and at the
    configured WEB_URL rather than a placeholder host.
  - The window is transparent for its whole life, so this screen has to paint
    its own full-height background — .ia-launcher does that, edge to edge, which
    also keeps the macOS traffic lights on the card.
*/
export default function LicenseGate({ onActivated, notice }) {
  const [key, setKey]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [webUrl, setWebUrl]   = useState('')

  useEffect(() => {
    window.electronAPI?.getWebUrl?.().then(setWebUrl).catch(() => {})
  }, [])

  const handleActivate = async () => {
    if (!key.trim()) return
    setLoading(true)
    setError('')

    try {
      const trimmed = key.trim()
      /*
        DEVICES 2026-08-30: this is the ONLY call site that passes activating.

        Signing this machine out from the dashboard sets a revocation that the
        automatic checks must never clear — otherwise a revoked app would
        un-revoke itself on its next ten-second poll. But a person typing their
        key in here is the account owner saying "this machine is mine again", so
        this call is allowed to clear it. Without the distinction, signing a
        machine out locked it out permanently.
      */
      const result = await window.electronAPI.validateLicense(trimmed, { activating: true })
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
    <div className="ia-glass ia-launcher">
      {/* The only drag surface; the controls below are inside .ia-gate, which
          sets no-drag on each one. */}
      <div className="ia-lhead" />

      <div className="ia-gate">
        {notice && <p className="ia-gate-notice">{notice}</p>}

        <span className="ia-gate-mark"><Icon name="mic" size={22} /></span>

        <h1>Activate Smart Hire AI</h1>
        <p className="ia-gate-lede">Enter your licence key to unlock the app.</p>

        <input
          className="ia-gate-input"
          data-invalid={!!error}
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleActivate()}
          placeholder="IA-XXXX-XXXX-XXXX-XXXX"
          autoFocus
        />

        {error && <p className="ia-error" style={{ width: '100%' }}>{error}</p>}

        <button
          className="ia-lstart"
          onClick={handleActivate}
          disabled={loading || !key.trim()}
          style={{ width: '100%', flex: 'none' }}
        >
          {loading ? 'Validating…' : 'Activate'}
        </button>

        <p className="ia-gate-foot">
          Don&rsquo;t have a key?{' '}
          <button
            className="ia-llink"
            style={{ display: 'inline-flex', verticalAlign: 'baseline' }}
            onClick={() => webUrl && window.electronAPI?.openExternal?.(`${webUrl}/signup`)}
            disabled={!webUrl}
          >
            Buy a licence
          </button>
        </p>
      </div>
    </div>
  )
}
