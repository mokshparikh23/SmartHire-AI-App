'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function StatCard({ label, value, change, icon, color, bg, href }) {
  const [hovered, setHovered] = useState(false)

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        style={{
          background: '#fff', borderRadius: 16, padding: '20px 22px',
          border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'all 0.2s',
          boxShadow: hovered ? '0 8px 25px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: bg, color: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {icon}
          </div>
          {change && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 20 }}>
              {change}
            </span>
          )}
        </div>
        <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{value}</p>
        <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{label}</p>
      </div>
    </Link>
  )
}