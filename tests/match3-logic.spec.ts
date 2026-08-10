import { describe, expect, it } from 'vitest'
import {
  advanceLevel, applyRemoval, createMatch3State, groupAt, hasRemovableGroup,
  largestGroupSize, levelTarget, planRemoval, removeGroup, restart, scoreForGroup,
  updateResult,
  type Match3State, type Position,
} from '../src/client/games/match3/logic.ts'

/** Deterministic LCG so random boards are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('match3 (消消乐) logic', () => {
  it('creates a full level-1 board with the first target', () => {
    const state = createMatch3State(lcg(1))
    expect(state.grid.flat().every(cell => cell >= 1)).toBe(true)
    expect(state.level).toBe(1)
    expect(state.target).toBe(800)
    expect(state.result).toBe('none')
  })

  it('scores groups super-linearly (quadratic)', () => {
    expect(scoreForGroup(1)).toBe(10)
    expect(scoreForGroup(3)).toBe(90)
    expect(scoreForGroup(5)).toBe(250)
    expect(scoreForGroup(10)).toBe(1000)
  })

  it('doubles the level target each level', () => {
    expect(levelTarget(1)).toBe(800)
    expect(levelTarget(2)).toBe(1200)
    expect(levelTarget(3)).toBe(1600)
  })

  it('finds the 4-connected same-color group, excluding diagonals', () => {
    const grid = [
      [1, 2],
      [2, 1],
    ]
    expect(groupAt(grid, { r: 0, c: 0 }).length).toBe(1) // diagonals do not connect
    const cross = [
      [1, 2, 1],
      [2, 1, 2],
      [1, 2, 1],
    ]
    expect(groupAt(cross, { r: 1, c: 1 }).length).toBe(1)
    const blob = [
      [1, 1, 2],
      [1, 2, 1],
      [1, 1, 1],
    ]
    expect(groupAt(blob, { r: 0, c: 0 }).length).toBe(7)
  })

  it('removes a group, scores it, and drops the rest without refilling', () => {
    const state = createMatch3State(lcg(1))
    state.grid = [
      [1, 1, 2],
      [1, 3, 2],
      [1, 3, 2],
    ]
    const before = state.grid.flat().filter(cell => cell !== 0).length
    const removed = removeGroup(state, { r: 0, c: 0 })
    expect(removed.length).toBe(4) // (0,0),(0,1),(1,0),(2,0)
    expect(state.score).toBe(160)
    const after = state.grid.flat().filter(cell => cell !== 0).length
    expect(after).toBe(before - 4) // no refill within a level
  })

  it('gems free-fall to the bottom after a removal', () => {
    const state = createMatch3State(lcg(1))
    state.grid = [
      [1, 1, 2],
      [1, 3, 2],
      [1, 3, 2],
    ]
    removeGroup(state, { r: 2, c: 1 }) // the two 3s in column 1
    expect(state.grid[2]![1]).toBe(1) // the top 1 fell to the floor
    expect(state.grid[0]![1]).toBe(0)
    expect(state.grid[1]![1]).toBe(0)
  })

  it('plans the fall animation consistently with the committed removal', () => {
    const grid = [
      [1, 1, 2],
      [1, 3, 2],
      [1, 3, 2],
    ]
    const removed = [{ r: 2, c: 1 }, { r: 1, c: 1 }] as Position[]
    const plan = planRemoval(grid, removed)
    expect(plan.falls).toEqual([{ from: { r: 0, c: 1 }, to: { r: 2, c: 1 } }])
    applyRemoval(grid, removed)
    expect(grid[2]![1]).toBe(1)
  })

  it('wins when the score reaches the target', () => {
    const state = createMatch3State(lcg(1))
    state.grid = [
      [1, 1, 1],
      [2, 3, 2],
      [2, 3, 2],
    ]
    state.score = 990
    removeGroup(state, { r: 0, c: 0 }) // +90 -> 1080
    updateResult(state)
    expect(state.result).toBe('win')
  })

  it('loses when no removable group (size >= 2) remains', () => {
    const state = createMatch3State(lcg(1))
    // Checkerboard: every group is a single cell.
    state.grid = Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => ((r + c) % 2) + 1))
    expect(largestGroupSize(state.grid)).toBe(1)
    expect(hasRemovableGroup(state.grid)).toBe(false)
    updateResult(state)
    expect(state.result).toBe('lose')
  })

  it('advances the level with a doubled target and a fresh board', () => {
    const state = createMatch3State(lcg(1))
    state.score = 500
    advanceLevel(state)
    expect(state.level).toBe(2)
    expect(state.target).toBe(1200)
    expect(state.score).toBe(0)
    expect(state.result).toBe('none')
    expect(state.grid.flat().every(cell => cell >= 1)).toBe(true)
  })

  it('restarts from level 1', () => {
    const state = createMatch3State(lcg(1))
    state.level = 3
    state.target = 3200
    state.score = 300
    restart(state)
    expect(state.level).toBe(1)
    expect(state.target).toBe(800)
    expect(state.score).toBe(0)
  })
})
