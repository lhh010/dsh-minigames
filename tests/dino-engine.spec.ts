import { describe, expect, it } from 'vitest'
import {
  collides, createDinoState, dinoRect, step,
  DINO_H, DUCK_H, GROUND_Y, VIEW_W, SCORE_PER_POINT, THEME_INTERVAL,
  RAIN_START, RAIN_LENGTH,
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

  it('spawns obstacles more frequently as the score rises', () => {
    const state = createDinoState(lcg(1))
    // High score -> short next-spawn interval (denser late game).
    state.distance = 30_000 // score 3000
    state.nextSpawnIn = 0
    step(state, 1 / 60, idle)
    expect(state.obstacles.length).toBeGreaterThan(0)
    const lateInterval = state.nextSpawnIn
    expect(lateInterval).toBeGreaterThan(0)
    expect(lateInterval).toBeLessThan(2.4) // well under the early-game max
    expect(lateInterval).toBeLessThanOrEqual(1.3) // ~0.5-1.2s at score 3000
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

  it('a low bird hits the standing dino', () => {
    // The low bird hovers where the standing dino's hitbox overlaps it.
    const state = createDinoState(lcg(1))
    state.obstacles.push({ kind: 'bird', x: 60, w: 46, h: 30, y: GROUND_Y - 60 })
    step(state, 1 / 60, idle)
    expect(state.over).toBe(true)
  })

  it('ducking dodges the low bird', () => {
    const state = createDinoState(lcg(1))
    state.obstacles.push({ kind: 'bird', x: 60, w: 46, h: 30, y: GROUND_Y - 60 })
    // 1s: the bird flies past while the first natural spawn (1.5s) is pending.
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, { jump: false, duck: true })
    expect(state.over).toBe(false)
    expect(state.obstacles).toHaveLength(0) // the bird flew past
  })

  it('jumping to the apex dodges the low bird', () => {
    const state = createDinoState(lcg(1))
    // Delay the jump so the bird passes under at the top of the arc.
    state.obstacles.push({ kind: 'bird', x: 200, w: 46, h: 30, y: GROUND_Y - 60 })
    for (let i = 0; i < 12; i += 1) step(state, 1 / 60, idle)
    step(state, 1 / 60, { jump: true, duck: false })
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, idle)
    expect(state.over).toBe(false)
    expect(state.obstacles).toHaveLength(0)
  })

  it('a jump clears a ground-level obstacle without dying', () => {
    const state = createDinoState(lcg(1))
    // Obstacle ahead; delay the jump so it passes under the dino at the arc
    // peak rather than clipping the feet on the way down.
    state.obstacles.push({ kind: 'cactus', x: 200, w: 26, h: 44, y: GROUND_Y - 44 })
    for (let i = 0; i < 12; i += 1) step(state, 1 / 60, idle)
    step(state, 1 / 60, { jump: true, duck: false })
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, idle)
    expect(state.over).toBe(false)
    expect(state.obstacles).toHaveLength(0)
    expect(state.score).toBeGreaterThan(0) // distance accrued along the way
  })

  it('landing back onto an obstacle collides', () => {
    const state = createDinoState(lcg(1))
    // A tall cactus parked exactly under where the dino lands.
    state.obstacles.push({ kind: 'cactus', x: 60, w: 26, h: 60, y: GROUND_Y - 60 })
    step(state, 1 / 60, { jump: true, duck: false })
    // Wait out the full jump arc.
    for (let i = 0; i < 240; i += 1) step(state, 1 / 60, idle)
    expect(state.over).toBe(true)
  })

  it('an obstacle that passes the dino leaves the field while distance accrues', () => {
    const state = createDinoState(lcg(1))
    state.obstacles.push({ kind: 'cactus', x: 10, w: 30, h: 40, y: GROUND_Y - 40 })
    const before = state.score
    // 0.27s scrolls the obstacle (x=10, w=30) out the left edge; the first
    // natural spawn (1.5s) has not happened yet.
    for (let i = 0; i < 8; i += 1) step(state, 1 / 30, idle)
    expect(state.obstacles).toHaveLength(0)
    expect(state.score).toBeGreaterThan(before)
    expect(state.score).toBe(Math.floor(state.distance / SCORE_PER_POINT))
  })

  it('score derives from distance and speed rises with it until the cap', () => {
    const state = createDinoState(lcg(1))
    state.distance = 10_000
    step(state, 0, idle)
    expect(state.score).toBe(1000)
    expect(state.speed).toBe(320 + 1000 * 0.15)
    state.distance = 50_000
    step(state, 0, idle)
    expect(state.score).toBe(5000)
    expect(state.speed).toBe(760) // MAX_SPEED cap
  })

  it('toggles day/night every theme interval of points', () => {
    const state = createDinoState(lcg(1))
    expect(state.night).toBe(false)
    state.distance = THEME_INTERVAL * SCORE_PER_POINT - 1
    step(state, 0, idle)
    expect(state.night).toBe(false)
    state.distance = THEME_INTERVAL * SCORE_PER_POINT
    step(state, 0, idle)
    expect(state.score).toBe(THEME_INTERVAL)
    expect(state.night).toBe(true)
    state.distance = THEME_INTERVAL * SCORE_PER_POINT * 2
    step(state, 0, idle)
    expect(state.night).toBe(false)
  })

  it('rains for a window of points at every thousand-mark', () => {
    const state = createDinoState(lcg(1))
    expect(state.raining).toBe(false)
    state.distance = (RAIN_START - 1) * SCORE_PER_POINT
    step(state, 0, idle)
    expect(state.raining).toBe(false)
    state.distance = RAIN_START * SCORE_PER_POINT
    step(state, 0, idle)
    expect(state.score).toBe(RAIN_START)
    expect(state.raining).toBe(true)
    state.distance = (RAIN_START + RAIN_LENGTH - 1) * SCORE_PER_POINT
    step(state, 0, idle)
    expect(state.raining).toBe(true)
    state.distance = (RAIN_START + RAIN_LENGTH) * SCORE_PER_POINT
    step(state, 0, idle)
    expect(state.raining).toBe(false)
    state.distance = (RAIN_START * 2) * SCORE_PER_POINT
    step(state, 0, idle)
    expect(state.raining).toBe(true)
  })

  it('flashes lightning during rain and decays it', () => {
    const state = createDinoState(lcg(1))
    state.distance = RAIN_START * SCORE_PER_POINT // score 1000 -> raining
    step(state, 0, idle)
    expect(state.raining).toBe(true)
    expect(state.lightning).toBe(0)
    state.nextStrikeIn = 0.1
    for (let i = 0; i < 10; i += 1) step(state, 1 / 60, idle)
    expect(state.lightning).toBeGreaterThan(0) // struck
    for (let i = 0; i < 30; i += 1) step(state, 1 / 60, idle)
    expect(state.lightning).toBe(0) // decayed back to clear
  })

  it('never flashes lightning outside rain', () => {
    const state = createDinoState(lcg(1))
    state.nextStrikeIn = 0.05
    for (let i = 0; i < 300; i += 1) step(state, 1 / 60, idle)
    expect(state.raining).toBe(false) // score stays below RAIN_START here
    expect(state.lightning).toBe(0)
  })

  it('a ground bird hits the standing dino', () => {
    const state = createDinoState(lcg(1))
    state.obstacles.push({ kind: 'bird-ground', x: 60, w: 46, h: 30, y: GROUND_Y - 30 })
    step(state, 1 / 60, idle)
    expect(state.over).toBe(true)
  })

  it('ducking does NOT dodge the ground bird', () => {
    // The ground bird hugs the ground: only a jump clears it.
    const state = createDinoState(lcg(1))
    state.obstacles.push({ kind: 'bird-ground', x: 60, w: 46, h: 30, y: GROUND_Y - 30 })
    for (let i = 0; i < 8; i += 1) step(state, 1 / 60, { jump: false, duck: true })
    expect(state.over).toBe(true)
  })

  it('jumping dodges the ground bird', () => {
    const state = createDinoState(lcg(1))
    state.obstacles.push({ kind: 'bird-ground', x: 200, w: 46, h: 30, y: GROUND_Y - 30 })
    for (let i = 0; i < 12; i += 1) step(state, 1 / 60, idle)
    step(state, 1 / 60, { jump: true, duck: false })
    for (let i = 0; i < 60; i += 1) step(state, 1 / 60, idle)
    expect(state.over).toBe(false)
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
