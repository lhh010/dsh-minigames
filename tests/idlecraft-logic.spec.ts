import { describe, expect, it } from 'vitest'
import {
  CLICK_BASE, DURATION_MS, LEVELS, MILESTONES, SPRINT_MS, TICK_MS, TIERS, UNLOCK_MARKUP,
  buyMachine, clickForge, createIdleCraftState, finalScore, globalMult, machinePrice,
  milestoneProgress, mulberry32, productionPerSec, tickIdleCraft, unlockCost, unlockNextTier,
  type IdleCraftState,
} from '../src/client/games/idlecraft/logic.ts'

/** 推进 n 秒（固定 tick，确定性）。 */
function runSeconds(state: IdleCraftState, seconds: number): void {
  for (let i = 0; i < seconds * (1000 / TICK_MS); i += 1) tickIdleCraft(state)
}

/** 敲打 n 次并回传最后一次产出。 */
function clickTimes(state: IdleCraftState, n: number): number {
  let gain = 0
  for (let i = 0; i < n; i += 1) gain = clickForge(state)
  return gain
}

describe('idlecraft logic', () => {
  it('hammer clicks produce CLICK_BASE and scale with global multiplier and sprint', () => {
    const state = createIdleCraftState(7, 0)
    expect(clickForge(state)).toBe(CLICK_BASE)
    expect(state.clicks).toBe(1)
    expect(state.totalProduced).toBe(1)
    // 里程碑抬到 ×2 后点击产出翻倍
    state.totalProduced = MILESTONES[1]
    clickForge(state) // 触发免费自动解锁：unlockedTier=1、milestones=1
    expect(state.milestones).toBe(1)
    expect(clickForge(state)).toBeCloseTo(2, 10)
    // 冲刺期（最后 30 秒）再 ×1.5
    state.elapsedMs = DURATION_MS - SPRINT_MS
    expect(clickForge(state)).toBeCloseTo(3, 10)
    // 结算后点击归零
    state.phase = 'won'
    expect(clickForge(state)).toBe(0)
  })

  it('prices machines by base × growth^n (ceil) and refuses unaffordable or locked buys', () => {
    const state = createIdleCraftState(3, 0)
    state.gears = 1000000
    expect(buyMachine(state, 1)).toBe(false) // 未解锁
    expect(machinePrice(state, 0)).toBe(TIERS[0]!.basePrice)
    expect(buyMachine(state, 0)).toBe(true)
    expect(machinePrice(state, 0)).toBe(Math.ceil(10 * Math.pow(1.15, 1)))
    buyMachine(state, 0)
    expect(machinePrice(state, 0)).toBe(Math.ceil(10 * Math.pow(1.15, 2)))
    expect(state.machines[0]).toBe(2)
    // 第 3 局（下标 2）起增长收紧为 1.2
    const tight = createIdleCraftState(3, 2)
    expect(LEVELS[2]!.growth).toBe(1.2)
    tight.gears = 1000000
    buyMachine(tight, 0)
    expect(machinePrice(tight, 0)).toBe(Math.ceil(10 * 1.2))
    // 余额不足不扣款
    const poor = createIdleCraftState(3, 0)
    expect(buyMachine(poor, 0)).toBe(false)
    expect(poor.gears).toBe(0)
    expect(poor.machines[0]).toBe(0)
  })

  it('accumulates auto output deterministically each fixed tick', () => {
    const state = createIdleCraftState(11, 0)
    state.gears = 10
    buyMachine(state, 0)
    const before = state.gears
    tickIdleCraft(state)
    // 1 台手动锤 0.5/s，100ms tick → 0.05（无里程碑、无冲刺）
    expect(state.gears).toBeCloseTo(before + 0.05, 10)
    runSeconds(state, 10)
    expect(state.gears).toBeCloseTo(before + 0.05 + 10 * 0.5, 10)
    expect(state.elapsedMs).toBe(10100)
    expect(productionPerSec(state)).toBeCloseTo(0.5, 10)
    // 同初态同脚本完全一致（纯确定性积分）
    const twin = createIdleCraftState(11, 0)
    twin.gears = 10
    buyMachine(twin, 0)
    tickIdleCraft(twin) // 与 state 同样先跑一拍
    runSeconds(twin, 10)
    expect(twin.gears).toBe(state.gears)
  })

  it('unlocks tiers for free at milestone thresholds, each doubling the global multiplier', () => {
    const state = createIdleCraftState(5, 0)
    expect(state.unlockedTier).toBe(0)
    expect(globalMult(state)).toBe(1)
    state.totalProduced = MILESTONES[1] - 0.01
    tickIdleCraft(state)
    expect(state.unlockedTier).toBe(0) // 差一点不解锁
    state.totalProduced = MILESTONES[1]
    tickIdleCraft(state)
    expect(state.unlockedTier).toBe(1)
    expect(globalMult(state)).toBe(2)
    expect(milestoneProgress(state)).toBeCloseTo(0, 10)
    // 一口气跨两个阈值：连环解锁
    state.totalProduced = MILESTONES[3]
    tickIdleCraft(state)
    expect(state.unlockedTier).toBe(3)
    expect(globalMult(state)).toBe(8)
    state.totalProduced = MILESTONES[4] + 1
    tickIdleCraft(state)
    expect(state.unlockedTier).toBe(4)
    expect(globalMult(state)).toBe(16)
    expect(milestoneProgress(state)).toBe(1) // 满级
  })

  it('U buys an early unlock at threshold × markup and grants the same ×2', () => {
    const state = createIdleCraftState(5, 0)
    expect(unlockCost(state)).toBe(Math.ceil(MILESTONES[1] * UNLOCK_MARKUP))
    expect(unlockNextTier(state)).toBe(false) // 余额不足
    state.gears = unlockCost(state)
    expect(unlockNextTier(state)).toBe(true)
    expect(state.gears).toBe(0)
    expect(state.unlockedTier).toBe(1)
    expect(globalMult(state)).toBe(2)
    // 满级后 U 无效
    state.unlockedTier = 4
    state.gears = 1e9
    expect(unlockNextTier(state)).toBe(false)
    expect(state.milestones).toBe(1)
  })

  it('applies the 1.5 sprint multiplier only inside the last 30 seconds', () => {
    const state = createIdleCraftState(13, 0)
    state.gears = 10
    buyMachine(state, 0)
    expect(productionPerSec(state)).toBeCloseTo(0.5, 10)
    // 149.9 秒处仍未冲刺；tick 先推进时间再计产出——跨入 150 秒那一拍即 ×1.5
    state.elapsedMs = DURATION_MS - SPRINT_MS - TICK_MS
    tickIdleCraft(state)
    expect(state.elapsedMs).toBe(DURATION_MS - SPRINT_MS)
    expect(state.totalProduced).toBeCloseTo(0.075, 10)
    expect(productionPerSec(state)).toBeCloseTo(0.75, 10)
    tickIdleCraft(state)
    expect(state.totalProduced).toBeCloseTo(0.15, 10)
  })

  it('settles when the 180s timer ends and stops ticking afterwards', () => {
    const lost = createIdleCraftState(2, 0)
    runSeconds(lost, DURATION_MS / 1000)
    expect(lost.elapsedMs).toBe(DURATION_MS)
    expect(lost.phase).toBe('lost') // 不敲不买必然不达标
    const produced = lost.totalProduced
    tickIdleCraft(lost) // 结算后推进无效果
    expect(lost.elapsedMs).toBe(DURATION_MS)
    expect(lost.totalProduced).toBe(produced)
    const won = createIdleCraftState(2, 4)
    won.totalProduced = LEVELS[4]!.target
    runSeconds(won, DURATION_MS / 1000)
    expect(won.phase).toBe('won')
    expect(finalScore(won)).toBe(Math.floor(won.totalProduced))
    // history 每 10 tick（1 秒）落一个快照，含开局零点
    expect(won.history.length).toBeLessThanOrEqual(DURATION_MS / 1000 + 1)
    expect(won.history[0]).toBe(0)
  })

  it('escalates five levels: rising targets and tighter growth from level 3', () => {
    expect(LEVELS).toHaveLength(5)
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i]!.target).toBeGreaterThan(LEVELS[i - 1]!.target)
    }
    expect(LEVELS[0]!.growth).toBe(1.15)
    expect(LEVELS[1]!.growth).toBe(1.15)
    for (let i = 2; i < LEVELS.length; i += 1) expect(LEVELS[i]!.growth).toBe(1.2)
    // 机器链产量×3、价格×10
    for (let i = 1; i < TIERS.length; i += 1) {
      expect(TIERS[i]!.ratePerSec).toBeCloseTo(TIERS[i - 1]!.ratePerSec * 3, 10)
      expect(TIERS[i]!.basePrice).toBe(TIERS[i - 1]!.basePrice * 10)
    }
  })

  it('counts spending separately: totalProduced tracks output, not purchases', () => {
    const state = createIdleCraftState(17, 0)
    clickTimes(state, 15)
    expect(state.totalProduced).toBe(15)
    expect(state.gears).toBe(15)
    buyMachine(state, 0) // 花 10 买 1 台
    expect(state.gears).toBe(5)
    expect(state.totalProduced).toBe(15) // 花掉的钱不减总产出
    runSeconds(state, 4)
    expect(state.totalProduced).toBeCloseTo(15 + 4 * 0.5, 10)
    expect(finalScore(state)).toBe(17)
  })

  it('replays identically for the same seed and scripted actions', () => {
    const script = (state: IdleCraftState): void => {
      clickTimes(state, 20)
      for (let s = 0; s < 60 && state.phase === 'playing'; s += 1) {
        for (let k = state.unlockedTier; k >= 0; k -= 1) buyMachine(state, k as 0 | 1 | 2 | 3 | 4)
        if (state.unlockedTier < 4 && state.gears >= unlockCost(state)) unlockNextTier(state)
        runSeconds(state, 1)
      }
    }
    const a = createIdleCraftState(2024, 3)
    const b = createIdleCraftState(2024, 3)
    script(a)
    script(b)
    expect(a.gears).toBe(b.gears)
    expect(a.totalProduced).toBe(b.totalProduced)
    expect(a.machines).toEqual(b.machines)
    expect(a.unlockedTier).toBe(b.unlockedTier)
    expect(a.phase).toBe(b.phase)
    expect(a.history).toEqual(b.history)
  })

  it('keeps mulberry32 deterministic per seed (regression guard)', () => {
    const a = mulberry32(99)
    const b = mulberry32(99)
    const c = mulberry32(100)
    const seq = [a(), a(), a()]
    expect(seq).toEqual([b(), b(), b()])
    expect(seq).not.toEqual([c(), c(), c()])
  })
})
