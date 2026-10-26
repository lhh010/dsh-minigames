/**
 * 泡泡龙 pure logic: a hex-grid (offset rows) bubble shooter. A shot flies
 * straight, bounces off the side walls, and snaps to the nearest empty cell
 * adjacent to the stack (or the ceiling row). 3+ connected same-color
 * bubbles pop; bubbles left unconnected to the ceiling then fall. Clearing
 * the field advances the level; settling at or below the lose row ends the
 * run.
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */

export const COLS = 8
export const R = 18
export const D = R * 2
export const ROW_H = D * Math.sqrt(3) / 2
export const PLAY_X = 20
export const PLAY_W = COLS * D
export const LOGICAL_W = PLAY_X * 2 + PLAY_W
export const CEIL_Y = 54
/** First row that counts as "below the bottom line" (a settle there loses). */
export const LOSE_ROW = 12
export const GRID_ROWS = LOSE_ROW + 1
export const SHOOTER_X = LOGICAL_W / 2
export const SHOOTER_Y = 480
export const LOGICAL_H = 540
export const POP_MIN = 3
export const POP_POINTS = 10
export const FALL_POINTS = 20
export const SHOT_SPEED = 520
/** Fire nudges a near-horizontal aim up by this so shots always rise. */
export const AIM_EPS = 0.02
/** Center distance at which a flying bubble counts as touching the stack. */
export const COLLIDE_D = D * 0.92
export const MAX_COLORS = 6

export type Cell = { r: number; c: number }
export type GameResult = 'playing' | 'paused' | 'won' | 'over'

export interface Flying {
  x: number
  y: number
  vx: number
  vy: number
  color: number
}

export type BubbleEvent =
  | { kind: 'snap'; cell: Cell; color: number }
  | { kind: 'bounce'; side: -1 | 1 }
  | { kind: 'pop'; cells: Cell[]; color: number }
  | { kind: 'fall'; cells: Cell[] }
  | { kind: 'clear' }
  | { kind: 'over' }

export interface BubbleState {
  result: GameResult
  level: number
  score: number
  /** grid[row][col] = color index, or null for empty. */
  grid: (number | null)[][]
  /** Color index loaded in the shooter. */
  current: number
  /** Color index queued after the loaded one. */
  next: number
  /** Aim angle in radians within [0, π]; π/2 is straight up. */
  aim: number
  flying: Flying | null
  seed: number
  rng: () => number
  /** Events emitted by the last step (audio/particle triggers in the glue). */
  events: BubbleEvent[]
}

/** mulberry32 seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Center x of cell (r, c); odd rows are offset right by half a bubble. */
export function cellX(r: number, c: number): number {
  return PLAY_X + R + c * D + (r % 2) * (D / 2)
}

/** Center y of row r (row 0 hangs from the ceiling). */
export function cellY(r: number): number {
  return CEIL_Y + R + r * ROW_H
}

export function cellCenter(r: number, c: number): { x: number; y: number } {
  return { x: cellX(r, c), y: cellY(r) }
}

export function inGrid(r: number, c: number): boolean {
  // Odd rows sit half a cell right, so they hold one column fewer to stay
  // inside the walls (classic 8/7 offset packing).
  const cols = r % 2 === 0 ? COLS : COLS - 1
  return r >= 0 && r < GRID_ROWS && c >= 0 && c < cols
}

/** Columns present in row r (even rows COLS, odd rows COLS - 1). */
export function colsIn(r: number): number {
  return r % 2 === 0 ? COLS : COLS - 1
}

/** The up to 6 hex neighbors of (r, c) that exist in the grid. */
export function neighborsOf(r: number, c: number): Cell[] {
  const out: Cell[] = []
  const push = (nr: number, nc: number): void => { if (inGrid(nr, nc)) out.push({ r: nr, c: nc }) }
  push(r, c - 1)
  push(r, c + 1)
  // Odd rows sit half a cell right of even rows, so the diagonal neighbors
  // differ by parity.
  if (r % 2 === 0) {
    push(r - 1, c - 1); push(r - 1, c)
    push(r + 1, c - 1); push(r + 1, c)
  } else {
    push(r - 1, c); push(r - 1, c + 1)
    push(r + 1, c); push(r + 1, c + 1)
  }
  return out
}

/** Rows of bubbles a level starts with: level N → 4+N rows, wrapping at 5. */
export function initialRows(level: number): number {
  return 5 + ((level - 1) % 5)
}

/** Distinct palette size: 5 colors early, 6 from level 4 on. */
export function colorsForLevel(level: number): number {
  return Math.min(MAX_COLORS, 5 + Math.floor((level - 1) / 3))
}

export function emptyGrid(): (number | null)[][] {
  return Array.from({ length: GRID_ROWS }, () => Array<number | null>(COLS).fill(null))
}

function levelSeed(seed: number, level: number): number {
  return (seed ^ Math.imul(level, 0x9e3779b9)) >>> 0
}

/** Build the opening board: the level's first rows fully filled. */
function buildBoard(seed: number, level: number): (number | null)[][] {
  const rng = mulberry32(levelSeed(seed, level))
  const grid = emptyGrid()
  const colors = colorsForLevel(level)
  for (let r = 0; r < initialRows(level); r += 1) {
    for (let c = 0; c < colsIn(r); c += 1) grid[r]![c] = (rng() * colors) | 0
  }
  return grid
}

/** Color index for the next loaded bubble: only colors still on the board. */
export function nextColor(state: BubbleState): number {
  const present = new Set<number>()
  for (const row of state.grid) for (const v of row) if (v !== null) present.add(v)
  if (present.size === 0) return (state.rng() * colorsForLevel(state.level)) | 0
  const list = [...present]
  return list[(state.rng() * list.length) | 0]!
}

/** A fresh state at `level` (defaults to 1) playing immediately. */
export function createState(seed = 1, level = 1): BubbleState {
  const state: BubbleState = {
    result: 'playing',
    level,
    score: 0,
    grid: emptyGrid(),
    current: 0,
    next: 0,
    aim: Math.PI / 2,
    flying: null,
    seed,
    rng: mulberry32(0),
    events: [],
  }
  loadLevel(state, level)
  return state
}

/** Rebuild the board for `level` against the stored seed (shared reset path). */
function loadLevel(state: BubbleState, level: number): void {
  state.level = level
  state.result = 'playing'
  state.grid = buildBoard(state.seed, level)
  state.rng = mulberry32(levelSeed(state.seed, level) ^ 0x51ed270b)
  state.flying = null
  state.aim = Math.PI / 2
  state.current = nextColor(state)
  state.next = nextColor(state)
}

/** Enter the next level with a fresh board, keeping the running score. */
export function advanceLevel(state: BubbleState): void {
  loadLevel(state, state.level + 1)
}

/** Restart the CURRENT level: same seed → the identical initial board, score 0. */
export function restartLevel(state: BubbleState): void {
  loadLevel(state, state.level)
  state.score = 0
  state.events = []
}

/**
 * Clamp an aim angle to [0, π]. Downward angles in atan2's range fold to
 * the nearer horizontal; anything further under truncates to 0 (plain
 * clamp, e.g. a large negative adjustAim delta).
 */
export function clampAim(a: number): number {
  if (a < -Math.PI) return 0
  if (a < 0) return a < -Math.PI / 2 ? Math.PI : 0
  return Math.min(Math.PI, a)
}

/** Move the aim by `delta` radians, clamped to [0, π]; ← increases it. */
export function adjustAim(state: BubbleState, delta: number): void {
  state.aim = clampAim(state.aim + delta)
}

/** Aim the shooter at a logical-space point (mouse aiming). */
export function aimAt(state: BubbleState, x: number, y: number): void {
  state.aim = clampAim(Math.atan2(SHOOTER_Y - y, x - SHOOTER_X))
}

/**
 * Fire the loaded bubble along the aim. Only while playing and with no shot
 * in flight; near-horizontal aims are nudged up so the shot always rises.
 */
export function fire(state: BubbleState): boolean {
  if (state.result !== 'playing' || state.flying !== null) return false
  const a = Math.min(Math.PI - AIM_EPS, Math.max(AIM_EPS, state.aim))
  state.flying = {
    x: SHOOTER_X,
    y: SHOOTER_Y,
    vx: Math.cos(a) * SHOT_SPEED,
    vy: -Math.sin(a) * SHOT_SPEED,
    color: state.current,
  }
  state.current = state.next
  state.next = nextColor(state)
  return true
}

/**
 * The empty cell a bubble at (x, y) snaps to: the nearest empty cell that is
 * in the ceiling row or adjacent to an occupied cell. Ties resolve to the
 * smallest (r, c) so the snap is deterministic. Null when no cell qualifies.
 */
export function findSnapCell(grid: (number | null)[][], x: number, y: number): Cell | null {
  let best: Cell | null = null
  let bestD = Infinity
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < colsIn(r); c += 1) {
      if (grid[r]![c] !== null) continue
      if (r !== 0 && !neighborsOf(r, c).some(n => grid[n.r]![n.c] !== null)) continue
      const dx = cellX(r, c) - x
      const dy = cellY(r) - y
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = { r, c } }
    }
  }
  return best
}

/** All same-color cells connected to (r, c) (including it), by BFS. */
export function connectedSameColor(grid: (number | null)[][], r: number, c: number): Cell[] {
  const color = grid[r]![c]
  if (color === null) return []
  const seen = new Set<string>([`${r},${c}`])
  const out: Cell[] = [{ r, c }]
  for (let i = 0; i < out.length; i += 1) {
    const cur = out[i]!
    for (const n of neighborsOf(cur.r, cur.c)) {
      const key = `${n.r},${n.c}`
      if (seen.has(key)) continue
      if (grid[n.r]![n.c] !== color) continue
      seen.add(key)
      out.push(n)
    }
  }
  return out
}

/** Occupied cells connected to the ceiling (directly or through neighbors). */
export function attachedCells(grid: (number | null)[][]): Set<string> {
  const attached = new Set<string>()
  const queue: Cell[] = []
  for (let c = 0; c < COLS; c += 1) {
    if (grid[0]![c] !== null) { attached.add(`0,${c}`); queue.push({ r: 0, c }) }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i]!
    for (const n of neighborsOf(cur.r, cur.c)) {
      const key = `${n.r},${n.c}`
      if (attached.has(key)) continue
      if (grid[n.r]![n.c] === null) continue
      attached.add(key)
      queue.push(n)
    }
  }
  return attached
}

/** Pop matches and drop hangers after a bubble settled at (r, c). */
function resolveSettle(state: BubbleState, r: number, c: number, color: number): boolean {
  const cluster = connectedSameColor(state.grid, r, c)
  let popped = false
  if (cluster.length >= POP_MIN) {
    popped = true
    for (const cell of cluster) state.grid[cell.r]![cell.c] = null
    state.score += POP_POINTS * cluster.length
    state.events.push({ kind: 'pop', cells: cluster, color })
    const attached = attachedCells(state.grid)
    const fallen: Cell[] = []
    for (let rr = 0; rr < GRID_ROWS; rr += 1) {
      for (let cc = 0; cc < colsIn(rr); cc += 1) {
        if (state.grid[rr]![cc] !== null && !attached.has(`${rr},${cc}`)) fallen.push({ r: rr, c: cc })
      }
    }
    for (const cell of fallen) state.grid[cell.r]![cell.c] = null
    if (fallen.length > 0) {
      state.score += FALL_POINTS * fallen.length
      state.events.push({ kind: 'fall', cells: fallen })
    }
  }
  return popped
}

function settle(state: BubbleState, x: number, y: number, color: number): void {
  const cell = findSnapCell(state.grid, x, y)
  if (cell === null || cell.r >= LOSE_ROW) {
    state.result = 'over'
    state.events.push({ kind: 'over' })
    return
  }
  state.grid[cell.r]![cell.c] = color
  state.events.push({ kind: 'snap', cell, color })
  const popped = resolveSettle(state, cell.r, cell.c, color)
  if (state.grid.every(row => row.every(v => v === null))) {
    state.result = 'won'
    state.events.push({ kind: 'clear' })
    return
  }
  // A popped cluster never triggers the lose line; an unpopped settle on it does.
  if (!popped && cell.r >= LOSE_ROW) {
    state.result = 'over'
    state.events.push({ kind: 'over' })
  }
}

/**
 * Advance the simulation by dt seconds: move the flying bubble, bounce it
 * off the side walls, and settle it on ceiling/stack contact. Mutates the
 * state in place (the renderer reads it directly).
 */
export function step(state: BubbleState, dt: number): void {
  state.events = []
  if (state.result !== 'playing') return
  const f = state.flying
  if (f === null) return
  f.x += f.vx * dt
  f.y += f.vy * dt
  const left = PLAY_X + R
  const right = PLAY_X + PLAY_W - R
  if (f.x < left) { f.x = left + (left - f.x); f.vx = -f.vx; state.events.push({ kind: 'bounce', side: -1 }) }
  else if (f.x > right) { f.x = right - (f.x - right); f.vx = -f.vx; state.events.push({ kind: 'bounce', side: 1 }) }
  if (f.y - R <= CEIL_Y) {
    const color = f.color
    state.flying = null
    settle(state, f.x, CEIL_Y + R, color)
    return
  }
  const hitD2 = COLLIDE_D * COLLIDE_D
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < colsIn(r); c += 1) {
      if (state.grid[r]![c] === null) continue
      const dx = f.x - cellX(r, c)
      const dy = f.y - cellY(r)
      if (dx * dx + dy * dy <= hitD2) {
        const { x, y, color } = f
        state.flying = null
        settle(state, x, y, color)
        return
      }
    }
  }
}

/** Toggle between playing and paused; no-op otherwise. */
export function togglePause(state: BubbleState): void {
  if (state.result === 'playing') state.result = 'paused'
  else if (state.result === 'paused') state.result = 'playing'
}
