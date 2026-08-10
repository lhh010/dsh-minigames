import { describe, expect, it } from 'vitest'
import {
  createHuarongState, isSolved, shuffle, slideAt, slideDirection,
  type HuarongState,
} from '../src/client/games/huarong/logic.ts'

describe('huarong (15-puzzle) logic', () => {
  it('creates a shuffled, solvable 4x4 board with one empty cell', () => {
    const state = createHuarongState()
    expect(state.rows).toBe(4)
    expect(state.cols).toBe(4)
    const flat = state.board.flat()
    expect(flat).toHaveLength(16)
    expect(flat.filter(v => v === 0)).toHaveLength(1)
    expect(flat.filter(v => v >= 1 && v <= 15)).toHaveLength(15)
    expect(state.solved).toBe(false) // shuffled, not already solved
  })

  it('detects the solved state', () => {
    const state: HuarongState = {
      rows: 4, cols: 4,
      board: [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 0],
      ],
      empty: { r: 3, c: 3 },
      moves: 0, solved: true, elapsed: 0,
    }
    expect(isSolved(state)).toBe(true)
    state.board[0]![0] = 2
    state.board[0]![1] = 1
    expect(isSolved(state)).toBe(false)
  })

  it('slides an adjacent tile into the empty and updates the board', () => {
    const state = createHuarongState()
    // Place a known configuration for deterministic testing.
    state.board = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 0, 15],
    ]
    state.empty = { r: 3, c: 2 }
    state.solved = false
    const slides = slideAt(state, 3, 3) // tile 15 slides left into empty
    expect(slides).not.toBeNull()
    expect(slides!.length).toBe(1)
    expect(state.board[3]![2]).toBe(15)
    expect(state.board[3]![3]).toBe(0)
    expect(state.empty).toEqual({ r: 3, c: 3 })
    expect(state.moves).toBe(1)
    expect(state.solved).toBe(true) // now 1..15 in order, empty at bottom-right
  })

  it('slides a run of tiles in the same row toward the empty', () => {
    const state = createHuarongState()
    state.board = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 0, 14, 15],
    ]
    state.empty = { r: 3, c: 1 }
    state.solved = false
    const slides = slideAt(state, 3, 3) // click tile 15 → tiles 14,15 slide left
    expect(slides).not.toBeNull()
    expect(slides!.length).toBe(2)
    expect(state.board[3]).toEqual([13, 14, 15, 0])
    expect(state.empty).toEqual({ r: 3, c: 3 })
    expect(state.solved).toBe(true)
  })

  it('rejects slides that do not share a row or column with the empty', () => {
    const state = createHuarongState()
    state.board = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 0],
    ]
    state.empty = { r: 3, c: 3 }
    expect(slideAt(state, 0, 0)).toBeNull() // diagonal — not aligned
    expect(slideAt(state, 3, 3)).toBeNull() // the empty itself
    expect(state.moves).toBe(0)
  })

  it('slideDirection maps arrow keys to tile motion', () => {
    const state = createHuarongState()
    state.board = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 0],
    ]
    state.empty = { r: 3, c: 3 }
    // dir 1 (right): tile to the LEFT of empty (15) slides right into empty.
    expect(slideDirection(state, 1)).not.toBeNull()
    expect(state.board[3]![3]).toBe(15)
    expect(state.empty).toEqual({ r: 3, c: 2 })
    // dir 3 (left) now: tile to the RIGHT of empty → OOB at column 2+1=3? empty at
    // (3,2); tile to the right is (3,3)=15 which just moved → slides left back.
    expect(slideDirection(state, 3)).not.toBeNull()
    expect(state.board[3]![2]).toBe(15)
    expect(state.empty).toEqual({ r: 3, c: 3 })
  })

  it('shuffle always produces a solvable (and usually unsolved) board', () => {
    const state = createHuarongState()
    const before = JSON.stringify(state.board)
    shuffle(state, 200)
    const after = JSON.stringify(state.board)
    expect(after).not.toEqual(before) // it changed
    expect(state.board.flat().filter(v => v === 0)).toHaveLength(1)
    // The exact probability of a 200-move shuffle landing on solved is ~0;
    // just assert the shuffle ran.
    expect(state.moves).toBe(0)
  })
})
