import React from 'react'
import Icon from '../ui/Icon'

/**
 * Replaces the dashboard's 288px question list with ~78px in the header.
 *
 * A live interview produces 15–40 questions, but the ones you revisit are the
 * last two or three. A pager reaches those in one click; the full list is one
 * click further, in a drawer, and never costs panel height until it is opened.
 */
export default function TurnPager({ turns, activeTurnId, onSelect, drawerOpen, onToggleDrawer }) {
  if (!turns.length) return null

  const index = turns.findIndex((t) => t.id === activeTurnId)
  const position = index === -1 ? turns.length : index + 1

  const step = (delta) => {
    const from = index === -1 ? turns.length - 1 : index
    const next = Math.min(turns.length - 1, Math.max(0, from + delta))
    onSelect(turns[next].id)
  }

  return (
    <span className="ia-pager">
      <button onClick={() => step(-1)} disabled={position <= 1} title="Previous question">
        <Icon name="chevronL" size={13} />
      </button>
      <span onClick={onToggleDrawer} title={drawerOpen ? 'Hide history' : 'Show history'}>
        {position}/{turns.length}
      </span>
      <button onClick={() => step(1)} disabled={position >= turns.length} title="Next question">
        <Icon name="chevronR" size={13} />
      </button>
    </span>
  )
}

export function TurnDrawer({ turns, activeTurnId, onSelect }) {
  return (
    <div className="ia-drawer">
      {[...turns].reverse().map((turn) => (
        <button
          key={turn.id}
          data-active={turn.id === activeTurnId}
          onClick={() => onSelect(turn.id)}
        >
          <Icon name={turn.source === 'manual' ? 'keyboard' : 'mic'} size={12} />
          <span>{turn.q}</span>
        </button>
      ))}
    </div>
  )
}
