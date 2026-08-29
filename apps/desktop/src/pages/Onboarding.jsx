import React, { useState } from 'react'

const steps = [
  {
    title: 'Welcome to Interview Assistant',
    desc: 'Your AI-powered co-pilot for interviews. Invisible to your interviewer, visible only to you.',
    icon: '👋'
  },
  {
    title: 'Invisible overlay',
    desc: 'A floating panel sits on your screen. When you share your screen, it is completely hidden from the interviewer.',
    icon: '🛡️'
  },
  {
    title: 'Voice powered',
    desc: 'It listens to the interviewer\'s question via your microphone and automatically generates an AI answer.',
    icon: '🎤'
  },
  {
    title: 'Add your API key',
    desc: 'Go to Settings and paste your OpenAI or Anthropic API key to power the AI answers.',
    icon: '🔑'
  }
]

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const isLast = step === steps.length - 1

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0f0f0f] text-white p-8">
      <div className="w-full max-w-sm">
        {/* Step indicator */}
        <div className="flex gap-1.5 justify-center mb-10">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step ? 'w-6 bg-indigo-500' : 'w-3 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-6">{steps[step].icon}</div>
          <h2 className="text-xl font-semibold mb-3">{steps[step].title}</h2>
          <p className="text-sm text-gray-400 leading-relaxed">{steps[step].desc}</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3 rounded-xl text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
            >
              Back
            </button>
          )}
          <a
            href={isLast ? '#/' : undefined}
            onClick={!isLast ? () => setStep(s => s + 1) : undefined}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all text-center cursor-pointer"
          >
            {isLast ? 'Get Started' : 'Next'}
          </a>
        </div>
      </div>
    </div>
  )
}