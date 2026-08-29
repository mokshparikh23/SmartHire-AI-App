import React, { useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { CHAT_MODELS, verifyApiKey } from '../services/aiRouter'

const G = {
  bg:'#f0fdf6', card:'#ffffff', border:'#d1fae5', border2:'#a7f3d0',
  primary:'#059669', dark:'#064e3b', accent:'#ecfdf5', accent2:'#d1fae5',
  text:'#064e3b', text2:'#065f46', muted:'#6b7280', muted2:'#9ca3af',
  red:'#dc2626', hdr:'linear-gradient(135deg,#022c22 0%,#064e3b 55%,#059669 100%)',
}

const MODELS = CHAT_MODELS

const Label = ({ children }) => (
  <div style={{ fontSize:9, fontWeight:800, color:G.primary,
    textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
    {children}
  </div>
)

export default function Settings({ onBack }) {
  const { openaiKey, model, overlayOpacity, setOpenaiKey, setModel, setOverlayOpacity } = useSettingsStore()
  const [gKey, setGKey]       = useState(openaiKey || localStorage.getItem('openai_key') || '')
  const [saved, setSaved]     = useState(false)
  const [opacity, setOpacity] = useState(overlayOpacity ?? 90)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk]   = useState(null)

  const handleSave = () => {
    setOpenaiKey(gKey)
    localStorage.setItem('openai_key', gKey)
    setOverlayOpacity(opacity)
    window.electronAPI?.setOverlayOpacity?.(opacity / 100)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testKey = async () => {
    const key = gKey.trim()
    if (!key) return
    setTesting(true); setTestOk(null)
    try {
      setTestOk(await verifyApiKey(key))
    } catch { setTestOk(false) }
    finally { setTesting(false) }
  }

  const S = {
    card: {
      background:G.card, borderRadius:14, border:`1px solid ${G.border}`,
      boxShadow:'0 1px 4px rgba(5,150,105,.06)', overflow:'hidden', flexShrink:0,
    },
    head: {
      padding:'9px 13px', borderBottom:`1px solid ${G.border}`,
      background:'linear-gradient(135deg,#f0fdf6,#ecfdf5)',
      display:'flex', alignItems:'center', justifyContent:'space-between',
    },
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden',
      background:G.bg, fontFamily:'Inter,-apple-system,BlinkMacSystemFont,sans-serif' }}>

      {/* Traffic light */}
      <div style={{ height:28, flexShrink:0, WebkitAppRegion:'drag',
        background:G.hdr, borderRadius:'14px 14px 0 0' }} />

      {/* Header */}
      <div style={{ background:G.hdr, padding:'0 14px 13px', flexShrink:0,
        WebkitAppRegion:'drag', boxShadow:'0 4px 24px rgba(2,44,34,.45)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, WebkitAppRegion:'no-drag' }}>
          <button onClick={onBack} style={{
            width:32, height:32, borderRadius:9, fontSize:14, fontWeight:700,
            background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)',
            color:'#fff', cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', backdropFilter:'blur(8px)', transition:'all .15s',
          }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.22)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.12)'}>
            ←
          </button>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff', lineHeight:1 }}>Settings</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.55)', marginTop:2 }}>
              Configure API key and preferences
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px', display:'flex',
        flexDirection:'column', gap:8 }}>

        {/* ── OpenAI API Key ── */}
        <div style={S.card}>
          <div style={S.head}>
            <Label>OpenAI API Key</Label>
            <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:99,
              background:'linear-gradient(135deg,#059669,#047857)', color:'#fff',
              letterSpacing:'0.04em', textTransform:'uppercase',
              boxShadow:'0 2px 6px rgba(5,150,105,.3)' }}>Free</span>
          </div>
          <div style={{ padding:'12px 13px', display:'flex', flexDirection:'column', gap:10 }}>

            {/* Input row */}
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:600, color:G.dark }}>API Key</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {gKey && (
                    <span style={{ fontSize:9, fontWeight:700,
                      color: testOk === true ? G.primary : testOk === false ? G.red : G.primary }}>
                      {testOk === true ? '✓ Verified' : testOk === false ? '✗ Invalid' : '● Saved'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ position:'relative' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={gKey}
                  onChange={e => { setGKey(e.target.value); setTestOk(null) }}
                  placeholder="sk-..."
                  style={{ width:'100%', padding:'10px 52px 10px 12px', borderRadius:10,
                    fontSize:12, background:G.accent, border:`1.5px solid ${G.border2}`,
                    color:'#1f2937', outline:'none', boxSizing:'border-box', fontFamily:'monospace',
                    transition:'border-color .15s' }}
                  onFocus={e=>e.target.style.borderColor=G.primary}
                  onBlur={e=>e.target.style.borderColor=G.border2}
                />
                <button onClick={() => setShowKey(!showKey)} style={{
                  position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                  fontSize:10, fontWeight:600, color:G.muted, background:'none',
                  border:'none', cursor:'pointer', padding:'2px 4px' }}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Test + how-to */}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={testKey} disabled={!gKey.trim() || testing} style={{
                flex:1, padding:'8px 0', borderRadius:9, border:`1.5px solid ${G.border2}`,
                background: testOk === true ? G.accent2 : testOk === false ? '#fef2f2' : G.accent,
                color: testOk === true ? G.primary : testOk === false ? G.red : G.muted,
                fontSize:11, fontWeight:700, cursor: gKey.trim() ? 'pointer' : 'not-allowed',
                opacity: gKey.trim() ? 1 : 0.5, transition:'all .15s',
              }}>
                {testing ? '⏳ Testing...' : testOk === true ? '✓ Key works!' : testOk === false ? '✗ Invalid key' : 'Test Key'}
              </button>
            </div>

            <div style={{ background:G.accent, border:`1px solid ${G.border2}`,
              borderRadius:12, padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:G.dark, marginBottom:8 }}>
                Get your OpenAI key:
              </div>
              {[
                ['1', 'Go to platform.openai.com'],
                ['2', 'Sign in and add billing'],
                ['3', 'API keys → Create new secret key'],
                ['4', 'Copy key (starts with sk-)'],
              ].map(([n, s]) => (
                <div key={n} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0,
                    background:'linear-gradient(135deg,#059669,#047857)', color:'#fff',
                    fontSize:9, fontWeight:800, display:'flex', alignItems:'center',
                    justifyContent:'center', boxShadow:'0 1px 4px rgba(5,150,105,.3)' }}>{n}</div>
                  <span style={{ fontSize:11, color:G.text2 }}>{s}</span>
                </div>
              ))}
              <div style={{ fontSize:10, fontWeight:700, color:G.primary, marginTop:6,
                paddingTop:6, borderTop:`1px solid ${G.border2}`,
                display:'flex', alignItems:'center', gap:5 }}>
                <span>🆓</span> Free tier: 14,400 requests/day
              </div>
            </div>
          </div>
        </div>

        {/* ── AI Model ── */}
        <div style={S.card}>
          <div style={S.head}>
            <Label>AI Model</Label>
            <span style={{ fontSize:10, color:G.muted2 }}>
              Currently: <strong style={{ color:G.primary }}>
                {MODELS.find(m=>m.id===model)?.label ?? model}
              </strong>
            </span>
          </div>
          <div style={{ padding:'10px 12px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {MODELS.map(m => (
              <button key={m.id} onClick={() => setModel(m.id)} style={{
                padding:'10px', borderRadius:12, textAlign:'left', cursor:'pointer',
                transition:'all .15s', position:'relative', overflow:'hidden',
                border: `1.5px solid ${model===m.id ? G.primary : G.border}`,
                background: model===m.id
                  ? 'linear-gradient(135deg,#059669,#047857)'
                  : G.accent,
                boxShadow: model===m.id
                  ? '0 3px 10px rgba(5,150,105,.25), inset 0 1px 0 rgba(255,255,255,.15)'
                  : 'none',
              }}
                onMouseEnter={e=>{ if(model!==m.id) e.currentTarget.style.borderColor=G.primary }}
                onMouseLeave={e=>{ if(model!==m.id) e.currentTarget.style.borderColor=G.border }}>
                {model===m.id && (
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:'50%',
                    background:'linear-gradient(180deg,rgba(255,255,255,.1),transparent)',
                    pointerEvents:'none' }} />
                )}
                <div style={{ fontSize:10, marginBottom:3 }}>{m.badge}</div>
                <div style={{ fontSize:11, fontWeight:700,
                  color: model===m.id ? '#fff' : G.dark }}>{m.label}</div>
                <div style={{ fontSize:10, marginTop:1,
                  color: model===m.id ? 'rgba(255,255,255,.7)' : G.muted }}>{m.desc}</div>
                {model===m.id && (
                  <div style={{ position:'absolute', top:7, right:8, width:6, height:6,
                    borderRadius:'50%', background:'#6ee7b7',
                    boxShadow:'0 0 5px #6ee7b7' }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Overlay Opacity ── */}
        <div style={S.card}>
          <div style={S.head}>
            <Label>Overlay Opacity</Label>
            <span style={{ fontSize:13, fontWeight:800, color:G.primary,
              fontVariantNumeric:'tabular-nums' }}>{opacity}%</span>
          </div>
          <div style={{ padding:'10px 13px' }}>
            <div style={{ position:'relative', height:6, borderRadius:99,
              background:G.border, marginBottom:10, cursor:'pointer' }}>
              <div style={{ position:'absolute', left:0, top:0, bottom:0, borderRadius:99,
                background:'linear-gradient(90deg,#059669,#34d399)',
                width:`${((opacity-20)/80)*100}%`, transition:'width .1s' }} />
              <input type="range" min={20} max={100} value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                style={{ position:'absolute', inset:'-8px 0', opacity:0,
                  width:'100%', cursor:'pointer' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:10, color:G.muted2 }}>20% — Ghost</span>
              <span style={{ fontSize:10, color:G.muted2 }}>100% — Solid</span>
            </div>
          </div>
        </div>

        {/* ── How it works ── */}
        <div style={S.card}>
          <div style={S.head}>
            <Label>How it works</Label>
          </div>
          <div style={{ padding:'10px 13px', display:'flex', flexDirection:'column', gap:7 }}>
            {[
              ['🎙', 'Mic captures interview questions live'],
              ['✍️', 'OpenAI Whisper transcribes speech to text'],
              ['🤖', 'OpenAI generates personalized answers'],
              ['⚡', 'Answers stream in real time'],
              ['🔑', 'Uses your own OpenAI API key'],
            ].map(([icon, text]) => (
              <div key={text} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{icon}</span>
                <span style={{ fontSize:11, color:G.text2, lineHeight:1.4 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Save ── */}
        <button onClick={handleSave} style={{
          width:'100%', padding:'13px 0', borderRadius:13, border:'none',
          fontWeight:800, fontSize:13, color:'#fff', cursor:'pointer',
          position:'relative', overflow:'hidden', flexShrink:0,
          background: saved
            ? 'linear-gradient(135deg,#16a34a,#15803d)'
            : 'linear-gradient(135deg,#059669,#047857)',
          boxShadow: saved
            ? '0 4px 16px rgba(22,163,74,.4), inset 0 1px 0 rgba(255,255,255,.15)'
            : '0 4px 16px rgba(5,150,105,.35), inset 0 1px 0 rgba(255,255,255,.15)',
          transition:'all .2s',
        }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:'50%',
            background:'linear-gradient(180deg,rgba(255,255,255,.12),transparent)',
            pointerEvents:'none' }} />
          <span style={{ position:'relative' }}>
            {saved ? '✓ Saved!' : 'Save Settings'}
          </span>
        </button>

        <div style={{ height:4 }} />
      </div>

      <style>{`
        ::-webkit-scrollbar       { width:4px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:${G.border2}; border-radius:99px }
        button:active             { transform:scale(.97) }
        input::placeholder        { color:${G.muted2} }
      `}</style>
    </div>
  )
}