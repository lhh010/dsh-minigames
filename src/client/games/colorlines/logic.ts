/**
 * Color Lines (五连珠) pure logic: a 9x9 board of colored balls. A move
 * slides one ball to an empty cell reachable over a clear orthogonal path
 * (BFS); 5+ in a row (orthogonal or diagonal) of one color clears and
 * scores 10 × n × (n−4). A clearing move spawns no new balls; otherwise 3
 * spawn on random empty cells. A full board ends the game. Deterministic
 * functions over a plain state object with an injected rng.
 */

export const SIZE = 9
export const COLOR_COUNT = 7
export const SPAWN_PER_TURN = 3
export const CLEAR_LEN = 5

export interface Position { r: number; c: number }

export interface ColorLinesState {
  /** SIZE x SIZE; 0 = empty, 1..COLOR_COUNT = ball color id. */
  grid: number[][]
  score: number
  over: boolean
  rng: () => number
}

/** Score for one cleared line of `n` balls (5→50, 6→120, 7→210, ...). */
export function scoreForLine(n: number): number {
  return 10 * n * (n - 4)
}

function emptyGrid(): number[][] {
  return Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0))
}

/** All empty cells in row-major order. */
export function emptyCells(grid: number[][]): Position[] {
  const out: Position[] = []
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (grid[r]![c] === 0) out.push({ r, c })
    }
  }
  return out
}

/** Spawn `count` random balls on empty cells (fewer only when the board runs out). */
export function spawnBalls(state: ColorLinesState, count = SPAWN_PER_TURN): number {
  let placed = 0
  for (let i = 0; i < count; i += 1) {
    const empty = emptyCells(state.grid)
    if (empty.length === 0) break
    const spot = empty[Math.floor(state.rng() * empty.length)]!
    state.grid[spot.r]![spot.c] = 1 + Math.floor(state.rng() * COLOR_COUNT)
    placed += 1
  }
  return placed
}

/** A fresh board with the opening spawn. */
export function createColorLinesState(rng: () => number = Math.random): ColorLinesState {
  const state: ColorLinesState = { grid: emptyGrid(), score: 0, over: false, rng }
  spawnBalls(state)
  return state
}

/**
 * Whether a ball at `from` can slide to the empty cell `to` over a clear
 * orthogonal path (any length; the path itself walks only empty cells).
 */
export function hasPath(grid: number[][], from: Position, to: Position): boolean {
  if (grid[from.r]![from.c] === 0) return false
  if (grid[to.r]![to.c] !== 0) return false
  const seen = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false))
  const queue: Position[] = [from]
  seen[from.r]![from.c] = true
  while (queue.length > 0) {
    const p = queue.shift()!
    if (p.r === to.r && p.c === to.c) return true
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nr = p.r + dr
      const nc = p.c + dc
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue
      if (seen[nr]![nc]) continue
      if (nr === to.r && nc === to.c) return true
      if (grid[nr]![nc] !== 0) continue
      seen[nr]![nc] = true
      queue.push({ r: nr, c: nc })
    }
  }
  return false
}

/** The 4 line directions: right, down, and the two diagonals. */
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]] as const

/**
 * Every cell on a 5+ run of one color (whole-board scan in the 4 line
 * directions). Overlapping runs merge their cells; score sums per run.
 */
export function findClearing(grid: number[][]): { cells: Position[]; gained: number } {
  const inClear = new Set<string>()
  let gained = 0
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const color = grid[r]![c]!
      if (color === 0) continue
      for (const [dr, dc] of DIRECTIONS) {
        const pr = r - dr
        const pc = c - dc
        // Only start a run at its first cell so each run is scored once.
        if (pr >= 0 && pr < SIZE && pc >= 0 && pc < SIZE && grid[pr]![pc] === color) continue
        let len = 0
        while (
          r + len * dr >= 0 && r + len * dr < SIZE
          && c + len * dc >= 0 && c + len * dc < SIZE
          && grid[r + len * dr]![c + len * dc] === color
        ) len += 1
        if (len >= CLEAR_LEN) {
          gained += scoreForLine(len)
          for (let i = 0; i < len; i += 1) inClear.add(`${r + i * dr},${c + i * dc}`)
        }
      }
    }
  }
  const cells = [...inClear].map(key => {
    const [rr, cc] = key.split(',')
    return { r: Number(rr), c: Number(cc) }
  })
  return { cells, gained }
}

/** Outcome of one attempted move. */
export interface MoveResult {
  moved: boolean
  /** Cleared cells (empty when the move cleared nothing). */
  cleared: Position[]
  gained: number
}

/**
 * Slide the ball `from` to the empty cell `to`. Legal moves then clear any
 * 5+ lines (no spawn that turn) or spawn 3 new balls; a full board with no
 * clear ends the game.
 */
export function moveBall(state: ColorLinesState, from: Position, to: Position): MoveResult {
  const fail: MoveResult = { moved: false, cleared: [], gained: 0 }
  if (state.over) return fail
  if (!hasPath(state.grid, from, to)) return fail
  const color = state.grid[from.r]![from.c]!
  state.grid[from.r]![from.c] = 0
  state.grid[to.r]![to.c] = color
  const { cells, gained } = findClearing(state.grid)
  if (cells.length > 0) {
    for (const p of cells) state.grid[p.r]![p.c] = 0
    state.score += gained
  } else {
    spawnBalls(state)
    if (emptyCells(state.grid).length === 0) state.over = true
  }
  return { moved: true, cleared: cells, gained }
}
