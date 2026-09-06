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

    it('gives an introduction as POINTS and forbids a script', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('INTRODUCTION AND BEHAVIOURAL QUESTIONS')
      expect(p).toContain('YOU DO NOT WRITE THE ANSWER')
      expect(p).toContain('Never write a first-person script')
      expect(p).toContain('never write a line beginning "I " for someone to read out')
      expect(p).toContain('Situation, Task,\n  Action, Result')
    })

    it('keeps the length ceiling honest — no fourth exception', () => {
      const p = buildSystemPrompt()
      expect(p).toContain('One exception, and it is the only one')
      expect(p).toContain('An introduction or a behavioural question is NOT a second exception')
    })
  })

  describe('the limits that do not move', () => {
    it('never lets the assistant speak as the candidate', () => {
      for (const style of ['plain', 'desi']) {
        seed({ answerStyle: style })
        const p = buildSystemPrompt()
        expect(p).toContain('You are not the candidate and you never speak as them')
        expect(p).toContain('say plainly that\nyou are an AI assistant')
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
  })
})
