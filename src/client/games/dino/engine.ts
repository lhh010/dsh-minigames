/**
 * Dino runner pure logic: physics, spawning, and collision as deterministic
 * functions over a plain state object. No DOM, no timers — the game instance
 * in index.ts drives this with requestAnimationFrame, and the unit tests
 * drive it with fixed dt and a seeded rng.
 */

/** Logical viewport width in px (height is GROUND_Y + a small margin). */
export const VIEW_W = 600
/** Ground line y (canvas coordinates); low enough for a full jump arc. */
export const GROUND_Y = 165
/** Dino's fixed horizontal position (left edge). */
export const DINO_X = 60
/** Standing dino hitbox. */
export const DINO_W = 46
export const DINO_H = 50
/** Ducking dino hitbox (only while on the ground). */
export const DUCK_H = 26

const GRAVITY = 2100
const JUMP_V = -640
const BASE_SPEED = 320
const MAX_SPEED = 760
/** Horizontal scroll px per score point (score = distance / this). */
export const SCORE_PER_POINT = 10
/** Speed gain per score point (speed = BASE + score * this, capped at MAX). */
const SPEED_PER_SCORE = 0.15
/** Score interval between day/night toggles. */
export const THEME_INTERVAL = 800
/** Every this many points, a rain window starts (1000, 2000, ...). */
export const RAIN_START = 1000
/** Rain window length in points: [mark, mark + RAIN_LENGTH). */
export const RAIN_LENGTH = 300
const SPAWN_MIN = 1.1
const SPAWN_MAX = 2.4
/** Forgiving hitbox shrink on both axes, in px. */
const HITBOX_SHRINK = 4

export interface DinoRect { x: number; y: number; w: number; h: number }

export interface Obstacle {
  kind: 'cactus' | 'cactus-double' | 'bird' | 'bird-ground'
  x: number
  w: number
  h: number
  /** Top edge (canvas coordinates); birds float, cacti sit on the ground. */
  y: number
}

export interface DinoInput {
  /** Jump is edge-triggered: the caller sets it for the frame the key/click lands. */
  jump: boolean
  /** Duck is level-triggered: held while the key is down. */
  duck: boolean
}

export interface DinoState {
  /** Elapsed run time in seconds (frozen once over). */
  t: number
  /** Current horizontal scroll speed in px/s (grows with score, capped). */
  speed: number
  /** Total scrolled distance in px; the score derives from it. */
  distance: number
  /** Score = floor(distance / SCORE_PER_POINT). */
  score: number
  /** Day/night theme, toggled every THEME_INTERVAL points. */
  night: boolean
  /** Rain window: drifting rain + fog for RAIN_LENGTH points every RAIN_START. */
  raining: boolean
  dino: {
    x: number
    /** Top edge. */
    y: number
    vy: number
    onGround: boolean
    ducking: boolean
  }
  obstacles: Obstacle[]
  /** Seconds until the next obstacle spawns. */
  nextSpawnIn: number
  over: boolean
  /** Seeded rng for deterministic tests. */
  rng: () => number
}

/** A new run at the starting line. */
export function createDinoState(rng: () => number = Math.random): DinoState {
  return {
    t: 0,
    speed: BASE_SPEED,
    distance: 0,
    score: 0,
    night: false,
    raining: false,
    dino: { x: DINO_X, y: GROUND_Y - DINO_H, vy: 0, onGround: true, ducking: false },
    obstacles: [],
    nextSpawnIn: 1.5,
    over: false,
    rng,
  }
}

/** The dino's current collision rect: follows the jump, ducking shrinks it. */
export function dinoRect(state: DinoState): DinoRect {
  const dino = state.dino
  if (dino.ducking && dino.onGround) {
    return { x: dino.x, y: GROUND_Y - DUCK_H, w: DINO_W, h: DUCK_H }
  }
  return { x: dino.x, y: dino.y, w: DINO_W, h: DINO_H }
}

/** Shrunk AABB overlap test — the forgiving hitbox the runner actually uses. */
export function collides(a: DinoRect, b: DinoRect): boolean {
  const ax0 = a.x + HITBOX_SHRINK
  const ax1 = a.x + a.w - HITBOX_SHRINK
  const ay0 = a.y + HITBOX_SHRINK
  const ay1 = a.y + a.h - HITBOX_SHRINK
  const bx0 = b.x + HITBOX_SHRINK
  const bx1 = b.x + b.w - HITBOX_SHRINK
  const by0 = b.y + HITBOX_SHRINK
  const by1 = b.y + b.h - HITBOX_SHRINK
  return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0
}

/** Roll one obstacle at the right edge of the viewport. */
function spawnObstacle(state: DinoState): void {
  const rng = state.rng
  const roll = rng()
  if (roll < 0.4) {
    // Single cactus with size variance.
    const w = 22 + rng() * 8
    const h = 40 + rng() * 12
    state.obstacles.push({ kind: 'cactus', x: VIEW_W, w, h, y: GROUND_Y - h })
  } else if (roll < 0.65) {
    // Double cactus: two trunks side by side, one wider hitbox.
    const w = 46 + rng() * 10
    const h = 40 + rng() * 12
    state.obstacles.push({ kind: 'cactus-double', x: VIEW_W, w, h, y: GROUND_Y - h })
  } else {
    // Birds at three heights:
    //  - high (passes over the standing dino, punishes jumps),
    //  - low (dodged by ducking OR by jumping to the apex),
    //  - ground (hugs the ground — only a jump clears it; ducking does not).
    const w = 46
    const h = 30
    const kindRoll = rng()
    if (kindRoll < 0.3) {
      state.obstacles.push({ kind: 'bird', x: VIEW_W, w, h, y: GROUND_Y - 118 })
    } else if (kindRoll < 0.75) {
      state.obstacles.push({ kind: 'bird', x: VIEW_W, w, h, y: GROUND_Y - 60 })
    } else {
      state.obstacles.push({ kind: 'bird-ground', x: VIEW_W, w, h, y: GROUND_Y - 30 })
    }
  }
}

/**
 * Advance the run by dt seconds.
 * @param state - the run state (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - this frame's input.
 */
export function step(state: DinoState, dt: number, input: DinoInput): void {
  if (state.over) return
  state.t += dt
  // The score is distance-based: scroll accumulates, and the speed rises with
  // the score (faster runs as you survive) until the cap. Day/night flips
  // every THEME_INTERVAL points.
  state.distance += state.speed * dt
  state.score = Math.floor(state.distance / SCORE_PER_POINT)
  state.night = Math.floor(state.score / THEME_INTERVAL) % 2 === 1
  // Rain windows: for RAIN_LENGTH points starting at every RAIN_START mark.
  state.raining = state.score >= RAIN_START && state.score % RAIN_START < RAIN_LENGTH
  state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.score * SPEED_PER_SCORE)

  // Dino vertical physics.
  const dino = state.dino
  if (input.jump && dino.onGround) {
    dino.vy = JUMP_V
    dino.onGround = false
  }
  if (!dino.onGround) {
    dino.vy += GRAVITY * dt
    dino.y += dino.vy * dt
    const floor = GROUND_Y - DINO_H
    if (dino.y >= floor) {
      dino.y = floor
      dino.vy = 0
      dino.onGround = true
    }
  }
  dino.ducking = input.duck && dino.onGround

  // Scroll obstacles.
  const speed = state.speed
  const remaining: Obstacle[] = []
  for (const obstacle of state.obstacles) {
    obstacle.x -= speed * dt
    if (obstacle.x + obstacle.w >= 0) remaining.push(obstacle)
  }
  state.obstacles = remaining

  // Spawn the next obstacle.
  state.nextSpawnIn -= dt
  if (state.nextSpawnIn <= 0) {
    spawnObstacle(state)
    state.nextSpawnIn = SPAWN_MIN + state.rng() * (SPAWN_MAX - SPAWN_MIN)
  }

  // Collision ends the run.
  const rect = dinoRect(state)
  for (const obstacle of state.obstacles) {
    if (collides(rect, obstacle)) {
      state.over = true
      return
    }
  }
}
