import { describe, expect, it } from 'vitest'
import {
  clearFullRows, collides, createTetrisState, ghostY, gravityInterval,
  hardDrop, holdPiece, move, rotate, spawn,
  COLS, ROWS,
} from '../src/client/games/tetris/board.ts'

/** Deterministic LCG so piece draws are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('tetris board', () => {
  it('spawns a centered piece without collision', () => {
    const state = createTetrisState(lcg(1))
    expect(state.current).not.toBeNull()
    expect(state.next).not.toBeNull()
    expect(collides(state.grid, state.current!)).toBe(false)
    expect(state.current!.x).toBeGreaterThanOrEqual(0)
    expect(state.current!.x + state.current!.shape[0]!.length).toBeLessThanOrEqual(COLS)
  })

  it('stops at the walls', () => {
    const state = createTetrisState(lcg(1))
    for (let i = 0; i < 50; i += 1) move(state, -1, 0)
    expect(state.current!.x).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 50; i += 1) move(state, 1, 0)
    expect(state.current!.x + state.current!.shape[0]!.length).toBeLessThanOrEqual(COLS)
  })

  it('rotates the I piece between horizontal and vertical', () => {
    const state = createTetrisState(lcg(1))
    // Force an I piece.
    state.current = { kind: 1, shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], x: 3, y: 0 }
    expect(rotate(state, 1)).toBe(true)
    // CW: the horizontal row becomes the right column (index 2) of the 4x4.
    const vertical = state.current!.shape
    expect(vertical[0]![2]).toBe(1)
    expect(vertical[1]![2]).toBe(1)
    expect(vertical[3]![2]).toBe(1)
    expect(vertical[0]![1]).toBe(0)
    expect(rotate(state, -1)).toBe(true)
    expect(state.current!.shape[1]![1]).toBe(1)
    expect(state.current!.shape[0]![1]).toBe(0)
  })

  it('locks the piece on gravity failure and spawns the next', () => {
    const state = createTetrisState(lcg(1))
    const first = state.current
    // Drop to the floor.
    for (let i = 0; i < ROWS + 5; i += 1) {
      if (!move(state, 0, 1)) break
    }
    expect(state.current).not.toBe(first)
    // Locked cells exist in the grid.
    const filled = state.grid.flat().filter(cell => cell !== 0).length
    expect(filled).toBeGreaterThan(0)
  })

  it('hard drop lands the piece at the floor', () => {
    const state = createTetrisState(lcg(1))
    const dropped = hardDrop(state)
    expect(dropped).toBeGreaterThan(0)
    // The piece is gone from the current slot and cells are locked in.
    expect(state.current).not.toBeNull() // next piece spawned
    const filled = state.grid.flat().filter(cell => cell !== 0).length
    expect(filled).toBeGreaterThan(0)
  })

  it('clears full rows and scores by line count', () => {
    const grid = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0))
    grid[ROWS - 1] = Array<number>(COLS).fill(3)
    grid[ROWS - 2] = Array<number>(COLS).fill(3)
    expect(clearFullRows(grid)).toBe(2)
    expect(grid[ROWS - 1]!.every(cell => cell === 0)).toBe(true)
  })

  it('scores line clears through a lock', () => {
    const state = createTetrisState(lcg(1))
    // Fill the bottom row except the two cells under where the O piece lands;
    // locking it completes the row -> one line, 100 * level points.
    state.grid[ROWS - 1] = Array<number>(COLS).fill(3)
    state.grid[ROWS - 1]![0] = 0
    state.grid[ROWS - 1]![1] = 0
    state.current = { kind: 2, shape: [[1, 1], [1, 1]], x: 0, y: ROWS - 2 }
    state.score = 0
    state.level = 1
    // Gravity fails immediately (the row below is out of bounds) -> locks.
    move(state, 0, 1)
    expect(state.lines).toBe(1)
    expect(state.score).toBe(100)
  })

  it('hold swaps the piece once per drop', () => {
    const state = createTetrisState(lcg(1))
    const first = state.current
    holdPiece(state)
    expect(state.hold).toBe(first)
    expect(state.canHold).toBe(false)
    const second = state.current
    holdPiece(state) // blocked this drop
    expect(state.current).toBe(second)
  })

  it('hard drop locks exactly one piece', () => {
    // Regression: hardDrop must not lock the freshly spawned piece at the top
    // (a double-lock merged each new piece instantly, piling the board).
    const state = createTetrisState(lcg(5))
    const cellsInPiece = state.current!.shape.flat().filter(Boolean).length
    hardDrop(state)
    const filled = state.grid.flat().filter(cell => cell !== 0).length
    expect(filled).toBe(cellsInPiece)
    // The current piece is still a live, un-merged piece.
    expect(state.current).not.toBeNull()
    expect(collides(state.grid, state.current!)).toBe(false)
  })

  it('game over when the spawn point is blocked', () => {
    const state = createTetrisState(lcg(1))
    for (let r = 0; r < 2; r += 1) state.grid[r] = Array<number>(COLS).fill(1)
    state.current = { kind: 2, shape: [[1, 1], [1, 1]], x: 0, y: 0 }
    spawn(state)
    expect(state.over).toBe(true)
  })

  it('ghost y sits at the landing row', () => {
    const state = createTetrisState(lcg(1))
    const ghost = ghostY(state)
    const probe = { ...state.current!, y: ghost + 1 }
    expect(collides(state.grid, probe)).toBe(true)
  })

  it('gravity speeds up with level', () => {
    expect(gravityInterval(1)).toBe(800)
    expect(gravityInterval(2)).toBe(720)
    expect(gravityInterval(99)).toBe(120)
  })
})
