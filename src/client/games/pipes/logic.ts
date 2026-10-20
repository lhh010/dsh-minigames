/**
 * 接水管 (Pipes) pure logic: solvable level generation (a random
 * source-to-sink path is laid first, the rest is random filler, then
 * rotations are scrambled while a known-good config is kept), tile
 * rotation, water connectivity BFS, and win/timeout state. Deterministic
 * given an injected rng; no DOM, no timers.
 */

/** Directions: 0 up, 1 right, 2 down, 3 left. */
export const DR = [-1, 0, 1, 0] as const
export const DC = [0, 1, 0, -1] as const

export type PipeType = 'straight' | 'elbow' | 'tee' | 'cross' | 'source' | 'sink'

export interface PipeTile {
  type: PipeType
  /** Quarter turns applied to the base shape (0..3); cross is fixed at 0. */
  rotation: number
}

export interface Cell {
  r: number
  c: number
}

/** One generated board: the playable tiles plus the guaranteed solution. */
export interface PipesLevel {
  size: number
  tiles: PipeTile[][]
  source: Cell
  sink: Cell
  /** Known-good rotation per cell; applying it always connects source→sink. */
  solution: number[][]
}

export type PipesStatus = 'playing' | 'won' | 'over'

export interface PipesState {
  /** 1-based level number; drives the board size. */
  level: number
  score: number
  /** Countdown in seconds; frozen unless status is 'playing'. */
  timeLeft: number
  status: PipesStatus
  board: PipesLevel
  rng: () => number
}

/** Score awarded per connected level. */
export const WIN_SCORE = 200
/** Countdown per level in seconds. */
export const LEVEL_TIME_S = 90
export const MIN_SIZE = 5
export const MAX_SIZE = 8

/** Base opening bitmasks (bit d = opening toward direction d). */
const BASE_MASK: Record<PipeType, number> = {
  straight: 0b0101,
  elbow: 0b0011,
  tee: 0b0111,
  cross: 0b1111,
  source: 0b0010,
  sink: 0b1000,
}

/**
 * The opening bitmask of a tile: each base opening rotated by `rotation`
 * quarter turns clockwise.
 */
export function openings(tile: PipeTile): number {
  let mask = 0
  const base = BASE_MASK[tile.type]
  for (let d = 0; d < 4; d += 1) {
    if ((base & (1 << d)) !== 0) mask |= 1 << ((d + tile.rotation) % 4)
  }
  return mask
}

/** Whether the tile opens toward direction `d`. */
export function hasOpening(tile: PipeTile, d: number): boolean {
  return (openings(tile) & (1 << d)) !== 0
}

/** Board size for a level: starts at 5, +1 every 3 levels, capped at 8. */
export function levelSize(level: number): number {
  return Math.min(MAX_SIZE, MIN_SIZE + Math.floor((level - 1) / 3))
}

/**
 * Randomized DFS for a simple (self-avoiding) path between two cells; the
 * grid is connected so a path always exists.
 */
function dfsPath(
  size: number, from: Cell, to: Cell, rng: () => number,
  visited: boolean[][], path: Cell[],
): boolean {
  path.push(from)
  visited[from.r]![from.c] = true
  if (from.r === to.r && from.c === to.c) return true
  const order = [0, 1, 2, 3]
    .map(d => ({ d, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map(e => e.d)
  for (const d of order) {
    const r = from.r + DR[d]!
    const c = from.c + DC[d]!
    if (r < 0 || r >= size || c < 0 || c >= size || visited[r]![c]) continue
    if (dfsPath(size, { r, c }, to, rng, visited, path)) return true
  }
  path.pop()
  visited[from.r]![from.c] = false
  return false
}

/** The rotation r (0..3) that gives `type` the opening set `mask`. */
function rotationFor(type: PipeType, mask: number): number {
  for (let r = 0; r < 4; r += 1) {
    if (openings({ type, rotation: r }) === mask) return r
  }
  return 0
}

/** A tile placed so it opens exactly toward both path neighbours. */
function tileForDirs(d1: number, d2: number): PipeTile {
  const mask = (1 << d1) | (1 << d2)
  const type: PipeType = mask === 0b0101 || mask === 0b1010 ? 'straight' : 'elbow'
  return { type, rotation: rotationFor(type, mask) }
}

/** Random filler tile: weighted pipes with a random rotation (cross fixed). */
function fillerTile(rng: () => number): PipeTile {
  const roll = rng()
  const type: PipeType = roll < 0.35 ? 'straight' : roll < 0.8 ? 'elbow' : roll < 0.95 ? 'tee' : 'cross'
  return { type, rotation: type === 'cross' ? 0 : Math.floor(rng() * 4) }
}

/**
 * Generate a solvable board: one source tile on the left edge and one sink
 * tile on the right edge, a random simple path of straights/elbows between
 * them (the tracked solution), random filler elsewhere, then scrambled
 * rotations that leave at least one known-good config (applying `solution`
 * always wins).
 * @param size - board dimension (size x size).
 * @param rng - injected random source for determinism.
 */
export function generateLevel(size: number, rng: () => number): PipesLevel {
  const source: Cell = { r: Math.floor(rng() * size), c: 0 }
  let sink: Cell = { r: Math.floor(rng() * size), c: size - 1 }
  while (sink.r === source.r) sink = { r: Math.floor(rng() * size), c: size - 1 }

  const visited: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const path: Cell[] = []
  dfsPath(size, source, sink, rng, visited, path)

  const tiles: PipeTile[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ type: 'straight' as PipeType, rotation: 0 })))
  const at = (cell: Cell): PipeTile => tiles[cell.r]![cell.c]!

  // Endpoints: fixed-orientation source/sink opening along the path.
  const sourceDir = path[1]!.c === source.c ? (path[1]!.r < source.r ? 0 : 2) : 1
  const sinkDir = path[path.length - 2]!.c === sink.c ? (path[path.length - 2]!.r < sink.r ? 0 : 2) : 3
  at(source).type = 'source'
  at(source).rotation = rotationFor('source', 1 << sourceDir)
  at(sink).type = 'sink'
  at(sink).rotation = rotationFor('sink', 1 << sinkDir)

  // Path interiors open toward both neighbours; everything else is filler.
  for (let i = 1; i < path.length - 1; i += 1) {
    const prev = path[i - 1]!
    const next = path[i + 1]!
    const cell = path[i]!
    const d1 = prev.r === cell.r ? (prev.c < cell.c ? 3 : 1) : prev.r < cell.r ? 0 : 2
    const d2 = next.r === cell.r ? (next.c < cell.c ? 3 : 1) : next.r < cell.r ? 0 : 2
    tiles[cell.r]![cell.c] = tileForDirs(d1, d2)
  }
  const onPath: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  for (const cell of path) onPath[cell.r]![cell.c] = true
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!onPath[r]![c]) tiles[r]![c] = fillerTile(rng)
    }
  }

  const solution = tiles.map(row => row.map(t => t.rotation))

  // Scramble rotations (endpoints and cross stay fixed); the tracked
  // solution still solves the board. Retry while the scramble accidentally
  // starts already connected.
  for (let attempt = 0; attempt < 64; attempt += 1) {
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const tile = tiles[r]![c]!
        if (tile.type === 'source' || tile.type === 'sink' || tile.type === 'cross') continue
        tile.rotation = Math.floor(rng() * 4)
      }
    }
    if (!levelConnected(tiles, size, source, sink)) break
  }

  return { size, tiles, source, sink, solution }
}

/**
 * BFS from the source through matching pipe openings; a cell is water-filled
 * when reached. The sink being reached is the win.
 */
export function connectedCells(tiles: PipeTile[][], size: number, source: Cell): boolean[][] {
  const reached: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const queue: Cell[] = [source]
  reached[source.r]![source.c] = true
  while (queue.length > 0) {
    const cell = queue.shift()!
    for (let d = 0; d < 4; d += 1) {
      if (!hasOpening(tiles[cell.r]![cell.c]!, d)) continue
      const r = cell.r + DR[d]!
      const c = cell.c + DC[d]!
      if (r < 0 || r >= size || c < 0 || c >= size || reached[r]![c]) continue
      if (!hasOpening(tiles[r]![c]!, (d + 2) % 4)) continue
      reached[r]![c] = true
      queue.push({ r, c })
    }
  }
  return reached
}

/** Whether the sink is water-filled on the given tiles. */
export function levelConnected(tiles: PipeTile[][], size: number, source: Cell, sink: Cell): boolean {
  return connectedCells(tiles, size, source)[sink.r]![sink.c]!
}

/**
 * Rotate a tile one quarter turn clockwise. No-op outside 'playing', on the
 * fixed tiles (source/sink/cross), or out of bounds.
 * @returns true when a rotation was applied.
 */
export function rotateTile(state: PipesState, r: number, c: number): boolean {
  if (state.status !== 'playing') return false
  if (r < 0 || r >= state.board.size || c < 0 || c >= state.board.size) return false
  const tile = state.board.tiles[r]![c]!
  if (tile.type === 'source' || tile.type === 'sink' || tile.type === 'cross') return false
  tile.rotation = (tile.rotation + 1) % 4
  return true
}

/**
 * Check for a win after a rotation: when water reaches the sink, mark the
 * level won and award {@link WIN_SCORE}.
 * @returns true on the playing→won transition.
 */
export function checkWin(state: PipesState): boolean {
  if (state.status !== 'playing') return false
  if (!levelConnected(state.board.tiles, state.board.size, state.board.source, state.board.sink)) return false
  state.status = 'won'
  state.score += WIN_SCORE
  return true
}

/**
 * Advance the countdown while playing; hitting zero ends the game.
 * @param dt - elapsed seconds (the caller freezes the clock on pause).
 */
export function tick(state: PipesState, dt: number): void {
  if (state.status !== 'playing') return
  state.timeLeft = Math.max(0, state.timeLeft - dt)
  if (state.timeLeft <= 0) state.status = 'over'
}

/** Move to the next level: bigger board (per {@link levelSize}) and a fresh countdown. */
export function advanceLevel(state: PipesState): void {
  if (state.status !== 'won') return
  state.level += 1
  state.board = generateLevel(levelSize(state.level), state.rng)
  state.timeLeft = LEVEL_TIME_S
  state.status = 'playing'
}

/**
 * A fresh state on the given level.
 * @param level - 1-based level number.
 * @param score - score carried in from previous levels.
 * @param rng - injected random source for determinism.
 */
export function createPipesState(level = 1, score = 0, rng: () => number = Math.random): PipesState {
  return {
    level,
    score,
    timeLeft: LEVEL_TIME_S,
    status: 'playing',
    board: generateLevel(levelSize(level), rng),
    rng,
  }
}
