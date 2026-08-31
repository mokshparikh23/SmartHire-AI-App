import React, { useLayoutEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import Icon from '../ui/Icon'
import Markdown from './Markdown'

/**
 * REDESIGN 2026-08-29: Chat mode.
 *
 * A free-form thread, separate from the Q→A fast path, shown in the card body
 * when the toolbar's Chat pill is on. Toggling it never disturbs a streaming
 * answer — the two keep their own state in the store.
 *
 * Like AnswerPanel, this is a leaf: it is the only subscriber to chatMessages,
 * so a streamed token re-renders this and nothing above it. sendChat coalesces
 * deltas on a frame in useInterviewSession, so the render rate is capped at
 * ~60/s no matter how fast the stream arrives.
 */
export default function ChatPanel({ onSend }) {
  const messages  = useSessionStore((s) => s.chatMessages)
  const streaming = useSessionStore((s) => s.chatStreaming)
  // BUGFIX 2026-08-30: this component read neither of these, so a failed
  // request produced a blank bubble and no reason — the "hi with no reply".
  const chatError     = useSessionStore((s) => s.chatError)
  const blockedReason = useSessionStore((s) => s.blockedReason)

  const [draft, setDraft] = useState('')
  const logRef   = useRef(null)
  const pinnedRef = useRef(true)

  // Same rule as the answer body: follow the stream only while already at the
  // bottom, so scrolling up to re-read is not yanked back down.
  const handleScroll = () => {
    const el = logRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  // chatError is in the deps too: the failure renders at the bottom of the log,
  // and it is the one thing the user is waiting for — scrolling to it matters
  // as much as scrolling to a reply.
  useLayoutEffect(() => {
    if (pinnedRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages, chatError])

  const submit = () => {
    const text = draft.trim()
    if (!text || streaming) return
    setDraft('')
    pinnedRef.current = true
    onSend(text)
  }

  return (
    <div className="ia-chat">
      <div className="ia-chat-log" ref={logRef} onScroll={handleScroll}>
        {messages.length === 0 && !chatError ? (
          <div className="ia-empty">
            <Icon name="chat" size={20} strokeWidth={1.4} />
            <span>Ask anything — this thread is separate from the answers</span>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`ia-msg ia-msg--${m.role}`}>
              {/* EMPHASIS 2026-09-01: the assistant's turns go through the same
                  renderer as the answer card. This was the last surface still
                  printing the model's markdown literally — a chat reply with a
                  code fragment in it arrived as backticks and unindented Inter,
                  which is the exact complaint Markdown.jsx was written to fix.

                  The user's own turns stay plain text on purpose: what they
                  typed is what should appear, and asterisks in a question are
                  asterisks, not formatting.
                  {m.content} */}
              {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
              {/* The assistant turn is pushed empty and streams into; the caret
                  is what makes that read as "working" rather than "blank". */}
              {m.role === 'assistant' && !m.content && streaming && (
                <span className="ia-dots"><i /><i /><i /></span>
              )}
            </div>
          ))
        )}

        {/* BUGFIX 2026-08-30: the failure now lands in the thread, where the
            reply was expected. Out of credits is a state with an action, so it
            gets the amber panel rather than a red error line. */}
        {chatError && (blockedReason ? (
          <div className="ia-blocked">
            <span>{chatError}</span>
            <button onClick={() => window.electronAPI?.getWebUrl?.().then((url) =>
              url && window.electronAPI?.openExternal?.(`${url}/dashboard/billing`))}>
              Top up credits
            </button>
          </div>
        ) : (
          <p className="ia-error">{chatError}</p>
        ))}
      </div>

      <div className="ia-composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
          placeholder="Message…"
        />
        <button
          className="ia-btn"
          onClick={submit}
          disabled={!draft.trim() || streaming}
          title="Send"
        >
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  )
}
