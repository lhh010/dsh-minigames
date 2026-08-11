/**
 * Snake pure logic: a grid-based snake that grows by eating food and dies on
 * the walls or its own body. Deterministic functions over a plain state
 * object — the game instance in index.ts drives this with requestAnimationFrame
 * and keyboard input, and the unit tests drive it directly.
 */

export interface Pos { r: number; c: number }

export interface SnakeState {
  cols: number
  rows: number
  /** Snake body cells, head first. */
  snake: Pos[]
  /** Current travel direction. */
  dir: 0 | 1 | 2 | 3 // 0 up, 1 right, 2 down, 3 left
  food: Pos
  /** Food eaten (score). */
  score: number
  over: boolean
  rng: () => number
}

const DIRS: readonly [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]]

export const DEFAULT_COLS = 16
export const DEFAULT_ROWS = 12

/** A fresh snake: 3 cells in the middle, moving right, food placed elsewhere. */
export function createSnakeState(rng: () => number = Math.random): SnakeState {
  const state: SnakeState = {
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    snake: [
      { r: Math.floor(DEFAULT_ROWS / 2), c: Math.floor(DEFAULT_COLS / 2) + 1 },
      { r: Math.floor(DEFAULT_ROWS / 2), c: Math.floor(DEFAULT_COLS / 2) },
      { r: Math.floor(DEFAULT_ROWS / 2), c: Math.floor(DEFAULT_COLS / 2) - 1 },
    ],
    dir: 1,
    food: { r: 0, c: 0 },
    score: 0,
    over: false,
    rng,
  }
  placeFood(state)
  return state
}

/** A random empty cell becomes the new food. */
export function placeFood(state: SnakeState): void {
  const occupied = new Set(state.snake.map(p => `${p.r},${p.c}`))
  const empty: Pos[] = []
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (!occupied.has(`${r},${c}`)) empty.push({ r, c })
    }
  }
  if (empty.length === 0) {
    state.over = true // board full — win
    return
  }
  state.food = empty[Math.floor(state.rng() * empty.length)]!
}

/** Change direction (no 180° reversal). */
export function turn(state: SnakeState, dir: 0 | 1 | 2 | 3): void {
  if ((state.dir + 2) % 4 === dir) return
  state.dir = dir
}

/**
 * Advance one tick: move the head, handle food / self collision. The board is
 * a torus — crossing a wall wraps the snake to the opposite side.
 */
export function stepSnake(state: SnakeState): void {
  if (state.over) return
  const [dr, dc] = DIRS[state.dir]!
  const head = state.snake[0]!
  // Wrap around the edges: (next.r, next.c) is always on the board.
  const next: Pos = {
    r: (head.r + dr + state.rows) % state.rows,
    c: (head.c + dc + state.cols) % state.cols,
  }

  const eats = next.r === state.food.r && next.c === state.food.c
  const body = state.snake
  // Self collision: the tail moves away unless we're growing this tick.
  const tail = body[body.length - 1]!
  const willMoveTail = !eats
  for (let i = 0; i < body.length; i += 1) {
    const p = body[i]!
    if (p.r === next.r && p.c === next.c) {
      if (willMoveTail && i === body.length - 1) continue // tail cell vacates
      state.over = true
      return
    }
  }

  body.unshift(next)
  if (eats) {
    state.score += 1
    placeFood(state)
  } else {
    body.pop()
  }
}
