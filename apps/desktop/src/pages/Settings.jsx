import React, { useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { CHAT_MODELS } from '../services/aiRouter'
import Icon from '../components/ui/Icon'

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
  const { model, overlayOpacity, setModel, setOverlayOpacity } = useSettingsStore()
  const [saved, setSaved]     = useState(false)
  const [opacity, setOpacity] = useState(overlayOpacity ?? 90)

  const handleSave = () => {
    setOverlayOpacity(opacity)
    window.electronAPI?.setOverlayOpacity?.(opacity / 100)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
      borderRadius:14, background:G.bg, fontFamily:'Inter,-apple-system,BlinkMacSystemFont,sans-serif' }}>

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
            <Icon name="arrowLeft" size={15} />
          </button>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff', lineHeight:1 }}>Settings</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.55)', marginTop:2 }}>
              Choose your model and overlay
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px', display:'flex',
        flexDirection:'column', gap:8 }}>

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
              ['mic',   'Mic captures interview questions live'],
              ['pen',   'OpenAI Whisper transcribes speech to text'],
              ['robot', 'OpenAI generates personalized answers'],
              ['bolt',  'Answers stream in real time'],
              ['lock',  'No API key needed — your licence covers it'],
            ].map(([icon, text]) => (
              <div key={text} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ flexShrink:0, color:G.primary }}><Icon name={icon} size={14} /></span>
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
            {saved ? 'Saved' : 'Save Settings'}
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