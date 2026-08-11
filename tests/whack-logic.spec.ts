import { describe, expect, it } from 'vitest'
import {
  createWhackState, tickWhack, whack, HOLES, DURATION, MAX_MOLES,
} from '../src/client/games/whack/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('whack logic', () => {
  it('creates a full-timer round with no moles', () => {
    const state = createWhackState(lcg(1))
    expect(state.moles).toEqual([])
    expect(state.remaining).toBe(DURATION)
    expect(state.score).toBe(0)
    expect(state.over).toBe(false)
  })

  it('pops a mole after the spawn delay', () => {
    const state = createWhackState(lcg(1))
    for (let i = 0; i < 200 && state.moles.length === 0; i += 1) tickWhack(state, 1 / 60)
    expect(state.moles.length).toBe(1)
    expect(state.moles[0]).toBeGreaterThanOrEqual(0)
    expect(state.moles[0]).toBeLessThan(HOLES)
  })

  it('can show five moles at the same time but never more', () => {
    const state = createWhackState(lcg(1))
    // One mole up; keep firing the spawn timer until the cap is reached.
    state.moles = [1]
    state.moleTimes = [2.0]
    for (let k = 0; k < MAX_MOLES - 1; k += 1) {
      state.spawnT = 0.01
      tickWhack(state, 1 / 60)
    }
    expect(state.moles.length).toBe(MAX_MOLES)
    // With every slot full the spawner idles; nothing beyond the cap appears.
    const before = [...state.moles]
    for (let i = 0; i < 10; i += 1) tickWhack(state, 1 / 60)
    expect(state.moles.length).toBe(MAX_MOLES)
    expect(state.moles).toEqual(before)
  })

  it('whacking a mole scores and hides it', () => {
    const state = createWhackState(lcg(1))
    for (let i = 0; i < 200 && state.moles.length === 0; i += 1) tickWhack(state, 1 / 60)
    const hole = state.moles[0]!
    expect(whack(state, hole)).toBe(true)
    expect(state.score).toBe(1)
    expect(state.moles.includes(hole)).toBe(false)
  })

  it('whacking an empty hole misses and costs a point (floor 0)', () => {
    const state = createWhackState(lcg(1))
    expect(whack(state, 0)).toBe(false)
    expect(state.score).toBe(0) // clamped at 0
    state.score = 3
    expect(whack(state, 4)).toBe(false)
    expect(state.score).toBe(2)
  })

  it('moles retreat on their own after their window', () => {
    const state = createWhackState(lcg(1))
    state.moles = [3]
    state.moleTimes = [0.2]
    state.spawnT = 100 // no new mole for a long time
    for (let i = 0; i < 30; i += 1) tickWhack(state, 1 / 60) // 0.5s > 0.2s
    expect(state.moles).toEqual([])
  })

  it('the round ends when time runs out', () => {
    const state = createWhackState(lcg(1))
    for (let i = 0; i < 2000; i += 1) tickWhack(state, 1 / 60)
    expect(state.over).toBe(true)
    expect(state.remaining).toBe(0)
    expect(state.moles).toEqual([])
    const score = state.score
    expect(whack(state, 0)).toBe(false)
    expect(state.score).toBe(score)
  })

  it('whacking outside the grid is a no-op', () => {
    const state = createWhackState(lcg(1))
    expect(whack(state, -1)).toBe(false)
    expect(whack(state, HOLES)).toBe(false)
    expect(state.score).toBe(0)
  })
})
