import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill="white"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Interview Assistant</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-4 py-2">
            Log in
          </Link>
          <Link href="/signup" className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-sm">
            Get started free
          </Link>
        </div>
      </nav>
      <section className="text-center px-6 pt-20 pb-28 max-w-4xl mx-auto">
        <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          Ace every interview with
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"> AI assistance</span>
        </h1>
        <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          Real-time AI answers. Completely invisible to your interviewer.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/signup" className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-indigo-200 text-sm">
            Start for free
          </Link>
          <Link href="/login" className="px-8 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all text-sm">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  )
}
