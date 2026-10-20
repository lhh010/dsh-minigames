/**
 * Dodger (弹幕躲避) pure logic: a player dot chases a target point (mouse or
 * arrow-nudged) on a fixed arena while bullets stream in from the edges aimed
 * at the player. Spawn rate and bullet speed ramp with survival time; grazing
 * a bullet (passing within 1.5x hit radius without touching) scores a
 * once-per-bullet bonus. From t=25s telegraphed full-length laser beams
 * seal rows/columns on an accelerating schedule; from score 350 diagonal
 * beams join the axis pool. From score 800 a seeded fraction of new bullets
 * is homing: slower comets that steer toward the player under a turn-rate
 * cap and live longer. Contact ends the run.
 * Deterministic given (dt, input, rng); time is in milliseconds throughout.
 */

/** Logical arena size (HUD strip lives inside this height). */
export const W = 480
export const H = 600
export const HUD_H = 30

export const PLAYER_R = 8
export const BULLET_R = 5
/** Player chase speed toward the target point, px/s. */
export const PLAYER_SPEED = 340
/** Arrow-key target nudge speed, px/s. */
export const KEY_SPEED = 300

export const GRACE_MS = 1500 // invulnerable flicker window at run start
export const RAMP_MS = 120_000 // spawn/speed ramp duration
const SPAWN_START = 900 // ms between spawns at t=0
const SPAWN_FLOOR = 250 // ms between spawns at t>=RAMP_MS
const SPEED_START = 90 // bullet speed at t=0, px/s
const SPEED_MAX = 220 // bullet speed at t>=RAMP_MS, px/s

export const AIM_JITTER = 0.35 // max radians off the exact player direction
export const MAX_BULLETS = 120
export const NEAR_MISS_FACTOR = 1.5
export const NEAR_MISS_BONUS = 5
export const SCORE_PER_SECOND = 10
/** Normal bullets are culled this far beyond the arena border, px. */
export const BULLET_CULL_MARGIN = 80

// --- Homing bullets (score-gated comets that chase the player) ---

/** Score at or above which new bullets may roll homing. */
export const HOMING_SCORE = 800
/** Fraction of newly spawned bullets that are homing once unlocked. */
export const HOMING_FRACTION = 0.35
/** Max velocity rotation, rad/s; a fast player can out-orbit them. */
export const HOMING_TURN_RATE = 1.6
/** Homing bullet speed as a factor of the tier speed. */
export const HOMING_SPEED_FACTOR = 0.75
/** Homing lifetime in ms (normal bullets have no lifetime: geometric cull). */
export const HOMING_LIFE_MS = 6000
/** Homing bullets use their own pool cap and do not count against MAX_BULLETS. */
export const HOMING_MAX_ALIVE = 24
/** Homing bullets are culled only past this far-field margin, px. */
export const HOMING_CULL_MARGIN = 300

// --- Lasers (telegraphed full-length beams that seal movement lanes) ---

export const LASER_TELEGRAPH_MS = 1100
export const LASER_FIRE_MS = 450
export const LASER_FADE_MS = 300
/** Full beam thickness in px; collision uses half of this as the beam radius. */
export const LASER_BEAM_W = 14
export const LASER_BEAM_HALF = LASER_BEAM_W / 2
/** First laser may not spawn before this survival time. */
export const LASER_START_MS = 25_000
/** Interval ramp duration counted from the first laser. */
export const LASER_RAMP_MS = 90_000
const LASER_MAX_INTERVAL = 6000
const LASER_MIN_INTERVAL = 3200
/** Max concurrently alive lasers (any phase). */
export const LASER_MAX_ALIVE = 2
/** After the player proves themselves (score ≥ this), lasers may run in
 *  parallel: the alive cap lifts to LASER_MULTI_MAX and the one-at-a-time
 *  restriction drops entirely — crossing grids become the pressure test. */
export const LASER_MULTI_SCORE = 500
export const LASER_MULTI_MAX = 3
/** Before this time at most one laser may occupy telegraph/fire at once. */
export const LASER_SOLO_FIRE_UNTIL = 70_000
/** Probability a laser targets the player's row/col instead of a random one. */
export const LASER_AIM_CHANCE = 0.6
/** Score at or above which diagonal axes join the laser axis pool. */
export const LASER_DIAGONAL_SCORE = 350

/** Laser spawn interval after `tMs`, linear 6s→3.2s over 90s from the first. */
export function laserInterval(tMs: number): number {
  const k = Math.min(1, Math.max(0, (tMs - LASER_START_MS) / LASER_RAMP_MS))
  return LASER_MAX_INTERVAL + (LASER_MIN_INTERVAL - LASER_MAX_INTERVAL) * k
}

/** Spawn interval after `tMs` of survival, linear 900→250 over 120s. */
export function spawnInterval(tMs: number): number {
  const k = Math.min(1, Math.max(0, tMs / RAMP_MS))
  return SPAWN_START + (SPAWN_FLOOR - SPAWN_START) * k
}

/** Bullet speed after `tMs` of survival, linear 90→220 over 120s. */
export function bulletSpeed(tMs: number): number {
  const k = Math.min(1, Math.max(0, tMs / RAMP_MS))
  return SPEED_START + (SPEED_MAX - SPEED_START) * k
}

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  /** True once this bullet has already paid its near-miss bonus. */
  grazed: boolean
  /** Homing bullets steer toward the player under a turn-rate cap. */
  homing?: boolean
  /** ms alive; tracked only for homing bullets (HOMING_LIFE_MS expiry). */
  age?: number
}

export type LaserPhase = 'telegraph' | 'fire' | 'fade'

/** Beam axis: h seals a row, v a column, d1 runs down-right, d2 down-left. */
export type LaserAxis = 'h' | 'v' | 'd1' | 'd2'

/**
 * A full-length beam. h sits at y=pos, v at x=pos; d1/d2 pass through the
 * anchor (ax, ay) along the 45° axis direction (ax/ay unused for h/v).
 */
export interface Laser {
  axis: LaserAxis
  pos: number
  phase: LaserPhase
  /** ms elapsed in the current phase. */
  phaseT: number
  /** Diagonal anchor x (d1/d2 only). */
  ax?: number
  /** Diagonal anchor y (d1/d2 only). */
  ay?: number
}

/** Unit direction vector of a laser axis. */
export function laserDir(axis: LaserAxis): { dx: number; dy: number } {
  if (axis === 'h') return { dx: 1, dy: 0 }
  if (axis === 'v') return { dx: 0, dy: 1 }
  const s = Math.SQRT1_2
  return axis === 'd1' ? { dx: s, dy: s } : { dx: -s, dy: s }
}

/** Clip the infinite line through (ax, ay) along unit (dx, dy) to the rect
 * [minX, maxX] × [minY, maxY] (parametric Liang–Barsky slab clipping).
 * @returns the boundary-to-boundary segment, or null when the line misses
 * the rect or the direction is zero. */
export function lineClip(
  ax: number, ay: number, dx: number, dy: number,
  minX: number, minY: number, maxX: number, maxY: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (dx === 0 && dy === 0) return null
  let tMin = -Infinity
  let tMax = Infinity
  const clip = (d: number, a: number, lo: number, hi: number): boolean => {
    if (d === 0) return a >= lo && a <= hi
    let tLo = (lo - a) / d
    let tHi = (hi - a) / d
    if (tLo > tHi) [tLo, tHi] = [tHi, tLo]
    tMin = Math.max(tMin, tLo)
    tMax = Math.min(tMax, tHi)
    return tMin <= tMax
  }
  if (!clip(dx, ax, minX, maxX)) return null
  if (!clip(dy, ay, minY, maxY)) return null
  return {
    x0: ax + tMin * dx,
    y0: ay + tMin * dy,
    x1: ax + tMax * dx,
    y1: ay + tMax * dy,
  }
}

/** Perpendicular distance from (px, py) to the laser's (infinite) beam line. */
export function laserDist(l: Laser, px: number, py: number): number {
  if (l.axis === 'h') return Math.abs(py - l.pos)
  if (l.axis === 'v') return Math.abs(px - l.pos)
  const { dx, dy } = laserDir(l.axis)
  return Math.abs(dx * (py - (l.ay ?? 0)) - dy * (px - (l.ax ?? 0)))
}

/** Held arrow/WASD state; also the modality switch (any key arms keyboard). */
export interface DodgerInput {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export interface DodgerState {
  x: number
  y: number
  /** Point the player dot chases (mouse position or arrow-nudged). */
  tx: number
  ty: number
  bullets: Bullet[]
  t: number
  score: number
  grazes: number
  over: boolean
  /** Remaining grace-period ms; >0 means contact is forgiven. */
  grace: number
  /** ms until the next edge spawn. */
  spawnCooldown: number
  /** Alive lasers in any phase. */
  lasers: Laser[]
  /** ms until the next laser spawn (first laser no earlier than LASER_START_MS). */
  laserCooldown: number
  rng: () => number
}

/** A fresh run: player centered, pointer target at the player, grace on. */
export function createDodger(rng: () => number = Math.random): DodgerState {
  return {
    x: W / 2,
    y: HUD_H + (H - HUD_H) / 2,
    tx: W / 2,
    ty: HUD_H + (H - HUD_H) / 2,
    bullets: [],
    t: 0,
    score: 0,
    grazes: 0,
    over: false,
    grace: GRACE_MS,
    spawnCooldown: spawnInterval(0),
    lasers: [],
    laserCooldown: LASER_START_MS,
    rng,
  }
}

/** Clamp the chase target into the playable area (below the HUD strip). */
export function setTarget(state: DodgerState, x: number, y: number): void {
  state.tx = Math.min(W - PLAYER_R, Math.max(PLAYER_R, x))
  state.ty = Math.min(H - PLAYER_R, Math.max(HUD_H + PLAYER_R, y))
}

/**
 * Spawn one bullet on a random edge point, aimed at the player with jitter.
 * Once score ≥ HOMING_SCORE, a seeded HOMING_FRACTION of spawns are homing
 * (0.75x tier speed, own pool cap HOMING_MAX_ALIVE, do not count against
 * MAX_BULLETS; a full homing pool falls back to a normal bullet).
 * Exposed for tests; stepDodger calls it on its cooldown.
 */
export function spawnBullet(state: DodgerState): void {
  let homing = state.score >= HOMING_SCORE && state.rng() < HOMING_FRACTION
  let homingCount = 0
  let normalCount = 0
  for (const b of state.bullets) {
    if (b.homing) homingCount += 1
    else normalCount += 1
  }
  if (homing && homingCount >= HOMING_MAX_ALIVE) homing = false
  if (!homing && normalCount >= MAX_BULLETS) return
  const M = BULLET_R + 4 // spawn just outside the arena
  const edge = Math.floor(state.rng() * 4)
  let x = 0
  let y = 0
  if (edge === 0) { x = state.rng() * W; y = -M }
  else if (edge === 1) { x = W + M; y = state.rng() * H }
  else if (edge === 2) { x = state.rng() * W; y = H + M }
  else { x = -M; y = state.rng() * H }
  const aim = Math.atan2(state.y - y, state.x - x) + (state.rng() * 2 - 1) * AIM_JITTER
  const speed = bulletSpeed(state.t) * (homing ? HOMING_SPEED_FACTOR : 1)
  const bullet: Bullet = { x, y, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, grazed: false }
  if (homing) {
    bullet.homing = true
    bullet.age = 0
  }
  state.bullets.push(bullet)
}

/**
 * Spawn one laser: 60% aimed at the player (row/col, or the anchor pinned to
 * the player's position for diagonals), 40% at a uniform random position in
 * the field; axis picked uniformly over h/v, plus d1/d2 once score ≥
 * LASER_DIAGONAL_SCORE. Exposed for tests.
 * @param state - the run (laser pushed onto `state.lasers`).
 * @returns the spawned laser.
 */
export function spawnLaser(state: DodgerState): Laser {
  const aimed = state.rng() < LASER_AIM_CHANCE
  const diagonal = state.score >= LASER_DIAGONAL_SCORE
  const axes: LaserAxis[] = diagonal ? ['h', 'v', 'd1', 'd2'] : ['h', 'v']
  const axis = axes[Math.floor(state.rng() * axes.length)]!
  const laser: Laser = { axis, pos: 0, phase: 'telegraph', phaseT: 0 }
  if (axis === 'h') laser.pos = aimed ? state.y : HUD_H + state.rng() * (H - HUD_H)
  else if (axis === 'v') laser.pos = aimed ? state.x : state.rng() * W
  else {
    laser.ax = aimed ? state.x : state.rng() * W
    laser.ay = aimed ? state.y : HUD_H + state.rng() * (H - HUD_H)
  }
  state.lasers.push(laser)
  return laser
}

/**
 * Whether the scheduler may spawn a laser now: alive cap (2 normally, 3 once
 * score ≥ LASER_MULTI_SCORE), and while still in the early phase (time <
 * LASER_SOLO_FIRE_UNTIL AND score < LASER_MULTI_SCORE) only when every alive
 * laser is already fading, so at most one laser telegraphs/fires at a time —
 * no impossible grids before the multi-laser unlock.
 */
function laserCanSpawn(state: DodgerState): boolean {
  const multi = state.score >= LASER_MULTI_SCORE
  const cap = multi ? LASER_MULTI_MAX : LASER_MAX_ALIVE
  if (state.lasers.length >= cap) return false
  if (!multi && state.t < LASER_SOLO_FIRE_UNTIL && state.lasers.some(l => l.phase !== 'fade')) return false
  return true
}

/**
 * Advance one fixed step by `dt` ms under the held input.
 * @param state - the run (mutated in place).
 * @param dt - elapsed milliseconds (clamp upstream).
 * @param input - held arrow/WASD keys; any held key nudges the chase target.
 * @returns true when the run ended this step.
 */
export function stepDodger(state: DodgerState, dt: number, input: DodgerInput): boolean {
  if (state.over) return true
  const dtSec = dt / 1000
  state.t += dt
  state.grace = Math.max(0, state.grace - dt)

  // Keyboard fallback: nudge the chase target.
  if (input.left) state.tx -= KEY_SPEED * dtSec
  if (input.right) state.tx += KEY_SPEED * dtSec
  if (input.up) state.ty -= KEY_SPEED * dtSec
  if (input.down) state.ty += KEY_SPEED * dtSec
  setTarget(state, state.tx, state.ty)

  // Player chases the target at capped speed.
  const dx = state.tx - state.x
  const dy = state.ty - state.y
  const dist = Math.hypot(dx, dy)
  if (dist > 0.001) {
    const step = Math.min(dist, PLAYER_SPEED * dtSec)
    state.x += (dx / dist) * step
    state.y += (dy / dist) * step
  }

  // Spawn pacing on the ramped cooldown.
  state.spawnCooldown -= dt
  while (state.spawnCooldown <= 0) {
    spawnBullet(state)
    state.spawnCooldown += spawnInterval(state.t)
  }

  // Bullets: move (homing steers first), cull, collide / graze.
  const hitR = PLAYER_R + BULLET_R
  const grazeR = hitR * NEAR_MISS_FACTOR
  const alive: Bullet[] = []
  for (const b of state.bullets) {
    if (b.homing) {
      b.age = (b.age ?? 0) + dt
      if (b.age >= HOMING_LIFE_MS) continue
      // Steer toward the player's current position, capped by the turn rate.
      const speed = Math.hypot(b.vx, b.vy)
      const cur = Math.atan2(b.vy, b.vx)
      const want = Math.atan2(state.y - b.y, state.x - b.x)
      let delta = want - cur
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      const maxTurn = HOMING_TURN_RATE * dtSec
      const turn = Math.min(maxTurn, Math.max(-maxTurn, delta))
      b.vx = Math.cos(cur + turn) * speed
      b.vy = Math.sin(cur + turn) * speed
    }
    b.x += b.vx * dtSec
    b.y += b.vy * dtSec
    const M = b.homing ? HOMING_CULL_MARGIN : BULLET_CULL_MARGIN
    if (b.x < -M || b.x > W + M || b.y < -M || b.y > H + M) continue
    const d = Math.hypot(b.x - state.x, b.y - state.y)
    if (d < hitR) {
      if (state.grace > 0) {
        // Forgiven during grace: graze credit instead of death.
        if (!b.grazed) {
          b.grazed = true
          state.grazes += 1
          state.score += NEAR_MISS_BONUS
        }
      } else {
        state.over = true
        state.bullets = alive
        return true
      }
    } else if (!b.grazed && d < grazeR) {
      b.grazed = true
      state.grazes += 1
      state.score += NEAR_MISS_BONUS
    }
    alive.push(b)
  }
  state.bullets = alive

  // Laser scheduler: spawn when due, or hold at 0 until allowed (cap/solo rule).
  state.laserCooldown -= dt
  if (state.laserCooldown <= 0) {
    if (laserCanSpawn(state)) {
      spawnLaser(state)
      state.laserCooldown = laserInterval(state.t)
    } else {
      state.laserCooldown = 0
    }
  }

  // Laser lifecycle: telegraph → fire → fade → cull.
  const liveLasers: Laser[] = []
  for (const l of state.lasers) {
    l.phaseT += dt
    if (l.phase === 'telegraph') {
      if (l.phaseT >= LASER_TELEGRAPH_MS) {
        l.phase = 'fire'
        l.phaseT -= LASER_TELEGRAPH_MS
      }
    } else if (l.phase === 'fire') {
      if (l.phaseT >= LASER_FIRE_MS) {
        l.phase = 'fade'
        l.phaseT -= LASER_FIRE_MS
      }
    } else if (l.phaseT >= LASER_FADE_MS) continue
    liveLasers.push(l)
  }
  state.lasers = liveLasers

  // Laser collision: lethal only in fire, circle-vs-beam distance; grace forgives.
  if (state.grace <= 0) {
    for (const l of state.lasers) {
      if (l.phase !== 'fire') continue
      if (laserDist(l, state.x, state.y) <= PLAYER_R + LASER_BEAM_HALF) {
        state.over = true
        return true
      }
    }
  }

  // Survival score: whole survived seconds x10.
  state.score = Math.floor(state.t / 1000) * SCORE_PER_SECOND + state.grazes * NEAR_MISS_BONUS
  return false
}
