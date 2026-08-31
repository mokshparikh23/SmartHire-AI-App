'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from 'smarthire-ui/Icon'
import { Badge, Button } from 'smarthire-ui'

/**
 * "Where is this account signed in", with a way to sign each one out.
 *
 * Revoked rows are filtered out rather than shown greyed: the question this list
 * answers is where you ARE signed in, and a row that says "signed out" invites
 * the reader to wonder whether it half-worked. The rows stay in the database —
 * they are what stops a revoked desktop reactivating itself on its next poll —
 * they are just not this screen's business.
 */
export default function DeviceList({ devices, currentDeviceId, activeWindowMs }) {
  const router = useRouter()
  const [pending, setPending] = useState(null)     // deviceId | 'all'
  const [armed, setArmed] = useState(false)        // "sign out everywhere" confirm step
  const [error, setError] = useState('')
  const [gone, setGone] = useState([])             // optimistic removals

  const visible = devices.filter(d => !d.revoked_at && !gone.includes(d.device_id))

  const post = async (body, deviceId) => {
    if (pending) return
    setPending(deviceId)
    setError('')

    try {
      const res = await fetch('/api/devices/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not sign that device out')

      // Signing THIS browser out ends its own session, so there is nothing left
      // to refresh — go to /login rather than re-rendering a dead dashboard.
      if (data.signedOut) {
        router.replace('/login')
        return
      }

      if (body.all) {
        setGone(devices.filter(d => d.device_id !== currentDeviceId).map(d => d.device_id))
      } else {
        setGone(g => [...g, deviceId])
      }
      setArmed(false)
      router.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setPending(null)
    }
  }

  const others = visible.filter(d => d.device_id !== currentDeviceId).length

  return (
    <div>
      <ul className="divide-y divide-line-soft">
        {visible.map(d => (
          <Row
            key={d.id}
            device={d}
            isCurrent={d.device_id === currentDeviceId}
            activeWindowMs={activeWindowMs}
            pending={pending === d.device_id}
            disabled={!!pending}
            onRevoke={() => post({ deviceId: d.device_id }, d.device_id)}
          />
        ))}

        {visible.length === 0 && (
          <li className="py-6 text-[14px] text-muted">
            Nothing registered yet. Devices appear here the first time they check in.
          </li>
        )}
      </ul>

      {error && (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} />{error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
        {armed ? (
          <>
            <Button
              variant="danger"
              size="sm"
              onClick={() => post({ all: true }, 'all')}
              disabled={!!pending}
            >
              {pending === 'all' ? 'Signing out…' : `Yes, sign out ${others} other device${others === 1 ? '' : 's'}`}
            </Button>
            <button
              onClick={() => setArmed(false)}
              disabled={!!pending}
              className="text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              Cancel
            </button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon="logout"
            onClick={() => setArmed(true)}
            disabled={!!pending || others === 0}
          >
            Sign out everywhere else
          </Button>
        )}

        <p className="text-[13px] text-muted">
          {others === 0
            ? 'This is the only device signed in.'
            : 'Keeps this browser signed in and ends every other session.'}
        </p>
      </div>
    </div>
  )
}

function deviceIcon({ kind, platform }) {
  if (kind === 'web') return 'globe'
  if (platform === 'darwin') return 'apple'
  if (platform === 'win32') return 'windows'
  return 'monitor'
}

function Row({ device, isCurrent, activeWindowMs, pending, disabled, onRevoke }) {
  const seen = useRelativeTime(device.last_seen_at)
  const active = Date.now() - new Date(device.last_seen_at).getTime() < activeWindowMs

  return (
    <li className="flex flex-wrap items-center gap-4 py-4">
      {/* Platform mark where we know it, so a row is recognisable at a glance —
          "the Mac in the office" is easier to place than "Desktop app". */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-2 text-ink">
        <Icon name={deviceIcon(device)} size={17} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-medium text-ink">{device.label || 'Unknown device'}</p>
          {isCurrent && <Badge tone="positive">This device</Badge>}
          {!isCurrent && active && <Badge tone="neutral">Active</Badge>}
        </div>
        <p className="mt-0.5 text-[13px] text-muted">
          {device.kind === 'desktop' ? 'Desktop app' : 'Browser'}
          {seen && <> · last seen {seen}</>}
        </p>
      </div>

      {isCurrent ? (
        // Revoking your own row is just signing out, and there is already a
        // Sign out button three inches away in the sidebar.
        <span className="text-[13px] text-faint">In use</span>
      ) : (
        <button
          onClick={onRevoke}
          disabled={disabled}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-critical-soft hover:text-critical disabled:pointer-events-none disabled:opacity-40"
        >
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
      )}
    </li>
  )
}

/**
 * Relative time, computed only after mount.
 *
 * Rendering it during SSR would hash a server clock into the HTML and a client
 * clock into the hydration pass — a guaranteed mismatch on any row older than a
 * few seconds. Returning null first paints the row without the timestamp and
 * fills it in immediately after.
 */
function useRelativeTime(iso) {
  const [text, setText] = useState(null)

  useEffect(() => {
    if (!iso) return

    const format = () => {
      const secs = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

      const units = [
        ['day',    86400],
        ['hour',   3600],
        ['minute', 60],
      ]
      for (const [unit, size] of units) {
        if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit)
      }
      return rtf.format(Math.min(-1, secs), 'second')
    }

    setText(format())
    const id = setInterval(() => setText(format()), 60_000)
    return () => clearInterval(id)
  }, [iso])

  return text
}
