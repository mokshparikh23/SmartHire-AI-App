/*
  SCREEN-ANSWERS 2026-09-06 ─ the first test under apps/desktop.

  WHY THIS FILE EXISTS. The Screenshot button came back describing the screen
  instead of answering the question on it, and one of the three causes was that
  the prompt had no instruction for the commonest screens in an interview — a
  multiple-choice question, an introduction, a behavioural question — and no
  instruction at all for what to do when the capture is too compressed to read.
  Prompt text is the product here, and until now nothing asserted a single word
  of it: a careless edit to a 700-line template literal could delete the
  [SCREENSHOT] section outright and every test in the repo would still pass.

  WHAT THIS CAN AND CANNOT CATCH. It asserts the prompt SAYS what we think it
  says — the sections exist, the identity limits survive, and no `${…}` was left
  unrendered by a mis-escaped backtick. It cannot assert the model OBEYS any of
  it; only the manual matrix does that. That is a real ceiling and it is the same
  one the note at the top of vitest.config.mjs draws around the SQL.
*/
import { describe, it, expect, beforeEach, vi } from 'vitest'

/* settingsStore is wrapped in zustand's persist middleware, which reaches for
   localStorage. vitest.config.mjs runs `environment: 'node'` for the whole repo
   and there is no jsdom in the tree, so the global has to exist before the store
   module is evaluated — hence vi.hoisted, which runs ahead of the imports below.

   A shim rather than switching this file to jsdom: the prompt is a pure string
   builder and pulling in a DOM to test it would be the most expensive way to get
   four methods. Nothing here asserts on what was persisted. */
vi.hoisted(() => {
  const mem = new Map()
  globalThis.localStorage = {
    getItem:    (k) => (mem.has(k) ? mem.get(k) : null),
    setItem:    (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear:      () => mem.clear(),
  }
})

import { buildSystemPrompt } from './systemPrompt'
import { useSettingsStore } from '../store/settingsStore'
import { useSessionStore } from '../store/sessionStore'

/* setState rather than the real actions: startSession opens an interval and a
   licence check, and none of that is what this file is about. */
const seed = (settings = {}, session = {}) => {
  useSettingsStore.setState({
    answerMode: 'answer',
    answerStyle: 'plain',
    interviewContext: {
      company: 'Acme', companyDomain: '', role: 'Backend Engineer',
      candidateName: 'A. Candidate', resume: '', resumeBrief: '', jobDescription: '',
      resumeConsent: false, isSetup: true,
      ...(settings.interviewContext || {}),
    },
    ...settings,
  })
  useSessionStore.setState({ captureSource: 'system', ...session })
}

describe('buildSystemPrompt', () => {
  beforeEach(() => seed())

  it('renders with no unresolved template syntax', () => {
    const p = buildSystemPrompt()
    // A mis-escaped backtick inside the literal ends it early and leaves the
    // rest of the prompt as source code the model is asked to obey.
    expect(p).not.toMatch(/\$\{/)
    expect(p).not.toMatch(/\\`/)
    expect(p.length).toBeGreaterThan(2000)
  })

  describe('the [SCREENSHOT] section', () => {
    it('routes every question type the screen can hold', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('[SCREENSHOT] — an image of the candidate\'s screen')
      expect(p).toContain('The\n   question is IN THE IMAGE')
      expect(p).toContain('MULTIPLE-CHOICE QUESTIONS below')
      expect(p).toContain('INTRODUCTION AND BEHAVIOURAL QUESTIONS below')
      expect(p).toContain('CODING AND PROBLEM QUESTIONS below')
    })

    it('tells the model what to do when it cannot read the capture', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('WHEN YOU CANNOT READ IT')
      // The whole point: illegibility must degrade to "zoom in", never to a
      // description, and never to solving a guessed problem statement.
      expect(p).toContain('Do not guess a problem\n   statement and then solve the guess')
      expect(p).toContain('do not fall back to describing the window')
    })

    it('no longer offers describing as an easy way out', () => {
      const p = buildSystemPrompt()
      // The old text made this reachable for any screen without a question mark.
      // It survives only behind "truly holds no question and no task at all".
      expect(p).not.toContain('If the screen holds no question\n   at all')
      expect(p).toContain('Only if the screen truly holds no question and no\n   task at all')
    })

    it('describes the fifth tag, which carries no image', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('it says where the message came\nfrom, and the five are not interchangeable')
      expect(p).toContain('[EARLIER SCREENSHOT]')
      expect(p).toContain('THE\n   IMAGE IS NO LONGER ATTACHED')
    })
  })

  describe('the two new answer sections', () => {
    it('makes a multiple-choice answer name the option, not just its label', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('MULTIPLE-CHOICE QUESTIONS')
      expect(p).toContain('give the option ITSELF, not just its label')
      expect(p).toContain('"It depends" is not an answer to a\nmultiple-choice question')
    })

    /* SELF-INTRO 2026-09-06: this assertion is inverted, and the test it
       replaces is kept here because the pair of them is the record of what
       changed and when:

         it('gives an introduction as POINTS and forbids a script', () => {
           expect(p).toContain('YOU DO NOT WRITE THE ANSWER')
           expect(p).toContain('Never write a first-person script')
           expect(p).toContain('never write a line beginning "I " for someone to read out')
         })

       The owner lifted the first-person limit for this one section. What the
       test asserts INSTEAD is the pair that has to travel with it — the voice
       changed, the sourcing rule did not — because an intro written in first
       person over invented facts is the failure this whole change is one
       inch away from. */
    it('writes the introduction, in first person, from documents only', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('INTRODUCTION AND BEHAVIOURAL QUESTIONS')
      expect(p).toContain("WRITE THE ANSWER, in the candidate's own voice, first person")
      expect(p).toContain('Situation, Task, Action, Result')

      // The limit that did NOT move, and the reason the one above is safe.
      expect(p).toContain('That licence is about VOICE and about nothing else')
      expect(p).toContain('comes from [resume] or [JD] and is cited inline')
      expect(p).toContain('If a document does not carry a detail, write the answer without it')
    })

    /* SELF-INTRO 2026-09-06: was 'keeps the length ceiling honest — no fourth
       exception', asserting 'One exception, and it is the only one' and 'An
       introduction or a behavioural question is NOT a second exception'. It is
       a second exception now: an introduction is said out loud, and a minute of
       speech does not fit a rule written for three seconds of reading. */
    it('gives an introduction room to be spoken, and nothing else', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('Two exceptions, and there are only two')
      expect(p).toContain('roughly 90\nto 120 words')
      // The ordinary ceiling is untouched — this is the guard against the
      // exception quietly becoming the rule.
      expect(p).toContain('Under about 60 words')
      expect(p).toContain('Never pad a short question up to a length')
    })
  })

  describe('the limits that do not move', () => {
    /* SELF-INTRO 2026-09-06: was 'never lets the assistant speak as the
       candidate', asserting 'You are not the candidate and you never speak as
       them'. That limit was lifted by the owner; this one was not, and it is
       the one this describe() block is now actually about.

       Both styles, because styleBlock() is appended last and last is the
       strongest position in a prompt — a register block that quietly dropped
       the disclosure would be the easiest way to lose it. */
    it('never conceals what it is, in either style', () => {
      for (const style of ['plain', 'desi']) {
        seed({ answerStyle: style })
        const p = buildSystemPrompt()
        expect(p).toContain('say plainly that you are an AI assistant')
        expect(p).toContain('Never deny it')
      }
    })

    /* The other half of what survived. First person over the user's own résumé
       is the change; first person over invented experience is not, and the only
       thing separating them is this rule. */
    it('still refuses to supply a fact no document carries', () => {
      for (const style of ['plain', 'desi']) {
        seed({ answerStyle: style })
        const p = buildSystemPrompt()
        expect(p).toContain('Never invent a fact, a number, a date')
        expect(p).toContain('invent an employer, a date, a number or an achievement')
      }
    })

    it('does not resurrect the covert prompt', () => {
      const p = buildSystemPrompt()
      // The dead block at the top of systemPrompt.js says these in so many
      // words. If either reaches a real prompt, the pivot has been undone.
      expect(p).not.toContain('Always sound like the candidate is speaking in first person')
      expect(p).not.toContain('NEVER say "As an AI')
    })

    it('answers in English whatever the question was asked in', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('Always write the answer in English, whatever was spoken')
    })
  })

  describe('resume grounding', () => {
    it('tells the model to cite a resume it has', () => {
      seed({ interviewContext: { resume: 'Worked on payments at Foo Ltd.' } })
      const p = buildSystemPrompt()
      expect(p).toContain('Worked on payments at Foo Ltd.')
      expect(p).toContain('comes from [resume] or [JD] and is cited inline')
    })

    it('tells the model to give the shape only when there is none', () => {
      const p = buildSystemPrompt()   // seeded with resume: ''
      expect(p).toContain('No resume is available for this conversation')
      expect(p).toContain('With no resume, do not invent a background')
    })

    /* SELF-INTRO 2026-09-06 ─ the second half of the reported bug.
       Asked for a project detail the CV does not spell out, the model answered
       ABOUT THE CV — "your résumé doesn't mention that" — which is a true
       sentence and a useless one: the candidate is mid-interview and cannot say
       it out loud. The fix is a way to answer around the gap, so that "never
       invent" does not leave the dropped turn as the only legal move. */
    it('forbids answering about the document instead of the question', () => {
      seed({ interviewContext: { resume: 'Worked on payments at Foo Ltd.' } })
      const p = buildSystemPrompt()
      expect(p).toContain('NEVER MAKE THE DOCUMENT THE SUBJECT')
      expect(p).toContain('Do not write "your résumé does not mention that"')
      expect(p).toContain('ANSWER THE SUBSTANCE')
      // The escape hatch has to be nameable, or the model invents its own.
      expect(p).toContain('⟨your bit: which cache you used⟩')
      // And it must not become a licence to fill the gap instead.
      expect(p).toContain('Do not fill the gap with an invented employer')
    })
  })
})
