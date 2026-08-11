/**
 * Minesweeper pure logic: a grid of mines, numbers, and hidden cells with
 * flood-fill reveal and flag marking. First click is always safe; the game is
 * won when all non-mine cells are revealed. Deterministic functions over a
 * plain state object — the game instance drives mouse input, tests drive the
 * logic directly.
 */

export const COLS = 9
export const ROWS = 9
export const MINES = 10

export interface Cell {
  mine: boolean
  /** Adjacent mine count (-1 until revealed). */
  count: number
  revealed: boolean
  flagged: boolean
}

export interface MinesweeperState {
  grid: Cell[][]
  /** Whether mines have been placed yet (first click places them). */
  seeded: boolean
  revealed: number
  safeCells: number
  /** Elapsed seconds since the first click; frozen on win/over. */
  elapsed: number
  over: boolean
  won: boolean
  rng: () => number
}

function makeCell(): Cell {
  return { mine: false, count: 0, revealed: false, flagged: false }
}

/** A fresh unseeded board. */
export function createMinesweeperState(rng: () => number = Math.random): MinesweeperState {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, makeCell))
  return {
    grid,
    seeded: false,
    revealed: 0,
    safeCells: ROWS * COLS - MINES,
    elapsed: 0,
    over: false,
    won: false,
    rng,
  }
}

/** Advance the game clock: counts only after the first click, until the end. */
export function tick(state: MinesweeperState, dt: number): void {
  if (state.seeded && !state.over && !state.won) state.elapsed += dt
}

function neighbours(r: number, c: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push([nr, nc])
    }
  }
  return out
}

/** Place mines avoiding the first-click cell and its neighbours. */
export function seedMines(state: MinesweeperState, safeR: number, safeC: number): void {
  const safe = new Set([[safeR, safeC], ...neighbours(safeR, safeC)].map(([r, c]) => `${r},${c}`))
  const candidates: Array<[number, number]> = []
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (!safe.has(`${r},${c}`)) candidates.push([r, c])
    }
  }
  let placed = 0
  while (placed < MINES && candidates.length > 0) {
    const idx = Math.floor(state.rng() * candidates.length)
    const [r, c] = candidates.splice(idx, 1)[0]!
    state.grid[r]![c]!.mine = true
    placed += 1
  }
  // Count neighbours.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      let count = 0
      for (const [nr, nc] of neighbours(r, c)) {
        if (state.grid[nr]![nc]!.mine) count += 1
      }
      state.grid[r]![c]!.count = count
    }
  }
  state.seeded = true
}

/** Reveal a cell; flood-fill zeros. Returns true if a mine was hit. */
export function reveal(state: MinesweeperState, r: number, c: number): boolean {
  const cell = state.grid[r]![c]!
  if (cell.revealed || cell.flagged || state.over || state.won) return false
  if (!state.seeded) seedMines(state, r, c)

  const stack: Array<[number, number]> = [[r, c]]
  while (stack.length > 0) {
    const [cr, cc] = stack.pop()!
    const cur = state.grid[cr]![cc]!
    if (cur.revealed || cur.flagged) continue
    cur.revealed = true
    state.revealed += 1
    if (cur.mine) {
      state.over = true
      return true
    }
    if (cur.count === 0) {
      for (const [nr, nc] of neighbours(cr, cc)) {
        if (!state.grid[nr]![nc]!.revealed) stack.push([nr, nc])
      }
    }
  }
  if (state.revealed >= state.safeCells) state.won = true
  return false
}

/** Toggle a flag on a hidden cell. */
export function toggleFlag(state: MinesweeperState, r: number, c: number): void {
  const cell = state.grid[r]![c]!
  if (cell.revealed || state.over || state.won) return
  cell.flagged = !cell.flagged
}

/**
 * Chord (double-click a revealed number): when the flagged neighbours equal
 * the cell's count, reveal every unopened, unflagged neighbour — with the
 * classic risk that a mis-placed flag exposes a mine and ends the game.
 */
export function chord(state: MinesweeperState, r: number, c: number): void {
  const cell = state.grid[r]![c]!
  if (!cell.revealed || cell.mine || state.over || state.won) return
  const around = neighbours(r, c)
  const flagCount = around.filter(([nr, nc]) => state.grid[nr]![nc]!.flagged).length
  if (flagCount !== cell.count) return
  for (const [nr, nc] of around) {
    if (reveal(state, nr, nc) && state.over) {
      revealAllMines(state)
      return
    }
  }
}

/** Reveal all mines (game over display). */
export function revealAllMines(state: MinesweeperState): void {
  for (const row of state.grid) {
    for (const cell of row) {
      if (cell.mine) cell.revealed = true
    }
  }
}
