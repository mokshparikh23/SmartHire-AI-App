import React, { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../store/settingsStore'

export default function Overlay() {
  const [answer,setAnswer]         = useState('')
  const [transcript,setTranscript] = useState('')
  const [isThinking,setIsThinking] = useState(false)
  const interviewContext = useSettingsStore(s=>s.interviewContext)
  const answerRef = useRef(null)

  useEffect(()=>{
    if(!window.electronAPI) return
    const unsub = window.electronAPI.onTranscript?.((data)=>{
      setTranscript(data.text||''); setIsThinking(true); setAnswer('')
    })
    return unsub
  },[])

  useEffect(()=>{
    if(!window.electronAPI) return
    const unsub = window.electronAPI.onAnswer((data)=>{
      setIsThinking(false)
      if(data.chunk) setAnswer(p=>p+data.chunk)
      else setAnswer(data.text||'')
    })
    return unsub
  },[])

  useEffect(()=>{
    if(answerRef.current) answerRef.current.scrollTop=answerRef.current.scrollHeight
  },[answer])

  return (
    <div style={{ width:'100%', height:'100vh', background:'transparent', padding:8, boxSizing:'border-box', fontFamily:'Inter,-apple-system,sans-serif' }}>
      <div style={{
        borderRadius:16, overflow:'hidden',
        border:'1px solid rgba(167,243,208,0.4)',
        background:'rgba(255,255,255,0.97)',
        backdropFilter:'blur(20px)',
        boxShadow:'0 8px 32px rgba(5,150,105,0.12), 0 2px 8px rgba(0,0,0,0.08)',
      }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'8px 14px', WebkitAppRegion:'drag',
          background:'linear-gradient(135deg,#064e3b,#059669)',
          borderBottom:'1px solid rgba(167,243,208,0.3)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:22, height:22, borderRadius:7, background:'rgba(255,255,255,0.2)',
              border:'1px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:9, fontWeight:800, color:'#fff' }}>IA</div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:'50%',
                background: isThinking?'#fbbf24':'#6ee7b7',
                boxShadow: isThinking?'0 0 6px #fbbf24':'0 0 6px #6ee7b7',
                animation:'pulse 1.5s infinite' }} />
              <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.9)' }}>
                {isThinking?'Thinking...':'Listening'}
              </span>
            </div>
          </div>

          {interviewContext?.isSetup&&(
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:9, fontWeight:700, background:'rgba(255,255,255,0.2)',
                color:'#fff', padding:'2px 8px', borderRadius:99, border:'1px solid rgba(255,255,255,0.25)' }}>
                {interviewContext.role}
              </span>
              <span style={{ fontSize:9, color:'rgba(255,255,255,0.6)' }}>@ {interviewContext.company}</span>
            </div>
          )}

          <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)', fontWeight:500 }}>🔒 hidden</span>
        </div>

        {/* Question */}
        {transcript&&(
          <div style={{ padding:'8px 14px', background:'#f0fdf4', borderBottom:'1px solid #d1fae5' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#059669', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>🎙 Question</div>
            <div style={{ fontSize:11, color:'#374151', lineHeight:1.5 }}>{transcript}</div>
          </div>
        )}

        {/* Answer */}
        <div ref={answerRef} style={{ padding:'10px 14px', maxHeight:440, overflowY:'auto' }}>
          {isThinking&&!answer&&(
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', gap:4 }}>
                {[0,150,300].map(d=>(
                  <div key={d} style={{ width:7, height:7, borderRadius:'50%', background:'#059669', animation:`bounce 1s ${d}ms infinite` }}/>
                ))}
              </div>
              <span style={{ fontSize:11, color:'#6b7280' }}>Generating answer...</span>
            </div>
          )}

          {answer&&(
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'#059669', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>💡 Answer</div>
              <div style={{ fontSize:12, color:'#1f2937', lineHeight:1.8, whiteSpace:'pre-wrap' }}>
                {answer}
                {isThinking&&<span style={{ display:'inline-block', width:2, height:14, background:'#059669', marginLeft:2, verticalAlign:'middle', animation:'blink 1s infinite' }}/>}
              </div>
            </div>
          )}

          {!isThinking&&!answer&&(
            <div style={{ textAlign:'center', padding:'16px 0' }}>
              <div style={{ fontSize:20, marginBottom:6 }}>🎙</div>
              <div style={{ fontSize:11, color:'#9ca3af' }}>
                {interviewContext?.isSetup?`Ready for ${interviewContext.company} · speak a question`:'Waiting for question...'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {answer&&!isThinking&&(
          <div style={{ padding:'6px 14px 8px', borderTop:'1px solid #f0fdf4', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f9fffe' }}>
            <span style={{ fontSize:10, color:'#9ca3af' }}>{answer.split(' ').length} words</span>
            <button onClick={()=>{ setAnswer(''); setTranscript('') }}
              style={{ fontSize:10, fontWeight:700, color:'#9ca3af', background:'none', border:'none', cursor:'pointer' }}
              onMouseEnter={e=>e.target.style.color='#dc2626'}
              onMouseLeave={e=>e.target.style.color='#9ca3af'}>Clear ✕</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#a7f3d0;border-radius:99px}
      `}</style>
    </div>
  )
}