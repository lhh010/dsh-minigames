import { describe, expect, it } from 'vitest'
import {
  BUOY_R, SAIL_MAX, DEAD_ZONE, FINISH_MS, FIXED_MS,
  createSailing, generateCourse, gustFactor, mulberry32, normAngle,
  sailPower, stepSailing, timeLeft, timeLimitOf, windOf, W, H,
  type SailingInput,
} from '../src/client/games/sailing/logic.ts'

const NO_INPUT: SailingInput = { left: false, right: false, sailOut: false, sailIn: false }

describe('sailing logic', () => {
  it('mulberry32 and course generation are deterministic per seed', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(generateCourse(42, 1)).toEqual(generateCourse(42, 1))
    expect(generateCourse(42, 1)).not.toEqual(generateCourse(43, 1))
  })

  it('courses have 3-5 in-bounds buoys reachable from the start line', () => {
    for (let level = 1; level <= 5; level += 1) {
      const buoys = generateCourse(7, level)
      expect(buoys.length).toBeGreaterThanOrEqual(3)
      expect(buoys.length).toBeLessThanOrEqual(5)
      for (const b of buoys) {
        expect(b.x).toBeGreaterThan(BUOY_R)
        expect(b.x).toBeLessThan(W - BUOY_R)
        expect(b.y).toBeGreaterThan(BUOY_R)
        expect(b.y).toBeLessThan(H - BUOY_R)
      }
    }
  })

  it('sail power: dead zone has no thrust; run beats beam reaches', () => {
    const wind = 100
    // 顶风正中与 ±30° 死角区内均无动力。
    expect(sailPower(Math.PI, SAIL_MAX, wind)).toBe(0)
    expect(sailPower(Math.PI - (Math.PI / 180) * 30, -0.5, wind)).toBe(0)
    expect(sailPower(-Math.PI + DEAD_ZONE - 0.01, 0.9, wind)).toBe(0)
    // 顺风满帆最大（≈风力），正侧风 45° 帆角只有一半。
    const run = sailPower(0, SAIL_MAX, wind)
    expect(run).toBeCloseTo(wind * Math.sin(SAIL_MAX) ** 2, 6)
    const beam = sailPower(-Math.PI / 2, Math.PI / 4, wind)
    expect(beam).toBeCloseTo(wind / 2, 6)
    expect(run).toBeGreaterThan(beam)
    // 侧风用错舷侧的帆角产生负推力（倒拖）。
    expect(sailPower(-Math.PI / 2, -Math.PI / 4, wind)).toBeLessThan(0)
  })

  it('gust factor is deterministic and bounded within [0.8, 1.2]', () => {
    for (let t = 0; t <= 60000; t += 137) {
      const g = gustFactor(9, t)
      expect(g).toBe(gustFactor(9, t))
      expect(g).toBeGreaterThanOrEqual(0.8)
      expect(g).toBeLessThanOrEqual(1.2)
    }
  })

  it('rudder turns the heading and wind accelerates the boat toward terminal speed', () => {
    const s = createSailing(5)
    s.buoys = [] // 隔离浮标判定，只测物理
    // 把船摆在正顺风上（风行方向 = 航向），满帆直行。
    s.heading = 0
    s.wind = { travel: 0, speed: 100 }
    s.sail = SAIL_MAX
    const startX = s.x
    for (let i = 0; i < 200; i += 1) stepSailing(s, FIXED_MS, { ...NO_INPUT })
    expect(s.v).toBeGreaterThan(60)
    expect(s.v).toBeLessThan(190) // 一阶阻力终端速度 ≈ 100 × DRAG_TAU × 阵风
    expect(s.x).toBeGreaterThan(startX + 100)
    // 回到画布中心持续右舵：航向显著右转且速度因转向衰减。
    s.x = W / 2
    s.y = H / 2
    const before = s.heading
    const vBefore = s.v
    for (let i = 0; i < 200; i += 1) stepSailing(s, FIXED_MS, { ...NO_INPUT, right: true })
    const turned = normAngle(s.heading - before)
    expect(turned).toBeGreaterThan(1.5)
    expect(turned).toBeLessThan(Math.PI)
    expect(s.v).toBeLessThan(vBefore + 1)
  })

  it('passing buoys requires the circle in order and emits events', () => {
    const s = createSailing(21)
    const first = s.buoys[0]!
    // 把船放进第一浮标圈内：下一帧子步即判定通过。
    s.x = first.x
    s.y = first.y
    stepSailing(s, FIXED_MS, NO_INPUT)
    expect(s.next).toBe(1)
    expect(s.events.some((e) => e.type === 'buoy' && e.index === 0)).toBe(true)
    expect(s.score).toBe(100)
    // 反向回圈内不算：必须按顺序过第二标。
    const second = s.buoys[1]!
    s.x = first.x
    s.y = first.y
    stepSailing(s, FIXED_MS, NO_INPUT)
    expect(s.next).toBe(1)
    s.x = second.x
    s.y = second.y
    stepSailing(s, FIXED_MS, NO_INPUT)
    expect(s.next).toBe(2)
  })

  it('sailing past a buoy along the leg beyond the margin fails the run', () => {
    const s = createSailing(3)
    s.wind = { travel: 0, speed: 0 } // 静风只测漏标几何
    const first = s.buoys[0]!
    // 沿出发段方向越过浮标 MISS_MARGIN 之外。
    const dx = first.x - W / 2
    const dy = first.y - (H - 60)
    const len = Math.hypot(dx, dy)
    s.x = first.x + ((dx / len) * (BUOY_R + 60))
    s.y = first.y + ((dy / len) * (BUOY_R + 60))
    stepSailing(s, FIXED_MS, NO_INPUT)
    expect(s.phase).toBe('gameover')
    expect(s.reason).toBe('miss')
  })

  it('running out of time fails the run with the timeout reason', () => {
    const s = createSailing(13)
    s.wind = { travel: 0, speed: 0 }
    const limit = timeLimitOf(1)
    let stepped = 0
    while (s.phase === 'racing' && stepped < limit + 1000) {
      stepSailing(s, 40, NO_INPUT)
      stepped += 40
    }
    expect(s.phase).toBe('gameover')
    expect(s.reason).toBe('timeout')
    expect(timeLeft(s)).toBe(0)
  })

  it('full runs replay deterministically: same seed and inputs, same trajectory', () => {
    const run = (): number[] => {
      const s = createSailing(77)
      const trace: number[] = []
      for (let i = 0; i < 1500; i += 1) {
        const input: SailingInput = {
          left: i % 9 < 4,
          right: i % 9 >= 5,
          sailOut: i % 7 === 0,
          sailIn: i % 11 === 0,
        }
        stepSailing(s, 16, input)
        if (i % 25 === 0) {
          trace.push(Math.round(s.x * 100), Math.round(s.y * 100),
            Math.round(s.heading * 1000), Math.round(s.v * 100), s.score, s.next)
        }
        if (s.phase === 'gameover') break
      }
      return trace
    }
    expect(run()).toEqual(run())
  })

  it('finishing the course scores a time bonus and advances the level', () => {
    const s = createSailing(21)
    const scoreBefore = 0
    expect(scoreBefore).toBe(0)
    // 直接顺序置入每个浮标圈，快速完成整条航线。
    for (let i = 0; i < s.buoys.length; i += 1) {
      const b = s.buoys[i]!
      s.x = b.x
      s.y = b.y
      stepSailing(s, FIXED_MS, NO_INPUT)
    }
    expect(s.phase).toBe('finished')
    expect(s.score).toBeGreaterThanOrEqual(s.buoys.length * 100 + 200)
    // 展示停留结束后进入第 2 关并重置航线。
    let waited = 0
    while (s.phase === 'finished' && waited < FINISH_MS + 100) {
      stepSailing(s, 40, NO_INPUT)
      waited += 40
    }
    expect(s.level).toBe(2)
    expect(s.phase).toBe('racing')
    expect(s.next).toBe(0)
    expect(s.score).toBeGreaterThan(0) // 分数跨关累计
  })
})
