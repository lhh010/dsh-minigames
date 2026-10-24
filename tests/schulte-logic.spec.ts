import { describe, expect, it } from 'vitest'
import {
  MAX_GRID, SCORE_BASE_MS, WRONG_PENALTY_MS, gridSizeFor, isCorrectClick, makeGrid, mulberry32, scoreFor,
} from '../src/client/games/schulte/logic.ts'

describe('schulte grid logic', () => {
  it('makeGrid is deterministic per seed and differs across seeds', () => {
    expect(makeGrid(42, 3)).toEqual(makeGrid(42, 3))
    expect(makeGrid(42, 3)).not.toEqual(makeGrid(43, 3))
  })

  it.each([3, 4, 5, 6, 7])('makeGrid(%s) contains exactly 1..n² (multiset equality)', (n) => {
    const grid = makeGrid(7, n)
    expect(grid).toHaveLength(n * n)
    expect([...grid].sort((a, b) => a - b)).toEqual(Array.from({ length: n * n }, (_, i) => i + 1))
  })

  it('makeGrid shuffles (rarely the identity) across seeds', () => {
    const identity = Array.from({ length: 9 }, (_, i) => i + 1)
    const same = Array.from({ length: 60 }, (_, s) => makeGrid(s, 3))
      .filter((g) => g.every((v, i) => v === identity[i]))
    expect(same).toHaveLength(0)
  })

  it('unbiased-ish: over 200 seeds every number 1..9 appears in the first cell (n=3)', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 200; seed += 1) seen.add(makeGrid(seed, 3)[0]!)
    for (let v = 1; v <= 9; v += 1) expect(seen.has(v)).toBe(true)
  })

  it('gridSizeFor ramps 3×3 → 7×7 and caps', () => {
    expect(gridSizeFor(1)).toBe(3)
    expect(gridSizeFor(2)).toBe(4)
    expect(gridSizeFor(3)).toBe(5)
    expect(gridSizeFor(4)).toBe(6)
    expect(gridSizeFor(5)).toBe(MAX_GRID)
    expect(gridSizeFor(99)).toBe(MAX_GRID)
    expect(gridSizeFor(0)).toBe(3) // degenerate level clamps to the first step
  })

  it('isCorrectClick follows the ascending sequence anywhere in the grid', () => {
    const grid = [5, 1, 9, 2, 8, 3, 7, 4, 6] // hand-made shuffle
    expect(isCorrectClick(grid, 1, 1)).toBe(true) // 1 at index 1
    expect(isCorrectClick(grid, 1, 0)).toBe(false) // 5 is not 1
    expect(isCorrectClick(grid, 2, 3)).toBe(true)
    expect(isCorrectClick(grid, 2, 5)).toBe(false) // ahead of sequence
    expect(isCorrectClick(grid, 9, 8)).toBe(false) // 6 is not the last
  })

  it('scoreFor applies the +500ms wrong-click penalty', () => {
    // scoreFor receives raw wall time; the penalty is folded in internally.
    expect(scoreFor(10_000, 0)).toBe(SCORE_BASE_MS - 10_000)
    expect(scoreFor(10_000, 1)).toBe(SCORE_BASE_MS - 10_000 - WRONG_PENALTY_MS)
    expect(scoreFor(10_000, 3)).toBe(SCORE_BASE_MS - 10_000 - 3 * WRONG_PENALTY_MS)
  })

  it('scoreFor is monotonically non-increasing in elapsed', () => {
    let prev = scoreFor(0, 0)
    for (let ms = 250; ms <= 70_000; ms += 250) {
      const next = scoreFor(ms, 2)
      expect(next).toBeLessThanOrEqual(prev)
      prev = next
    }
  })

  it('scoreFor clamps at 1 for slow runs', () => {
    expect(scoreFor(120_000, 5)).toBe(1)
    expect(scoreFor(10_000_000, 0)).toBe(1)
  })

  it('scoreFor 60s cap boundary: at exactly 60s the raw score hits the clamp', () => {
    expect(scoreFor(SCORE_BASE_MS, 0)).toBe(1)
    expect(scoreFor(SCORE_BASE_MS - 1, 0)).toBe(1) // floor lands on 0 → clamped
    expect(scoreFor(SCORE_BASE_MS - 1000, 0)).toBe(1000)
    // With penalties the boundary moves earlier in wall time.
    expect(scoreFor(SCORE_BASE_MS - WRONG_PENALTY_MS, 1)).toBe(1)
  })

  it('mulberry32 is deterministic per seed and stays in [0,1)', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    for (let i = 0; i < 100; i += 1) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
