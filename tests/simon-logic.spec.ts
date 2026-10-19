import { describe, expect, it } from 'vitest'
import {
  PAD_COUNT, RAMP_ROUND, MIN_INTERVAL_MS, START_INTERVAL_MS,
  advanceShow, createSimonState, flashInterval, press, showingPad, startRound,
} from '../src/client/games/simon/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function showAll(state: ReturnType<typeof createSimonState>): void {
  while (state.phase === 'showing') advanceShow(state)
}

describe('simon logic', () => {
  it('generates a deterministic seeded sequence of valid pads', () => {
    const a = createSimonState(lcg(42))
    const b = createSimonState(lcg(42))
    for (let i = 0; i < 5; i += 1) startRound(a)
    // Same seed -> identical sequence.
    expect(b.sequence).toEqual([])
    startRound(b)
    expect(b.sequence).toEqual(a.sequence.slice(0, 1))
    for (let i = 1; i < 5; i += 1) startRound(b)
    expect(b.sequence).toEqual(a.sequence)
    expect(a.round).toBe(5)
    for (const pad of a.sequence) {
      expect(pad).toBeGreaterThanOrEqual(0)
      expect(pad).toBeLessThan(PAD_COUNT)
    }
  })

  it('ramps flash interval from 600ms at round 1 to 300ms by round 10 and clamps after', () => {
    expect(flashInterval(1)).toBe(START_INTERVAL_MS)
    expect(flashInterval(RAMP_ROUND)).toBe(MIN_INTERVAL_MS)
    expect(flashInterval(RAMP_ROUND + 5)).toBe(MIN_INTERVAL_MS)
    for (let r = 2; r < RAMP_ROUND; r += 1) {
      expect(flashInterval(r)).toBeGreaterThan(flashInterval(r + 1))
    }
  })

  it('transitions showing -> input once the whole sequence has flashed', () => {
    const state = createSimonState(lcg(7))
    startRound(state)
    expect(state.phase).toBe('showing')
    expect(showingPad(state)).toBe(state.sequence[0])
    expect(advanceShow(state)).toBe(true) // length-1 round finishes in one step
    expect(state.phase).toBe('input')
    expect(showingPad(state)).toBeNull()
  })

  it('accepts correct input and clears the round, adding the round number to the score', () => {
    const state = createSimonState(lcg(7))
    startRound(state)
    showAll(state)
    expect(press(state, state.sequence[0]!)).toBe('round-clear')
    expect(state.score).toBe(1)
    expect(state.phase).toBe('idle')

    startRound(state) // round 2: sequence grew by one
    showAll(state)
    expect(press(state, state.sequence[0]!)).toBe('correct')
    expect(state.inputIndex).toBe(1)
    expect(press(state, state.sequence[1]!)).toBe('round-clear')
    expect(state.score).toBe(3) // 1 + 2
  })

  it('ends the game on a wrong pad and goes inert', () => {
    const state = createSimonState(lcg(7))
    startRound(state)
    showAll(state)
    const wrong = (state.sequence[0]! + 1) % PAD_COUNT
    expect(press(state, wrong)).toBe('wrong')
    expect(state.phase).toBe('over')
    expect(press(state, state.sequence[0]!)).toBe('ignored')
    expect(showingPad(state)).toBeNull()
  })

  it('ignores presses outside the input phase', () => {
    const state = createSimonState(lcg(9))
    startRound(state)
    expect(press(state, state.sequence[0]!)).toBe('ignored') // still showing
    showAll(state)
    press(state, state.sequence[0]!)
    expect(state.phase).toBe('idle')
    expect(press(state, 0)).toBe('ignored') // between rounds
  })

  it('supports restart from a fresh state after game over', () => {
    const state = createSimonState(lcg(9))
    startRound(state)
    showAll(state)
    press(state, (state.sequence[0]! + 1) % PAD_COUNT)
    expect(state.phase).toBe('over')
    // Restart = new state; a seeded clone replays identically.
    const fresh = createSimonState(lcg(9))
    startRound(fresh)
    expect(fresh.sequence).toEqual([state.sequence[0]])
    expect(fresh.score).toBe(0)
    expect(fresh.phase).toBe('showing')
  })
})
