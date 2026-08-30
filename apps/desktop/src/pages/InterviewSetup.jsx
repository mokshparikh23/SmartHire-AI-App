import { useState, useRef } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import Icon from '../components/ui/Icon'

const G = {
  bg:'#f7fdf9', card:'#ffffff', border:'#d1fae5', border2:'#a7f3d0',
  primary:'#059669', accent:'#ecfdf5', accent2:'#d1fae5',
  text:'#064e3b', text2:'#065f46', muted:'#6b7280', muted2:'#9ca3af',
  red:'#dc2626', redBg:'#fef2f2',
}

const STEPS = ['Company & Role', 'Resume', 'Job Description']

export default function InterviewSetup({ onComplete }) {
  const setInterviewContext = useSettingsStore(s=>s.setInterviewContext)
  const [step,setStep] = useState(0)
  // PIVOT 2026-08-30: resumeConsent added. buildSystemPrompt() drops the résumé
  // entirely unless this is true, so an unticked box is not a soft warning —
  // the text never reaches the model.
  // const [form,setForm] = useState({ company:'', role:'', resume:'', jobDescription:'' })
  const [form,setForm] = useState({ company:'', role:'', resume:'', jobDescription:'', resumeConsent:false })
  const [resumeFileName,setResumeFileName] = useState('')
  const [parsing,setParsing] = useState(false)
  const [parseSuccess,setParseSuccess] = useState(false)
  const [error,setError] = useState('')
  const fileRef = useRef()

  const update = (f,v) => { setForm(p=>({...p,[f]:v})); setError('') }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if(!file) return
    setResumeFileName(file.name); setParseSuccess(false); setError('')
    if(file.type==='text/plain'){ update('resume',(await file.text()).trim()); setParseSuccess(true); return }
    if(file.type==='application/pdf'){
      setParsing(true)
      try{
        const r = await window.electronAPI.parsePdf(file.path)
        if(r.success&&r.text?.trim()){update('resume',r.text.trim());setParseSuccess(true)}
        else setError('Could not extract text. Please paste below.')
      }catch{ setError('Failed to parse. Please paste below.') }
      finally{ setParsing(false) }
      return
    }
    setError('Upload PDF or .txt only.')
  }

  const next = () => {
    if(step===0){
      if(!form.company.trim()) return setError('Please enter company name.')
      if(!form.role.trim()) return setError('Please enter job role.')
    }
    // PIVOT 2026-08-30: a résumé with no confirmed consent is a dead weight —
    // buildSystemPrompt() would silently drop it and the interviewer would spend
    // the interview wondering why no follow-up ever cites it. Better to stop
    // here and make the choice explicit: confirm, or clear the text.
    if(step===1 && form.resume.trim() && !form.resumeConsent){
      return setError('Confirm the candidate agreed to their résumé being used, or clear it.')
    }
    setError('')
    if(step<STEPS.length-1) setStep(step+1)
    else{ setInterviewContext(form); onComplete() }
  }

  /**
   * PIVOT 2026-08-30: skipping the résumé step discards whatever is in the box
   * along with any consent given for it, then advances. Leaving the text behind
   * would send it to the model on the strength of a box ticked before the
   * interviewer changed their mind.
   */
  const skip = () => {
    if(step===1){
      setForm(p=>({ ...p, resume:'', resumeConsent:false }))
      setResumeFileName(''); setParseSuccess(false)
      setError(''); setStep(2)
      return
    }
    // Step 2 skips the JOB DESCRIPTION, not the résumé — that decision was
    // already made and consented to on the previous step, so `form` goes through
    // untouched.
    setError('')
    setInterviewContext(form)
    onComplete()
  }

  const inputStyle = {
    width:'100%', padding:'11px 14px', borderRadius:12, fontSize:12,
    background:G.accent, border:`1.5px solid ${G.border2}`, color:'#1f2937',
    outline:'none', boxSizing:'border-box', fontFamily:'Inter,-apple-system,sans-serif',
    transition:'border-color 0.15s',
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:G.bg, fontFamily:'Inter,-apple-system,sans-serif', overflow:'hidden', borderRadius:14 }}>

      {/* Traffic light */}
      <div style={{ height:28, flexShrink:0, WebkitAppRegion:'drag',
        background:'linear-gradient(135deg,#064e3b,#059669)', borderRadius:'14px 14px 0 0' }} />

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#064e3b,#059669)', padding:'0 16px 18px', flexShrink:0, WebkitAppRegion:'drag', textAlign:'center' }}>
        <div style={{ width:40, height:40, borderRadius:14, background:'rgba(255,255,255,0.2)',
          backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.3)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:14, fontWeight:800, color:'#fff', margin:'0 auto 10px' }}>IA</div>
        <div style={{ fontSize:15, fontWeight:800, color:'#fff', lineHeight:1 }}>Interview Setup</div>
        {/* PIVOT 2026-08-30: was "Personalize your AI answers" — this app does
            not write answers any more. See services/systemPrompt.js. */}
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:4 }}>Set up the questions it suggests</div>
      </div>

      {/* Steps */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${G.border}`, padding:'12px 16px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0 }}>
          {STEPS.map((label,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, fontWeight:800, transition:'all 0.2s',
                  background: i<step?G.primary:i===step?'#fff':G.accent,
                  border: `2px solid ${i<=step?G.primary:G.border}`,
                  color: i<step?'#fff':i===step?G.primary:G.muted2 }}>
                  {i<step ? <Icon name="check" size={11} strokeWidth={2.4} /> : i+1}
                </div>
                <span style={{ fontSize:9, fontWeight:700, marginTop:4, whiteSpace:'nowrap',
                  color: i===step?G.primary:i<step?G.primary:G.muted2 }}>{label}</span>
              </div>
              {i<STEPS.length-1&&(
                <div style={{ width:32, height:2, margin:'0 4px', marginBottom:14, background:i<step?G.primary:G.border, borderRadius:99, transition:'all 0.2s' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
        <div style={{ background:G.card, border:`1px solid ${G.border}`, borderRadius:16,
          boxShadow:'0 1px 4px rgba(5,150,105,0.06)', padding:'16px' }}>

          {/* Step 0 */}
          {step===0&&(
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:G.text, marginBottom:6 }}>
                  Company Name <span style={{ color:G.red }}>*</span>
                </label>
                <input autoFocus value={form.company} onChange={e=>update('company',e.target.value)}
                  placeholder="e.g. Google, Amazon, TCS, Infosys" style={inputStyle}
                  onFocus={e=>e.target.style.borderColor=G.primary}
                  onBlur={e=>e.target.style.borderColor=G.border2} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:G.text, marginBottom:6 }}>
                  Job Role <span style={{ color:G.red }}>*</span>
                </label>
                <input value={form.role} onChange={e=>update('role',e.target.value)}
                  placeholder="e.g. Software Engineer, SDE-2" style={inputStyle}
                  onFocus={e=>e.target.style.borderColor=G.primary}
                  onBlur={e=>e.target.style.borderColor=G.border2} />
              </div>
              {form.company&&form.role&&(
                <div style={{ background:G.accent, border:`1px solid ${G.border2}`, borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ display:'flex', color:G.primary }}><Icon name="check" size={13} strokeWidth={2.4} /></span>
                  {/* PIVOT 2026-08-30: was "Tailored answers for …". */}
                  <span style={{ fontSize:11, color:G.text2 }}>
                    Follow-ups tuned for <strong>{form.role}</strong> at <strong>{form.company}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Step 1 */}
          {step===1&&(
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, fontWeight:700, color:G.text }}>Resume</span>
                <span style={{ fontSize:9, fontWeight:700, background:G.accent, color:G.muted, border:`1px solid ${G.border}`, borderRadius:99, padding:'2px 8px', textTransform:'uppercase', letterSpacing:'0.04em' }}>optional</span>
              </div>

              {/* Upload zone */}
              <div onClick={()=>fileRef.current.click()}
                style={{ border:`2px dashed ${parseSuccess?G.primary:G.border2}`, borderRadius:14,
                  background: parseSuccess?G.accent:G.bg, padding:'16px 12px', textAlign:'center', cursor:'pointer',
                  transition:'all 0.15s' }}
                onMouseEnter={e=>{ if(!parseSuccess) e.currentTarget.style.borderColor=G.primary }}
                onMouseLeave={e=>{ if(!parseSuccess) e.currentTarget.style.borderColor=G.border2 }}>
                {parsing?(
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                    <div style={{ display:'flex', gap:5 }}>
                      {[0,150,300].map(d=><div key={d} style={{ width:8, height:8, borderRadius:'50%', background:G.primary, animation:`bounce 1s ${d}ms infinite` }}/>)}
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, color:G.primary }}>Parsing PDF...</span>
                  </div>
                ):parseSuccess?(
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:G.accent2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, marginBottom:2 }}><Icon name="check" size={20} strokeWidth={2.2} /></div>
                    <div style={{ fontSize:12, fontWeight:700, color:G.primary }}>{resumeFileName}</div>
                    <div style={{ fontSize:10, color:G.muted }}>{form.resume.length} chars extracted · click to change</div>
                  </div>
                ):(
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:G.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, marginBottom:2 }}><Icon name="upload" size={20} /></div>
                    <div style={{ fontSize:12, fontWeight:600, color:G.text }}>Upload PDF or .txt</div>
                    <div style={{ fontSize:10, color:G.muted2 }}>Text extracted automatically</div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".txt,.pdf" onChange={handleFileUpload} style={{ display:'none' }} />
              </div>

              <textarea value={form.resume}
                onChange={e=>{ update('resume',e.target.value); setParseSuccess(false); setResumeFileName('') }}
                placeholder="Or paste resume text here..."
                rows={4}
                style={{ ...inputStyle, resize:'none', fontFamily:'monospace', fontSize:11, lineHeight:1.5 }}
                onFocus={e=>e.target.style.borderColor=G.primary}
                onBlur={e=>e.target.style.borderColor=G.border2} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                {/* PIVOT 2026-08-30: was "Skip for generic answers". */}
                <span style={{ fontSize:10, color:G.muted2 }}>
                  {form.resume.length>0?`${form.resume.length} chars`:'Skip to work from the conversation alone'}
                </span>
                {form.resume.length>0&&(
                  <button onClick={()=>{ update('resume',''); update('resumeConsent',false); setResumeFileName(''); setParseSuccess(false) }}
                    style={{ fontSize:10, fontWeight:600, color:G.muted2, background:'none', border:'none', cursor:'pointer' }}
                    onMouseEnter={e=>e.target.style.color=G.red}
                    onMouseLeave={e=>e.target.style.color=G.muted2}>Clear</button>
                )}
              </div>

              {/*
                PIVOT 2026-08-30: the consent gate the site has been advertising
                since the pivot. Only rendered once there is a résumé to consent
                to — an empty checkbox above an empty box is noise, and there is
                nothing to authorise yet.
              */}
              {form.resume.trim().length>0&&(
                <label
                  style={{ display:'flex', alignItems:'flex-start', gap:9, cursor:'pointer',
                    background: form.resumeConsent?G.accent:G.bg,
                    border:`1.5px solid ${form.resumeConsent?G.primary:G.border2}`,
                    borderRadius:12, padding:'10px 12px', transition:'all 0.15s' }}>
                  <input
                    type="checkbox"
                    checked={form.resumeConsent}
                    onChange={e=>update('resumeConsent', e.target.checked)}
                    style={{ marginTop:1, width:14, height:14, accentColor:G.primary, cursor:'pointer', flexShrink:0 }} />
                  <span style={{ fontSize:10.5, lineHeight:1.5, color:G.text2 }}>
                    The candidate knows this résumé is being used to shape the
                    questions I ask them.
                    <span style={{ display:'block', color:G.muted, marginTop:3 }}>
                      Without this the résumé is left out of the prompt entirely.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Step 2 */}
          {step===2&&(
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, fontWeight:700, color:G.text }}>Job Description</span>
                <span style={{ fontSize:9, fontWeight:700, background:G.accent, color:G.muted, border:`1px solid ${G.border}`, borderRadius:99, padding:'2px 8px', textTransform:'uppercase', letterSpacing:'0.04em' }}>optional</span>
              </div>
              <textarea value={form.jobDescription} onChange={e=>update('jobDescription',e.target.value)}
                placeholder="Paste job description here..." rows={4}
                style={{ ...inputStyle, resize:'none', lineHeight:1.6 }}
                onFocus={e=>e.target.style.borderColor=G.primary}
                onBlur={e=>e.target.style.borderColor=G.border2} />

              {/* Summary */}
              <div style={{ background:G.accent, border:`1px solid ${G.border2}`, borderRadius:12, padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                <span style={{ fontSize:10, fontWeight:800, color:G.primary, textTransform:'uppercase', letterSpacing:'0.06em' }}>Ready to start</span>
                {[
                  ['Company', form.company],
                  ['Role',    form.role],
                  ['Resume',  form.resume ? `${form.resume.length} chars` : null],
                  // PIVOT 2026-08-30: surfaced here so the last thing seen before
                  // starting is what the candidate has and has not agreed to.
                  // The unapproved string is quoted verbatim on the marketing
                  // site's consent section. Keep the two in step.
                  ...(form.resume ? [['Consent', form.resumeConsent ? 'Approved' : 'Not approved — unused']] : []),
                  ['JD',      form.jobDescription ? `${form.jobDescription.length} chars` : null],
                ].map(([label,value])=>(
                  <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:11, color:G.muted }}>{label}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:value?G.primary:G.muted2 }}>{value||'Not provided'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error&&(
            <div style={{ marginTop:12, background:G.redBg, border:`1px solid #fecaca`, borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:8 }}>
              <span><Icon name="warning" size={13} /></span>
              <span style={{ fontSize:11, color:G.red }}>{error}</span>
            </div>
          )}

          {/* Nav */}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            {step>0&&(
              <button onClick={()=>{ setStep(step-1); setError('') }}
                style={{ padding:'11px 16px', borderRadius:12, fontSize:12, fontWeight:700,
                  background:G.accent, color:G.primary, border:`1.5px solid ${G.border2}`, cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background=G.accent2}
                onMouseLeave={e=>e.currentTarget.style.background=G.accent}>← Back</button>
            )}
            <button onClick={next} disabled={parsing}
              style={{ flex:1, padding:'12px 0', borderRadius:12, fontSize:13, fontWeight:800,
                color:'#fff', border:'none', cursor:parsing?'not-allowed':'pointer',
                background:'linear-gradient(135deg,#059669,#047857)',
                boxShadow:'0 4px 14px rgba(5,150,105,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                opacity:parsing?0.6:1 }}>
              {step===STEPS.length-1?'Start Interview':'Continue →'}
            </button>
          </div>
        </div>

        {step>=1&&(
          <div style={{ textAlign:'center', marginTop:10 }}>
            {/*
              PIVOT 2026-08-30: "Skip resume" now actually discards it. It used
              to call next() straight through, which since the consent gate would
              mean a skip that refuses to advance while a résumé sits in the box
              — asking someone to consent to something they just said to skip.
            */}
            <button onClick={skip} style={{ fontSize:11, color:G.muted2, background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
              {step===1?'Skip resume →':'Skip and start →'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${G.border2};border-radius:99px}
      `}</style>
    </div>
  )
}