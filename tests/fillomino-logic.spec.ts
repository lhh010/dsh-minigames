import { describe, expect, it } from 'vitest'
import {
  LEVEL_SIZES, attemptCap, computeScore, isWon, levelSize, mulberry32,
  neighbors, puzzleFromSeed, solveCount,
} from '../src/client/games/fillomino/logic.ts'
import type { FilloPuzzle } from '../src/client/games/fillomino/logic.ts'

describe('fillomino logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('neighbors stays inside the board', () => {
    expect(neighbors(6, 0)).toEqual([6, 1])
    expect(neighbors(6, 35)).toEqual([29, 34])
    expect(neighbors(6, 14)).toEqual([8, 20, 13, 15])
    expect(neighbors(1, 0)).toEqual([])
  })

  it('every level generates a solvable puzzle with enough clues', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      expect(p).not.toBeNull()
      const puzzle = p!
      expect(puzzle.size).toBe(levelSize(lv))
      expect(puzzle.clues.size).toBeGreaterThanOrEqual(4)
      expect(puzzle.solution.length).toBe(levelSize(lv) ** 2)
      expect(isWon(puzzle, puzzle.solution)).toBe(true)
    }
  })

  it('isWon rejects an all-1 board and an empty board', () => {
    const p = puzzleFromSeed(0x9e3779b9, 6)!
    expect(isWon(p, new Array(36).fill(1))).toBe(false)
    expect(isWon(p, new Array(36).fill(0))).toBe(false)
  })

  it('the same seed generates the same puzzle', () => {
    const a = puzzleFromSeed(12345, 7)
    const b = puzzleFromSeed(12345, 7)
    expect(a).toEqual(b)
  })

  it('computeScore decays the time bonus to the base score', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
    expect(computeScore(3, 0)).toBe(3300)
    expect(computeScore(5, 600)).toBe(500)
  })

  it('levelSize cycles the five sizes and attemptCap is always 1', () => {
    expect(LEVEL_SIZES).toEqual([6, 7, 8, 9, 10])
    expect(levelSize(1)).toBe(6)
    expect(levelSize(5)).toBe(10)
    expect(levelSize(6)).toBe(6)
    for (const size of LEVEL_SIZES) expect(attemptCap(size)).toBe(1)
  })

  it('solveCount proves a tiny handcrafted board and exhausts on big boards', () => {
    const whole: FilloPuzzle = { size: 2, clues: new Map([[0, 4]]), solution: [4, 4, 4, 4], unique: false }
    const r = solveCount(whole)
    expect(r.solutions).toBe(1)
    expect(r.exhausted).toBe(false)
    const p = puzzleFromSeed(2 * 0x9e3779b9, 6)!
    const big = solveCount(p, 2_000)
    if (big.exhausted) expect(big.solutions).toBeLessThanOrEqual(2)
  })
})
