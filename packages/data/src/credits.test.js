import { describe, it, expect } from 'vitest'
import {
  END_REASON_LABEL,
  LEDGER_LABEL,
  LOW_BALANCE_MINUTES,
  MINUTES_PER_CREDIT,
  balanceTone,
  creditsToMinutes,
  formatBalance,
  formatClock,
  formatCredits,
} from './credits.js'

/*
  These are the functions every surface uses to say how much time someone has
  left. They are pure, they are cheap to test, and getting one wrong means a
  customer reading a number that is not their balance.
*/

describe('creditsToMinutes', () => {
  it('is one hour per credit', () => {
    expect(creditsToMinutes(1)).toBe(60)
    expect(creditsToMinutes(2.5)).toBe(150)
  })

  it('rounds to whole minutes, because minutes are canonical', () => {
    // "someone who buys 2 credits owns exactly 120 minutes, not 2.0 of something
    // that has to be multiplied back out at every call site"
    expect(Number.isInteger(creditsToMinutes(0.337))).toBe(true)
  })

  it('reads nothing as zero rather than NaN', () => {
    for (const input of [null, undefined, '', NaN]) {
      expect(creditsToMinutes(input), String(input)).toBe(0)
    }
  })
})

describe('formatBalance', () => {
  it('never returns a bare number', () => {
    for (const m of [0, 1, 59, 60, 61, 599, 600]) {
      expect(formatBalance(m)).toMatch(/^\d+h( \d+m)?$|^\d+m$/)
    }
  })

  it('renders the three shapes the docstring promises', () => {
    expect(formatBalance(272)).toBe('4h 32m')
    expect(formatBalance(240)).toBe('4h')
    expect(formatBalance(48)).toBe('48m')
    expect(formatBalance(0)).toBe('0m')
  })

  it('drops the minutes on an exact hour, not "4h 0m"', () => {
    expect(formatBalance(60)).toBe('1h')
    expect(formatBalance(120)).toBe('2h')
  })

  it('clamps a negative balance to zero instead of showing "-1h"', () => {
    // A wallet should never go negative, but if a correction ever overshoots,
    // the customer must not read a negative time.
    expect(formatBalance(-5)).toBe('0m')
    expect(formatBalance(-600)).toBe('0m')
  })

  it('reads junk as zero', () => {
    for (const input of [null, undefined, NaN, 'abc', {}]) {
      expect(formatBalance(input), String(input)).toBe('0m')
    }
  })

  it('rounds fractional minutes rather than truncating', () => {
    expect(formatBalance(59.6)).toBe('1h')
    expect(formatBalance(0.4)).toBe('0m')
  })
})

describe('formatCredits', () => {
  it('says "1 credit" and not "1 credits"', () => {
    expect(formatCredits(60)).toBe('1 credit')
  })

  it('pluralises everything else, zero included', () => {
    expect(formatCredits(0)).toBe('0 credits')
    expect(formatCredits(120)).toBe('2 credits')
    expect(formatCredits(150)).toBe('2.5 credits')
  })

  it('rounds to one decimal place', () => {
    expect(formatCredits(61)).toBe('1 credit')      // 1.016… -> 1
    expect(formatCredits(70)).toBe('1.2 credits')   // 1.166… -> 1.2
  })

  it('never reports negative credits', () => {
    expect(formatCredits(-120)).toBe('0 credits')
  })
})

describe('balanceTone', () => {
  it('is critical only at or below zero', () => {
    expect(balanceTone(0)).toBe('critical')
    expect(balanceTone(-1)).toBe('critical')
    expect(balanceTone(1)).toBe('warning')
  })

  it('warns below one full interview and is positive at exactly one', () => {
    // The boundary is the whole point of the constant: "Under one full
    // interview. Every surface shows a warning below this."
    expect(balanceTone(LOW_BALANCE_MINUTES - 1)).toBe('warning')
    expect(balanceTone(LOW_BALANCE_MINUTES)).toBe('positive')
    expect(balanceTone(LOW_BALANCE_MINUTES + 1)).toBe('positive')
  })

  it('agrees with MINUTES_PER_CREDIT about what one interview is', () => {
    expect(LOW_BALANCE_MINUTES).toBe(MINUTES_PER_CREDIT)
  })

  it('treats junk as empty', () => {
    for (const input of [null, undefined, NaN, 'abc']) {
      expect(balanceTone(input), String(input)).toBe('critical')
    }
  })
})

describe('formatClock', () => {
  it('pads the seconds to two digits', () => {
    expect(formatClock(724)).toBe('12:04')
    expect(formatClock(60)).toBe('1:00')
    expect(formatClock(9)).toBe('0:09')
  })

  it('does not pad the minutes, and does not wrap at 60', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(3600)).toBe('60:00')
  })

  it('clamps a countdown that ran past zero', () => {
    expect(formatClock(-30)).toBe('0:00')
  })
})

describe('the label maps', () => {
  /*
    Every value these two maps can be asked for comes from a database enum. A
    missing key renders as `undefined` in the billing history, so what matters is
    that no entry is blank and that they stay in step with the SQL — the second
    half is checked by check-invariants only insofar as the file exists, so this
    pins the shape.
  */
  it('gives every ledger kind a non-empty label', () => {
    for (const [kind, label] of Object.entries(LEDGER_LABEL)) {
      expect(label, kind).toBeTypeOf('string')
      expect(label.length, kind).toBeGreaterThan(0)
    }
  })

  it('gives every session end reason a non-empty label', () => {
    for (const [reason, label] of Object.entries(END_REASON_LABEL)) {
      expect(label, reason).toBeTypeOf('string')
      expect(label.length, reason).toBeGreaterThan(0)
    }
  })

  it('does not tell a user someone else is using their account', () => {
    // A 2026-08-30 bugfix: 'superseded' used to read "Started elsewhere", which
    // the row cannot support — nothing on it says where the newer session came
    // from, and in practice it was the same machine restarting.
    expect(END_REASON_LABEL.superseded).toBe('Replaced by a new session')
    expect(Object.values(END_REASON_LABEL).join(' ')).not.toMatch(/elsewhere/i)
  })
})
