/**
 * Stack (堆塔) pure logic: blocks of width W slide horizontally (ping-pong)
 * at the current top layer; drop() trims the slider to its overlap with the
 * block below — a perfect drop (offset ≤ PERFECT_TOL px) keeps the full
 * width, anything else cuts the overhang off as a falling piece, and no
 * overlap at all collapses the tower. Speed ramps every RAMP_EVERY layers;
 * slider direction alternates layer by layer; per-layer speed jitter comes
 * from the seeded mulberry32 stream, so a run is deterministic given (seed,
 * dt, drop timings). Time is in milliseconds throughout.
 */

/** Logical canvas size (HUD strip lives inside this height). */
export const W = 420
export const H = 640
export const HUD_H = 30

/** Layer geometry: every block is BLOCK_H tall; the tower stands on BASE_Y. */
export const BLOCK_H = 24
export const BASE_Y = H - 44
/** Width of the ground (layer 0) block. */
export const START_W = 240

/** Slider offset (px) at or under which a drop counts as perfect. */
export const PERFECT_TOL = 3

/** Slider speed at layer 0 and the additive ramp per 5 layers, px/s. */
export const BASE_SPEED = 150
export const SPEED_STEP = 22
export const RAMP_EVERY = 5

export const NORMAL_SCORE = 1
export const PERFECT_SCORE = 3
export const STREAK_BONUS = 10
/** Every STREAK_BONUS_EVERY-th consecutive perfect pays STREAK_BONUS extra. */
export const STREAK_BONUS_EVERY = 5

/** Gravity on cut-off overhang pieces, px/s². */
export const GRAVITY = 1100
/** Falling pieces are culled this far below the ground line, px. */
export const FALL_CULL = 320

/**
 * mulberry32 PRNG: small, fast, seedable — used for the initial slider side
 * and the per-layer speed jitter.
 * @param seed - any uint32; identical seeds produce identical streams.
 * @returns a () => number in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One placed block: left edge x and width w (both in logical px). */
export interface PlacedBlock {
  x: number
  w: number
}

/** The moving block at the top layer. */
export interface Slider {
  x: number
  w: number
  /** +1 slides right, -1 slides left; ping-pong reflects at the walls. */
  dir: number
  /** Current speed in px/s (BASE_SPEED ramp × per-layer jitter). */
  speed: number
}

/** A cut-off overhang tumbling off the tower. */
export interface FallingPiece {
  x: number
  w: number
  /** Top edge y in tower coordinates (y grows downward, BASE_Y is ground). */
  y: number
  vy: number
}

export interface StackState {
  /** Placed layers, bottom (layer 0, the ground slab) first. */
  blocks: PlacedBlock[]
  slider: Slider
  falling: FallingPiece[]
  /** Number of placed layers above the ground slab. */
  layers: number
  score: number
  /** Consecutive perfect drops; a normal drop resets it to 0. */
  streak: number
  over: boolean
  rng: () => number
}

/** Top-edge y of layer `i` in tower coordinates. */
export function layerTopY(i: number): number {
  return BASE_Y - (i + 1) * BLOCK_H
}

/** Slider speed for a layer count, ramped every RAMP_EVERY layers. */
export function sliderSpeed(layers: number): number {
  return BASE_SPEED + Math.floor(layers / RAMP_EVERY) * SPEED_STEP
}

/**
 * A fresh run: ground slab centered, first slider entering from a seeded
 * side with jittered speed.
 * @param seed - mulberry32 seed for the side/speed jitter stream.
 */
export function createState(seed: number): StackState {
  const rng = mulberry32(seed)
  const ground: PlacedBlock = { x: (W - START_W) / 2, w: START_W }
  const state: StackState = {
    blocks: [ground],
    slider: { x: 0, w: START_W, dir: 1, speed: sliderSpeed(0) },
    falling: [],
    layers: 0,
    score: 0,
    streak: 0,
    over: false,
    rng,
  }
  // Seeded initial side; speed jitter is drawn per new layer in drop().
  const dir = rng() < 0.5 ? -1 : 1
  state.slider.dir = dir
  state.slider.x = dir > 0 ? 0 : W - START_W
  state.slider.speed = sliderSpeed(0) * (0.92 + rng() * 0.16)
  return state
}

/**
 * Advance the ping-pong slider and the falling pieces by `dt` ms. No input
 * here — dropping is {@link drop}. Does nothing once the tower collapsed.
 * @param state - the run (mutated in place).
 * @param dt - elapsed milliseconds (clamp upstream).
 */
export function step(state: StackState, dt: number): void {
  if (state.over) return
  const dtSec = dt / 1000
  const s = state.slider
  s.x += s.dir * s.speed * dtSec
  // Ping-pong: reflect at either wall, keeping x inside [0, W - w].
  const maxX = W - s.w
  if (s.x <= 0) {
    s.x = Math.min(maxX, -s.x)
    s.dir = 1
  } else if (s.x >= maxX) {
    s.x = Math.max(0, 2 * maxX - s.x)
    s.dir = -1
  }
  // Overhang pieces: accelerate downward, cull far below the ground line.
  const alive: FallingPiece[] = []
  for (const p of state.falling) {
    p.vy += GRAVITY * dtSec
    p.y += p.vy * dtSec
    if (p.y < BASE_Y + FALL_CULL) alive.push(p)
  }
  state.falling = alive
}

/** What one drop did to the tower. */
export type DropResult = 'perfect' | 'ok' | 'gameover'

export interface DropOutcome {
  state: StackState
  result: DropResult
  /** Overlap width in px; ≤ 0 means the tower collapsed. */
  overlap: number
}

/**
 * Drop the slider onto the block below. The overlap becomes the new placed
 * block; the overhang (if any) detaches as a falling piece. Perfect drops
 * (offset ≤ PERFECT_TOL) keep the full width, score +PERFECT_SCORE, and pay
 * +STREAK_BONUS on every STREAK_BONUS_EVERY-th consecutive perfect; normal
 * drops score +NORMAL_SCORE and reset the streak. When the overlap is ≤ 0
 * the tower collapses. A new slider then enters from the alternating side.
 * @param state - the run (mutated in place; also returned).
 * @returns the outcome with the same state reference.
 */
export function drop(state: StackState): DropOutcome {
  const top = state.blocks[state.blocks.length - 1]!
  const s = state.slider
  const left = Math.max(top.x, s.x)
  const right = Math.min(top.x + top.w, s.x + s.w)
  const overlap = right - left
  const offset = Math.abs(s.x - top.x)
  if (overlap <= 0) {
    // Total miss: the whole slider tumbles off and the run ends.
    state.over = true
    state.falling.push({ x: s.x, w: s.w, y: layerTopY(state.layers), vy: 0 })
    return { state, result: 'gameover', overlap }
  }
  const dropY = layerTopY(state.layers)
  if (offset <= PERFECT_TOL) {
    // Perfect: snap onto the block below at full width.
    state.blocks.push({ x: top.x, w: top.w })
    state.streak += 1
    state.score += PERFECT_SCORE
    if (state.streak % STREAK_BONUS_EVERY === 0) state.score += STREAK_BONUS
  } else {
    // Trim to the overlap; the overhang (one side — widths match) falls.
    state.blocks.push({ x: left, w: overlap })
    state.falling.push({ x: s.x < top.x ? s.x : right, w: s.w - overlap, y: dropY, vy: 0 })
    state.streak = 0
    state.score += NORMAL_SCORE
  }
  state.layers += 1
  // Next slider: width of the new top, alternating side, jittered speed.
  const newTop = state.blocks[state.blocks.length - 1]!
  const dir = s.dir === 1 ? -1 : 1
  state.slider = {
    x: dir > 0 ? 0 : W - newTop.w,
    w: newTop.w,
    dir,
    speed: sliderSpeed(state.layers) * (0.92 + state.rng() * 0.16),
  }
  return { state, result: offset <= PERFECT_TOL ? 'perfect' : 'ok', overlap }
}
