import { useEffect, useRef } from 'react'
import { useAI } from '../../hooks/useAI'
import { useSettingsStore } from '../../store/settingsStore'

export default function AnswerPanel({ question, isListening }) {
  const { answer, loading, error, askStream, clear } = useAI()
  const interviewContext = useSettingsStore((s) => s.interviewContext)
  const prevQuestionRef = useRef('')
  const answerRef = useRef(null)

  // Auto-ask when a new question comes in
  useEffect(() => {
    if (
      question &&
      question.trim().length > 5 &&
      question !== prevQuestionRef.current
    ) {
      prevQuestionRef.current = question
      askStream(question)
    }
  }, [question])

  // Auto-scroll as answer streams in
  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight
    }
  }, [answer])

  return (
    <div className="flex flex-col h-full bg-gray-950/95 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-400 font-medium">
            {isListening ? 'Listening...' : 'Waiting'}
          </span>
        </div>

        {/* Interview context badge */}
        {interviewContext.isSetup && (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full border border-blue-800/50">
              {interviewContext.role}
            </span>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
              {interviewContext.company}
            </span>
          </div>
        )}
      </div>

      {/* Question detected */}
      {question && (
        <div className="px-4 py-2.5 bg-gray-900/60 border-b border-gray-800/50">
          <p className="text-xs text-gray-500 mb-0.5 uppercase tracking-wide">Question</p>
          <p className="text-sm text-gray-200 leading-snug">{question}</p>
        </div>
      )}

      {/* Answer area */}
      <div
        ref={answerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {/* Loading state */}
        {loading && !answer && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-500">Generating answer...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
            <p className="text-xs text-red-400 font-medium mb-1">Error</p>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Answer streaming */}
        {answer && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Answer</p>
            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
              {answer}
              {/* Blinking cursor while streaming */}
              {loading && (
                <span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 animate-pulse align-middle" />
              )}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !answer && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="text-3xl mb-3">🎙️</div>
            <p className="text-sm text-gray-500">
              Start speaking — AI will answer in real time
            </p>
            {interviewContext.isSetup && (
              <p className="text-xs text-gray-600 mt-1">
                Answers tailored for {interviewContext.role} at {interviewContext.company}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {answer && !loading && (
        <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/60 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            {answer.split(' ').length} words
          </p>
          <button
            onClick={clear}
            className="text-xs text-gray-500 hover:text-gray-300 transition px-3 py-1 rounded-lg hover:bg-gray-800"
          >
            Clear ✕
          </button>
        </div>
      )}
    </div>
  )
}