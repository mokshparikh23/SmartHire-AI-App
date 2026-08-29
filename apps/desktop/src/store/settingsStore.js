import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
  persist(
    (set) => ({
      // ── API Key ─────────────────────────────────────────────────────────────
      groqKey: '',
      setGroqKey: (k) => set({ groqKey: k }),

      // ── Model ───────────────────────────────────────────────────────────────
      model: 'llama-3.3-70b-versatile',
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