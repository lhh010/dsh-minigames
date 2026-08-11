import { describe, expect, it } from 'vitest'
import {
  conflictsAt, createSudokuState, generateSolution, makePuzzle, place, tick,
  SIZE,
} from '../src/client/games/sudoku/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function isCompleteValid(grid: (number | null)[][]): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    const row = new Set<number>()
    const col = new Set<number>()
    for (let c = 0; c < SIZE; c += 1) {
      const v = grid[r]![c]!
      if (v === null) return false
      row.add(v)
      col.add(grid[c]![r]!)
    }
    if (row.size !== 9 || col.size !== 9) return false
  }
  for (let br = 0; br < 3; br += 1) {
    for (let bc = 0; bc < 3; bc += 1) {
      const box = new Set<number>()
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) {
          box.add(grid[br * 3 + dr]![bc * 3 + dc]!)
        }
      }
      if (box.size !== 9) return false
    }
  }
  return true
}

describe('sudoku logic', () => {
  it('generates a complete valid solution', () => {
    const solution = generateSolution(lcg(7))
    expect(isCompleteValid(solution)).toBe(true)
  })

  it('makePuzzle removes cells symmetrically and keeps the target clue count', () => {
    const solution = generateSolution(lcg(7))
    const puzzle = makePuzzle(solution, 35, lcg(11))
    const clues = puzzle.flat().filter(v => v !== null).length
    // Symmetric removal may leave one extra clue (the centre cell when the
    // target parity mismatches), but never fewer than the target.
    expect(clues).toBeGreaterThanOrEqual(35)
    expect(clues).toBeLessThanOrEqual(36)
    // Symmetric removal: (r,c) empty iff (8-r,8-c) empty.
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        expect((puzzle[r]![c] === null) === (puzzle[SIZE - 1 - r]![SIZE - 1 - c] === null)).toBe(true)
      }
    }
    // The original solution still satisfies every clue.
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const clue = puzzle[r]![c]
        if (clue !== null) expect(solution[r]![c]).toBe(clue)
      }
    }
  })

  it('createSudokuState starts with the puzzle as the grid', () => {
    const state = createSudokuState(lcg(3))
    expect(state.won).toBe(false)
    expect(state.elapsed).toBe(0)
    expect(state.grid).toEqual(state.puzzle)
  })

  it('place fills and clears a free cell but never a clue', () => {
    const state = createSudokuState(lcg(3))
    // Find a free cell and a clue cell.
    let free: [number, number] | null = null
    let clue: [number, number] | null = null
    for (let r = 0; r < SIZE && (free === null || clue === null); r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.puzzle[r]![c] === null && free === null) free = [r, c]
        if (state.puzzle[r]![c] !== null && clue === null) clue = [r, c]
      }
    }
    expect(place(state, free![0], free![1], 5)).toBe(true)
    expect(state.grid[free![0]]![free![1]]).toBe(5)
    expect(place(state, free![0], free![1], 0)).toBe(true)
    expect(state.grid[free![0]]![free![1]]).toBe(null)
    expect(place(state, clue![0], clue![1], 3)).toBe(false)
    expect(state.grid[clue![0]]![clue![1]]).toBe(state.puzzle[clue![0]]![clue![1]])
  })

  it('conflictsAt flags a duplicate in the same row', () => {
    const state = createSudokuState(lcg(3))
    // Two free cells in the same row.
    let a: [number, number] | null = null
    let b: [number, number] | null = null
    for (let c = 0; c < SIZE; c += 1) {
      if (state.puzzle[0]![c] === null && a === null) a = [0, c]
      else if (state.puzzle[0]![c] === null && b === null) b = [0, c]
    }
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    place(state, a![0], a![1], 5)
    place(state, b![0], b![1], 5)
    expect(conflictsAt(state, a![0], a![1])).toBe(true)
  })

  it('the game clock runs until the win', () => {
    const state = createSudokuState(lcg(3))
    tick(state, 2)
    tick(state, 0.5)
    expect(state.elapsed).toBe(2.5)
  })

  it('filling every cell without conflicts wins', () => {
    // Same seed as the state: the generator deterministically reproduces the
    // exact solution this puzzle was carved from.
    const state = createSudokuState(lcg(7))
    const solution = generateSolution(lcg(7))
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.puzzle[r]![c] === null) place(state, r, c, solution[r]![c]!)
      }
    }
    expect(state.won).toBe(true)
  })
})
