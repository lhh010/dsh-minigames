import { describe, expect, it } from 'vitest'
import {
  attemptCap, computeScore, isWon, levelSize, mulberry32, neighbors,
  puzzleFromSeed, solveCount,
} from '../src/client/games/hitori/logic.ts'

describe('hitori logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('neighbors stays inside the board', () => {
    expect(neighbors(5, 0)).toEqual([5, 1])
    expect(neighbors(5, 24)).toEqual([19, 23])
    expect(neighbors(5, 12)).toEqual([7, 17, 11, 13])
  })

  it('every level size generates a puzzle', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      expect(p).not.toBeNull()
      const puzzle = p!
      expect(puzzle.size).toBe(levelSize(lv))
      expect(puzzle.grid.length).toBe(levelSize(lv))
      expect(puzzle.solution.length).toBe(levelSize(lv) ** 2)
    }
  })

  it('the generating black set wins', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))!
      const blacks = new Set<number>()
      p.solution.forEach((black, i) => { if (black) blacks.add(i) })
      expect(isWon(p, blacks)).toBe(true)
    }
  })

  it('isWon rejects an all-black board', () => {
    const p = puzzleFromSeed(1 * 0x9e3779b9, levelSize(1))!
    const all = new Set<number>()
    for (let i = 0; i < p.size * p.size; i += 1) all.add(i)
    expect(isWon(p, all)).toBe(false)
  })

  it('solveCount finds at least one solution without exhausting', () => {
    const p = puzzleFromSeed(2 * 0x9e3779b9, levelSize(2))!
    const r = solveCount(p, 200_000)
    expect(r.solutions).toBeGreaterThanOrEqual(1)
    expect(r.exhausted).toBe(false)
    if (p.unique) expect(r.solutions).toBe(1)
  })

  it('computeScore decays the time bonus to the base score', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
    expect(computeScore(3, 0)).toBe(3300)
  })

  it('levelSize maps and wraps the five levels', () => {
    expect(levelSize(1)).toBe(5)
    expect(levelSize(6)).toBe(5)
    expect(attemptCap(5)).toBe(15)
    expect(attemptCap(6)).toBe(15)
    expect(attemptCap(7)).toBe(6)
    expect(attemptCap(8)).toBe(6)
  })
})
