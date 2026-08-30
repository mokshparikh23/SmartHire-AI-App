import React, { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useSessionStore }  from '../store/sessionStore'
import Icon from '../components/ui/Icon'

/* ── tokens ─────────────────────────────────────────────────────────────── */
const G = {
  bg:      '#f0fdf6',
  card:    '#ffffff',
  border:  '#d1fae5',
  border2: '#a7f3d0',
  primary: '#059669',
  dark:    '#064e3b',
  accent:  '#ecfdf5',
  accent2: '#d1fae5',
  text:    '#064e3b',
  muted:   '#6b7280',
  muted2:  '#9ca3af',
  red:     '#dc2626',
  hdr:     'linear-gradient(135deg,#022c22 0%,#064e3b 55%,#059669 100%)',
}

/* ── CopyBtn ─────────────────────────────────────────────────────────────── */
function CopyBtn({ text, ghost }) {
  const [ok, setOk] = useState(false)
  const go = e => {
    e.stopPropagation()
    if (window.electronAPI?.copyText) window.electronAPI.copyText(text)
    else {
      const el = Object.assign(document.createElement('textarea'),
        { value:text, style:'position:fixed;top:-9999px;opacity:0' })
      document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setOk(true); setTimeout(() => setOk(false), 1800)
  }
  return (
    <button onClick={go} style={{
      display:'flex', alignItems:'center', gap:4, padding:'4px 10px',
      borderRadius:7, flexShrink:0, cursor:'pointer', transition:'all .15s',
      fontSize:10, fontWeight:700,
      border: ghost
        ? `1px solid ${ok ? 'rgba(110,231,183,.6)' : 'rgba(255,255,255,.25)'}`
        : `1px solid ${ok ? G.primary : G.border2}`,
      background: ghost
        ? ok ? 'rgba(110,231,183,.2)' : 'rgba(255,255,255,.1)'
        : ok ? G.accent2 : '#fff',
      color: ghost
        ? ok ? '#6ee7b7' : 'rgba(255,255,255,.85)'
        : ok ? G.primary : G.muted,
      backdropFilter: ghost ? 'blur(4px)' : 'none',
    }}>
      <Icon name={ok ? 'check' : 'copy'} size={11} />{ok ? 'Copied!' : 'Copy'}
    </button>
  )
}

/* ── QuestionItem ─────────────────────────────────────────────────────────── */
function QItem({ q, selected, onClick, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding:'9px 12px', cursor:'pointer', transition:'all .13s',
        borderBottom:`1px solid ${G.accent2}`,
        borderLeft:`3px solid ${selected ? G.primary : 'transparent'}`,
        background: selected
          ? 'linear-gradient(90deg,#ecfdf5,#f7fffe)'
          : hov ? G.accent : 'transparent',
        position:'relative',
      }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:7 }}>
        <span style={{ flexShrink:0, marginTop:3, color:G.muted2 }}>
          <Icon name={q.manual ? 'keyboard' : 'mic'} size={12} />
        </span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, lineHeight:1.55, wordBreak:'break-word',
            color: selected ? G.dark : '#374151',
            fontWeight: selected ? 600 : 400 }}>
            {q.text}
          </div>
          <div style={{ fontSize:9, color:G.muted2, marginTop:2, fontVariantNumeric:'tabular-nums' }}>
            {new Date(q.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
          </div>
        </div>
        {/* delete */}
        {(hov || selected) && (
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            style={{ width:18, height:18, borderRadius:5, border:'none',
              background:'rgba(220,38,38,.1)', color:G.red, fontSize:10,
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              flexShrink:0, fontWeight:700, transition:'all .12s' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(220,38,38,.2)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(220,38,38,.1)'}>
            <Icon name="close" size={10} strokeWidth={2.2} />
          </button>
        )}
        {selected && (
          <div style={{ width:5, height:5, borderRadius:'50%', background:G.primary,
            flexShrink:0, marginTop:5, boxShadow:`0 0 5px ${G.primary}` }} />
        )}
      </div>
    </div>
  )
}

/* ── Dashboard ───────────────────────────────────────────────────────────── */
export default function Dashboard({ session, onLogout, onResetInterview, onGoSettings }) {
  const interviewContext = useSettingsStore(s => s.interviewContext)
  const isRunning        = useSessionStore(s => s.isRunning)
  const elapsed          = useSessionStore(s => s.elapsed)

  // Turns committed during the last session. Capture and generation live in
  // useInterviewSession (mounted in MainApp) so they survive the switch into
  // the floating panel; this page just reviews the result between sessions.
  const turns = useSessionStore(s => s.turns)

  const [selectedIdx, setSelectedIdx] = useState(null)
  const [manualInput, setManualInput] = useState('')
  // SESSION GATE 2026-08-29: starting is a network call now, and it can be
  // refused (no credits, revoked licence). Both states are surfaced by the bar.
  const [starting,   setStarting]   = useState(false)
  const [startError, setStartError] = useState(null)
  const hideWindow = () => window.electronAPI?.toggleOverlay?.()

  const answerRef = useRef(null)

  const questions = turns.map((t, i) => ({
    text: t.q, id: t.id, ts: t.ts, manual: t.source === 'manual', idx: i,
  }))
  const answer      = selectedIdx !== null ? (turns[selectedIdx]?.a ?? '') : ''
  const answerFor   = selectedIdx !== null ? (turns[selectedIdx]?.q ?? '') : ''
  const isGenerating = false

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')

  useEffect(() => {
    if (answerRef.current)
      answerRef.current.scrollTop = answerRef.current.scrollHeight
  }, [answer])

  // SESSION GATE 2026-08-29: asking anything needs an open metered session, so
  // a question typed here has to start one first — otherwise /api/ai/chat
  // answers 402 no_session and nothing appears.
  // const addManual = () => {
  //   const t = manualInput.trim(); if (!t) return
  //   setManualInput('')
  //   session.askManual(t)      // starting a question moves us into the panel
  // }
  const addManual = async () => {
    const t = manualInput.trim(); if (!t) return
    setManualInput('')
    if (!isRunning) {
      const started = await session.start()
      if (!started?.ok) return          // startError already shows the reason
    }
    session.askManual(t)        // starting a question moves us into the panel
  }

  const deleteQ = () => {}    // the turn log is immutable once a session ends
  const clearAll = () => setSelectedIdx(null)

  // SESSION GATE 2026-08-29: start() opens a metered session over the network
  // now, so it is async and can fail — out of credits, revoked licence, backend
  // unreachable. Entering the panel regardless would show a live-looking overlay
  // whose first question 402s.
  // const handleStartStop = () => (isRunning ? session.stop() : session.start())
  const handleStartStop = async () => {
    if (isRunning) { session.stop(); return }

    setStarting(true)
    setStartError(null)
    const result = await session.start()
    setStarting(false)

    if (!result?.ok) {
      setStartError(
        result?.code === 'out_of_credits'
          ? 'You have run out of credits. Top up to start a session.'
          : result?.reason || 'Could not start the session.'
      )
    }
  }

  const selQ = selectedIdx !== null ? questions[selectedIdx] : null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden',
      borderRadius:14, background:G.bg, fontFamily:'Inter,-apple-system,BlinkMacSystemFont,sans-serif' }}>

      {/* traffic light */}
      <div style={{ height:28, flexShrink:0, WebkitAppRegion:'drag',
        background:G.hdr, borderRadius:'14px 14px 0 0' }} />

      {/* ── Navbar ── */}
      <div style={{ flexShrink:0, WebkitAppRegion:'drag', background:G.hdr,
        padding:'0 14px 13px', boxShadow:'0 4px 24px rgba(2,44,34,.45)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:10, WebkitAppRegion:'no-drag' }}>
            <div style={{ width:34, height:34, borderRadius:11, fontSize:12, fontWeight:900,
              color:'#fff', letterSpacing:'-0.5px',
              background:'linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.08))',
              border:'1px solid rgba(255,255,255,.28)', backdropFilter:'blur(10px)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'inset 0 1px 0 rgba(255,255,255,.2), 0 2px 8px rgba(0,0,0,.2)' }}>IA</div>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:'#fff',
                lineHeight:1, letterSpacing:'-0.2px' }}>Smart Hire AI</div>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                <span style={{ fontSize:9, fontWeight:700, padding:'1px 7px', borderRadius:99,
                  background:'rgba(110,231,183,.18)', color:'#6ee7b7',
                  border:'1px solid rgba(110,231,183,.28)',
                  textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  {interviewContext.company}
                </span>
                <span style={{ fontSize:9, color:'rgba(255,255,255,.4)' }}>·</span>
                <span style={{ fontSize:10, color:'rgba(255,255,255,.6)', fontWeight:500 }}>
                  {interviewContext.role}
                </span>
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display:'flex', alignItems:'center', gap:6, WebkitAppRegion:'no-drag' }}>
            {isRunning && (
              <div style={{ display:'flex', alignItems:'center', gap:6, borderRadius:99,
                background:'rgba(110,231,183,.15)', border:'1px solid rgba(110,231,183,.28)',
                padding:'5px 12px', backdropFilter:'blur(8px)' }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'#6ee7b7',
                  boxShadow:'0 0 8px #6ee7b7', animation:'pulse 1.4s infinite' }} />
                <span style={{ fontSize:12, fontWeight:800, color:'#fff',
                  fontVariantNumeric:'tabular-nums', letterSpacing:'0.05em' }}>
                  {mm}:{ss}
                </span>
              </div>
            )}
            {/* Hide window */}
            <button onClick={hideWindow} title="Hide window (⌘⇧H)"
              style={{ width:32, height:32, borderRadius:9, fontSize:13, cursor:'pointer',
                background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.18)',
                color:'rgba(255,255,255,.8)', display:'flex', alignItems:'center',
                justifyContent:'center', transition:'all .15s', backdropFilter:'blur(8px)' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,.2)' }}
              onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,.1)' }}>
              <Icon name="eyeOff" size={14} />
            </button>
            {[{ icon:'<Icon name="gear" size={14} />', fn:onGoSettings, tip:'Settings' },
              { icon:'<Icon name="reset" size={14} />', fn:onResetInterview, tip:'Change interview' }].map(({ icon,fn,tip }) => (
              <button key={icon} onClick={fn} title={tip} style={{
                width:32, height:32, borderRadius:9, fontSize:14, cursor:'pointer',
                background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.18)',
                color:'rgba(255,255,255,.85)', display:'flex', alignItems:'center',
                justifyContent:'center', transition:'all .15s', backdropFilter:'blur(8px)' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.22)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}>
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Session bar ── */}
      <div style={{ flexShrink:0, padding:'8px 10px',
        borderBottom:`1px solid ${G.border}`, background:G.card,
        display:'flex', gap:8, alignItems:'center' }}>
        {/* START / STOP */}
        <button onClick={handleStartStop} disabled={starting} style={{
          flex:1, height:38, borderRadius:11, border:'none',
          cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1,
          color:'#fff', transition:'all .2s',
          fontWeight:800, fontSize:12, letterSpacing:'0.03em',
          display:'flex', alignItems:'center', justifyContent:'center', gap:7,
          background: isRunning
            ? 'linear-gradient(135deg,#991b1b,#dc2626)'
            : 'linear-gradient(135deg,#047857,#059669)',
          boxShadow: isRunning
            ? '0 2px 10px rgba(220,38,38,.35), inset 0 1px 0 rgba(255,255,255,.12)'
            : '0 2px 10px rgba(5,150,105,.35), inset 0 1px 0 rgba(255,255,255,.12)',
        }}>
          {isRunning ? (
            <>
              <div style={{ width:10, height:10, borderRadius:2, background:'#fff',
                boxShadow:'0 0 6px rgba(255,255,255,.5)', flexShrink:0 }} />
              Stop
            </>
          ) : (
            <>
              <div style={{ width:0, height:0, flexShrink:0,
                borderTop:'5px solid transparent', borderBottom:'5px solid transparent',
                borderLeft:'8px solid #fff', filter:'drop-shadow(0 0 3px rgba(255,255,255,.4))' }} />
              {starting ? 'Starting…' : 'Start Session'}
            </>
          )}
        </button>
      </div>

      {/* SESSION GATE 2026-08-29: why a start was refused. Out of credits is the
          common case and is not an error the user can fix by retrying. */}
      {startError && (
        <div style={{ flexShrink:0, padding:'8px 12px', background:'#fef2f2',
          borderBottom:`1px solid ${G.border}`, display:'flex', gap:7,
          alignItems:'center', color:G.red, fontSize:11, fontWeight:600 }}>
          <Icon name="warning" size={13} />
          <span style={{ flex:1 }}>{startError}</span>
          <button onClick={() => setStartError(null)} style={{
            border:'none', background:'none', cursor:'pointer',
            color:G.red, display:'flex', padding:2 }}>
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      {/* ── Two panels ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex' }}>

        {/* ══ LEFT: Questions ══ */}
        <div style={{ width:288, flexShrink:0, display:'flex', flexDirection:'column',
          borderRight:`1px solid ${G.border}`, background:G.card }}>

          {/* panel head */}
          <div style={{ padding:'9px 12px', borderBottom:`1px solid ${G.border}`, flexShrink:0,
            background:'linear-gradient(135deg,#f0fdf6,#ecfdf5)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:3, height:16, borderRadius:99, flexShrink:0,
                background: isRunning
                  ? 'linear-gradient(180deg,#059669,#34d399)'
                  : G.border2 }} />
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:G.dark,
                  textTransform:'uppercase', letterSpacing:'0.07em' }}>
                  {isRunning ? 'Capturing Live' : 'Questions'}
                </div>
                {isRunning && (
                  <div style={{ fontSize:9, color:G.primary, marginTop:1,
                    display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ display:'flex', gap:2 }}>
                      {[0,120,240].map(d=>(
                        <div key={d} style={{ width:3, height:3, borderRadius:'50%', background:G.primary,
                          animation:`bounce .9s ${d}ms infinite` }} />
                      ))}
                    </div>
                    Listening...
                  </div>
                )}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, fontWeight:800, padding:'2px 8px', borderRadius:99,
                background: questions.length > 0 ? G.accent2 : G.accent,
                color:G.primary, border:`1px solid ${G.border2}` }}>
                {questions.length}
              </span>
              {questions.length > 0 && (
                <button onClick={clearAll} title="Clear all"
                  style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:6,
                    border:`1px solid ${G.border2}`, background:G.accent,
                    color:G.muted, cursor:'pointer' }}
                  onMouseEnter={e=>{ e.currentTarget.style.color=G.red; e.currentTarget.style.borderColor=G.red; e.currentTarget.style.background='#fef2f2' }}
                  onMouseLeave={e=>{ e.currentTarget.style.color=G.muted; e.currentTarget.style.borderColor=G.border2; e.currentTarget.style.background=G.accent }}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* manual input */}
          <div style={{ padding:'8px 10px', borderBottom:`1px solid ${G.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', gap:6 }}>
              <input value={manualInput}
                onChange={e=>setManualInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addManual()}
                placeholder="Type a question manually..."
                style={{ flex:1, padding:'8px 10px', borderRadius:9, fontSize:11,
                  border:`1.5px solid ${G.border}`, background:G.accent,
                  color:G.dark, outline:'none', fontFamily:'inherit', transition:'border-color .15s' }}
                onFocus={e=>e.target.style.borderColor=G.primary}
                onBlur={e=>e.target.style.borderColor=G.border}
              />
              <button onClick={addManual} style={{
                width:34, height:34, borderRadius:9, border:'none', flexShrink:0,
                background:'linear-gradient(135deg,#059669,#047857)',
                color:'#fff', fontSize:20, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 2px 8px rgba(5,150,105,.3)',
              }}>+</button>
            </div>
          </div>

          {/* list */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {questions.length === 0 ? (
              <div style={{ padding:'28px 16px', textAlign:'center' }}>
                <div style={{ marginBottom:10, opacity:.4, color:G.primary }}><Icon name="mic" size={30} strokeWidth={1.4} /></div>
                <div style={{ fontSize:11, fontWeight:600, color:G.muted, marginBottom:5 }}>
                  {isRunning ? 'Listening for questions...' : 'No questions yet'}
                </div>
                <div style={{ fontSize:10, color:G.muted2, lineHeight:1.7 }}>
                  {isRunning
                    ? 'Speak clearly and pause.\nQuestions appear here automatically.'
                    : 'Start session or type a question above.'}
                </div>
              </div>
            ) : (
              questions.map((q, i) => (
                <QItem key={q.id} q={q}
                  selected={selectedIdx===i}
                  onClick={() => setSelectedIdx(i)}
                  onDelete={() => deleteQ(i)}
                />
              ))
            )}
          </div>
        </div>

        {/* ══ RIGHT: Answer ══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column',
          overflow:'hidden', background:G.bg }}>

          {/* panel head */}
          <div style={{ padding:'9px 14px', borderBottom:`1px solid ${G.border}`, flexShrink:0,
            background:'linear-gradient(135deg,#f0fdf6,#ecfdf5)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:3, height:16, borderRadius:99, flexShrink:0,
                background: isGenerating
                  ? 'linear-gradient(180deg,#059669,#34d399)' : G.border2 }} />
              <div>
                {/* PIVOT 2026-08-30: was "AI Answer". The panel shows follow-up
                    questions for the interviewer, not an answer to read out. */}
                <div style={{ fontSize:10, fontWeight:800, color:G.dark,
                  textTransform:'uppercase', letterSpacing:'0.07em' }}>Ask next</div>
                {isGenerating && (
                  <div style={{ fontSize:9, color:G.primary, marginTop:1,
                    display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ display:'flex', gap:2 }}>
                      {[0,100,200].map(d=>(
                        <div key={d} style={{ width:3, height:3, borderRadius:'50%',
                          background:G.primary, animation:`bounce .9s ${d}ms infinite` }} />
                      ))}
                    </div>
                    Generating...
                  </div>
                )}
              </div>
            </div>
            {answer && <CopyBtn text={answerFor ? `Q: ${answerFor}\n\nA: ${answer}` : answer} />}
          </div>

          {/* selected Q + generate */}
          <div style={{ padding:'11px 14px', borderBottom:`1px solid ${G.border}`,
            flexShrink:0, background:G.card,
            boxShadow:'0 2px 8px rgba(5,150,105,.05)' }}>
            {selQ ? (
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:9, fontWeight:800, color:G.primary,
                    textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>
                    Selected Question
                  </div>
                  <div style={{ fontSize:12, color:G.dark, lineHeight:1.55, fontWeight:500 }}>
                    {selQ.text}
                  </div>
                </div>
                <button onClick={() => session.askManual(selQ.text)} disabled={isGenerating}
                  style={{ padding:'9px 16px', borderRadius:10, border:'none',
                    fontWeight:800, fontSize:12, letterSpacing:'0.02em',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    color:'#fff', flexShrink:0, transition:'all .2s',
                    position:'relative', overflow:'hidden',
                    background: isGenerating
                      ? G.muted2
                      : 'linear-gradient(135deg,#059669,#047857)',
                    boxShadow: isGenerating ? 'none'
                      : '0 3px 12px rgba(5,150,105,.35),inset 0 1px 0 rgba(255,255,255,.15)',
                    opacity: isGenerating ? .65 : 1 }}>
                  {!isGenerating && (
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:'50%',
                      background:'linear-gradient(180deg,rgba(255,255,255,.12),transparent)',
                      pointerEvents:'none' }} />
                  )}
                  <span style={{ position:'relative' }}>
                    <Icon name={isGenerating ? 'clock' : 'sparkle'} size={13} />
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </span>
                </button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:7,
                fontSize:11, color:G.muted2 }}>
                <span style={{ color:G.muted2 }}><Icon name="arrowLeft" size={15} /></span>
                Select a question from the left to generate an answer
              </div>
            )}
          </div>

          {/* answer */}
          <div ref={answerRef} style={{ flex:1, overflowY:'auto', padding:'12px' }}>
            {answer ? (
              <div style={{ background:G.card, borderRadius:14, border:`1px solid ${G.border}`,
                padding:'14px', boxShadow:'0 2px 10px rgba(5,150,105,.07)' }}>
                <div style={{ fontSize:9, fontWeight:800, color:G.primary, textTransform:'uppercase',
                  letterSpacing:'0.07em', marginBottom:10,
                  display:'flex', alignItems:'center', gap:6 }}>
                  {/* PIVOT 2026-08-30: was "Answer". */}
                  <Icon name="bulb" size={13} /> Ask next
                </div>
                <div style={{ fontSize:12, color:'#1f2937', lineHeight:1.9,
                  whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                  {answer}
                  {isGenerating && (
                    <span style={{ display:'inline-block', width:2, height:14,
                      background:G.primary, marginLeft:2, verticalAlign:'middle',
                      animation:'blink 1s infinite' }} />
                  )}
                </div>
              </div>
            ) : (
              <div style={{ height:'100%', minHeight:180, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', textAlign:'center',
                padding:'20px', background:G.card, borderRadius:14,
                border:`1.5px dashed ${G.border2}` }}>
                {selQ ? (
                  <>
                    <div style={{ width:52, height:52, borderRadius:16, marginBottom:12,
                      background:'linear-gradient(135deg,#d1fae5,#a7f3d0)',
                      display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkle" size={22} /></div>
                    <div style={{ fontSize:13, fontWeight:700, color:G.dark, marginBottom:5 }}>
                      Ready to generate
                    </div>
                    <div style={{ fontSize:11, color:G.muted2, lineHeight:1.7, maxWidth:200 }}>
                      Click <strong style={{ color:G.primary }}>Generate</strong> to get a personalized AI answer
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width:52, height:52, borderRadius:16, marginBottom:12,
                      background:'linear-gradient(135deg,#d1fae5,#a7f3d0)',
                      display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="mic" size={22} strokeWidth={1.5} /></div>
                    <div style={{ fontSize:13, fontWeight:700, color:G.dark, marginBottom:5 }}>
                      Start your interview
                    </div>
                    <div style={{ fontSize:11, color:G.muted2, lineHeight:1.7, maxWidth:200 }}>
                      Start a session to capture live questions, or type one on the left
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ flexShrink:0, padding:'6px 12px 8px',
        background:G.card, borderTop:`1px solid ${G.border}`,
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {[['⌘⇧H','Show/Hide'],['⌘⇧M','Move']].map(([k,a]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <kbd style={{ fontSize:9, fontWeight:800, fontFamily:'monospace',
                background:G.accent, color:G.primary, border:`1px solid ${G.border2}`,
                borderRadius:5, padding:'2px 7px',
                boxShadow:'0 1px 2px rgba(5,150,105,.08)' }}>{k}</kbd>
              <span style={{ fontSize:10, color:G.muted }}>{a}</span>
            </div>
          ))}
        </div>
        <button onClick={() => onLogout?.()} style={{ fontSize:10, fontWeight:500,
          color:G.muted2, background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}
          onMouseEnter={e=>e.target.style.color=G.red}
          onMouseLeave={e=>e.target.style.color=G.muted2}>
          Sign out
        </button>
      </div>

      <style>{`
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes ping   { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(2.5);opacity:0} }
        ::-webkit-scrollbar       { width:4px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:${G.border2}; border-radius:99px }
        input::placeholder        { color:${G.muted2}; font-size:11px }
        button:active             { transform:scale(.97) }
      `}</style>
    </div>
  )
}