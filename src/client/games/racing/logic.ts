/**
 * Neon Racing pure logic: a pseudo-3D lane racer. The player car sits at a
 * fixed perspective distance (PD) on a curving road; traffic spawns ahead and
 * drives slower; the player changes lanes, accelerates, brakes, and scores
 * for distance, passes, and near-miss combos until a collision.
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */

export const LANES = [-1.7, 0, 1.7] as const
export const ROAD_HW = 3.4
export const RUMBLE_W = 0.35
export const CAR_W = 1.0
export const CAR_H = 0.75
export const COLLIDE_X = 0.8
export const NEAR_X = 1.35
export const PD = 3.0
export const SPAWN_Z = 170
/** Visual distance of the roadside scenery (render-side constant, exported
 * here so the renderer and tests share one value). */
export const VIEW_D = 240
/** Camera height above the road (world units) for the projection. */
export const CAM_H = 2.0
export const MAX_SPEED = 92
export const CRASH_OVER_S = 1.6
export const COMBO_WINDOW_S = 3.2
export const NEAR_MISS_POINTS = 100
export const PASS_POINTS = 30
export const DIST_POINTS_PER_UNIT = 0.5

export type LaneInput = { left: boolean; right: boolean; accel: boolean; brake: boolean }
export type GameResult = 'ready' | 'playing' | 'paused' | 'over'

export interface Enemy {
  /** Lane index 0..2. */
  li: number
  lane: number
  z: number
  /** The enemy's own world speed. */
  v: number
  color: string
  /** Near-miss already awarded for this enemy. */
  near: boolean
  /** Already counted as passed. */
  passed: boolean
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  grav: number
}

export interface RacingState {
  result: GameResult
  /** Seconds since the run started. */
  t: number
  /** World distance travelled (also the scroll offset). */
  worldZ: number
  speed: number
  dist: number
  score: number
  passCount: number
  laneIdx: number
  /** Smoothed lateral offset (world units) toward the target lane. */
  playerLat: number
  /** Lateral velocity (for the body roll), derived. */
  latVel: number
  enemies: Enemy[]
  particles: Particle[]
  spawnTimer: number
  crashed: boolean
  crashTimer: number
  combo: number
  comboTimer: number
  /** Seconds remaining on the floating message (near-miss/crash text). */
  msgTimer: number
  msg: string
  /** Events emitted by the last step (for audio/particle triggers in the glue). */
  events: RaceEvent[]
  rng: () => number
}

export type RaceEvent =
  | { kind: 'lane' }
  | { kind: 'near-miss'; points: number; side: number }
  | { kind: 'pass' }
  | { kind: 'crash' }
  | { kind: 'over' }

/** Road centre lateral offset at world z (two summed sines = curves). */
export function centreAt(z: number): number {
  return 1.8 * Math.sin(z * 0.010) + 0.9 * Math.sin(z * 0.023 + 1.3)
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

export const ENEMY_COLORS = ['#ff3b5c', '#ffd23f', '#f4f4f5', '#8b5cf6', '#34d399', '#fb923c', '#2563eb'] as const

/** A fresh run in the ready (attract) state. */
export function createState(seed = 1): RacingState {
  return {
    result: 'ready',
    t: 0,
    worldZ: 0,
    speed: 22,
    dist: 0,
    score: 0,
    passCount: 0,
    laneIdx: 1,
    playerLat: 0,
    latVel: 0,
    enemies: [],
    particles: [],
    spawnTimer: 0.9,
    crashed: false,
    crashTimer: 0,
    combo: 0,
    comboTimer: 0,
    msgTimer: 0,
    msg: '',
    events: [],
    rng: mulberry32(seed),
  }
}

/** Start (or restart) a run from the ready/over states. */
export function startRun(state: RacingState): void {
  const seed = (state.rng() * 0xffffffff) >>> 0
  const fresh = createState(seed)
  Object.assign(state, fresh, { result: 'playing' })
}

/** Toggle between playing and paused; no-op otherwise. */
export function togglePause(state: RacingState): void {
  if (state.result === 'playing') state.result = 'paused'
  else if (state.result === 'paused') state.result = 'playing'
}

/** Request a lane change; clamped and only while playing. */
export function changeLane(state: RacingState, dir: number): boolean {
  if (state.result !== 'playing' || state.crashed) return false
  const n = Math.min(Math.max(state.laneIdx + dir, 0), LANES.length - 1)
  if (n === state.laneIdx) return false
  state.laneIdx = n
  state.events.push({ kind: 'lane' })
  return true
}

/** Base speed target for the current time (ramps with survival time). */
export function baseSpeedAt(t: number): number {
  return 34 + Math.min(30, t * 0.35)
}

function randBetween(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a)
}

function spawnEnemy(state: RacingState, li: number): void {
  state.enemies.push({
    li,
    lane: LANES[li]!,
    z: SPAWN_Z + state.rng() * 8,
    v: Math.min(40, randBetween(state.rng, 6, 26) + state.t * 0.1),
    color: ENEMY_COLORS[(state.rng() * ENEMY_COLORS.length) | 0]!,
    near: false,
    passed: false,
  })
}

/**
 * Spawn a wave of 1-2 enemies, never blocking all three lanes within the
 * spawn horizon (so the player always has a way through).
 */
export function spawnWave(state: RacingState): void {
  const blocked = new Set<number>()
  for (const e of state.enemies) if (e.z > SPAWN_Z - 40) blocked.add(e.li)
  const free = [0, 1, 2].filter(i => !blocked.has(i))
  if (free.length <= 1) return
  // Deterministic shuffle.
  for (let i = free.length - 1; i > 0; i -= 1) {
    const j = (state.rng() * (i + 1)) | 0
    ;[free[i], free[j]] = [free[j]!, free[i]!]
  }
  let n = 1
  if (free.length >= 3 && state.rng() < Math.min(0.4, 0.08 + state.t * 0.006)) n = 2
  for (let i = 0; i < n; i += 1) spawnEnemy(state, free[i]!)
}

function startCrash(state: RacingState): void {
  state.crashed = true
  state.crashTimer = 0
  state.combo = 0
  state.comboTimer = 0
  state.events.push({ kind: 'crash' })
  state.msg = '撞车了！'
  state.msgTimer = 1.6
}

/**
 * Advance the world by dt seconds under the player's held inputs. Mutates the
 * state in place (the renderer reads it directly). Only runs while playing.
 */
export function step(state: RacingState, dt: number, input: LaneInput): void {
  state.events = []
  if (state.result !== 'playing') return
  state.t += dt

  // Speed model.
  const base = baseSpeedAt(state.t)
  let target = base
  if (state.crashed) target = 0
  else if (input.accel) target = Math.min(MAX_SPEED, base + 28)
  else if (input.brake) target = base * 0.45
  const rate = state.crashed ? 3 : (input.accel ? 2.2 : 1.5)
  state.speed += (target - state.speed) * Math.min(1, dt * rate)
  state.worldZ += state.speed * dt

  if (!state.crashed) {
    state.dist += state.speed * dt
    state.score += state.speed * dt * DIST_POINTS_PER_UNIT
  }

  // Lateral smoothing toward the target lane.
  const prevLat = state.playerLat
  state.playerLat += (LANES[state.laneIdx]! - state.playerLat) * Math.min(1, dt * 11)
  state.latVel = dt > 0 ? (state.playerLat - prevLat) / dt : 0

  // Spawning.
  if (!state.crashed) {
    state.spawnTimer -= dt
    if (state.spawnTimer <= 0) {
      spawnWave(state)
      state.spawnTimer = Math.max(0.45, 1.2 - state.t * 0.008) * randBetween(state.rng, 0.75, 1.25)
    }
  }

  // Enemy motion, collision, near-miss, pass scoring.
  for (const e of state.enemies) {
    e.z -= (state.speed - e.v) * dt
    if (!state.crashed) {
      const dz = Math.abs(e.z - PD)
      if (dz < 1.25) {
        const dx = Math.abs(state.playerLat - e.lane)
        if (dx < COLLIDE_X) startCrash(state)
        else if (dx < NEAR_X && !e.near) {
          e.near = true
          state.combo = Math.min(state.combo + 1, 9)
          state.comboTimer = COMBO_WINDOW_S
          const points = NEAR_MISS_POINTS * state.combo
          state.score += points
          state.msg = `擦身而过！ +${points}`
          state.msgTimer = 1.2
          state.events.push({ kind: 'near-miss', points, side: e.lane > state.playerLat ? 1 : -1 })
        }
      }
      if (!e.passed && e.z < PD - 1.25) {
        e.passed = true
        state.passCount += 1
        state.score += PASS_POINTS
        state.events.push({ kind: 'pass' })
      }
    }
  }
  state.enemies = state.enemies.filter(e => e.z > -10)

  // Timers.
  if (state.comboTimer > 0) {
    state.comboTimer -= dt
    if (state.comboTimer <= 0) state.combo = 0
  }
  if (state.msgTimer > 0) state.msgTimer -= dt

  // Crash → game over.
  if (state.crashed) {
    state.crashTimer += dt
    if (state.crashTimer > CRASH_OVER_S) {
      state.result = 'over'
      state.events.push({ kind: 'over' })
    }
  }
}

/** Attract-mode step: the road scrolls behind the start screen. */
export function attractStep(state: RacingState, dt: number): void {
  if (state.result !== 'ready') return
  state.speed += (22 - state.speed) * Math.min(1, dt * 2)
  state.worldZ += state.speed * dt
}

/** The player's smoothed world position at the perspective plane. */
export function playerWorldX(state: RacingState): number {
  return centreAt(state.worldZ + PD) + state.playerLat
}

/** Camera lateral offset (partially follows the player). */
export function cameraX(state: RacingState): number {
  const rc = centreAt(state.worldZ)
  const pw = playerWorldX(state)
  return rc + (pw - rc) * 0.6
}

/** Horizontal lanes currently blocked near the spawn horizon. */
export function blockedLanes(state: RacingState): Set<number> {
  const s = new Set<number>()
  for (const e of state.enemies) if (e.z > SPAWN_Z - 40) s.add(e.li)
  return s
}
