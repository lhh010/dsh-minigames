/**
 * Piano Tiles pure logic: 4 vertical lanes, one seeded active tile per row
 * scrolling down; a lane press in the hit zone scores with a combo
 * multiplier, a press with no tile in the zone (wrong lane or too early) or
 * a tile scrolling fully past the bottom ends the run (classic rules).
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */

export const LANE_COUNT = 4
/** Logical canvas height in px (render.ts mirrors this). */
export const LOGIC_H = 640
/** One tile row height in px; 4 rows are visible. */
export const ROW_H = 160
/** Tiles are hittable once their top edge is below this y. */
export const HIT_MIN_Y = LOGIC_H - ROW_H * 1.25
/** An unhit tile whose top passes this y (the bottom edge) is a miss. */
export const MISS_Y = LOGIC_H
/** Rows prefilled above/at the screen at run start. */
export const PREFILL_ROWS = 5
/** Probability a spawned tile is long (2 rows, counts as one hit). */
export const LONG_CHANCE = 0.18

export const BASE_SPEED = 340
export const SPEED_PER_HIT = 7
export const SPEED_ADD_MAX = 460

export type GameResult = 'ready' | 'playing' | 'paused' | 'over'

export interface Tile {
  /** Lane index 0..3. */
  lane: number
  /** Screen y of the tile's top edge. */
  y: number
  /** Row count this tile spans (1 normal, 2 long; long = one hit). */
  len: number
  /** Already hit this run; hit tiles scroll off harmlessly. */
  hit: boolean
}

export type PianoEvent =
  | { kind: 'hit'; lane: number; note: number }
  | { kind: 'fail'; reason: 'miss' | 'wrong' }
  | { kind: 'over' }

export interface PianoState {
  result: GameResult
  /** The run seed; R restarts the identical run. */
  seed: number
  rng: () => number
  /** Seconds since the run started. */
  t: number
  /** Scroll speed in px/s, derived from hits. */
  speed: number
  score: number
  combo: number
  /** Total successful hits (drives speed and the note scale). */
  hits: number
  tiles: Tile[]
  /** Why the run ended ('' while alive). */
  failReason: '' | 'miss' | 'wrong'
  events: PianoEvent[]
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

/** Scroll speed for a hit count: ramps linearly, capped. */
export function speedAt(hits: number): number {
  return BASE_SPEED + Math.min(SPEED_ADD_MAX, hits * SPEED_PER_HIT)
}

/** Combo multiplier: 1 at combo 0, +1 every 8 combo, capped at 8. */
export function comboMultiplier(combo: number): number {
  return Math.min(8, 1 + Math.floor(Math.max(0, combo) / 8))
}

/**
 * Spawn one row: exactly one lane is active; occasionally the tile is long
 * (len 2). Long tiles do not consume an extra row slot — spacing is uniform.
 */
export function spawnTile(rng: () => number, y: number): Tile {
  return {
    lane: (rng() * LANE_COUNT) | 0,
    y,
    len: rng() < LONG_CHANCE ? 2 : 1,
    hit: false,
  }
}

/** A fresh state in the ready (attract) state, prefilled deterministically. */
export function createState(seed = 1): PianoState {
  const rng = mulberry32(seed)
  const tiles: Tile[] = []
  let topY = LOGIC_H - ROW_H * 2
  for (let i = 0; i < PREFILL_ROWS; i += 1) {
    tiles.push(spawnTile(rng, topY))
    topY -= ROW_H
  }
  return {
    result: 'ready',
    seed,
    rng,
    t: 0,
    speed: BASE_SPEED,
    score: 0,
    combo: 0,
    hits: 0,
    tiles,
    failReason: '',
    events: [],
  }
}

/** Start (or restart) the run from ready/over with the SAME seed. */
export function startRun(state: PianoState): void {
  const fresh = createState(state.seed)
  Object.assign(state, fresh, { result: 'playing' })
}

/** Toggle between playing and paused; no-op otherwise. */
export function togglePause(state: PianoState): void {
  if (state.result === 'playing') state.result = 'paused'
  else if (state.result === 'paused') state.result = 'playing'
}

/**
 * Press a lane. A hit requires an unhit tile in that lane whose top edge is
 * inside the hit zone ([HIT_MIN_Y, MISS_Y]); otherwise the press is a miss
 * and the run ends. Wrong lane and too-early presses both fail here.
 */
export function pressLane(state: PianoState, lane: number): boolean {
  if (state.result !== 'playing') return false
  let candidate: Tile | null = null
  for (const tile of state.tiles) {
    if (tile.lane !== lane || tile.hit) continue
    if (tile.y >= HIT_MIN_Y && tile.y <= MISS_Y) {
      if (candidate === null || tile.y > candidate.y) candidate = tile
    }
  }
  if (candidate === null) {
    fail(state, 'wrong')
    return false
  }
  candidate.hit = true
  state.hits += 1
  state.combo += 1
  state.score += comboMultiplier(state.combo)
  state.events.push({ kind: 'hit', lane, note: state.hits })
  return true
}

function fail(state: PianoState, reason: 'miss' | 'wrong'): void {
  state.result = 'over'
  state.failReason = reason
  state.combo = 0
  state.events.push({ kind: 'fail', reason })
  state.events.push({ kind: 'over' })
}

/**
 * Advance by dt seconds: scroll tiles, spawn rows above the top, and fail
 * the run when an unhit tile fully scrolls past the bottom. No-op unless
 * playing, so a paused or over state never advances.
 */
export function step(state: PianoState, dt: number): void {
  state.events = []
  if (state.result !== 'playing') return
  state.t += dt
  state.speed = speedAt(state.hits)
  for (const tile of state.tiles) tile.y += state.speed * dt
  // Keep rows streaming: stack new tiles above the current topmost tile.
  let minY = Infinity
  for (const tile of state.tiles) minY = Math.min(minY, tile.y)
  while (minY > -ROW_H) {
    const tile = spawnTile(state.rng, minY - ROW_H)
    state.tiles.push(tile)
    minY = tile.y
  }
  // Miss: the lowest unhit tile scrolled past the bottom edge entirely.
  for (const tile of state.tiles) {
    if (!tile.hit && tile.y > MISS_Y) {
      fail(state, 'miss')
      break
    }
  }
  state.tiles = state.tiles.filter(tile => tile.y < LOGIC_H + ROW_H * 3)
}

/**
 * Attract-mode step: the tile field scrolls behind the start screen without
 * spawning or failing; hit tiles never appear (nothing is pressed).
 */
export function attractStep(state: PianoState, dt: number): void {
  if (state.result !== 'ready') return
  for (const tile of state.tiles) tile.y += BASE_SPEED * 0.5 * dt
  let minY = Infinity
  for (const tile of state.tiles) minY = Math.min(minY, tile.y)
  while (minY > -ROW_H) {
    const tile = spawnTile(state.rng, minY - ROW_H)
    state.tiles.push(tile)
    minY = tile.y
  }
  state.tiles = state.tiles.filter(tile => tile.y < LOGIC_H + ROW_H * 3)
}
