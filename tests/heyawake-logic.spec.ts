import { describe, expect, it } from 'vitest'
import {
  LEVEL_SIZES, attemptCap, computeScore, isWon, levelSize, mulberry32,
  neighbors, puzzleFromSeed, roomCovers, solveCount,
} from '../src/client/games/heyawake/logic.ts'

describe('heyawake logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('roomCovers accepts inside cells and rejects outside cells', () => {
    const rect = [1, 2, 3, 4] as const
    expect(roomCovers(rect, 1, 2)).toBe(true)
    expect(roomCovers(rect, 3, 4)).toBe(true)
    expect(roomCovers(rect, 2, 3)).toBe(true)
    expect(roomCovers(rect, 0, 2)).toBe(false)
    expect(roomCovers(rect, 1, 5)).toBe(false)
    expect(roomCovers(rect, 4, 4)).toBe(false)
  })

  it('neighbors stays inside the board', () => {
    expect(neighbors(6, 0)).toEqual([6, 1])
    expect(neighbors(6, 35)).toEqual([29, 34])
    expect(neighbors(6, 14)).toEqual([8, 20, 13, 15])
  })

  it('every level generates a solvable puzzle', { timeout: 20_000 }, () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      expect(p).not.toBeNull()
      const puzzle = p!
      expect(puzzle.size).toBe(levelSize(lv))
      expect(puzzle.solution.length).toBe(levelSize(lv) ** 2)
      const blacks = new Set<number>()
      puzzle.solution.forEach((black, i) => { if (black) blacks.add(i) })
      expect(isWon(puzzle, blacks)).toBe(true)
    }
  })

  it('isWon rejects an all-black board and adjacent black pairs', () => {
    const p = puzzleFromSeed(0x9e3779b9, 6)!
    const all = new Set<number>()
    for (let i = 0; i < 36; i += 1) all.add(i)
    expect(isWon(p, all)).toBe(false)
    expect(isWon(p, new Set([0, 1]))).toBe(false)
  })

  it('attemptCap splits at size 8 and computeScore decays to the base', () => {
    expect(LEVEL_SIZES).toEqual([6, 7, 8, 9, 10])
    expect(levelSize(1)).toBe(6)
    expect(levelSize(6)).toBe(6)
    expect(attemptCap(6)).toBe(20)
    expect(attemptCap(8)).toBe(20)
    expect(attemptCap(9)).toBe(12)
    expect(attemptCap(10)).toBe(12)
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
    expect(computeScore(3, 0)).toBe(3300)
  })

  it('solveCount proves uniqueness on a small unique board', () => {
    const p = puzzleFromSeed(2 * 0x9e3779b9, 6)
    expect(p).not.toBeNull()
    if (p!.unique) {
      const r = solveCount(p!, 120_000)
      expect(r.solutions).toBe(1)
      expect(r.exhausted).toBe(false)
    }
  })
})
