import { describe, expect, it } from 'vitest'
import {
  BASE_TOGGLES, MAX_TOGGLES, SIZE, emptyBoard, isSolved, neighbors,
  scramble, scrambleCount, scrambleMoves, toggleAt,
} from '../src/client/games/lightsout/logic.ts'

function countLit(board: boolean[][]): number {
  return board.flat().filter(Boolean).length
}

describe('lights out logic', () => {
  it('neighbors: corner toggles 2, edge 3, center 4, never out of bounds', () => {
    const sorted = (cells: [number, number][]) => [...cells].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
    expect(sorted(neighbors(0, 0))).toEqual(sorted([[0, 1], [1, 0]]))
    expect(sorted(neighbors(0, SIZE - 1))).toEqual(sorted([[0, SIZE - 2], [1, SIZE - 1]]))
    expect(sorted(neighbors(SIZE - 1, 0))).toEqual(sorted([[SIZE - 2, 0], [SIZE - 1, 1]]))
    expect(sorted(neighbors(SIZE - 1, SIZE - 1))).toEqual(sorted([[SIZE - 2, SIZE - 1], [SIZE - 1, SIZE - 2]]))
    expect(sorted(neighbors(0, 2))).toEqual(sorted([[0, 1], [0, 3], [1, 2]]))
    expect(sorted(neighbors(2, 0))).toEqual(sorted([[1, 0], [2, 1], [3, 0]]))
    expect(sorted(neighbors(2, 2))).toEqual(sorted([[1, 2], [3, 2], [2, 1], [2, 3]]))
  })

  it('toggleAt flips exactly the cell and its orthogonal neighbors (pure)', () => {
    const board = emptyBoard()
    const next = toggleAt(board, 2, 2)
    // Only the plus-shape around (2,2) is lit.
    const falseRow = Array.from({ length: SIZE }, () => false)
    expect(next).toEqual([
      falseRow.slice(),
      [false, false, true, false, false],
      [false, true, true, true, false],
      [false, false, true, false, false],
      falseRow.slice(),
    ])
    expect(countLit(next)).toBe(5)
    // Input board untouched.
    expect(isSolved(board)).toBe(true)
  })

  it('toggleAt on a corner flips exactly 3 cells', () => {
    const next = toggleAt(emptyBoard(), 0, 0)
    expect(next[0]![0]).toBe(true)
    expect(next[0]![1]).toBe(true)
    expect(next[1]![0]).toBe(true)
    expect(countLit(next)).toBe(3)
  })

  it('toggling the same set of cells twice is the identity', () => {
    let board = emptyBoard()
    board = toggleAt(board, 0, 0)
    board = toggleAt(board, 3, 4)
    expect(isSolved(board)).toBe(false) // scrambled, not identity yet
    board = toggleAt(board, 0, 0)
    board = toggleAt(board, 3, 4)
    expect(board).toEqual(emptyBoard())
    expect(isSolved(board)).toBe(true)
  })

  it('isSolved: true for all-off, false with any light on', () => {
    expect(isSolved(emptyBoard())).toBe(true)
    const one = emptyBoard()
    one[4]![4] = true
    expect(isSolved(one)).toBe(false)
    expect(isSolved(toggleAt(emptyBoard(), 2, 3))).toBe(false)
  })

  it('scrambleCount grows 4 at level 1 by +1 per level and caps at 12', () => {
    expect(scrambleCount(1)).toBe(BASE_TOGGLES)
    expect(scrambleCount(2)).toBe(5)
    expect(scrambleCount(MAX_TOGGLES - BASE_TOGGLES + 1)).toBe(MAX_TOGGLES)
    expect(scrambleCount(99)).toBe(MAX_TOGGLES)
  })

  it('scramble is deterministic per seed and differs across seeds', () => {
    expect(scramble(42, 8)).toEqual(scramble(42, 8))
    expect(scrambleMoves(42, 8)).toEqual(scrambleMoves(42, 8))
    expect(scramble(42, 8)).not.toEqual(scramble(43, 8))
  })

  it('every scramble is solvable: reapplying the same toggles solves it', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      let board = scramble(seed, scrambleCount(seed % 12 + 1))
      const moves = scrambleMoves(seed, scrambleCount(seed % 12 + 1))
      for (const [r, c] of moves) board = toggleAt(board, r, c)
      expect(isSolved(board)).toBe(true)
    }
  })

  it('a scramble actually turns lights on (start state is not already solved)', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      expect(isSolved(scramble(seed, 4))).toBe(false)
    }
  })
})
