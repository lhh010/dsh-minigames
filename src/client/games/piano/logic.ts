/**
 * Piano Tiles pure logic: 4 vertical lanes, one seeded active tile per row
 * scrolling down. Press a lane while its tile covers the judge line; long
 * tiles are HOLDS — press at the head, keep held until the tail passes the
 * line. Empty presses (no tile near the window) are free; early presses,
 * released holds, and tiles sliding past the window cost one of LIVES
 * misses; the run ends when the misses run out.
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */

export const LANE_COUNT = 4
/** Logical canvas height in px (render.ts mirrors this). */
export const LOGIC_H = 640
/** One tile row height in px; 4 rows are visible. */
export const ROW_H = 160
/** The judge line: tiles must cover it when pressed. */
export const LINE_Y = LOGIC_H - 100
/** Judge window half-height around LINE_Y (early/late tolerance). */
export const GRACE = ROW_H * 0.45
/** A tile is hittable while it overlaps this window (bottom >= HIT_MIN_Y). */
export const HIT_MIN_Y = LINE_Y - GRACE
/** An unhit tile whose top passes this y has left the judge window: miss. */
export const MISS_Y = LINE_Y + GRACE
/** Rows prefilled above the screen at run start (lead-in for reaction). */
export const PREFILL_ROWS = 8
/** Probability a spawned tile is long (a hold). */
export const LONG_CHANCE = 0.18
/** Misses allowed before the run ends. */
export const LIVES = 5
/** A press counts as "early" (life loss) when a same-lane tile is this
 * close above the window top; farther away the press is a free empty tap. */
export const EARLY_RANGE = ROW_H * 2

export const BASE_SPEED = 340
export const SPEED_PER_HIT = 7
export const SPEED_ADD_MAX = 460
/** Score bonus for holding a long tile through its tail. */
export const HOLD_BONUS = 3

export type GameResult = 'ready' | 'playing' | 'paused' | 'over'

export interface Tile {
  /** Lane index 0..3. */
  lane: number
  /** Screen y of the tile's top edge. */
  y: number
  /** Row count this tile spans (1 normal, 2 long = hold). */
  len: number
  /** Already resolved this run; resolved tiles scroll off harmlessly. */
  hit: boolean
  /** A hold currently held by the player (head pressed, tail not past). */
  holding: boolean
  /** The hold completed: head pressed AND held through the tail. */
  held: boolean
}

export type PianoEvent =
  | { kind: 'hit'; lane: number; note: number }
  | { kind: 'hold-start'; lane: number }
  | { kind: 'hold-done'; lane: number; points: number }
  | { kind: 'press'; lane: number; empty: boolean }
  | { kind: 'miss-life'; lane: number; reason: 'miss' | 'early' | 'drop' }
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
  /** Misses spent; the run ends at LIVES. */
  misses: number
  tiles: Tile[]
  /** Per-lane press flash (seconds remaining, renderer feedback). */
  laneFlash: number[]
  /** Why the run ended ('' while alive). */
  failReason: '' | 'miss' | 'early' | 'drop' | 'lives'
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
 * (len 2, a hold). Long tiles do not consume an extra row slot — spacing is
 * uniform.
 */
export function spawnTile(rng: () => number, y: number): Tile {
  return {
    lane: (rng() * LANE_COUNT) | 0,
    y,
    len: rng() < LONG_CHANCE ? 2 : 1,
    hit: false,
    holding: false,
    held: false,
  }
}

/** A fresh state in the ready (attract) state, prefilled deterministically.
 * The prefilled field starts ABOVE the screen: the lowest tile's top sits a
 * full row above y=0 so the first press is ~1.8s away at base speed — the
 * player gets a lead-in instead of an instant judgment. */
export function createState(seed = 1): PianoState {
  const rng = mulberry32(seed)
  const tiles: Tile[] = []
  let topY = LOGIC_H - ROW_H * 7
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
    misses: 0,
    tiles,
    laneFlash: new Array<number>(LANE_COUNT).fill(0),
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

/** Spend one life; ends the run at LIVES. Returns true when the run ended. */
function spendLife(state: PianoState, lane: number, reason: 'miss' | 'early' | 'drop'): boolean {
  state.misses += 1
  state.combo = 0
  state.events.push({ kind: 'miss-life', lane, reason })
  if (state.misses >= LIVES) {
    state.result = 'over'
    state.failReason = 'lives'
    state.events.push({ kind: 'over' })
    return true
  }
  return false
}

/** Whether a tile overlaps the judge window (the hittable test). */
function overlapsWindow(tile: Tile): boolean {
  return tile.y <= MISS_Y && tile.y + tile.len * ROW_H >= HIT_MIN_Y
}

/**
 * Press a lane.
 * - A tile overlapping the judge window: normal tiles resolve for combo
 *   score; long tiles ENTER a hold (hold-start) and complete when their
 *   tail passes the line while still held.
 * - No tile in the window, but a same-lane tile within EARLY_RANGE above
 *   it: an early press — costs one life.
 * - Nothing nearby: a free empty tap (combo resets, no life lost).
 */
export function pressLane(state: PianoState, lane: number): boolean {
  if (state.result !== 'playing') return false
  state.laneFlash[lane] = 0.18
  let candidate: Tile | null = null
  let approaching: Tile | null = null
  for (const tile of state.tiles) {
    if (tile.lane !== lane || tile.hit || tile.holding) continue
    if (overlapsWindow(tile)) {
      if (candidate === null || tile.y > candidate.y) candidate = tile
    } else if (tile.y < HIT_MIN_Y && tile.y >= HIT_MIN_Y - EARLY_RANGE) {
      if (approaching === null || tile.y > approaching.y) approaching = tile
    }
  }
  if (candidate !== null) {
    if (candidate.len === 1) {
      candidate.hit = true
      state.hits += 1
      state.combo += 1
      state.score += comboMultiplier(state.combo)
      state.events.push({ kind: 'hit', lane, note: state.hits })
    } else {
      candidate.holding = true
      state.events.push({ kind: 'hold-start', lane })
    }
    state.events.push({ kind: 'press', lane, empty: false })
    return true
  }
  if (approaching !== null) {
    // Early press on an inbound tile: the press is committed to a real
    // note but mistimed — costs a life, the tile keeps coming.
    spendLife(state, lane, 'early')
    state.events.push({ kind: 'press', lane, empty: false })
    return false
  }
  // Free empty tap: feedback only, combo resets so taps cannot be spammed.
  state.combo = 0
  state.events.push({ kind: 'press', lane, empty: true })
  return false
}

/**
 * Release a lane key. Releasing while a hold's head has not yet crossed the
 * judge line drops the hold and costs a life; after the head crosses, the
 * release is irrelevant (completion is handled in step).
 */
export function releaseLane(state: PianoState, lane: number): void {
  if (state.result !== 'playing') return
  for (const tile of state.tiles) {
    if (tile.lane !== lane || !tile.holding) continue
    if (tile.y < LINE_Y) {
      // Head has not crossed the line yet: dropped hold.
      tile.holding = false
      tile.hit = true
      spendLife(state, lane, 'drop')
      return
    }
  }
}

/**
 * Advance by dt seconds: scroll tiles, spawn rows above the top, decay the
 * lane-press flashes, complete holds whose tails pass the line, and spend a
 * life when an unhit tile leaves the judge window. No-op unless playing, so
 * a paused or over state never advances.
 */
export function step(state: PianoState, dt: number): void {
  state.events = []
  if (state.result !== 'playing') return
  state.t += dt
  state.speed = speedAt(state.hits)
  for (let i = 0; i < LANE_COUNT; i += 1) {
    if (state.laneFlash[i]! > 0) state.laneFlash[i] = Math.max(0, state.laneFlash[i]! - dt)
  }
  for (const tile of state.tiles) tile.y += state.speed * dt
  // Keep rows streaming: stack new tiles above the current topmost tile.
  let minY = Infinity
  for (const tile of state.tiles) minY = Math.min(minY, tile.y)
  while (minY > -ROW_H) {
    const tile = spawnTile(state.rng, minY - ROW_H)
    state.tiles.push(tile)
    minY = tile.y
  }
  for (const tile of state.tiles) {
    // Hold completion: the HEAD passes the judge line while held. The tail
    // touches the line first (that is the press moment); the hold lasts
    // until the whole body has crossed (y grows: head at/after the line).
    if (tile.holding && tile.y >= LINE_Y) {
      tile.holding = false
      tile.hit = true
      tile.held = true
      state.hits += 1
      state.combo += 1
      const points = comboMultiplier(state.combo) * HOLD_BONUS
      state.score += points
      state.events.push({ kind: 'hold-done', lane: tile.lane, points })
      continue
    }
    // Miss: an unhit tile whose top edge has left the judge window bottom.
    if (!tile.hit && !tile.holding && tile.y > MISS_Y) {
      tile.hit = true // resolved as missed; scrolls off without repeats
      if (spendLife(state, tile.lane, 'miss')) break
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
