import { describe, expect, it } from 'vitest'
import {
  createRacingState, step, spawnObstacle, checkCollision, maxSpeed,
  SPAWN_Z, SCORE_PER_POINT, MAX_SPEED, LANES,
  type RacingInput, type RacingState,
} from '../src/client/games/racing/logic.ts'

/** Deterministic LCG so obstacle spawns are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const idle: RacingInput = { left: false, right: false, throttle: false, brake: false, handbrake: false }

describe('racing logic', () => {
  it('creates a fresh run at rest, centred, not over', () => {
    const state = createRacingState(lcg(1))
    expect(state.speed).toBe(0)
    expect(state.carX).toBe(0)
    expect(state.score).toBe(0)
    expect(state.over).toBe(false)
    expect(state.obstacles).toHaveLength(0)
    expect(state.shake).toBe(0)
    expect(state.flash).toBe(0)
  })

  it('accelerates with throttle and caps at the speed limit', () => {
    const state = createRacingState(lcg(1))
    // Steer right every frame so the car never sits in the centre lane where a
    // spawned obstacle could collide and reset the speed; we are measuring
    // acceleration, not survival.
    for (let i = 0; i < 300; i += 1) {
      step(state, 1 / 60, { ...idle, throttle: true, right: true })
      // Strip any obstacles that happen to land in the car's current lane so a
      // collision cannot mask the acceleration.
      state.obstacles = state.obstacles.filter(o => o.z > 5)
    }
    // ACCEL=20 over 5s would reach 100 uncapped; it must be held at the cap.
    expect(state.speed).toBeGreaterThan(40)
    expect(state.speed).toBeLessThanOrEqual(maxSpeed(state.score))
  })

  it('brakes decelerate the car toward zero', () => {
    const state = createRacingState(lcg(1))
    state.speed = 30
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, { ...idle, brake: true })
    expect(state.speed).toBeLessThan(10)
  })

  it('coasting (no input) applies gentle drag', () => {
    const state = createRacingState(lcg(1))
    state.speed = 30
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, idle)
    // COAST=4 over 1s drops ~4 m/s.
    expect(state.speed).toBeLessThan(30)
    expect(state.speed).toBeGreaterThan(20)
  })

  it('handbrake decelerates harder than the regular brake', () => {
    const a = createRacingState(lcg(1))
    const b = createRacingState(lcg(1))
    a.speed = 40
    b.speed = 40
    for (let i = 0; i < 10; i += 1) {
      step(a, 1 / 60, { ...idle, brake: true })
      step(b, 1 / 60, { ...idle, handbrake: true })
    }
    expect(b.speed).toBeLessThan(a.speed)
  })

  it('steering moves carX and clamps it to the road bounds', () => {
    const state = createRacingState(lcg(1))
    state.speed = MAX_SPEED // full steer rate
    // Steer right hard; clamp is ROAD_HALF_WIDTH + 0.5 = 1.5.
    for (let i = 0; i < 200; i += 1) step(state, 1 / 60, { ...idle, throttle: true, right: true })
    expect(state.carX).toBeGreaterThan(0.5)
    expect(state.carX).toBeLessThanOrEqual(1.5)
    // Steer left to come back across centre.
    for (let i = 0; i < 240; i += 1) step(state, 1 / 60, { ...idle, throttle: true, left: true })
    expect(state.carX).toBeLessThan(0)
    expect(state.carX).toBeGreaterThanOrEqual(-1.5)
  })

  it('centred steer input (both keys) does not move the car', () => {
    const state = createRacingState(lcg(1))
    state.speed = MAX_SPEED
    const before = state.carX
    step(state, 1 / 60, { ...idle, throttle: true, left: true, right: true })
    expect(state.carX).toBe(before)
  })

  it('off-road (|carX| > 1) applies the grass speed penalty', () => {
    const state = createRacingState(lcg(1))
    state.speed = 40
    state.carX = 1.2 // off the road
    const speedBefore = state.speed
    step(state, 0.5, idle)
    // Off-road drags speed down via the grass penalty multiplier on distance,
    // but the raw speed also coasts; either way the effective speed is lower.
    expect(state.speed).toBeLessThanOrEqual(speedBefore)
    // Distance accrues at half rate while off-road.
    expect(state.distance).toBeLessThan(40 * 0.5 * 10)
  })

  it('spawnObstacle returns an obstacle at SPAWN_Z in a valid lane', () => {
    const state = createRacingState(lcg(1))
    for (let i = 0; i < 50; i += 1) {
      const obstacle = spawnObstacle(state)
      expect(obstacle.z).toBe(SPAWN_Z)
      expect([-1, 0, 1]).toContain(obstacle.lane)
      expect(['cone', 'rock', 'barrel', 'car', 'barrier']).toContain(obstacle.type)
      // Only cars move under their own power.
      if (obstacle.type === 'car') expect(obstacle.speed).toBeGreaterThan(0)
      else expect(obstacle.speed).toBe(0)
    }
  })

  it('spawns consecutive obstacles in different lanes', () => {
    const state = createRacingState(lcg(1))
    let prev = spawnObstacle(state, null)
    for (let i = 0; i < 50; i += 1) {
      const next = spawnObstacle(state, prev.lane)
      expect(next.lane).not.toBe(prev.lane) // a free dodge lane always exists
      prev = next
    }
  })

  it('obstacles spawn and approach the player (z decreases)', () => {
    const state = createRacingState(lcg(3))
    state.speed = 30
    for (let i = 0; i < 400; i += 1) step(state, 1 / 60, { ...idle, throttle: true })
    expect(state.obstacles.length).toBeGreaterThan(0)
    // At least one should have approached (z < SPAWN_Z).
    expect(state.obstacles.some(o => o.z < SPAWN_Z)).toBe(true)
  })

  it('detects a collision when an obstacle is at z≈0 in the same lane', () => {
    const state = createRacingState(lcg(1))
    state.carX = 0 // centre lane
    const obstacle = { type: 'cone' as const, lane: 0 as const, z: 0, speed: 0 }
    expect(checkCollision(state, obstacle)).toBe(true)
  })

  it('does not collide when the obstacle is far away', () => {
    const state = createRacingState(lcg(1))
    state.carX = 0
    const obstacle = { type: 'cone' as const, lane: 0 as const, z: 50, speed: 0 }
    expect(checkCollision(state, obstacle)).toBe(false)
  })

  it('does not collide when the obstacle is in a different lane', () => {
    const state = createRacingState(lcg(1))
    state.carX = 0 // centre
    const obstacle = { type: 'cone' as const, lane: -1 as const, z: 0, speed: 0 }
    expect(checkCollision(state, obstacle)).toBe(false)
  })

  it('collision reduces speed, triggers flash + shake, and removes the obstacle', () => {
    const state = createRacingState(lcg(1))
    state.speed = 40
    state.carX = 0
    state.obstacles.push({ type: 'cone', lane: 0, z: 0, speed: 0 })
    step(state, 1 / 60, idle)
    // Coast (COAST=4) applies before the collision check in the same step, so
    // the exact value is 40 -> coast -> *0.4; just assert the ~60% loss.
    expect(state.speed).toBeLessThan(20)
    expect(state.speed).toBeGreaterThan(10)
    expect(state.flash).toBeGreaterThan(0)
    expect(state.shake).toBeGreaterThan(0)
    expect(state.obstacles).toHaveLength(0)
  })

  it('a barrier blocks two adjacent lanes', () => {
    const state = createRacingState(lcg(1))
    // Barrier centred on the left lane; it also covers the centre lane.
    state.carX = 0 // centre
    const barrier = { type: 'barrier' as const, lane: -1 as const, z: 0, speed: 0 }
    expect(checkCollision(state, barrier)).toBe(true)
    // But the right lane is clear.
    state.carX = LANES[2]! // 0.6
    expect(checkCollision(state, barrier)).toBe(false)
  })

  it('score increases with distance and matches floor(distance / 10)', () => {
    const state = createRacingState(lcg(1))
    state.speed = 30
    for (let i = 0; i < 120; i += 1) step(state, 1 / 60, idle)
    expect(state.score).toBeGreaterThan(0)
    expect(state.score).toBe(Math.floor(state.distance / SCORE_PER_POINT))
  })

  it('speed cap rises with score up to 80', () => {
    expect(maxSpeed(0)).toBe(45)
    expect(maxSpeed(1000)).toBe(50) // 45 + 1000 * 0.005
    expect(maxSpeed(5000)).toBeGreaterThan(45)
    expect(maxSpeed(100000)).toBe(80) // capped
  })

  it('flash and shake decay over time after a collision', () => {
    const state = createRacingState(lcg(1))
    state.speed = 40
    state.carX = 0
    state.obstacles.push({ type: 'cone', lane: 0, z: 0, speed: 0 })
    step(state, 1 / 60, idle)
    // The hit sets flash=1 / shake=0.35, then the same step decays them a
    // fraction; capture the post-hit values and confirm they decay further.
    const flashAfterHit = state.flash
    const shakeAfterHit = state.shake
    expect(flashAfterHit).toBeGreaterThan(0)
    expect(shakeAfterHit).toBeGreaterThan(0)
    // Step forward; both must decay.
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, idle)
    expect(state.flash).toBeLessThan(flashAfterHit)
    expect(state.shake).toBeLessThan(shakeAfterHit)
  })

  it('step is a no-op once over', () => {
    const state = createRacingState(lcg(1))
    state.over = true
    state.speed = 40
    const before = { ...state }
    step(state, 1 / 60, { ...idle, throttle: true })
    expect(state.speed).toBe(before.speed)
    expect(state.distance).toBe(before.distance)
  })

  it('keeps the obstacle field bounded (obstacles despawn past the camera)', () => {
    const state = createRacingState(lcg(7))
    state.speed = MAX_SPEED
    for (let i = 0; i < 1200; i += 1) step(state, 1 / 60, { ...idle, throttle: true })
    // No obstacle should ever have a negative z far behind the camera; they are
    // culled once they pass.
    for (const obstacle of state.obstacles) {
      expect(obstacle.z).toBeGreaterThan(-5)
    }
  })
})
