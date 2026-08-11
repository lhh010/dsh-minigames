import { describe, expect, it } from 'vitest'
import {
  chord, createMinesweeperState, reveal, tick, toggleFlag, seedMines, revealAllMines,
  COLS, ROWS, MINES,
} from '../src/client/games/minesweeper/logic.ts'
import type { Cell, MinesweeperState } from '../src/client/games/minesweeper/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Build a pre-seeded 9×9 board from an ASCII layout placed at the top-left:
 * `*` is a mine, `.` is a safe cell (any other char is treated as a safe
 * cell too — it is only a visual marker). The rest of the board is safe.
 * Counts are derived from the layout, so tests can assert on chord behaviour
 * without fighting the random mine placement.
 */
function boardFrom(rows: string[]): MinesweeperState {
  const grid: Cell[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      const ch = rows[r] ? rows[r]![c] ?? '.' : '.'
      return { mine: ch === '*', count: 0, revealed: false, flagged: false }
    }),
  )
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      let count = 0
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr]![nc]!.mine) {
            count += 1
          }
        }
      }
      grid[r]![c]!.count = count
    }
  }
  const safeCells = grid.flat().filter((cell) => !cell.mine).length
  return { grid, seeded: true, revealed: 0, safeCells, elapsed: 0, over: false, won: false, rng: Math.random }
}

/** Mark a cell as already revealed (as if the player clicked it earlier). */
function opened(state: MinesweeperState, r: number, c: number): void {
  state.grid[r]![c]!.revealed = true
  state.revealed += 1
}

describe('minesweeper logic', () => {
  it('creates an unseeded board with no mines', () => {
    const state = createMinesweeperState(lcg(1))
    expect(state.seeded).toBe(false)
    expect(state.grid.flat().every(c => !c.mine)).toBe(true)
  })

  it('first click seeds mines safely away from the click', () => {
    const state = createMinesweeperState(lcg(1))
    reveal(state, 0, 0)
    expect(state.seeded).toBe(true)
    expect(state.over).toBe(false) // first click is never a mine
    // No mine within the 3x3 safe zone of (0,0).
    for (let r = 0; r <= 1; r += 1) {
      for (let c = 0; c <= 1; c += 1) {
        expect(state.grid[r]![c]!.mine).toBe(false)
      }
    }
  })

  it('places exactly MINES mines', () => {
    const state = createMinesweeperState(lcg(1))
    seedMines(state, 4, 4)
    const mines = state.grid.flat().filter(c => c.mine).length
    expect(mines).toBe(MINES)
  })

  it('flood-fills zero-count cells', () => {
    const state = createMinesweeperState(lcg(1))
    seedMines(state, 0, 0)
    // The first-click safe zone keeps (0,0) mine-free, so its count is 0 and
    // revealing it floods outward.
    expect(state.grid[0]![0]!.count).toBe(0)
    reveal(state, 0, 0)
    expect(state.revealed).toBeGreaterThan(1)
  })

  it('reveal on a mine ends the game', () => {
    const state = createMinesweeperState(lcg(1))
    seedMines(state, 0, 0)
    // Find a mine and reveal it.
    const mine: [number, number] = state.grid.flatMap((row, r) =>
      row.map((cell, c) => (cell.mine ? [[r, c]] as Array<[number, number]> : [])).flat())[0]!
    reveal(state, mine[0], mine[1])
    expect(state.over).toBe(true)
  })

  it('flags toggle and block reveal', () => {
    const state = createMinesweeperState(lcg(1))
    seedMines(state, 4, 4)
    toggleFlag(state, 0, 0)
    expect(state.grid[0]![0]!.flagged).toBe(true)
    const before = state.revealed
    reveal(state, 0, 0) // flagged cells do not reveal
    expect(state.revealed).toBe(before)
    toggleFlag(state, 0, 0)
    expect(state.grid[0]![0]!.flagged).toBe(false)
  })

  it('wins when all safe cells are revealed', () => {
    const state = createMinesweeperState(lcg(1))
    seedMines(state, 4, 4)
    // Reveal everything except mines.
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (!state.grid[r]![c]!.mine) reveal(state, r, c)
      }
    }
    expect(state.won).toBe(true)
    expect(state.over).toBe(false)
  })

  it('revealAllMines exposes the mine field after a loss', () => {
    const state = createMinesweeperState(lcg(1))
    seedMines(state, 0, 0)
    revealAllMines(state)
    expect(state.grid.flat().every(c => !c.mine || c.revealed)).toBe(true)
    expect(COLS * ROWS).toBe(81)
  })

  describe('tick (game clock)', () => {
    it('does not run before the first click', () => {
      const state = createMinesweeperState(lcg(1))
      tick(state, 1)
      tick(state, 0.5)
      expect(state.elapsed).toBe(0)
    })

    it('counts up after the first reveal and stops on win', () => {
      const state = boardFrom([
        '.*.',
        '.1.',
        '...',
      ])
      reveal(state, 1, 1)
      tick(state, 2)
      tick(state, 0.5)
      expect(state.elapsed).toBe(2.5)
      // Finish the board: the clock must freeze once won.
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          if (!state.grid[r]![c]!.mine) reveal(state, r, c)
        }
      }
      expect(state.won).toBe(true)
      const frozen = state.elapsed
      tick(state, 3)
      expect(state.elapsed).toBe(frozen)
    })

    it('freezes on a loss', () => {
      const state = boardFrom([
        '.**',
        '.2.',
        '...',
      ])
      reveal(state, 0, 2) // a mine -> over
      expect(state.over).toBe(true)
      const frozen = state.elapsed
      tick(state, 3)
      expect(state.elapsed).toBe(frozen)
    })
  })

  describe('chord (double-click a revealed number)', () => {
    it('reveals unflagged neighbours when the flagged count matches the number', () => {
      const state = boardFrom([
        '.*.',
        '.1.',
        '...',
      ])
      opened(state, 1, 1) // count 1, mine at (0,1)
      toggleFlag(state, 0, 1)
      chord(state, 1, 1)
      // The zero cell at (2,0) floods outward, so every safe cell ends up
      // revealed; only the flagged mine stays hidden.
      expect(state.over).toBe(false)
      expect(state.grid[0]![1]!.revealed).toBe(false)
      expect(state.grid[0]![1]!.flagged).toBe(true)
      expect(state.revealed).toBe(80)
      expect(state.won).toBe(true)
    })

    it('does nothing when the flagged count does not match the number', () => {
      const state = boardFrom([
        '.*.',
        '.1.',
        '...',
      ])
      opened(state, 1, 1)
      toggleFlag(state, 0, 1)
      toggleFlag(state, 0, 0) // over-flagged: 2 flags vs count 1
      chord(state, 1, 1)
      expect(state.revealed).toBe(1)
      expect(state.over).toBe(false)
    })

    it('reveals a mine and ends the game when a flag is misplaced', () => {
      const state = boardFrom([
        '.**',
        '.2.',
        '...',
      ])
      opened(state, 1, 1) // count 2, mines at (0,1) and (0,2)
      toggleFlag(state, 0, 1) // correct flag
      toggleFlag(state, 0, 0) // wrong flag: safe cell
      chord(state, 1, 1) // 2 flags == count, so (0,2) — an unflagged mine — is hit
      expect(state.over).toBe(true)
      expect(state.grid.flat().every(c => !c.mine || c.revealed)).toBe(true)
    })

    it('is a no-op on a hidden cell', () => {
      const state = boardFrom([
        '.*.',
        '.1.',
        '...',
      ])
      chord(state, 1, 1)
      expect(state.revealed).toBe(0)
      expect(state.over).toBe(false)
    })
  })
})
