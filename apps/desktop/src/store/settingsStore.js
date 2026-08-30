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

      // ── Answer mode ─────────────────────────────────────────────────────────
      //
      // SYSTEM-AUDIO 2026-08-30: what the panel does with a line it hears.
      //
      //   'answer'    — answer the question that was asked
      //   'followups' — suggest what to ask next (the interviewer copilot)
      //
      // buildSystemPrompt() in services/systemPrompt.js branches on this. It is
      // an ordinary preference, so unlike resumeConsent it persists — see the
      // partialize note at the bottom of this file.
      answerMode: 'answer',
      setAnswerMode: (m) => set({ answerMode: m === 'followups' ? 'followups' : 'answer' }),

      // ── Interview context ───────────────────────────────────────────────────
      //
      // PIVOT 2026-08-30: `resumeConsent` added. The marketing site has claimed
      // since the pivot that "the résumé is used only after you confirm the
      // candidate agreed to it" — there was no such flag anywhere, so the claim
      // was false. buildSystemPrompt() in services/systemPrompt.js is what
      // actually enforces it; this is only where the answer is kept.
      //
      // It is deliberately NOT persisted across interviews — see the partialize
      // note at the bottom of this file. Consent is given for one candidate, not
      // once for the life of the install.
      //
      // interviewContext: { company: '', role: '', resume: '', jobDescription: '', isSetup: false },
      interviewContext: {
        company: '',
        role: '',
        resume: '',
        jobDescription: '',
        resumeConsent: false,
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
            resumeConsent: false,
            isSetup: false,
          },
        }),
    }),
    {
      name: 'ia-settings',

      /*
        PIVOT 2026-08-30: consent does not survive a restart.

        Everything else here is a preference and SHOULD persist — the model, the
        overlay opacity, and the interview context so a crash mid-setup does not
        cost the interviewer their typing. `resumeConsent` is different: it is a
        statement about one candidate in one interview, not a setting. Persisting
        it would mean a box ticked for Monday's candidate silently authorising
        Tuesday's résumé.

        The résumé text itself still persists. That is the safe pairing — on a
        restart the text is present but the flag is false, so buildSystemPrompt()
        omits the résumé until consent is confirmed again for the new candidate.
      */
      partialize: (s) => ({
        ...s,
        interviewContext: { ...s.interviewContext, resumeConsent: false },
      }),
    }
  )
)