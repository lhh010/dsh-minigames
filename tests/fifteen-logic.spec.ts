import { describe, expect, it } from 'vitest'
import {
  blankIndex, createSolved, isSolved, opposite, scrambleFrom, scrambleMovesFor, slide,
  solvableParity,
} from '../src/client/games/fifteen/logic.ts'

describe('15-Puzzle logic', () => {
  it('createSolved lays out 1..n²-1 with the blank last', () => {
    for (const size of [3, 4, 5]) {
      const board = createSolved(size)
      expect(board).toHaveLength(size * size)
      expect(board.slice(0, -1)).toEqual(Array.from({ length: size * size - 1 }, (_, i) => i + 1))
      expect(board[size * size - 1]).toBe(0)
      expect(blankIndex(board)).toBe(size * size - 1)
    }
  })

  it('slide accepts only into-blank tile moves: each direction', () => {
    // Blank at (1,1) centre: every direction has an adjacent tile.
    const board = [
      1, 2, 3,
      4, 0, 5,
      6, 7, 8,
    ]
    // Tile moves up → the tile below the blank (7) enters the blank.
    expect(slide(board, 'up')).toEqual([1, 2, 3, 4, 7, 5, 6, 0, 8])
    // Tile moves down → the tile above (2).
    expect(slide(board, 'down')).toEqual([1, 0, 3, 4, 2, 5, 6, 7, 8])
    // Tile moves left → the tile to the right (5).
    expect(slide(board, 'left')).toEqual([1, 2, 3, 4, 5, 0, 6, 7, 8])
    // Tile moves right → the tile to the left (4).
    expect(slide(board, 'right')).toEqual([1, 2, 3, 0, 4, 5, 6, 7, 8])
  })

  it('slide rejects directions with no tile to move', () => {
    const solved = createSolved(4)
    // Blank at bottom-right: only tiles above (down) and left (right) exist.
    expect(slide(solved, 'down')).not.toBeNull()
    expect(slide(solved, 'right')).not.toBeNull()
    expect(slide(createSolved(4), 'up')).toBeNull()
    expect(slide(createSolved(4), 'left')).toBeNull()
  })

  it('slide by tile index only accepts tiles adjacent to the blank', () => {
    const board = [
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 0, 11,
      12, 13, 14, 15,
    ]
    expect(slide(board, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15])
    expect(slide(board, 6)).not.toBeNull() // directly above the blank: adjacent
    expect(slide(board, 5)).toBeNull() // diagonal from the blank
    expect(slide(board, 15)).toBeNull() // diagonal
    expect(slide(board, 9)).not.toBeNull()
    expect(slide(board, blankIndex(board))).toBeNull() // the blank itself
  })

  it('slide is pure: the input board is unchanged', () => {
    const board = [1, 2, 3, 4, 5, 6, 7, 0, 8]
    const before = [...board]
    slide(board, 'down')
    slide(board, 8)
    slide(board, 'nope' as never)
    expect(board).toEqual(before)
  })

  it('scrambleFrom is deterministic and never returns a solved board', () => {
    for (const size of [3, 4, 5]) {
      for (const seed of [1, 42, 0x9e3779b9]) {
        const a = scrambleFrom(createSolved(size), seed, scrambleMovesFor(size))
        const b = scrambleFrom(createSolved(size), seed, scrambleMovesFor(size))
        expect(a.board).toEqual(b.board)
        expect(a.moves).toEqual(b.moves)
        expect(isSolved(a.board)).toBe(false)
      }
    }
  })

  it('scrambling from solved with legal moves keeps the board parity-solvable', () => {
    for (const size of [3, 4, 5]) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const { board } = scrambleFrom(createSolved(size), seed, scrambleMovesFor(size))
        expect(solvableParity(board, size)).toBe(true)
      }
    }
  })

  it('solvableParity: solved boards pass, the classic 14-15 swap fails', () => {
    expect(solvableParity(createSolved(3), 3)).toBe(true)
    expect(solvableParity(createSolved(4), 4)).toBe(true)
    expect(solvableParity(createSolved(5), 5)).toBe(true)
    // Sam Loyd's 14-15 puzzle: swap 14 and 15 with the blank at bottom-right.
    const swapped = [...createSolved(4)]
    swapped[13] = 15
    swapped[14] = 14
    expect(solvableParity(swapped, 4)).toBe(false)
  })

  it('isSolved detects the goal and a one-move-off board', () => {
    expect(isSolved(createSolved(4))).toBe(true)
    const moved = slide(createSolved(4), 'down')!
    expect(isSolved(moved)).toBe(false)
    expect(isSolved(slide(moved, 'up')!)).toBe(true)
  })

  it('undo inverse: a slide followed by the opposite slide restores the board', () => {
    for (const size of [3, 4, 5]) {
      const { board } = scrambleFrom(createSolved(size), size * 7, 25)
      const after = slide(board, 'left')
      if (after !== null) {
        expect(slide(after, opposite('left'))).toEqual(board)
      }
      const byTile = slide(board, 0)
      if (byTile !== null) {
        // Undoing a tile slide: slide the same tile back from its new home.
        expect(slide(byTile, blankIndex(board))).toEqual(board)
      }
    }
  })

  it('scrambleMovesFor scales with board size', () => {
    expect(scrambleMovesFor(3)).toBe(30)
    expect(scrambleMovesFor(4)).toBe(40)
    expect(scrambleMovesFor(5)).toBe(50)
  })

  it('5×5 variant sanity: scramble differs by seed and slides stay legal', () => {
    const solved = createSolved(5)
    const a = scrambleFrom(solved, 99, 12)
    const b = scrambleFrom(solved, 100, 12)
    expect(a.moves).toBeGreaterThanOrEqual(12)
    expect(a.board).not.toEqual(b.board)
    expect(solvableParity(a.board, 5)).toBe(true)
    // Blank lands somewhere inside the 5×5 grid and its tile slides legally.
    const blank = blankIndex(a.board)
    expect(blank).toBeGreaterThanOrEqual(0)
    expect(blank).toBeLessThan(25)
    // At least one direction has a legal slide that changes the board.
    const moved = (['up', 'down', 'left', 'right'] as const)
      .map((d) => slide(a.board, d))
      .find((next) => next !== null)
    expect(moved).toBeDefined()
    expect(moved).not.toEqual(a.board)
  })
})
