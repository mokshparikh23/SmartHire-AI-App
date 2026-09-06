/*
  SELF-INTRO 2026-09-06 ─ the first test for this file.

  classifyQuestion() shipped on 2026-09-01 with no test at all, which was
  survivable while a miss cost a slower answer to a coding question. It is less
  survivable now: 'intro' decides whether "tell me about yourself" — the question
  that has to read a whole résumé and build a minute of speech out of it — is
  answered by the smart model or the cheapest one in the list.

  Regexes fail silently and specifically. A stray `\b`, a missing alternation,
  and the phrase simply never matches; nothing throws, no build breaks, and the
  only symptom is a slightly worse answer to one question in an interview nobody
  is watching. So the cases below are written as the sentences an interviewer
  actually says, not as inputs chosen to satisfy the patterns.

  WHAT THIS DELIBERATELY DOES NOT ASSERT: that the classification is right in
  some absolute sense. The note at the top of questionType.js sets the trade —
  lexical, wrong sometimes, and wrong in the cheap direction on purpose — and a
  test that demanded perfection would be arguing with that decision rather than
  protecting it.
*/
import { describe, it, expect } from 'vitest'
import { classifyQuestion } from './questionType'

describe('classifyQuestion', () => {
  describe('intro', () => {
    it('catches the opening question in the forms it is actually asked', () => {
      for (const q of [
        'Tell me about yourself.',
        'so, tell me about yourself',
        'Tell us about yourself and your background',
        'Can you introduce yourself?',
        'Walk me through your resume',
        'walk me through your CV quickly',
        'walk us through your background',
      ]) {
        expect(classifyQuestion(q), q).toBe('intro')
      }
    })

    it('catches the behavioural openers', () => {
      for (const q of [
        'Tell me about a time when you disagreed with your manager',
        'Give me an example of a time you missed a deadline',
        'Describe a situation where you had to push back',
        'How do you handle conflict in a team?',
        'how do you deal with tight deadlines',
      ]) {
        expect(classifyQuestion(q), q).toBe('intro')
      }
    })

    it('catches the fixed set every interview closes with', () => {
      for (const q of [
        'Why this company?',
        'Why do you want to join us?',
        'why do you want to work here',
        'Why should we hire you?',
        'What is your biggest weakness?',
        'what are your greatest strengths',
        'Where do you see yourself in five years?',
        'Why are you leaving your current role?',
      ]) {
        expect(classifyQuestion(q), q).toBe('intro')
      }
    })

    it('reads the Hinglish forms, which is how half of these are asked', () => {
      for (const q of [
        'apne baare me batao',
        'apne bare mein bataiye',
        'haan to apne baare me kuch batao',
        'khud ke baare me batao',
        'apna introduction do',
        'apna intro dijiye',
      ]) {
        expect(classifyQuestion(q), q).toBe('intro')
      }
    })
  })

  describe('the order of the three lists', () => {
    /* Documented in questionType.js: coding and aptitude are checked first, so a
       behavioural question that also reads as a problem lands on 'coding'. That
       is deliberate and it is free — intent picks the model and the token
       ceiling, never the answer shape, and both escalate to the same model. This
       test exists so the behaviour is a decision on the record rather than
       something discovered later and "fixed". */
    it('lets coding win over intro when a question reads as both', () => {
      expect(classifyQuestion('tell me about a time you had to optimise it'))
        .toBe('coding')
    })

    it('does not let an intro pattern swallow a real coding question', () => {
      expect(classifyQuestion('walk me through your solution')).toBe('general')
      expect(classifyQuestion('write the code for a binary search')).toBe('coding')
      expect(classifyQuestion('given an array, find the longest subarray'))
        .toBe('coding')
    })

    it('leaves an ordinary technical question alone', () => {
      for (const q of [
        'What is a hash map?',
        'Tell me about the event loop',
        'why?',
        'and then?',
        'What is the difference between a process and a thread?',
      ]) {
        expect(classifyQuestion(q), q).toBe('general')
      }
    })
  })

  describe('the guards that were already there', () => {
    it('survives a non-string and an empty question', () => {
      expect(classifyQuestion(undefined)).toBe('general')
      expect(classifyQuestion(null)).toBe('general')
      expect(classifyQuestion(42)).toBe('general')
      expect(classifyQuestion('')).toBe('general')
      expect(classifyQuestion('   ')).toBe('general')
    })

    it('is not defeated by transcription whitespace', () => {
      // Transcribed audio arrives with the spacing the recogniser felt like.
      expect(classifyQuestion('tell   me  about\n  yourself')).toBe('intro')
    })
  })
})
