import { describe, expect, it } from 'vitest'
import {
  computeScore, isWon, levelIslands, levelSize, mulberry32, neighbors,
  puzzleFromSeed, solveCount,
} from '../src/client/games/nurikabe/logic.ts'

describe('nurikabe logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('neighbors stays inside the board', () => {
    expect(neighbors(6, 0)).toEqual([6, 1])
    expect(neighbors(6, 35)).toEqual([29, 34])
  })

  it('levelSize and levelIslands cycle their tables', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      expect(levelSize(lv)).toBe(levelSize(((lv - 1) % 5) + 1))
      expect(levelIslands(lv)).toBe(levelIslands(((lv - 1) % 5) + 1))
    }
    expect(levelSize(6)).toBe(levelSize(1))
    expect(levelIslands(6)).toBe(levelIslands(1))
  })

  it('every level generates a puzzle whose own sea wins', { timeout: 20000 }, () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv), levelIslands(lv))
      expect(p).not.toBeNull()
      const puzzle = p!
      expect(puzzle.size).toBe(levelSize(lv))
      expect(puzzle.numbers.size).toBe(levelIslands(lv))
      const sea = new Set<number>()
      puzzle.whites.forEach((white, cell) => { if (!white) sea.add(cell) })
      expect(isWon(puzzle, sea)).toBe(true)
    }
  })

  it('isWon rejects an empty sea and a blackened number anchor', () => {
    const p = puzzleFromSeed(1 * 0x9e3779b9, levelSize(1), levelIslands(1))!
    expect(isWon(p, new Set<number>())).toBe(false)
    const sea = new Set<number>()
    p.whites.forEach((white, cell) => { if (!white) sea.add(cell) })
    sea.add([...p.numbers.keys()][0]!) // blacken a number anchor
    expect(isWon(p, sea)).toBe(false)
  })

  it('a level-1 puzzle solves with at least one solution', () => {
    const p = puzzleFromSeed(1 * 0x9e3779b9, levelSize(1), levelIslands(1))!
    const r = solveCount(p, 60_000)
    expect(r.solutions).toBeGreaterThanOrEqual(1)
    if (p.unique) expect(r.solutions).toBe(1)
  })

  it('computeScore decays the time bonus to the base score', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
  })
})
