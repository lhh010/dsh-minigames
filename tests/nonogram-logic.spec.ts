import { describe, expect, it } from 'vitest'
import {
  SIZE, checkWin, cluesFrom, lineSolveLine, makePattern, solveFromClues,
  type Cell,
} from '../src/client/games/nonogram/logic.ts'

function patternOf(rows: string[]): boolean[][] {
  return rows.map(row => [...row].map(ch => ch === '#'))
}

describe('nonogram logic', () => {
  it('cluesFrom maps an empty line to [0]', () => {
    const pattern = patternOf(['..........'])
    const { rows } = cluesFrom(pattern)
    expect(rows[0]).toEqual([0])
  })

  it('cluesFrom derives basic runs', () => {
    const pattern = patternOf(['##.####.#.'])
    const { rows } = cluesFrom(pattern)
    expect(rows[0]).toEqual([2, 4, 1])
  })

  it('cluesFrom derives column clues', () => {
    const pattern = patternOf([
      '#..',
      '#..',
      '..#',
    ].map(r => r.padEnd(SIZE, '.')))
    const { cols } = cluesFrom(pattern)
    // Columns beyond the drawn 3 do not exist here; check the first three.
    expect(cols[0]).toEqual([2])
    expect(cols[1]).toEqual([0])
    expect(cols[2]).toEqual([1])
  })

  it('lineSolveLine: full-run clue [10] fills the whole line', () => {
    const known = Array<boolean | null>(10).fill(null)
    expect(lineSolveLine([10], known)).toEqual(Array<boolean>(10).fill(true))
  })

  it('lineSolveLine: [2,2] on 5 cells is fully determined', () => {
    const known = Array<boolean | null>(5).fill(null)
    expect(lineSolveLine([2, 2], known)).toEqual([true, true, false, true, true])
  })

  it('lineSolveLine: edge anchoring — filled first cell pins clue [3] on 5', () => {
    const known: (boolean | null)[] = [true, null, null, null, null]
    expect(lineSolveLine([3], known)).toEqual([true, true, true, false, false])
  })

  it('lineSolveLine: empty clue [0] clears the line', () => {
    const known: (boolean | null)[] = [null, null, null, null, null]
    expect(lineSolveLine([0], known)).toEqual([false, false, false, false, false])
  })

  it('lineSolveLine: contradictory input returns the line unchanged', () => {
    const known: (boolean | null)[] = [true, false, null, null, null]
    // [5] cannot fit with the second cell known empty.
    expect(lineSolveLine([5], known)).toEqual(known)
  })

  it('makePattern is deterministic with 10x10 dimensions', () => {
    const a = makePattern(0x1234)
    const b = makePattern(0x1234)
    expect(a).toEqual(b)
    expect(a.length).toBe(10)
    expect(a.every(row => row.length === 10)).toBe(true)
  })

  it('makePattern stays within the 45%-65% density band', () => {
    for (let i = 1; i <= 6; i += 1) {
      const density = makePattern(i * 0x9e3779b9).flat().filter(Boolean).length / 100
      expect(density).toBeGreaterThanOrEqual(0.45)
      expect(density).toBeLessThanOrEqual(0.65)
    }
  })

  it('every seeded level is uniquely recoverable by iterated line solving', () => {
    for (let i = 1; i <= 6; i += 1) {
      const pattern = makePattern(i * 0x9e3779b9)
      const solved = solveFromClues(cluesFrom(pattern))
      expect(solved.every((row, r) => row.every((v, c) => v === pattern[r]![c]))).toBe(true)
    }
  })

  it('checkWin requires an exact fill match; crosses are irrelevant', () => {
    const pattern = patternOf(['##.', '.#.', '...'])
    const won: Cell[][] = [
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]
    expect(checkWin(won, pattern)).toBe(true)
    const crossed: Cell[][] = [
      [1, 1, 2],
      [2, 1, 2],
      [2, 2, 2],
    ]
    expect(checkWin(crossed, pattern)).toBe(true)
    const missed: Cell[][] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]
    expect(checkWin(missed, pattern)).toBe(false)
    const extra: Cell[][] = [
      [1, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ]
    expect(checkWin(extra, pattern)).toBe(false)
  })
})
