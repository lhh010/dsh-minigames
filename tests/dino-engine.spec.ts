import { describe, expect, it } from 'vitest'
import {
  collides, createDinoState, dinoRect, step,
  DINO_H, DUCK_H, GROUND_Y, VIEW_W,
} from '../src/client/games/dino/engine.ts'

/** Deterministic LCG so obstacle spawns are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const idle = { jump: false, duck: false }

describe('dino engine', () => {
  it('spawns obstacles and grows speed over time', () => {
    const state = createDinoState(lcg(1))
    // ~1.7s: first obstacle spawned (1.5s), none has reached the dino yet.
    for (let i = 0; i < 100; i += 1) step(state, 1 / 60, idle)
    expect(state.obstacles.length).toBeGreaterThan(0)
    expect(state.speed).toBeGreaterThan(320)
    expect(state.over).toBe(false)
  })

  it('jump leaves the ground and lands back', () => {
    const state = createDinoState(lcg(1))
    step(state, 1 / 60, { jump: true, duck: false })
    expect(state.dino.onGround).toBe(false)
    expect(state.dino.vy).toBeLessThan(0)
    // Let it fall back down (a few seconds is plenty).
    for (let i = 0; i < 180; i += 1) step(state, 1 / 60, idle)
    expect(state.dino.onGround).toBe(true)
    expect(state.dino.y).toBe(GROUND_Y - DINO_H)
  })

  it('ducking shrinks the hitbox while on the ground', () => {
    const state = createDinoState(lcg(1))
    step(state, 1 / 60, { jump: false, duck: true })
    expect(state.dino.ducking).toBe(true)
    expect(dinoRect(state).h).toBe(DUCK_H)
    // Ducking does not apply mid-air.
    step(state, 1 / 60, { jump: true, duck: true })
    expect(state.dino.ducking).toBe(false)
  })

  it('collision ends the run', () => {
    const state = createDinoState(lcg(1))
    // Park an obstacle exactly on the dino.
    state.obstacles.push({ kind: 'cactus', x: 60, w: 30, h: 40, y: GROUND_Y - 40 })
    step(state, 1 / 60, idle)
    expect(state.over).toBe(true)
  })

  it('an obstacle that passes the dino scores and leaves the field', () => {
    const state = createDinoState(lcg(1))
    state.obstacles.push({ kind: 'cactus', x: 10, w: 30, h: 40, y: GROUND_Y - 40 })
    const before = state.score
    // 0.27s scrolls the obstacle (x=10, w=30) out the left edge; the first
    // natural spawn (1.5s) has not happened yet.
    for (let i = 0; i < 8; i += 1) step(state, 1 / 30, idle)
    expect(state.score).toBe(before + 1)
    expect(state.obstacles).toHaveLength(0)
  })

  it('collides uses shrunk AABB overlap', () => {
    // Solid overlap survives the 4px shrink.
    expect(collides(
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 10, y: 0, w: 20, h: 20 },
    )).toBe(true)
    // No overlap at all.
    expect(collides(
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 30, y: 0, w: 20, h: 20 },
    )).toBe(false)
    // A 3px overlap is forgiven by the shrink (4px each side).
    expect(collides(
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 17, y: 0, w: 20, h: 20 },
    )).toBe(false)
  })

  it('obstacles spawn inside the viewport', () => {
    const state = createDinoState(lcg(7))
    for (let i = 0; i < 300; i += 1) step(state, 1 / 60, idle)
    for (const obstacle of state.obstacles) {
      expect(obstacle.x).toBeLessThanOrEqual(VIEW_W)
    }
  })
})
