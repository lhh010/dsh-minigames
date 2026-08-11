/**
 * Pseudo-3D racing pure logic: an endless racer modelled after classic
 * OutRun / Pole Position. Speed scales with score; obstacles spawn far ahead
 * (z = SPAWN_Z) and approach the camera (z → 0); collisions cost speed and
 * trigger a screen shake + flash. No DOM, no timers — the game instance in
 * index.ts drives this with requestAnimationFrame, and the unit tests drive
 * it with fixed dt and a seeded rng.
 */

/** Logical viewport width in px (matches render.VIEW_W). */
export const VIEW_W = 480
/** Logical viewport height in px (matches render.VIEW_H). */
export const VIEW_H = 320

/** carX range: -1 = left edge, 0 = center, 1 = right edge. */
export const ROAD_HALF_WIDTH = 1.0
/** The three lane centres on the road (-1 = left, 0 = center, 1 = right). */
export const LANES = [-0.6, 0, 0.6] as const
/** Distance at which obstacles spawn; they approach the player as z → 0. */
export const SPAWN_Z = 100

/** Base top speed; the actual cap rises with score via maxSpeed. */
export const MAX_SPEED = 45
/** Acceleration when the throttle is held (m/s²). */
export const ACCEL = 20
/** Brake deceleration (m/s²). */
export const BRAKE = 35
/** Coast (no input) drag deceleration (m/s²). */
export const COAST = 4
/** Handbrake deceleration (m/s²). */
export const HANDBRAKE = 50
/** carX change per second at full steer (speed-scaled inside step). */
export const STEER_RATE = 2.5
/** Speed multiplier while off-road (|carX| > 1). */
export const GRASS_PENALTY = 0.5
/** Speed is multiplied by this on a collision. */
export const COLLISION_SPEED_LOSS = 0.4
/** distance / this = score (distance is in px-equivalent units). */
export const SCORE_PER_POINT = 10
/** Base z-units between obstacle spawns; shrinks slightly with score. */
export const SPAWN_INTERVAL_BASE = 12

/** Minimum z-units between spawns (floor for the score-based shrink). */
const SPAWN_INTERVAL_FLOOR = 7
/** How much the spawn interval shrinks per score point. */
const SPAWN_INTERVAL_SHRINK = 0.0008
/** z-range around the player car in which a same-lane obstacle collides. */
const COLLISION_Z = 3.5

/** All obstacle archetypes. */
export type ObstacleType = 'cone' | 'rock' | 'barrel' | 'car' | 'barrier'

/** The lane an obstacle occupies: -1 left, 0 center, 1 right. */
export type Lane = -1 | 0 | 1

export interface Obstacle {
  type: ObstacleType
  /** Lane centre index: -1, 0, or 1 (maps to LANES). */
  lane: Lane
  /** Distance ahead; SPAWN_Z far away, 0 at the player car. */
  z: number
  /** Forward speed of the obstacle (only type 'car' moves under its own power). */
  speed: number
}

export interface RacingInput {
  /** Steer left (A / ←), level-triggered. */
  left: boolean
  /** Steer right (D / →), level-triggered. */
  right: boolean
  /** Accelerate (W / ↑), level-triggered. */
  throttle: boolean
  /** Brake (S / ↓), level-triggered. */
  brake: boolean
  /** Handbrake (Space), level-triggered. */
  handbrake: boolean
}

export interface RacingState {
  /** Current speed along the road in m/s. */
  speed: number
  /** Horizontal position: -1 left edge, 0 center, 1 right edge. */
  carX: number
  /** Total travelled distance (px-equivalent); the score derives from it. */
  distance: number
  /** Score = floor(distance / SCORE_PER_POINT). */
  score: number
  obstacles: Obstacle[]
  /** Distance until the next obstacle spawns (in z-units). */
  nextSpawnZ: number
  /** Collision shake remaining (seconds; the renderer scales amplitude by it). */
  shake: number
  /** Collision flash remaining, 0..1 (a white overlay the renderer fades out). */
  flash: number
  /** Whether the run has ended. */
  over: boolean
  /** Seeded rng for deterministic tests. */
  rng: () => number
}

/** The speed cap at a given score: rises from 45 toward 80. */
export function maxSpeed(score: number): number {
  return Math.min(80, MAX_SPEED + score * 0.005)
}

/** A fresh run at the starting line. */
export function createRacingState(rng: () => number = Math.random): RacingState {
  return {
    speed: 0,
    carX: 0,
    distance: 0,
    score: 0,
    obstacles: [],
    nextSpawnZ: SPAWN_INTERVAL_BASE,
    shake: 0,
    flash: 0,
    over: false,
    rng,
  }
}

/** Roll one random obstacle at z = SPAWN_Z. */
export function spawnObstacle(state: RacingState): Obstacle {
  const rng = state.rng
  const roll = rng()
  let type: ObstacleType
  if (roll < 0.3) type = 'cone'
  else if (roll < 0.5) type = 'rock'
  else if (roll < 0.68) type = 'barrel'
  else if (roll < 0.86) type = 'car'
  else type = 'barrier'
  const laneRoll = rng()
  const lane: Lane = laneRoll < 1 / 3 ? -1 : laneRoll < 2 / 3 ? 0 : 1
  // Cars drive forward (slower than the player); everything else is static.
  const speed = type === 'car' ? 12 + rng() * 10 : 0
  return { type, lane, z: SPAWN_Z, speed }
}

/**
 * Whether the player car (at carX) overlaps an obstacle at the given lane when
 * the obstacle is within COLLISION_Z of the camera. Wide barriers also nudge
 * into the adjacent lane.
 * @param state - the run state (reads carX).
 * @param obstacle - the obstacle to test.
 * @returns true on a collision this frame.
 */
export function checkCollision(state: RacingState, obstacle: Obstacle): boolean {
  if (obstacle.z > COLLISION_Z || obstacle.z < -COLLISION_Z) return false
  const carX = state.carX
  const obstacleX = LANES[obstacle.lane + 1]!
  if (obstacle.type === 'barrier') {
    // Barriers block two adjacent lanes; pick the side closer to the player.
    const neighbour = obstacle.lane <= 0 ? obstacle.lane + 1 : obstacle.lane - 1
    const neighbourX = LANES[neighbour + 1]!
    const halfW = 0.32
    return Math.abs(carX - obstacleX) < halfW || Math.abs(carX - neighbourX) < halfW
  }
  return Math.abs(carX - obstacleX) < 0.32
}

/**
 * Advance the run by dt seconds.
 * @param state - the run state (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - this frame's held inputs.
 */
export function step(state: RacingState, dt: number, input: RacingInput): void {
  if (state.over) return
  const cap = maxSpeed(state.score)

  // Longitudinal physics: throttle accelerates, brake / handbrake decelerate,
  // coast applies gentle drag. All clamped to [0, cap].
  if (input.handbrake) {
    state.speed = Math.max(0, state.speed - HANDBRAKE * dt)
  } else if (input.brake) {
    state.speed = Math.max(0, state.speed - BRAKE * dt)
  } else if (input.throttle) {
    state.speed = Math.min(cap, state.speed + ACCEL * dt)
  } else {
    state.speed = Math.max(0, state.speed - COAST * dt)
  }

  // Off-road penalty: drifting past the road edge drags the speed down.
  const offRoad = Math.abs(state.carX) > ROAD_HALF_WIDTH
  let effectiveSpeed = state.speed
  if (offRoad) effectiveSpeed *= GRASS_PENALTY

  // Steering: rate scales with speed so faster runs turn wider. Centred input
  // (both or neither keys) does not move the car.
  let steer = 0
  if (input.left) steer -= 1
  if (input.right) steer += 1
  if (steer !== 0) {
    const speedFactor = Math.min(1, state.speed / MAX_SPEED)
    state.carX += steer * STEER_RATE * speedFactor * dt
  }
  // Clamp so the car cannot slide entirely off-screen; the grass penalty is
  // the cost of hugging the edge, not an invisible wall beyond it.
  if (state.carX > ROAD_HALF_WIDTH + 0.5) state.carX = ROAD_HALF_WIDTH + 0.5
  if (state.carX < -ROAD_HALF_WIDTH - 0.5) state.carX = -ROAD_HALF_WIDTH - 0.5

  // Distance + score: faster runs accrue score faster (like the dino runner).
  state.distance += effectiveSpeed * dt * 10
  state.score = Math.floor(state.distance / SCORE_PER_POINT)

  // Move obstacles toward the player: the closing speed is the player's
  // effective speed minus the obstacle's own forward speed (cars drift ahead).
  const remaining: Obstacle[] = []
  for (const obstacle of state.obstacles) {
    obstacle.z -= (effectiveSpeed - obstacle.speed) * dt
    if (obstacle.z > -COLLISION_Z) remaining.push(obstacle)
  }
  state.obstacles = remaining

  // Spawn the next obstacle once the distance counter runs out; the interval
  // shrinks slightly with score for a denser late game.
  state.nextSpawnZ -= effectiveSpeed * dt
  if (state.nextSpawnZ <= 0) {
    state.obstacles.push(spawnObstacle(state))
    const interval = Math.max(SPAWN_INTERVAL_FLOOR, SPAWN_INTERVAL_BASE - state.score * SPAWN_INTERVAL_SHRINK)
    state.nextSpawnZ = interval
  }

  // Collisions: cost speed + trigger shake/flash. The obstacle is removed so a
  // single hit cannot fire repeatedly; the run continues (endless racer).
  for (let i = 0; i < state.obstacles.length; i += 1) {
    const obstacle = state.obstacles[i]!
    if (checkCollision(state, obstacle)) {
      state.speed *= COLLISION_SPEED_LOSS
      state.shake = 0.35
      state.flash = 1
      state.obstacles.splice(i, 1)
      break
    }
  }

  // Decay shake and flash over time.
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt)
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 3)
}
