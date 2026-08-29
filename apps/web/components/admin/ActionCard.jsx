'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function ActionCard({ href, title, desc, icon, color, bg }) {
  const [hovered, setHovered] = useState(false)

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        style={{
          background: bg, borderRadius: 16, padding: '20px 22px',
          border: `1px solid ${color}20`,
          display: 'flex', alignItems: 'center', gap: 16,
          transition: 'all 0.2s', cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: hovered ? `0 8px 25px ${color}20` : 'none'
        }}
      >
        <div style={{
          fontSize: 28, width: 52, height: 52, background: '#fff',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0
        }}>
          {icon}
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{title}</p>
          <p style={{ fontSize: 12, color: '#64748b' }}>{desc}</p>
        </div>
        <svg style={{ marginLeft: 'auto', color, flexShrink: 0 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </Link>
  )
}