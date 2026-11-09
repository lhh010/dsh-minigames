import { describe, expect, it } from 'vitest'
import {
  BALLOON_COUNT, INFLATE_RATE, MIN_CAP, THRESHOLD_FLOOR,
  createBalloon, popCap, popThreshold, potential, release, startHold, stepBalloon,
} from '../src/client/games/balloon/logic.ts'

/** 按住 stepMs*n 毫秒（每步 stepBalloon 一次）。 */
function holdFor(state: ReturnType<typeof createBalloon>, ms: number, stepMs = 16): void {
  startHold(state)
  for (let t = 0; t < ms; t += stepMs) stepBalloon(state, stepMs)
}

describe('balloon logic', () => {
  it('popCap decays 6% per balloon and clamps at 40%', () => {
    expect(popCap(1)).toBeCloseTo(0.9)
    expect(popCap(2)).toBeCloseTo(0.84)
    expect(popCap(9)).toBeCloseTo(0.42)
    expect(popCap(10)).toBe(MIN_CAP)
    expect(popCap(50)).toBe(MIN_CAP)
    for (let n = 1; n < 20; n += 1) {
      expect(popCap(n)).toBeGreaterThanOrEqual(popCap(n + 1))
      expect(popCap(n)).toBeGreaterThanOrEqual(MIN_CAP)
    }
  })

  it('popThreshold is seeded, deterministic, and within [75% cap, cap)', () => {
    for (let n = 1; n <= BALLOON_COUNT; n += 1) {
      const cap = popCap(n)
      for (const seed of [1, 12345, 0xffffffff]) {
        const v = popThreshold(seed, n)
        expect(v).toBe(popThreshold(seed, n))
        expect(v).toBeGreaterThanOrEqual(cap * THRESHOLD_FLOOR)
        expect(v).toBeLessThan(cap)
      }
    }
    // 不同 seed 在一轮内至少派生出不同的阈值序列。
    const a: number[] = []
    const b: number[] = []
    for (let n = 1; n <= BALLOON_COUNT; n += 1) {
      a.push(popThreshold(7, n))
      b.push(popThreshold(8, n))
    }
    expect(a).not.toEqual(b)
  })

  it('inflate grows only while holding', () => {
    const s = createBalloon(42)
    for (let i = 0; i < 30; i += 1) stepBalloon(s, 16)
    expect(s.inflate).toBe(0)
    startHold(s)
    stepBalloon(s, 100)
    expect(s.inflate).toBeCloseTo(INFLATE_RATE * 0.1)
    release(s)
    const frozen = s.inflate
    for (let i = 0; i < 10; i += 1) stepBalloon(s, 16)
    expect(s.inflate).toBe(frozen)
    expect(s.holding).toBe(false)
  })

  it('release banks the potential score and moves to the next balloon', () => {
    const s = createBalloon(42)
    holdFor(s, 400)
    expect(s.inflate).toBeCloseTo(0.2, 5)
    release(s)
    expect(s.runScore).toBe(20)
    expect(s.banked).toEqual([20])
    expect(s.balloonIndex).toBe(2)
    expect(s.inflate).toBe(0)
    expect(s.threshold).toBe(popThreshold(42, 2))
    expect(s.over).toBe(false)
    expect(potential(s)).toBe(0)
  })

  it('holding past the threshold pops and zeroes the run', () => {
    const s = createBalloon(42)
    holdFor(s, 400)
    release(s)
    expect(s.runScore).toBe(20)
    // 充到阈值之上即爆：任意阈值 ≤ 0.9，最多 2 秒必然达到。
    startHold(s)
    while (!s.over) stepBalloon(s, 16)
    expect(s.events.some(ev => ev.type === 'pop')).toBe(true)
    expect(s.popped).toBe(true)
    expect(s.complete).toBe(false)
    expect(s.runScore).toBe(0)
    expect(s.banked).toEqual([20])
    // 结束后按住与松手都不再改变状态。
    startHold(s)
    stepBalloon(s, 100)
    release(s)
    expect(s.over).toBe(true)
    expect(s.inflate).toBeGreaterThanOrEqual(s.threshold - INFLATE_RATE * 0.1)
  })

  it('banking all ten small balloons completes the round', () => {
    const s = createBalloon(99)
    // 每只只充 0.32 秒（0.16 < 全部阈值下界 0.3），稳收 10 只。
    for (let i = 0; i < BALLOON_COUNT; i += 1) {
      holdFor(s, 320)
      expect(s.over).toBe(false)
      release(s)
    }
    expect(s.complete).toBe(true)
    expect(s.over).toBe(true)
    expect(s.popped).toBe(false)
    expect(s.balloonIndex).toBe(BALLOON_COUNT)
    expect(s.banked).toHaveLength(BALLOON_COUNT)
    expect(s.runScore).toBe(s.banked.reduce((a, b) => a + b, 0))
    expect(s.events.some(ev => ev.type === 'complete')).toBe(true)
  })

  it('same seed and script replay identically', () => {
    const script = (s: ReturnType<typeof createBalloon>): void => {
      // 每只充到目标潜在分即松手；前 5 只贪（60 分），后 5 只怂（30 分），
      // 阈值不足即中途爆掉——两种结局都必须可精确复现。
      while (!s.over) {
        const target = s.balloonIndex <= 5 ? 60 : 30
        startHold(s)
        while (s.holding && potential(s) < target) stepBalloon(s, 16)
        release(s)
      }
    }
    const a = createBalloon(2024)
    const b = createBalloon(2024)
    script(a)
    script(b)
    expect(b.seed).toBe(a.seed)
    expect(b.balloonIndex).toBe(a.balloonIndex)
    expect(b.banked).toEqual(a.banked)
    expect(b.runScore).toBe(a.runScore)
    expect(b.over).toBe(a.over)
    expect(b.popped).toBe(a.popped)
    expect(b.complete).toBe(a.complete)
    // 必然在 10 只之内结束（爆掉或存满）。
    expect(a.over).toBe(true)
  })

  it('release without holding is a no-op', () => {
    const s = createBalloon(5)
    release(s)
    expect(s.runScore).toBe(0)
    expect(s.balloonIndex).toBe(1)
    expect(s.events).toHaveLength(0)
    // 空步进只推进动画时钟。
    const t0 = s.t
    stepBalloon(s, 32)
    expect(s.t).toBe(t0 + 32)
    expect(s.inflate).toBe(0)
  })
})
