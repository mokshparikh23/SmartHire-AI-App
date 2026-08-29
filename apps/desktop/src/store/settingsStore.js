import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
  persist(
    (set) => ({
      // ── Model ───────────────────────────────────────────────────────────────
      // Installs from before the OpenAI switch have a Groq or Claude model name
      // persisted here; resolveModel() in services/aiRouter.js falls back to the
      // default, and the server re-checks it against its own allowlist.
      model: 'gpt-4o',
      setModel: (m) => set({ model: m }),

      // ── Overlay opacity ─────────────────────────────────────────────────────
      overlayOpacity: 90,
      setOverlayOpacity: (o) => set({ overlayOpacity: o }),

      // ── Interview context ───────────────────────────────────────────────────
      interviewContext: {
        company: '',
        role: '',
        resume: '',
        jobDescription: '',
        isSetup: false,
      },
      setInterviewContext: (ctx) =>
        set((s) => ({
          interviewContext: { ...s.interviewContext, ...ctx, isSetup: true },
        })),
      clearInterviewContext: () =>
        set({
          interviewContext: {
            company: '',
            role: '',
            resume: '',
            jobDescription: '',
            isSetup: false,
          },
        }),
    }),
    { name: 'ia-settings' }
  )
)