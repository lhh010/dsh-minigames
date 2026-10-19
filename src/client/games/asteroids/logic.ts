/**
 * Asteroids pure logic: a vector world with inertia physics — a thrusting,
 * rotating ship, rate-limited bullets, jagged rocks that split twice (large →
 * medium → small), wrap-around edges, wrap-aware collisions, lives with
 * respawn invulnerability, and endless waves. Deterministic given
 * (dt, input, rng); the game instance in index.ts drives it with rAF and the
 * unit tests drive it directly. Time is in milliseconds throughout.
 */

/** Logical canvas size. */
export const W = 960
export const H = 600

export type RockSize = 'large' | 'medium' | 'small'

/** Collision/spawn radii per rock size. */
export const ROCK_RADIUS: Record<RockSize, number> = { large: 40, medium: 22, small: 12 }
/** Score awarded for shooting a rock of each size. */
export const ROCK_SCORE: Record<RockSize, number> = { large: 20, medium: 50, small: 100 }

const VERT_COUNT = 10
const ROT_SPEED = 3.8 // rad/s
const THRUST = 340 // px/s^2
const DAMPING_PER_FRAME = 0.99 // velocity keep per 60fps frame
const FRAME_MS = 1000 / 60
const MAX_SPEED = 480
const START_LIVES = 3
const SHIP_HIT_RADIUS = 11
export const FIRE_INTERVAL = 180 // ms between shots
export const MAX_BULLETS = 8 // live player bullets allowed
const BULLET_SPEED = 540
export const BULLET_LIFE = 1100 // ms a bullet lives
export const RESPAWN_INVULN = 2000 // ms of respawn invulnerability
export const WAVE_DELAY = 1500 // ms between waves
/** Rocks never spawn within this radius of the ship's respawn point (center). */
const SPAWN_SAFE_RADIUS = 200

export interface Ship {
  x: number
  y: number
  vx: number
  vy: number
  /** Heading in radians; 0 points up, growing clockwise. */
  angle: number
  /** Whether thrust was applied this step (render draws the flame). */
  thrusting: boolean
}

export interface Rock {
  x: number
  y: number
  vx: number
  vy: number
  size: RockSize
  /** Current body rotation in radians. */
  angle: number
  /** Rotation speed in rad/s (signed). */
  spin: number
  /**
   * Stable per-vertex radius multipliers (0.72–1.28), one per VERT_COUNT
   * slice: the pregenerated jagged silhouette of this rock.
   */
  verts: number[]
}

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  /** Remaining lifetime in ms. */
  life: number
}

export interface PlayerInput {
  left: boolean
  right: boolean
  thrust: boolean
  /** Fire is level-triggered; the world respects the rate limit. */
  fire: boolean
}

/** One rock destruction this step — the render side bursts particles here. */
export interface DestructionEvent {
  x: number
  y: number
  size: RockSize
}

export interface AsteroidsState {
  ship: Ship
  rocks: Rock[]
  bullets: Bullet[]
  /** Rock destructions of the most recent step; cleared on each entry. */
  events: DestructionEvent[]
  score: number
  wave: number
  lives: number
  result: 'none' | 'lose'
  /** ms until firing is allowed again. */
  fireCooldown: number
  /** ms of remaining respawn invulnerability. */
  invuln: number
  /** ms until the next wave spawns; null while rocks remain. */
  waveClearTimer: number | null
  t: number
  rng: () => number
}

function wrapX(x: number): number {
  return ((x % W) + W) % W
}

function wrapY(y: number): number {
  return ((y % H) + H) % H
}

/** Shortest signed delta from a to b on a wrapping axis of length size. */
function wrapDelta(a: number, b: number, size: number): number {
  let d = b - a
  if (d > size / 2) d -= size
  else if (d < -size / 2) d += size
  return d
}

/** Wrap-aware squared distance between two points. */
function wrapDist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = wrapDelta(ax, bx, W)
  const dy = wrapDelta(ay, by, H)
  return dx * dx + dy * dy
}

function makeRock(size: RockSize, x: number, y: number, vx: number, vy: number, rng: () => number): Rock {
  const verts: number[] = []
  for (let i = 0; i < VERT_COUNT; i += 1) verts.push(0.72 + rng() * 0.56)
  return {
    x, y, vx, vy, size,
    angle: rng() * Math.PI * 2,
    spin: (rng() * 2 - 1) * 1.4,
    verts,
  }
}

/** One drifting rock at a random position outside the spawn-safe radius. */
function spawnRock(state: AsteroidsState, size: RockSize): void {
  let x = W / 2
  let y = 0
  for (let i = 0; i < 40; i += 1) {
    x = state.rng() * W
    y = state.rng() * H
    const dx = x - W / 2
    const dy = y - H / 2
    if (Math.hypot(dx, dy) > SPAWN_SAFE_RADIUS) break
  }
  const angle = state.rng() * Math.PI * 2
  const speed = 24 + state.rng() * 30
  state.rocks.push(makeRock(size, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, state.rng))
}

/** Replace the wave field: 2 + N large rocks for wave N. */
function spawnWave(state: AsteroidsState): void {
  const count = 2 + state.wave
  for (let i = 0; i < count; i += 1) spawnRock(state, 'large')
}

/** A fresh world at wave 1 with the ship centered. */
export function createAsteroids(rng: () => number = Math.random): AsteroidsState {
  const state: AsteroidsState = {
    ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0, thrusting: false },
    rocks: [],
    bullets: [],
    events: [],
    score: 0,
    wave: 1,
    lives: START_LIVES,
    result: 'none',
    fireCooldown: 0,
    invuln: RESPAWN_INVULN,
    waveClearTimer: null,
    t: 0,
    rng,
  }
  spawnWave(state)
  return state
}

/**
 * Destroy `index`'s rock: award score, record a destruction event, and split
 * large/medium rocks into two faster children deflected sideways.
 */
function destroyRock(state: AsteroidsState, index: number, awardScore: boolean): void {
  const rock = state.rocks[index]!
  state.rocks.splice(index, 1)
  if (awardScore) state.score += ROCK_SCORE[rock.size]
  state.events.push({ x: rock.x, y: rock.y, size: rock.size })
  if (rock.size === 'small') return
  const childSize: RockSize = rock.size === 'large' ? 'medium' : 'small'
  const speed = Math.hypot(rock.vx, rock.vy) * 1.35 + 18
  const heading = Math.atan2(rock.vy, rock.vx)
  for (const deflect of [-0.9, 0.9]) {
    const a = heading + deflect
    state.rocks.push(makeRock(childSize, rock.x, rock.y, Math.cos(a) * speed, Math.sin(a) * speed, state.rng))
  }
}

/** Respawn at the center with a fresh invulnerability window. */
function respawnShip(state: AsteroidsState): void {
  state.ship.x = W / 2
  state.ship.y = H / 2
  state.ship.vx = 0
  state.ship.vy = 0
  state.ship.angle = 0
  state.invuln = RESPAWN_INVULN
}

/**
 * Advance the world by dt milliseconds under the player's held inputs.
 * @param state - the world (mutated in place).
 * @param dt - elapsed milliseconds (clamp upstream; large steps blur physics).
 * @param input - player held keys this step.
 */
export function updateAsteroids(state: AsteroidsState, dt: number, input: PlayerInput): void {
  if (state.result !== 'none') return
  const dtSec = dt / 1000
  state.t += dt
  state.events = []

  // Ship: rotate, thrust with inertia, damp, wrap.
  const ship = state.ship
  if (input.left) ship.angle -= ROT_SPEED * dtSec
  if (input.right) ship.angle += ROT_SPEED * dtSec
  ship.thrusting = input.thrust
  if (input.thrust) {
    ship.vx += Math.sin(ship.angle) * THRUST * dtSec
    ship.vy -= Math.cos(ship.angle) * THRUST * dtSec
    const speed = Math.hypot(ship.vx, ship.vy)
    if (speed > MAX_SPEED) {
      ship.vx = (ship.vx / speed) * MAX_SPEED
      ship.vy = (ship.vy / speed) * MAX_SPEED
    }
  }
  const damp = Math.pow(DAMPING_PER_FRAME, dt / FRAME_MS)
  ship.vx *= damp
  ship.vy *= damp
  ship.x = wrapX(ship.x + ship.vx * dtSec)
  ship.y = wrapY(ship.y + ship.vy * dtSec)

  state.fireCooldown = Math.max(0, state.fireCooldown - dt)
  state.invuln = Math.max(0, state.invuln - dt)
  if (input.fire && state.fireCooldown <= 0 && state.bullets.length < MAX_BULLETS) {
    const nose = SHIP_HIT_RADIUS + 6
    state.bullets.push({
      x: wrapX(ship.x + Math.sin(ship.angle) * nose),
      y: wrapY(ship.y - Math.cos(ship.angle) * nose),
      vx: ship.vx + Math.sin(ship.angle) * BULLET_SPEED,
      vy: ship.vy - Math.cos(ship.angle) * BULLET_SPEED,
      life: BULLET_LIFE,
    })
    state.fireCooldown = FIRE_INTERVAL
  }

  // Bullets: move, age out, wrap.
  const aliveBullets: Bullet[] = []
  for (const bullet of state.bullets) {
    bullet.life -= dt
    if (bullet.life <= 0) continue
    bullet.x = wrapX(bullet.x + bullet.vx * dtSec)
    bullet.y = wrapY(bullet.y + bullet.vy * dtSec)
    aliveBullets.push(bullet)
  }
  state.bullets = aliveBullets

  // Rocks: drift, spin, wrap.
  for (const rock of state.rocks) {
    rock.x = wrapX(rock.x + rock.vx * dtSec)
    rock.y = wrapY(rock.y + rock.vy * dtSec)
    rock.angle += rock.spin * dtSec
  }

  // Bullet ↔ rock (wrap-aware): one rock max per bullet.
  const liveBullets: Bullet[] = []
  for (const bullet of state.bullets) {
    let dead = false
    for (let i = 0; i < state.rocks.length; i += 1) {
      const rock = state.rocks[i]!
      const r = ROCK_RADIUS[rock.size]
      if (wrapDist2(bullet.x, bullet.y, rock.x, rock.y) < r * r) {
        destroyRock(state, i, true)
        dead = true
        break
      }
    }
    if (!dead) liveBullets.push(bullet)
  }
  state.bullets = liveBullets

  // Ship ↔ rock: lose a life (the rock shatters without score), respawn.
  if (state.invuln <= 0) {
    for (let i = 0; i < state.rocks.length; i += 1) {
      const rock = state.rocks[i]!
      const r = ROCK_RADIUS[rock.size] + SHIP_HIT_RADIUS
      if (wrapDist2(ship.x, ship.y, rock.x, rock.y) < r * r) {
        destroyRock(state, i, false)
        state.lives -= 1
        if (state.lives <= 0) {
          state.result = 'lose'
          return
        }
        respawnShip(state)
        break
      }
    }
  }

  // Wave progression: a cleared field starts the next wave after a pause.
  if (state.rocks.length === 0) {
    if (state.waveClearTimer === null) state.waveClearTimer = WAVE_DELAY
    state.waveClearTimer -= dt
    if (state.waveClearTimer <= 0) {
      state.wave += 1
      state.waveClearTimer = null
      spawnWave(state)
    }
  } else {
    state.waveClearTimer = null
  }
}
