import { describe, expect, it } from 'vitest'
import {
  computeScore, isWon, levelSize, mulberry32, puzzleFromSeed, rectAllowed,
  rectArea, rectCovers, solveCount,
} from '../src/client/games/shikaku/logic.ts'

describe('shikaku logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a()]).toEqual([b(), b()])
  })

  it('rect helpers compute area and coverage', () => {
    expect(rectArea([0, 0, 2, 3])).toBe(12)
    expect(rectCovers([0, 0, 2, 3], 0, 0)).toBe(true)
    expect(rectCovers([0, 0, 2, 3], 2, 3)).toBe(true)
    expect(rectCovers([0, 0, 2, 3], 3, 0)).toBe(false)
  })

  it('rectAllowed requires exactly one matching clue inside the board', () => {
    const clues = [{ cell: 14, area: 4 }] // cell 14 = (2,2); 2×2 at (2,2) on a 6×6
    expect(rectAllowed(6, clues, [2, 2, 3, 3])).toBe(true)
    expect(rectAllowed(6, clues, [2, 2, 3, 4])).toBe(false) // wrong area
    expect(rectAllowed(6, [{ cell: 14, area: 4 }], [0, 0, 1, 1])).toBe(false) // no clue inside
    expect(rectAllowed(6, clues, [4, 4, 5, 5])).toBe(false) // clue outside
    expect(rectAllowed(6, clues, [-1, 0, 0, 1])).toBe(false) // outside board
  })

  it('every level size generates a puzzle whose own partition wins', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      expect(p.size).toBe(levelSize(lv))
      expect(isWon(p.size, p.solution)).toBe(true)
      // Every clue rect covers exactly its own clue cell with matching area.
      for (let i = 0; i < p.clues.length; i += 1) {
        expect(p.solution[i]).toBeDefined()
        expect(rectArea(p.solution[i]!)).toBe(p.clues[i]!.area)
        const cell = p.clues[i]!.cell
        expect(rectCovers(p.solution[i]!, Math.floor(cell / p.size), cell % p.size)).toBe(true)
      }
    }
  })

  it('generated levels solve with at least one solution', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      const r = solveCount(p, 300_000)
      expect(r.exhausted).toBe(false)
      expect(r.solutions).toBeGreaterThanOrEqual(1)
    }
  })

  it('isWon rejects overlapping and partial coverage', () => {
    const p = puzzleFromSeed(1 * 0x9e3779b9, levelSize(1))
    expect(isWon(p.size, [])).toBe(false)
    expect(isWon(p.size, [...p.solution, p.solution[0]!])).toBe(false)
  })

  it('computeScore decays the time bonus to the base score', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
  })
})
