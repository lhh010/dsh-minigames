import { describe, expect, it } from 'vitest'
import {
  judge, mergeKeyHints, isValidGuess, mulberry32, pickAnswer, type KeyHints,
} from '../src/client/games/wordle/logic.ts'
import { ANSWERS, EXTRA_GUESSES } from '../src/client/games/wordle/words.ts'

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

  it('always returns five verdicts', () => {
    expect(judge('BLIMP', 'QUART')).toHaveLength(5)
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
  const answers = ['CRANE', 'BRAIN']
  const extras = ['SALSA', 'TENET']
  it('accepts words from either list', () => {
    expect(isValidGuess('CRANE', answers, extras)).toBe(true)
    expect(isValidGuess('SALSA', answers, extras)).toBe(true)
  })
  it('rejects unknown words, lowercase, and wrong lengths', () => {
    expect(isValidGuess('QQQQQ', answers, extras)).toBe(false)
    expect(isValidGuess('crane', answers, extras)).toBe(false)
    expect(isValidGuess('CRAN', answers, extras)).toBe(false)
    expect(isValidGuess('CRANES', answers, extras)).toBe(false)
    expect(isValidGuess('', answers, extras)).toBe(false)
  })
})

describe('wordle pickAnswer', () => {
  it('is deterministic for a given seed', () => {
    expect(pickAnswer(12345)).toBe(pickAnswer(12345))
    expect(pickAnswer(0)).toBe(pickAnswer(0))
  })

  it('always lands inside the answer list (bounds)', () => {
    for (const seed of [0, 1, 7, 42, 99, 1_000_003, 0xffff_ffff]) {
      expect(ANSWERS).toContain(pickAnswer(seed))
    }
    for (let i = 0; i < 200; i += 1) expect(ANSWERS).toContain(pickAnswer(i))
  })

  it('different seeds sweep a real share of the pool', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 150; i += 1) seen.add(pickAnswer(i))
    expect(seen.size).toBeGreaterThan(20)
  })

  it('mulberry32 sequences are seeded-deterministic', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b())
  })
})

describe('wordle word lists', () => {
  it('hold ~150 five-letter uppercase words each, disjoint', () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(140)
    expect(EXTRA_GUESSES.length).toBeGreaterThanOrEqual(140)
    for (const w of [...ANSWERS, ...EXTRA_GUESSES]) expect(w).toMatch(/^[A-Z]{5}$/)
    const extras: readonly string[] = EXTRA_GUESSES
    expect(ANSWERS.filter(w => extras.includes(w))).toEqual([])
  })
})
