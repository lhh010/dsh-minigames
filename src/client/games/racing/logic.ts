/**
 * Pseudo-3D racing pure logic: an endless straight road where the player's car
 * accelerates, steers left/right across 3 lanes, and dodges approaching
 * obstacles (cones, rocks, barrels, cars, barriers). Score is distance-based;
 * the speed cap rises with score for escalating intensity. Deterministic
 * functions over a plain state object — the game instance in index.ts drives
 * this with requestAnimationFrame, and the unit tests drive it directly.
 */

export interface Obstacle {
  type: 'cone' | 'rock' | 'barrel' | 'car' | 'barrier'
  /** Lane center offset: -0.6 = left, 0 = center, 0.6 = right. */
  lane: number
  /** Distance ahead: SPAWN_Z = far, 0 = at the player. */
  z: number
  /** Forward speed (only 'car' obstacles move; others are static on the road). */
  speed: number
}

export interface RacingInput {
  left: boolean
  right: boolean
  throttle: boolean
  brake: boolean
  handbrake: boolean
}

export interface RacingState {
  speed: number
  /** -1 = left road edge, 0 = center, 1 = right edge. */
  carX: number
  distance: number
  score: number
  obstacles: Obstacle[]
  nextSpawnZ: number
  shake: number
  flash: number
  over: boolean
  rng: () => number
}

/** Distance ahead where obstacles spawn. */
export const SPAWN_Z = 100
export const SCORE_PER_POINT = 10
const MAX_SPEED_BASE = 45
const MAX_SPEED_CAP = 80
const ACCEL = 20
const BRAKE = 35
const COAST = 4
const HANDBRAKE = 50
const STEER_RATE = 2.5
const GRASS_FACTOR = 0.5
const COLLISION_LOSS = 0.4
const LANE_OFFSETS = [-0.6, 0, 0.6]

/** Current speed cap, rising with score. */
export function maxSpeed(score: number): number {
  return Math.min(MAX_SPEED_CAP, MAX_SPEED_BASE + score * 0.005)
}

/** A fresh run at the starting line. */
export function createRacingState(rng: () => number = Math.random): RacingState {
  return {
    speed: 0,
    carX: 0,
    distance: 0,
    score: 0,
    obstacles: [],
    nextSpawnZ: 30,
    shake: 0,
    flash: 0,
    over: false,
    rng,
  }
}

/** Roll one obstacle at the far end. */
function spawnObstacle(state: RacingState): void {
  const types: Obstacle['type'][] = ['cone', 'rock', 'barrel', 'car', 'barrier']
  const roll = state.rng()
  let type: Obstacle['type']
  if (roll < 0.25) type = 'cone'
  else if (roll < 0.45) type = 'rock'
  else if (roll < 0.65) type = 'barrel'
  else if (roll < 0.85) type = 'car'
  else type = 'barrier'

  // Lane assignment: barriers occupy 2 lanes (placed at -0.3 or 0.3 to span two).
  let lane: number
  if (type === 'barrier') {
    lane = state.rng() < 0.5 ? -0.3 : 0.3
  } else {
    lane = LANE_OFFSETS[Math.floor(state.rng() * 3)]!
  }
  const speed = type === 'car' ? 12 + state.rng() * 10 : 0
  state.obstacles.push({ type, lane, z: SPAWN_Z, speed })
}

/**
 * Advance the run by dt seconds.
 * @param state - the run state (mutated in place).
 * @param dt - elapsed seconds.
 * @param input - held keys this frame.
 */
export function step(state: RacingState, dt: number, input: RacingInput): void {
  if (state.over) return
  const cap = maxSpeed(state.score)

  // Longitudinal physics.
  if (input.throttle) {
    state.speed = Math.min(cap, state.speed + ACCEL * dt)
  } else if (input.brake) {
    if (state.speed > 0.6) {
      state.speed = Math.max(0, state.speed - BRAKE * dt)
    } else {
      state.speed = Math.max(-10, state.speed - ACCEL * 0.5 * dt)
    }
  } else if (input.handbrake) {
    const dec = HANDBRAKE * dt
    state.speed = state.speed > dec ? state.speed - dec : state.speed < -dec ? state.speed + dec : 0
  } else {
    const dec = COAST * dt
    state.speed = state.speed > dec ? state.speed - dec : state.speed < -dec ? state.speed + dec : 0
  }

  // Steering (scaled by speed: faster = wider lateral movement).
  const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const speedFactor = Math.min(1, Math.abs(state.speed) / 8)
  state.carX += steerInput * STEER_RATE * speedFactor * dt * (state.speed >= 0 ? 1 : -1)
  state.carX = Math.max(-1.2, Math.min(1.2, state.carX))

  // Off-road penalty.
  if (Math.abs(state.carX) > 1) {
    state.speed *= 1 - (1 - GRASS_FACTOR) * dt * 3
  }

  // Distance + score.
  const travel = state.speed * dt
  state.distance += travel
  state.score = Math.floor(state.distance / SCORE_PER_POINT)

  // Move obstacles toward the player.
  const moveObstacles: Obstacle[] = []
  for (const obs of state.obstacles) {
    obs.z -= (state.speed - obs.speed) * dt * 0.6
    if (obs.z > -5) moveObstacles.push(obs)
  }
  state.obstacles = moveObstacles

  // Spawn next obstacle; interval shrinks slightly with score for density.
  state.nextSpawnZ -= travel * 0.6
  if (state.nextSpawnZ <= 0) {
    spawnObstacle(state)
    const interval = Math.max(8, 14 - state.score * 0.001)
    state.nextSpawnZ = interval + state.rng() * 6
  }

  // Collision check: obstacle near z=0 and overlapping the car's x.
  for (const obs of state.obstacles) {
    if (obs.z > 3 || obs.z < -3) continue
    const carHalf = 0.35
    const obsHalf = obs.type === 'barrier' ? 0.55 : obs.type === 'car' ? 0.4 : 0.22
    if (Math.abs(state.carX - obs.lane) < carHalf + obsHalf) {
      state.speed *= COLLISION_LOSS
      state.shake = 0.7
      state.flash = 1
      // Remove the hit obstacle.
      obs.z = -10
      break
    }
  }

  // Decay effects.
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.5)
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 4)
}
