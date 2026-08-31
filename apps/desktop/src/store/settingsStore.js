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
      //
      // ANSWER-STYLE 2026-08-30: setAnswerMode has a call site now. Until today
      // it had none anywhere in the app — grep it — so answerMode was pinned at
      // its default for the life of every install and the OTHER prompt in
      // systemPrompt.js was code that had never run on a user's machine. The
      // launcher's ⋮ menu exposes it, so the choice is the user's now.
      //
      // CONCEPT 2026-08-30 (later): the default stays 'answer'. It was briefly
      // flipped to 'followups' while this app was the interviewer's, along with
      // a persisted-state migration to carry the flip onto existing installs.
      // Both were reverted with the direction: the product answers the question
      // that was asked, and that is what a fresh install should do. Nothing was
      // ever released with the flip, so there is no install to migrate — and now
      // that the ⋮ menu exists, a value someone dislikes is one click away
      // rather than something the store has to reach in and correct.
      answerMode: 'answer',
      setAnswerMode: (m) => set({ answerMode: m === 'followups' ? 'followups' : 'answer' }),

      // ── Answer style ────────────────────────────────────────────────────────
      //
      // ANSWER-STYLE 2026-08-30: the REGISTER the copilot writes in. Orthogonal
      // to answerMode above — it applies to both, because "plainly" is a thing
      // you can want a follow-up said in and a thing you can want an answer said
      // in, and they are not two features.
      //
      //   'plain' — the prompt exactly as this app has always sent it
      //   'desi'  — plain, direct Indian English; short everyday words
      //
      // What this is NOT: it is not the candidate-side "answers that sound like
      // you" this competes with. It changes how the copilot words what the
      // INTERVIEWER reads. styleBlock() in services/systemPrompt.js is the only
      // consumer, and its doc comment is where that boundary is written down.
      //
      // Deliberately top-level rather than a field inside interviewContext.
      // That object is facts about the interview — it is cleared wholesale by
      // clearInterviewContext() and rewritten wholesale by setInterviewContext()
      // — and this is a preference. Keeping it here also keeps
      // buildSystemPrompt()'s read to one flat destructure alongside answerMode.
      //
      // Seeded per candidate: Launcher copies the picked profile's default in
      // when the candidate is selected. The ⋮ menu then overrides it. The full
      // precedence rule is written at the seed effect in pages/Launcher.jsx.
      answerStyle: 'plain',
      // Anything unrecognised lands on the shipped default rather than on a
      // value it happens to sort next to. A profile from a server that predates
      // the answer_style column arrives as undefined and must land on 'plain'.
      setAnswerStyle: (s) => set({ answerStyle: s === 'desi' ? 'desi' : 'plain' }),

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
      /* CONTEXT 2026-08-31: candidateName, companyDomain and resumeBrief added.
         All three already existed on the interview_profiles row; they were
         simply never carried across into the prompt. See systemPrompt.js for
         why candidateName is deliberately NOT behind resumeConsent and why
         resumeBrief deliberately IS. */
      // interviewContext: {
      //   company: '', role: '', resume: '', jobDescription: '',
      //   resumeConsent: false, isSetup: false,
      // },
      interviewContext: {
        company: '',
        companyDomain: '',
        role: '',
        candidateName: '',
        resume: '',
        resumeBrief: '',
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
            companyDomain: '',   // CONTEXT 2026-08-31
            role: '',
            candidateName: '',   // CONTEXT 2026-08-31
            resume: '',
            resumeBrief: '',     // CONTEXT 2026-08-31
            jobDescription: '',
            resumeConsent: false,
            isSetup: false,
          },
        }),
    }),
    {
      name: 'ia-settings',

      /*
        CONCEPT 2026-08-30 (later): there is deliberately no `version` / `migrate`
        pair here.

        One was written while the default above was briefly 'followups', because
        flipping a default reaches nobody who has already opened the app —
        rehydration merges the persisted blob OVER the initial state, so an
        existing install keeps whatever it stored. Reverting the default removed
        the reason for it: no build has ever shipped with the flip, so there is
        no stored value that disagrees with the default.

        If a migration is ever needed here, the thing to know before writing one
        is that zustand's persist middleware defaults `version` to 0 AND WRITES
        IT, so existing blobs contain "version":0 and clear the
        `typeof version === 'number'` guard on the rehydrate path — which is what
        makes `migrate` fire at all. That is a property of the middleware, not of
        our config: setting `storage`, `serialize` or `deserialize` here sends an
        old blob to `merge` instead, and a migration would silently never run.
      */

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

        ANSWER-STYLE 2026-08-30: answerMode and answerStyle both persist, and
        that is chosen rather than inherited from the spread below. Neither is a
        statement about a person, which is the whole test resumeConsent fails.
        answerStyle is additionally re-seeded from the picked profile whenever a
        candidate is selected (see pages/Launcher.jsx), so what survives a
        restart is only the value used in the window between the app opening and
        a candidate being picked — a window in which no session can start.
      */
      /* CONTEXT 2026-08-31 ─ blank the DOCUMENT too, not just the flag ────────
         The note above calls text-without-consent "the safe pairing", and that
         reasoning was sound when the text was the only copy. It no longer is:
         Launcher.start() rewrites resume, resumeBrief and resumeConsent from a
         freshly fetched /api/profiles row on every single session start, and it
         is the only live caller of session.start(). So the persisted copy is
         redundant — and a résumé sitting in localStorage under a false flag is a
         landmine rather than a safety property.

         This is STRICTLY STRICTER than what it replaces. Nothing that was gated
         becomes ungated; one more thing stops being written to disk. */
      // partialize: (s) => ({
      //   ...s,
      //   interviewContext: { ...s.interviewContext, resumeConsent: false },
      // }),
      partialize: (s) => ({
        ...s,
        interviewContext: {
          ...s.interviewContext,
          resume: '',
          resumeBrief: '',
          resumeConsent: false,
        },
      }),
    }
  )
)