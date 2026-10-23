import { describe, expect, it } from 'vitest'
import {
  judge, mergeKeyHints, isValidGuess, mulberry32, pickAnswer, type KeyHints,
} from '../src/client/games/wordle/logic.ts'
import { ANSWERS_4, ANSWERS_5, ANSWERS_6 } from '../src/client/games/wordle/words.ts'

describe('wordle judge', () => {
  it('all green on an exact match', () => {
    expect(judge('CRANE', 'CRANE')).toEqual(['green', 'green', 'green', 'green', 'green'])
  })

  it('all gray when no letter is shared', () => {
    expect(judge('GHOST', 'CRANE')).toEqual(['gray', 'gray', 'gray', 'gray', 'gray'])
  })

  it('marks greens and yellows on mixed overlap', () => {
    // answer BRAIN: B,R green; guess A lands where answer A is not (yellow); E,D gray.
    expect(judge('BREAD', 'BRAIN')).toEqual(['green', 'green', 'gray', 'yellow', 'gray'])
  })

  it('green consumes its answer letter so a duplicate guess letter stays gray', () => {
    // answer STARE: S green consumes the only S; the second S in SALSA cannot be yellow.
    expect(judge('SALSA', 'STARE')).toEqual(['green', 'yellow', 'gray', 'gray', 'gray'])
  })

  it('a repeated answer letter yields at most that many yellows', () => {
    // answer SALSA has two A: guess STARE gets one yellow A, not two.
    expect(judge('STARE', 'SALSA')).toEqual(['green', 'gray', 'yellow', 'gray', 'gray'])
  })

  it('doubled guess letters against a doubled answer letter: greens first, then bounded yellows', () => {
    // answer THERE (E x2): T green, both E guesses yellow, trailing T gray (T consumed).
    expect(judge('TENET', 'THERE')).toEqual(['green', 'yellow', 'gray', 'yellow', 'gray'])
    // answer APPLE (P x2): one P green, the other P yellow; A x1 gives one yellow A only.
    expect(judge('PAPAL', 'APPLE')).toEqual(['yellow', 'yellow', 'green', 'gray', 'yellow'])
  })

  it('always returns one verdict per letter at any length', () => {
    expect(judge('BLIMP', 'QUART')).toHaveLength(5)
    expect(judge('BACK', 'CAFE')).toHaveLength(4)
    expect(judge('CASTLE', 'CANDLE')).toHaveLength(6)
  })
})

describe('wordle mergeKeyHints', () => {
  it('keeps the strongest hint per letter (green > yellow > gray)', () => {
    let hints = mergeKeyHints({}, 'CRANE', ['gray', 'yellow', 'gray', 'gray', 'gray'])
    expect(hints).toEqual({ C: 'gray', R: 'yellow', A: 'gray', N: 'gray', E: 'gray' })
    hints = mergeKeyHints(hints, 'ROBOT', ['green', 'gray', 'gray', 'gray', 'gray'])
    expect(hints).toEqual({
      C: 'gray', R: 'green', A: 'gray', N: 'gray', E: 'gray', O: 'gray', B: 'gray', T: 'gray',
    })
    hints = mergeKeyHints(hints, 'CHAIR', ['gray', 'gray', 'gray', 'yellow', 'gray'])
    expect(hints).toEqual({
      C: 'gray', R: 'green', A: 'gray', N: 'gray', E: 'gray', O: 'gray', B: 'gray', T: 'gray',
      H: 'gray', I: 'yellow',
    })
  })

  it('never downgrades an established hint', () => {
    let hints = mergeKeyHints({}, 'GREEN', ['green', 'green', 'green', 'green', 'green'])
    hints = mergeKeyHints(hints, 'GREEN', ['gray', 'gray', 'gray', 'gray', 'gray'])
    hints = mergeKeyHints(hints, 'GREEN', ['yellow', 'yellow', 'yellow', 'yellow', 'yellow'])
    expect(hints).toEqual({ G: 'green', R: 'green', E: 'green', N: 'green' })
  })

  it('does not mutate the previous hints object', () => {
    const prev: KeyHints = { A: 'green' }
    const next = mergeKeyHints(prev, 'ADMIT', ['green', 'yellow', 'gray', 'gray', 'gray'])
    expect(prev).toEqual({ A: 'green' })
    expect(next).toEqual({ A: 'green', D: 'yellow', M: 'gray', I: 'gray', T: 'gray' })
  })
})

describe('wordle isValidGuess', () => {
  it('accepts any word of the exact length with letters only — no dictionary required', () => {
    expect(isValidGuess('CRANE', 5)).toBe(true)
    expect(isValidGuess('QQQQQ', 5)).toBe(true)
    expect(isValidGuess('ZZQQ', 4)).toBe(true)
    expect(isValidGuess('XZZQQX', 6)).toBe(true)
  })
  it('rejects wrong lengths, lowercase, non-letters, and empty', () => {
    expect(isValidGuess('CRAN', 5)).toBe(false)
    expect(isValidGuess('CRANES', 5)).toBe(false)
    expect(isValidGuess('CRANE', 4)).toBe(false)
    expect(isValidGuess('crane', 5)).toBe(false)
    expect(isValidGuess('CR-NE', 5)).toBe(false)
    expect(isValidGuess('', 5)).toBe(false)
  })
})

describe('wordle pickAnswer', () => {
  it('is deterministic for a given seed', () => {
    expect(pickAnswer(12345, 5)).toBe(pickAnswer(12345, 5))
    expect(pickAnswer(0, 4)).toBe(pickAnswer(0, 4))
  })

  it('always lands inside the matching answer list (bounds)', () => {
    const lists: Record<number, readonly string[]> = { 4: ANSWERS_4, 5: ANSWERS_5, 6: ANSWERS_6 }
    for (const seed of [0, 1, 7, 42, 99, 1_000_003, 0xffff_ffff]) {
      for (const len of [4, 5, 6]) expect(lists[len]).toContain(pickAnswer(seed, len))
    }
    for (let i = 0; i < 200; i += 1) expect(ANSWERS_5).toContain(pickAnswer(i, 5))
  })

  it('different seeds sweep a real share of the pool', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 150; i += 1) seen.add(pickAnswer(i, 5))
    expect(seen.size).toBeGreaterThan(20)
  })

  it('mulberry32 sequences are seeded-deterministic', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b())
  })
})

describe('wordle word lists', () => {
  it('hold ~120+ uppercase words of exactly the declared length, disjoint across lengths', () => {
    expect(ANSWERS_4.length).toBeGreaterThanOrEqual(110)
    expect(ANSWERS_5.length).toBeGreaterThanOrEqual(140)
    expect(ANSWERS_6.length).toBeGreaterThanOrEqual(110)
    expect([...ANSWERS_4].every(w => /^[A-Z]{4}$/.test(w))).toBe(true)
    expect([...ANSWERS_5].every(w => /^[A-Z]{5}$/.test(w))).toBe(true)
    expect([...ANSWERS_6].every(w => /^[A-Z]{6}$/.test(w))).toBe(true)
    for (const list of [ANSWERS_4, ANSWERS_5, ANSWERS_6]) {
      expect(new Set(list).size).toBe(list.length)
    }
  })
})
