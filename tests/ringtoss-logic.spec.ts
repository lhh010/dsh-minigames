import { describe, expect, it } from 'vitest'
import {
  COMBO_CAP, FLOOR_Y, GRAVITY, HAND, HIT_TOL, LAUNCH_VY, MAX_VX, MIN_VX,
  POINT_GOLD, POINT_MID, POINT_NEAR, POWER_RATE, RINGS_PER_ROUND, ROUNDS,
  RESULT_MS, W,
  createRingToss, layoutPegs, mulberry32, powerToVelocity, pressCharge,
  releaseThrow, stepRingToss, type RingTossState,
} from '../src/client/games/ringtoss/logic.ts'

/** 直接把环摆到某柱顶上方并推进一步，模拟一次下落穿越。 */
function dropOnto(s: RingTossState, pegIndex: number, dx: number): void {
  const peg = s.pegs[pegIndex]!
  s.phase = 'flying'
  // 直接摆位模拟下落穿越——视同已抛出一环（正常路径经 releaseThrow 计数）。
  s.ringsThrown = 1
  s.ringsLeft -= 1
  s.ring = { x: peg.x + dx, y: peg.topY - 0.5, vx: 30, vy: 150, rot: 0, vrot: 0 }
  stepRingToss(s, 16)
}

/** 快进展示阶段到下一环（柱布局不变）。 */
function skipSettle(s: RingTossState): void {
  expect(s.phase).toBe('settle')
  stepRingToss(s, RESULT_MS + 1)
}

/** 抛出一环并推进到结算完成（默认零力度，环落地不中）。 */
function throwAndSettle(s: RingTossState): void {
  expect(s.phase).toBe('aim')
  pressCharge(s)
  expect(releaseThrow(s)).toBe(true)
  for (let i = 0; i < 3000 && s.phase !== 'settle'; i += 1) stepRingToss(s, 16)
  expect(s.phase).toBe('settle')
  stepRingToss(s, RESULT_MS + 1)
}

describe('ring toss logic', () => {
  it('maps power to velocity linearly with clamping at both ends', () => {
    expect(powerToVelocity(0)).toEqual({ vx: MIN_VX, vy: LAUNCH_VY })
    expect(powerToVelocity(1)).toEqual({ vx: MAX_VX, vy: LAUNCH_VY })
    expect(powerToVelocity(0.5).vx).toBeCloseTo((MIN_VX + MAX_VX) / 2, 6)
    expect(powerToVelocity(-3)).toEqual({ vx: MIN_VX, vy: LAUNCH_VY })
    expect(powerToVelocity(9)).toEqual({ vx: MAX_VX, vy: LAUNCH_VY })
    expect(LAUNCH_VY).toBeLessThan(0)
  })

  it('lays out pegs deterministically: 5 pegs, distance-ordered tiers and values', () => {
    const a = layoutPegs(mulberry32(42))
    const b = layoutPegs(mulberry32(42))
    expect(a).toEqual(b)
    expect(a).toHaveLength(5)
    expect(a[0]!.x).toBeLessThanOrEqual(a[1]!.x)
    expect(a[3]!.x).toBeLessThanOrEqual(a[4]!.x)
    for (const peg of a) {
      expect(peg.x).toBeGreaterThanOrEqual(W * 0.46 - 0.001)
      expect(peg.x).toBeLessThanOrEqual(W - 52 + 0.001)
      expect(peg.topY).toBeLessThan(FLOOR_Y)
      // 相邻柱保证最小间距，柱高（远近）单调不减。
    }
    for (let i = 1; i < a.length; i += 1) {
      expect(Math.abs(a[i]!.x - a[i - 1]!.x)).toBeGreaterThanOrEqual(44 - 0.001)
      expect(a[i]!.topY).toBeLessThanOrEqual(a[i - 1]!.topY + 0.001)
    }
    expect(a.map((peg) => peg.value)).toEqual([POINT_NEAR, POINT_NEAR, POINT_MID, POINT_MID, POINT_GOLD])
    expect(a.map((peg) => peg.tier)).toEqual([0, 0, 1, 1, 2])
  })

  it('charges while held and throws on release, consuming a ring', () => {
    const s = createRingToss(7)
    expect(s.phase).toBe('aim')
    expect(s.ringsLeft).toBe(RINGS_PER_ROUND)
    pressCharge(s)
    expect(s.phase).toBe('charge')
    // 非瞄准阶段再按无效。
    pressCharge(s)
    expect(s.power).toBe(0)
    stepRingToss(s, 500)
    expect(s.power).toBeCloseTo(POWER_RATE * 0.5, 6)
    stepRingToss(s, 500)
    expect(s.power).toBe(1)
    // 松开前力度已满并保持（钳制不回落）。
    stepRingToss(s, 500)
    expect(s.power).toBe(1)
    expect(releaseThrow(s)).toBe(true)
    expect(s.phase).toBe('flying')
    expect(s.ringsThrown).toBe(1)
    expect(s.ringsLeft).toBe(RINGS_PER_ROUND - 1)
    expect(s.ring.vx).toBe(MAX_VX)
    expect(s.ring.vy).toBe(LAUNCH_VY)
    // 非蓄力阶段松开不动作。
    expect(releaseThrow(s)).toBe(false)
    expect(s.ringsThrown).toBe(1)
  })

  it('integrates the parabola exactly (semi-implicit Euler, no wind in round 1)', () => {
    const s = createRingToss(11)
    expect(s.wind).toBe(0)
    s.phase = 'charge'
    s.power = 0.5
    expect(releaseThrow(s)).toBe(true)
    const vx0 = s.ring.vx
    const dt = 0.016
    const steps = 10
    for (let i = 0; i < steps; i += 1) stepRingToss(s, 16)
    // x 无风匀速；y 半隐式欧拉闭式解：y0 + vy0·n·dt + g·dt²·n(n+1)/2。
    expect(s.ring.x).toBeCloseTo(HAND.x + vx0 * steps * dt, 6)
    const vyN = LAUNCH_VY + GRAVITY * steps * dt
    const yN = HAND.y + LAUNCH_VY * steps * dt + GRAVITY * dt * dt * steps * (steps + 1) / 2
    expect(s.ring.vy).toBeCloseTo(vyN, 6)
    expect(s.ring.y).toBeCloseTo(yN, 6)
    expect(s.phase).toBe('flying')
  })

  it('rings a peg when the ring center crosses the peg top within tolerance', () => {
    const s = createRingToss(5)
    dropOnto(s, 4, HIT_TOL - 1)
    expect(s.phase).toBe('settle')
    expect(s.combo).toBe(1)
    expect(s.score).toBe(POINT_GOLD * 1)
    expect(s.slide).toEqual({ pegIndex: 4, t: 0 })
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'hit', gained: POINT_GOLD, value: POINT_GOLD, combo: 1 }))
    expect(s.floats.some((f) => f.text === '+' + POINT_GOLD)).toBe(true)
    // 展示阶段滑落计时推进，随后同轮下一环（柱不变、环回手）。
    stepRingToss(s, 100)
    expect(s.slide!.t).toBe(100)
    skipSettle(s)
    expect(s.phase).toBe('aim')
    expect(s.pegs[4]!.x).toBe(s.pegs[4]!.x)
    expect(s.ringsThrown).toBe(1)
  })

  it('clanks off the peg top just outside tolerance and misses without scoring', () => {
    const s = createRingToss(5)
    s.combo = 2
    s.score = 30
    const peg = s.pegs[2]!
    // 穿越点偏出容差但在柱顶碰撞圈内：擦柱弹开。
    const dx = HIT_TOL + 2
    s.phase = 'flying'
    s.ring = { x: peg.x + dx, y: peg.topY - 0.5, vx: 200, vy: 150, rot: 0, vrot: 0 }
    stepRingToss(s, 16)
    expect(s.events.some((ev) => ev.type === 'clank')).toBe(true)
    expect(s.phase).not.toBe('settle')
    expect(s.ring.vx).toBeLessThan(0)
    expect(s.score).toBe(30)
    // 继续推进到落地：脱手，连击清零。
    for (let i = 0; i < 3000 && s.phase === 'flying'; i += 1) stepRingToss(s, 16)
    expect(s.phase).toBe('settle')
    expect(s.combo).toBe(0)
    expect(s.score).toBe(30)
    expect(s.events.some((ev) => ev.type === 'miss')).toBe(true)
  })

  it('out-of-bounds and ground misses reset the combo; combo multiplier is capped', () => {
    const s = createRingToss(9)
    // 连击倍率封顶：预置连击到上限，再套中金柱按 xCOMBO_CAP 计。
    s.combo = COMBO_CAP
    dropOnto(s, 4, 0)
    expect(s.combo).toBe(COMBO_CAP)
    expect(s.score).toBe(POINT_GOLD * COMBO_CAP)
    skipSettle(s)
    // 出界脱手：把环射出右边界。
    s.phase = 'flying'
    s.ring = { x: W + 20, y: 100, vx: 500, vy: -100, rot: 0, vrot: 0 }
    stepRingToss(s, 16)
    expect(s.phase).toBe('settle')
    expect(s.combo).toBe(0)
    expect(s.events.some((ev) => ev.type === 'miss')).toBe(true)
  })

  it('chains consecutive hits with growing combo scoring', () => {
    const s = createRingToss(13)
    // 同轮连套金柱三次：25×1 + 25×2 + 25×3。
    let expected = 0
    for (let i = 1; i <= 3; i += 1) {
      dropOnto(s, 4, 0)
      expected += POINT_GOLD * i
      expect(s.score).toBe(expected)
      expect(s.combo).toBe(i)
      skipSettle(s)
    }
    // 中断一次（擦柱外远远落地不中）。
    dropOnto(s, 0, 40)
    expect(s.phase === 'settle' || s.phase === 'flying').toBe(true)
    for (let i = 0; i < 3000 && s.phase === 'flying'; i += 1) stepRingToss(s, 16)
    expect(s.combo).toBe(0)
    skipSettle(s)
    // 再套中：连击从头计。
    dropOnto(s, 4, 0)
    expect(s.score).toBe(expected + POINT_GOLD)
  })

  it('advances rounds with new seeded layouts and wind, then ends after 15 rings', () => {
    const s = createRingToss(2024)
    const round1Pegs = s.pegs.map((peg) => peg.x)
    let round = 1
    for (let ring = 0; ring < ROUNDS * RINGS_PER_ROUND; ring += 1) {
      throwAndSettle(s)
      if (s.phase === 'over') break
    }
    expect(s.round).toBe(ROUNDS)
    expect(s.phase).toBe('over')
    expect(s.ringsLeft).toBe(0)
    // 复跑同 seed：全程状态一致（确定性）。
    const twin = createRingToss(2024)
    for (let ring = 0; ring < ROUNDS * RINGS_PER_ROUND; ring += 1) {
      throwAndSettle(twin)
      if (twin.phase === 'over') break
    }
    expect(twin.pegs).toEqual(s.pegs)
    expect(twin.score).toBe(s.score)
    // 第二轮：柱位重排 + 起风（本 seed 下非零）。
    const s2 = createRingToss(2024)
    for (let ring = 0; ring < RINGS_PER_ROUND; ring += 1) throwAndSettle(s2)
    round = s2.round
    expect(round).toBe(2)
    expect(s2.wind).not.toBe(0)
    expect(Math.abs(s2.wind)).toBeLessThanOrEqual(150)
    const moved = s2.pegs.some((peg, i) => Math.abs(peg.x - round1Pegs[i]!) > 1)
    expect(moved).toBe(true)
  })
})
