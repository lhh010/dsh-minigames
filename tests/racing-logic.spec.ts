import { describe, expect, it } from 'vitest'
import {
  createRacingState, step, maxSpeed, SPAWN_Z, SCORE_PER_POINT,
  type RacingInput,
} from '../src/client/games/racing/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const idle: RacingInput = { left: false, right: false, throttle: false, brake: false, handbrake: false }

describe('racing logic', () => {
  it('creates a fresh run at rest', () => {
    const state = createRacingState(lcg(1))
    expect(state.speed).toBe(0)
    expect(state.carX).toBe(0)
    expect(state.score).toBe(0)
    expect(state.over).toBe(false)
    expect(state.obstacles).toHaveLength(0)
  })

  it('accelerates with throttle and caps at the speed limit', () => {
    const state = createRacingState(lcg(1))
    for (let i = 0; i < 300; i += 1) step(state, 1 / 60, { ...idle, throttle: true })
    expect(state.speed).toBeGreaterThan(40)
    expect(state.speed).toBeLessThanOrEqual(maxSpeed(state.score))
  })

  it('brakes decelerate the car', () => {
    const state = createRacingState(lcg(1))
    state.speed = 30
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, { ...idle, brake: true })
    expect(state.speed).toBeLessThan(10)
  })

  it('steering moves the car sideways, clamped to the road', () => {
    const state = createRacingState(lcg(1))
    state.speed = 20
    for (let i = 0; i < 120; i += 1) step(state, 1 / 60, { ...idle, throttle: true, right: true })
    expect(state.carX).toBeGreaterThan(0.5)
    expect(state.carX).toBeLessThanOrEqual(1.2)
    // Steer left to come back.
    for (let i = 0; i < 120; i += 1) step(state, 1 / 60, { ...idle, throttle: true, left: true })
    expect(state.carX).toBeLessThan(0)
  })

  it('off-road applies a grass speed penalty', () => {
    const state = createRacingState(lcg(1))
    state.speed = 40
    state.carX = 1.1 // off-road
    const before = state.speed
    step(state, 0.5, idle)
    expect(state.speed).toBeLessThan(before)
  })

  it('obstacles spawn and approach the player', () => {
    const state = createRacingState(lcg(3))
    state.speed = 30
    for (let i = 0; i < 400; i += 1) step(state, 1 / 60, { ...idle, throttle: true })
    expect(state.obstacles.length).toBeGreaterThan(0)
    // At least one should have a z < SPAWN_Z (approached).
    expect(state.obstacles.some(o => o.z < SPAWN_Z)).toBe(true)
  })

  it('collision reduces speed and triggers flash + shake', () => {
    const state = createRacingState(lcg(1))
    state.speed = 40
    state.obstacles.push({ type: 'cone', lane: 0, z: 0, speed: 0 })
    step(state, 1 / 60, idle)
    expect(state.speed).toBeLessThan(20)
    expect(state.flash).toBeGreaterThan(0)
    expect(state.shake).toBeGreaterThan(0)
  })

  it('score increases with distance', () => {
    const state = createRacingState(lcg(1))
    state.speed = 30
    for (let i = 0; i < 120; i += 1) step(state, 1 / 60, idle)
    expect(state.score).toBeGreaterThan(0)
    expect(state.score).toBe(Math.floor(state.distance / SCORE_PER_POINT))
  })

  it('speed cap rises with score', () => {
    expect(maxSpeed(0)).toBe(45)
    expect(maxSpeed(5000)).toBeGreaterThan(45)
    expect(maxSpeed(100000)).toBe(80) // capped
  })
})
