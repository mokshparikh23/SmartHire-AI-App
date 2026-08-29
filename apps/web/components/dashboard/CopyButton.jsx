'use client'

import { useState } from 'react'
import Icon from '@/components/ui/Icon'

export default function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard can be blocked; leaving the label unchanged is the honest cue
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} className={copied ? 'text-positive' : ''} />
      {copied ? 'Copied' : label}
    </button>
  )
}
