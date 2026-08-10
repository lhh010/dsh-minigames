/**
 * 数字华容道 (15-puzzle, 4x4 = 16 cells) pure logic: a 4x4 board with tiles
 * 1..15 and one empty cell. Sliding tiles into the empty space (adjacent, or a
 * whole row/column run toward the empty) rearranges them; the puzzle is won
 * when tiles read 1..15 with the empty at the bottom-right. The board is
 * shuffled from the solved state with random valid moves, so every shuffle is
 * solvable. Deterministic functions over a plain state object; the game
 * instance in index.ts drives the slide animation, and the unit tests drive
 * the logic directly.
 */

export interface Position { r: number; c: number }

/** One tile's slide, for the animation (the board is already updated). */
export interface Slide {
  tile: number
  from: Position
  to: Position
}

export interface HuarongState {
  rows: number
  cols: number
  /** 0 = empty, 1..15 = tile id. */
  board: number[][]
  empty: Position
  moves: number
  solved: boolean
  /** Elapsed seconds (accumulated by the game instance while playing). */
  elapsed: number
}

/** A solved 1..15 board with the empty at the bottom-right. */
function solvedBoard(rows: number, cols: number): number[][] {
  const board = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => r * cols + c + 1))
  board[rows - 1]![cols - 1] = 0
  return board
}

/** Whether the board reads 1..n-1 with the empty last. */
export function isSolved(state: HuarongState): boolean {
  let expected = 1
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const last = r === state.rows - 1 && c === state.cols - 1
      const value = state.board[r]![c]!
      if (last) return value === 0
      if (value !== expected) return false
      expected += 1
    }
  }
  return true
}

/**
 * Shuffle by performing random valid slides from the solved state — every
 * shuffle produced this way is solvable (unlike swapping tiles at random).
 * @param state - the board (mutated to a fresh shuffled state).
 * @param steps - number of random slides.
 */
export function shuffle(state: HuarongState, steps = 200): void {
  state.board = solvedBoard(state.rows, state.cols)
  state.empty = { r: state.rows - 1, c: state.cols - 1 }
  state.moves = 0
  state.elapsed = 0
  state.solved = false
  let lastDir: number | null = null
  for (let i = 0; i < steps; i += 1) {
    // Slide a random tile adjacent to the empty; avoid the immediate reverse
    // to reduce wasted churn. dir: 0 up, 1 right, 2 down, 3 left (tile motion).
    const choices: number[] = []
    if (state.empty.r < state.rows - 1) choices.push(0)
    if (state.empty.c > 0) choices.push(1)
    if (state.empty.r > 0) choices.push(2)
    if (state.empty.c < state.cols - 1) choices.push(3)
    const reverse: number = lastDir === null ? -1 : (lastDir + 2) % 4
    const usable: number[] = choices.filter((d: number) => d !== reverse)
    const dir: number = usable[Math.floor(Math.random() * usable.length)]!
    slideDirection(state, dir)
    lastDir = dir
  }
  state.moves = 0
  state.elapsed = 0
  state.solved = isSolved(state)
}

/** A fresh, shuffled, solvable 4x4 puzzle. */
export function createHuarongState(): HuarongState {
  const state: HuarongState = {
    rows: 4, cols: 4, board: [], empty: { r: 3, c: 3 },
    moves: 0, solved: false, elapsed: 0,
  }
  shuffle(state)
  return state
}

/**
 * Slide the tile(s) between `(r, c)` and the empty toward the empty — the tile
 * at `(r, c)` must share a row or column with the empty. Returns the slide
 * animation entries (the board is already updated), or null when the move is
 * invalid.
 */
export function slideAt(state: HuarongState, r: number, c: number): Slide[] | null {
  const e = state.empty
  if ((r !== e.r && c !== e.c) || (r === e.r && c === e.c)) return null
  const slides: Slide[] = []
  if (r === e.r) {
    const step = c < e.c ? 1 : -1 // tiles shift toward the empty
    let cur = e.c
    while (cur !== c) {
      const fromC = cur - step
      const tile = state.board[r]![fromC]!
      slides.push({ tile, from: { r, c: fromC }, to: { r, c: cur } })
      state.board[r]![cur] = tile
      cur = fromC
    }
    state.board[r]![c] = 0
  } else {
    const step = r < e.r ? 1 : -1
    let cur = e.r
    while (cur !== r) {
      const fromR = cur - step
      const tile = state.board[fromR]![c]!
      slides.push({ tile, from: { r: fromR, c }, to: { r: cur, c } })
      state.board[cur]![c] = tile
      cur = fromR
    }
    state.board[r]![c] = 0
  }
  state.empty = { r, c }
  state.moves += 1
  state.solved = isSolved(state)
  return slides
}

/**
 * Slide a tile adjacent to the empty in the given direction (the tile moves
 * that way into the empty). dir: 0 up, 1 right, 2 down, 3 left.
 */
export function slideDirection(state: HuarongState, dir: number): Slide[] | null {
  const e = state.empty
  let r = e.r
  let c = e.c
  if (dir === 0) r = e.r + 1
  else if (dir === 1) c = e.c - 1
  else if (dir === 2) r = e.r - 1
  else c = e.c + 1
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null
  return slideAt(state, r, c)
}
