import { describe, expect, it } from 'vitest'
import {
  PHYSICS, LEVEL_COUNT,
  generateLevel, createLightspeed, createLightspeedState,
  stepLightspeed, advanceLevel, arrivalScore,
  type Level,
} from '../src/client/games/lightspeed/logic.ts'

/** 空障碍 + 可自定义终点的关卡，用于受控物理测试。 */
function bareLevel(goalX: number, goalY: number): Level {
  return {
    index: 0,
    seed: 12345,
    start: { x: 70, y: 300 },
    goal: { x: goalX, y: goalY },
    goalRadius: 26,
    wells: [],
    asteroids: [],
  }
}

/** 连续推进 state 一段时间。 */
function run(state: Parameters<typeof stepLightspeed>[0], ms: number, steer = 0): void {
  let left = ms
  while (left > 0) {
    const dt = Math.min(16, left)
    left -= dt
    stepLightspeed(state, dt, steer)
    if (state.result !== 'playing') break
  }
}

describe('lightspeed logic', () => {
  it('generates deterministic levels that differ per index', () => {
    const a = generateLevel(0)
    const b = generateLevel(0)
    expect(a).toEqual(b)
    const c = generateLevel(1)
    expect(c.wells.map(w => w.x)).not.toEqual(a.wells.map(w => w.x))
    expect(c.asteroids.length).toBeGreaterThan(a.asteroids.length)
    for (const level of [a, c]) {
      expect(level.wells.length).toBeGreaterThanOrEqual(2)
      // A/B 点周边保留安全区。
      for (const w of level.wells) {
        expect(Math.hypot(w.x - level.start.x, w.y - level.start.y)).toBeGreaterThan(190)
        expect(Math.hypot(w.x - level.goal.x, w.y - level.goal.y)).toBeGreaterThan(170)
      }
      for (const rock of level.asteroids) {
        expect(Math.hypot(rock.x - level.start.x, rock.y - level.start.y)).toBeGreaterThan(150)
      }
    }
  })

  it('drifts straight ahead with no input and records a capped trail', () => {
    const state = createLightspeedState(bareLevel(890, 100))
    run(state, 1000)
    expect(state.result).toBe('playing')
    expect(state.photon.x).toBeGreaterThan(200)
    expect(Math.abs(state.photon.y - 300)).toBeLessThan(1)
    expect(state.trail.length).toBeGreaterThan(10)
    expect(state.trail.length).toBeLessThanOrEqual(PHYSICS.trailMax)
  })

  it('steering changes heading in both directions', () => {
    const right = createLightspeedState(bareLevel(890, 100))
    run(right, 500, 1)
    expect(right.photon.heading).toBeGreaterThan(0.5)
    const left = createLightspeedState(bareLevel(890, 100))
    run(left, 500, -1)
    expect(left.photon.heading).toBeLessThan(-0.5)
  })

  it('gravity wells bend the trajectory toward the well and accelerate the photon', () => {
    const flat = createLightspeedState(bareLevel(890, 100))
    const pulled = createLightspeedState(bareLevel(890, 100))
    pulled.level = { ...bareLevel(890, 100), wells: [{ x: 400, y: 460, radius: 30, mass: 2e6 }] }
    run(flat, 2000)
    run(pulled, 2000)
    // 井在航线下方：光子应被向下拉。
    expect(pulled.photon.y).toBeGreaterThan(flat.photon.y + 40)
    // 接近途中（尚未坠入核心）引力沿航向做正功，速度上升。
    expect(pulled.photon.speed).toBeGreaterThan(PHYSICS.baseSpeed)
    expect(pulled.result).toBe('playing')
  })

  it('dies on asteroid impact and on the well core', () => {
    const rock = bareLevel(890, 100)
    rock.asteroids = [{ x: 300, y: 300, radius: 12 }]
    const s1 = createLightspeedState(rock)
    run(s1, 3000)
    expect(s1.result).toBe('dead')

    const core = bareLevel(890, 100)
    core.wells = [{ x: 260, y: 300, radius: 40, mass: 5e6 }]
    const s2 = createLightspeedState(core)
    run(s2, 3000)
    expect(s2.result).toBe('dead')
  })

  it('reaching B clears the level, scores, and chains into the next level', () => {
    const state = createLightspeedState(bareLevel(300, 300))
    run(state, 4000)
    expect(state.result).toBe('levelClear')
    expect(state.score).toBeGreaterThanOrEqual(50)
    advanceLevel(state)
    expect(state.result).toBe('playing')
    expect(state.level.index).toBe(1)
    expect(state.photon.x).toBe(state.level.start.x)
  })

  it('clearing the last level yields victory', () => {
    const last = bareLevel(300, 300)
    last.index = LEVEL_COUNT - 1
    const state = createLightspeedState(last)
    run(state, 4000)
    expect(state.result).toBe('levelClear')
    advanceLevel(state)
    expect(state.result).toBe('victory')
  })

  it('deterministically replays the same seed run', () => {
    const a = createLightspeed()
    const b = createLightspeed()
    for (let i = 0; i < 200; i += 1) {
      const steer = i % 40 < 20 ? 1 : -1
      stepLightspeed(a, 16, steer)
      stepLightspeed(b, 16, steer)
    }
    expect(a.photon).toEqual(b.photon)
    expect(a.score).toBe(b.score)
  })

  it('scores faster arrivals higher (speed and time both matter)', () => {
    expect(arrivalScore(400, 1000)).toBeGreaterThan(arrivalScore(200, 1000))
    expect(arrivalScore(300, 2000)).toBeGreaterThan(arrivalScore(300, 8000))
    expect(arrivalScore(0, 99999)).toBeGreaterThanOrEqual(50)
  })
})
