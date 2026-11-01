import { describe, expect, it } from 'vitest'
import {
  adjacent, attemptCap, computeScore, isWon, levelOrder, mulberry32,
  puzzleFromSeed, solveCount,
} from '../src/client/games/dominosa/logic.ts'

describe('dominosa logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('adjacent accepts orthogonal neighbors only', () => {
    expect(adjacent(6, 0, 1)).toBe(true)   // same row, next column
    expect(adjacent(6, 1, 0)).toBe(true)   // symmetric
    expect(adjacent(6, 0, 6)).toBe(true)   // same column, next row
    expect(adjacent(6, 0, 2)).toBe(false)  // same row, one cell apart
    expect(adjacent(6, 0, 7)).toBe(false)  // diagonal
    expect(adjacent(6, 0, 0)).toBe(false)  // same cell
    expect(adjacent(6, 0, 5)).toBe(false)  // row wrap via flat index
  })

  it('every level generates a puzzle whose own matching wins', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelOrder(lv))
      expect(p).not.toBeNull()
      const puzzle = p!
      expect(puzzle.order).toBe(levelOrder(lv))
      expect(puzzle.grid.length).toBe(levelOrder(lv) + 1)
      expect(puzzle.grid[0]!.length).toBe(levelOrder(lv) + 2)
      expect(isWon(puzzle, puzzle.solution)).toBe(true)
    }
  })

  it('isWon rejects non-adjacent pairs and empty pairs', () => {
    const puzzle = puzzleFromSeed(1 * 0x9e3779b9, levelOrder(1))!
    expect(isWon(puzzle, [])).toBe(false)
    expect(isWon(puzzle, [[0, 2]])).toBe(false) // same row, one cell apart
    expect(isWon(puzzle, [[0, 7]])).toBe(false) // diagonal
  })

  it('the same seed generates the same puzzle', () => {
    const seed = 5 * 0x9e3779b9
    const a = puzzleFromSeed(seed, levelOrder(5))
    const b = puzzleFromSeed(seed, levelOrder(5))
    expect(a).toEqual(b)
  })

  it('solveCount finds at least one solution without exhausting', () => {
    const puzzle = puzzleFromSeed(2 * 0x9e3779b9, levelOrder(2))!
    const r = solveCount(puzzle, 150_000)
    expect(r.solutions).toBeGreaterThanOrEqual(1)
    expect(r.exhausted).toBe(false)
    if (puzzle.unique) expect(r.solutions).toBe(1)
  })

  it('computeScore decays the time bonus to the base score', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
  })

  it('attemptCap switches at order 7', () => {
    expect(attemptCap(4)).toBe(30)
    expect(attemptCap(6)).toBe(30)
    expect(attemptCap(7)).toBe(15)
    expect(attemptCap(8)).toBe(15)
  })
})
