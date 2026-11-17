import { describe, expect, it } from 'vitest'
import {
  CABINET, COINS_PER_ROUND, DROP_DEPTH, TOTAL_ROUNDS,
  createClaw, grabChance, layoutDolls, mulberry32, pickTarget,
  pressClaw, slipChance, stepClaw, swingAmplitude, swingDx,
  type ClawState,
} from '../src/client/games/claw/logic.ts'

/** 步进直到 cond 为真或步数用尽（每步 dtMs）。 */
function runUntil(state: ClawState, cond: (s: ClawState) => boolean, steps = 2000, dtMs = 40): boolean {
  for (let i = 0; i < steps; i += 1) {
    if (cond(state)) return true
    stepClaw(state, dtMs)
  }
  return cond(state)
}

/** 注入首低后高的随机流：夹取判定必过、滑落判定必不过。 */
function rigAlwaysGrab(state: ClawState): void {
  let calls = 0
  state.rng = () => {
    calls += 1
    return calls === 1 ? 0 : 1
  }
}

/** 注入恒 1 的随机流：夹取判定必不过。 */
function rigAlwaysMiss(state: ClawState): void {
  state.rng = () => 1
}

/** 把爪对准指定娃娃（不经过 step 刷新）并连续两段锁定下爪。 */
function aimAndDrop(state: ClawState, dollIndex: number): void {
  const doll = state.dolls[dollIndex]!
  state.clawX = doll.x
  pressClaw(state)
  state.clawZ = doll.z
  pressClaw(state)
}

describe('claw logic', () => {
  it('starts a round aiming horizontally with 5 coins and a seeded doll layout', () => {
    const s = createClaw(7)
    expect(s.phase).toBe('aimX')
    expect(s.coinsLeft).toBe(COINS_PER_ROUND)
    expect(s.round).toBe(0)
    expect(s.score).toBe(0)
    expect(s.clawX).toBe(CABINET.left)
    expect(s.dolls).toHaveLength(6)
    for (const d of s.dolls) {
      expect(d.x).toBeGreaterThanOrEqual(CABINET.left)
      expect(d.x).toBeLessThanOrEqual(CABINET.right)
      expect(d.size).toBeGreaterThan(0)
      expect(d.value).toBeGreaterThan(0)
    }
    const other = createClaw(7)
    expect(other.dolls).toEqual(s.dolls)
  })

  it('the horizontal sweep stays inside the cabinet and actually moves', () => {
    const s = createClaw(11)
    const seen: number[] = [s.clawX]
    for (let i = 0; i < 60; i += 1) {
      stepClaw(s, 50)
      seen.push(s.clawX)
      expect(s.clawX).toBeGreaterThanOrEqual(CABINET.left - 0.01)
      expect(s.clawX).toBeLessThanOrEqual(CABINET.right + 0.01)
    }
    const xs = new Set(seen.map((x) => Math.round(x)))
    expect(xs.size).toBeGreaterThan(10)
  })

  it('two presses lock X then Z, spend a coin and start the drop', () => {
    const s = createClaw(3)
    runUntil(s, (st) => st.clawX > CABINET.left + 40)
    pressClaw(s)
    expect(s.phase).toBe('aimZ')
    expect(s.lockedX).toBe(s.clawX)
    expect(s.coinsLeft).toBe(COINS_PER_ROUND)
    // 深度扫描期间 clawZ 始终在 0..1 内且阶段不变。
    for (let i = 0; i < 40; i += 1) {
      stepClaw(s, 50)
      expect(s.clawZ).toBeGreaterThanOrEqual(-0.001)
      expect(s.clawZ).toBeLessThanOrEqual(1.001)
      expect(s.phase).toBe('aimZ')
    }
    runUntil(s, (st) => st.clawZ > 0.2)
    pressClaw(s)
    expect(s.phase).toBe('drop')
    expect(s.lockedZ).toBeGreaterThan(0)
    expect(s.coinsLeft).toBe(COINS_PER_ROUND - 1)
    expect(runUntil(s, (st) => st.phase === 'carry')).toBe(true)
    expect(s.dropY).toBe(DROP_DEPTH)
  })

  it('a forced-success grab carries the doll to the chute, scores and removes it', () => {
    const s = createClaw(23)
    rigAlwaysGrab(s)
    const target = s.dolls[3]!
    aimAndDrop(s, 3)
    expect(runUntil(s, (st) => st.score > 0, 4000)).toBe(true)
    expect(s.score).toBe(target.value)
    expect(s.totalGrabs).toBe(1)
    expect(s.dolls.some((d) => d.id === target.id)).toBe(false)
    expect(s.dolls).toHaveLength(5)
    // runUntil 在得分当帧即停：score 事件仍在，grab 事件已随帧清空。
    expect(s.events.some((e) => e.type === 'score')).toBe(true)
    // 只花了 1 币：返回定位阶段等待下一爪，轮次不变
    expect(s.phase).toBe('aimX')
    expect(s.round).toBe(0)
    expect(s.coinsLeft).toBe(COINS_PER_ROUND - 1)
  })

  it('a forced-miss claw grabs nothing, spends the coin and returns empty', () => {
    const s = createClaw(23)
    rigAlwaysMiss(s)
    aimAndDrop(s, 3)
    expect(runUntil(s, (st) => st.phase === 'aimX' && st.clawX > 0, 4000)).toBe(true)
    expect(s.score).toBe(0)
    expect(s.totalGrabs).toBe(0)
    expect(s.dolls).toHaveLength(6)
    expect(s.coinsLeft).toBe(COINS_PER_ROUND - 1)
  })

  it('an out-of-reach claw head reports a miss with no target', () => {
    const s = createClaw(19)
    s.rng = () => 0
    // 锁到机柜外远端：任何娃娃都在爪的够不着范围外。
    s.clawX = 10
    pressClaw(s)
    s.clawZ = 0.5
    pressClaw(s)
    expect(s.phase).toBe('drop')
    expect(pickTarget(s, 0)).toBeNull()
    expect(runUntil(s, (st) => st.events.some((e) => e.type === 'miss'), 200)).toBe(true)
    expect(s.score).toBe(0)
  })

  it('grabChance rises with doll size and falls with offset, staying bounded', () => {
    expect(grabChance(34, 0)).toBeGreaterThan(grabChance(15, 0))
    expect(grabChance(24, 0)).toBeGreaterThan(grabChance(24, 10))
    expect(grabChance(24, 10)).toBeGreaterThan(grabChance(24, 30))
    for (const size of [15, 24, 34]) {
      for (const off of [0, 5, 12, 25, 60]) {
        const p = grabChance(size, off)
        expect(p).toBeGreaterThanOrEqual(0.03)
        expect(p).toBeLessThanOrEqual(0.96)
      }
    }
    expect(grabChance(34, 200)).toBe(0.03)
  })

  it('slipChance rises with offset and round, falls with doll size', () => {
    expect(slipChance(24, 12, 0)).toBeGreaterThan(slipChance(24, 0, 0))
    expect(slipChance(24, 12, 2)).toBeGreaterThan(slipChance(24, 12, 0))
    expect(slipChance(34, 12, 0)).toBeLessThan(slipChance(15, 12, 0))
    for (const size of [15, 24, 34]) {
      for (const off of [0, 8, 30]) {
        for (const round of [0, 1, 2]) {
          const p = slipChance(size, off, round)
          expect(p).toBeGreaterThanOrEqual(0.04)
          expect(p).toBeLessThanOrEqual(0.85)
        }
      }
    }
  })

  it('pendulum swing amplitude grows with grabs and rounds, offset stays bounded', () => {
    expect(swingAmplitude(0, 0)).toBe(8)
    expect(swingAmplitude(2, 0)).toBeGreaterThan(swingAmplitude(0, 0))
    expect(swingAmplitude(0, 2)).toBeGreaterThan(swingAmplitude(0, 0))
    expect(swingAmplitude(50, 5)).toBe(60)
    const s = createClaw(31)
    s.totalGrabs = 4
    s.round = 2
    const amp = swingAmplitude(s.totalGrabs, s.round)
    for (let i = 0; i < 200; i += 1) {
      stepClaw(s, 25)
      expect(Math.abs(swingDx(s))).toBeLessThanOrEqual(amp + 1e-9)
    }
  })

  it('later rounds stock smaller dolls', () => {
    const rng = mulberry32(99)
    const r0 = layoutDolls(rng, 0, 1)
    const r2 = layoutDolls(rng, 2, 100)
    const avg = (list: typeof r0): number => list.reduce((a, d) => a + d.size, 0) / list.length
    expect(avg(r2)).toBeLessThan(avg(r0))
    expect(r2).toHaveLength(r0.length)
  })

  it('a full 3-round game reaches over and replays identically per seed', () => {
    const play = (): { trace: number[]; score: number; grabs: number } => {
      const s = createClaw(42, 1)
      let pressed = 0
      const trace: number[] = []
      for (let i = 0; i < 30000 && s.phase !== 'over'; i += 1) {
        if (s.phase === 'aimX' || s.phase === 'aimZ') {
          // 每 7 帧按一次，避免锁定在同相位上。
          if (i % 7 === 0) {
            pressClaw(s)
            pressed += 1
          }
        }
        stepClaw(s, 40)
        if (i % 10 === 0) trace.push(s.score, s.coinsLeft, s.round, s.dolls.length)
      }
      expect(s.phase).toBe('over')
      expect(pressed).toBe(TOTAL_ROUNDS * COINS_PER_ROUND * 2)
      return { trace, score: s.score, grabs: s.totalGrabs }
    }
    const a = play()
    const b = play()
    expect(b.trace).toEqual(a.trace)
    expect(b.score).toBe(a.score)
    expect(b.grabs).toBe(a.grabs)
  })
})
