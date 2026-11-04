import { describe, expect, it } from 'vitest'
import {
  HALF_MIN, HULL_HALF_H, HULL_HALF_W, H, SUB_MS, VY_MAX,
  caveProfile, ceilingAt, createCopter, floorAt, mulberry32,
  speedOf, stepCopter, SPEED_BASE, SPEED_MAX,
} from '../src/client/games/copter/logic.ts'

describe('copter logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('cave profile is deterministic and stays a sane corridor inside the canvas', () => {
    for (let i = 0; i < 300; i += 1) {
      expect(caveProfile(42, i)).toEqual(caveProfile(42, i))
      const p = caveProfile(42, i)
      expect(p.half).toBeGreaterThanOrEqual(HALF_MIN)
      expect(p.center - p.half).toBeGreaterThanOrEqual(0)
      expect(p.center + p.half).toBeLessThanOrEqual(H)
      // 插值壁与剖面一致：段边界处 ceiling/floor 关于中线对称。
      const x = i * 40
      expect(ceilingAt(42, x)).toBeCloseTo(p.center - p.half, 6)
      expect(floorAt(42, x)).toBeCloseTo(p.center + p.half, 6)
    }
    // 不同种子生成不同洞穴。
    expect(caveProfile(42, 9)).not.toEqual(caveProfile(43, 9))
  })

  it('cave half-width narrows monotonically with distance down to the floor', () => {
    let prev = caveProfile(7, 0).half
    let reachedMin = false
    for (let i = 1; i < 400; i += 1) {
      const half = caveProfile(7, i).half
      expect(half).toBeLessThanOrEqual(prev)
      prev = half
      if (half === HALF_MIN) reachedMin = true
    }
    expect(reachedMin).toBe(true)
  })

  it('speed ramps with distance and caps at SPEED_MAX', () => {
    expect(speedOf(0)).toBe(SPEED_BASE)
    expect(speedOf(5000)).toBeGreaterThan(speedOf(0))
    expect(speedOf(1e9)).toBe(SPEED_MAX)
  })

  it('holding thrusts up and releasing falls, with the vertical speed clamped', () => {
    const s = createCopter(3)
    const y0 = s.y
    for (let i = 0; i < 10; i += 1) stepCopter(s, 16, true)
    expect(s.y).toBeLessThan(y0)
    const yTop = s.y
    for (let i = 0; i < 80; i += 1) stepCopter(s, 16, false)
    expect(s.y).toBeGreaterThan(yTop)
    // 长按推力：速度不超过上限（数值上也不会 NaN）。
    const f = createCopter(5)
    for (let i = 0; i < 3000; i += 1) stepCopter(f, 16, true)
    if (f.phase === 'flying') expect(f.vy).toBeGreaterThanOrEqual(-VY_MAX - 1e-9)
    expect(Number.isFinite(f.y)).toBe(true)
  })

  it('distance scores meters and advances deterministically per input timeline', () => {
    const run = (): number[] => {
      const s = createCopter(7)
      const out: number[] = []
      for (let i = 0; i < 600; i += 1) {
        stepCopter(s, 16, i % 3 !== 0)
        out.push(Math.round(s.y * 1000), s.score, Math.round(s.worldX * 1000))
      }
      return out
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b)
    // 分数随距离增长：米数 = floor(worldX / 10)。
    const s = createCopter(7)
    for (let i = 0; i < 300; i += 1) stepCopter(s, 16, true)
    if (s.phase === 'flying') {
      expect(s.score).toBe(Math.floor(s.worldX / 10))
      expect(s.score).toBeGreaterThan(0)
    }
  })

  it('jittered frame sizes replay identically (fixed substeps)', () => {
    const jitter = [16, 16, 5, 11, 16, 20, 3, 13]
    const run = (): { y: number, x: number, acc: number } => {
      const s = createCopter(9)
      for (let k = 0; k < 200; k += 1) {
        const dt = jitter[k % jitter.length]!
        stepCopter(s, dt, k % 2 === 0)
      }
      return { y: s.y, x: s.worldX, acc: s.acc }
    }
    expect(run()).toEqual(run())
    expect(SUB_MS).toBe(8)
  })

  it('hitting the ceiling with the hull box explodes and ends the run', () => {
    const s = createCopter(5)
    const ceil = ceilingAt(s.seed, s.worldX)
    // 把机身盒上缘塞进上壁。
    s.y = ceil + HULL_HALF_H - 1
    s.vy = 0
    stepCopter(s, 16, true)
    expect(s.phase).toBe('crashed')
    expect(s.events.some((e) => e.type === 'crash')).toBe(true)
  })

  it('hitting the floor explodes too, and the score freezes after the crash', () => {
    const s = createCopter(5)
    const fl = floorAt(s.seed, s.worldX)
    s.y = fl - HULL_HALF_H + 1
    s.vy = 0
    stepCopter(s, 16, false)
    expect(s.phase).toBe('crashed')
    const frozen = s.score
    for (let i = 0; i < 50; i += 1) stepCopter(s, 16, true)
    expect(s.score).toBe(frozen)
    expect(s.worldX).toBeGreaterThanOrEqual(0)
    expect(HULL_HALF_W).toBe(11)
  })
})
