'use client'

import { useState } from 'react'

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-4 shrink-0 transition-colors"
    >
      {copied ? '✓ Copied!' : 'Copy'}
    </button>
  )
}