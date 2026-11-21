import { describe, expect, it } from 'vitest'
import {
  ROUNDS_PER_LEVEL, LEVEL_COUNT, THRESHOLD_MIN, THRESHOLD_MAX_BASE, LEVEL_TARGETS,
  createBalloonBank, pump, cash, advance, beginLevel, payout, levelTarget,
  thresholdMax, thresholdFor, roundPenalty, lateLevelPenalty, evNextPump,
  popCounts, remaining,
  type BalloonBankState,
} from '../src/client/games/balloonbank/logic.ts'

/**
 * 打一轮「最优」：测试可读 state.threshold，打到 threshold-1 次后兑现
 * （保证不爆），再推进/结算。
 */
function playOptimalRound(state: BalloonBankState): void {
  while (state.phase === 'pumping' && state.pumps < state.threshold - 1) pump(state)
  cash(state)
  pump(state)
}

describe('balloonbank logic', () => {
  it('thresholdMax decays with later rounds and late levels but keeps a floor', () => {
    expect(thresholdMax(1, 1)).toBe(THRESHOLD_MAX_BASE)
    expect(roundPenalty(1)).toBe(0)
    expect(roundPenalty(5)).toBe(1)
    expect(roundPenalty(9)).toBe(2)
    expect(lateLevelPenalty(3)).toBe(0)
    expect(lateLevelPenalty(4)).toBe(1)
    expect(lateLevelPenalty(5)).toBe(2)
    expect(thresholdMax(1, 9)).toBe(10)
    expect(thresholdMax(5, 9)).toBe(8)
    expect(thresholdMax(5, 10)).toBeGreaterThanOrEqual(6)
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      for (let round = 1; round <= ROUNDS_PER_LEVEL; round += 1) {
        expect(thresholdMax(level, round)).toBeGreaterThanOrEqual(THRESHOLD_MIN + 2)
        expect(thresholdMax(level, round)).toBeLessThanOrEqual(THRESHOLD_MAX_BASE)
      }
    }
  })

  it('thresholdFor is seeded, deterministic, and uniform within the round range', () => {
    const seen = new Set<number>()
    for (let round = 1; round <= ROUNDS_PER_LEVEL; round += 1) {
      const max = thresholdMax(2, round)
      for (const seed of [1, 12345, 0xffffffff]) {
        const v = thresholdFor(seed, 2, round)
        expect(v).toBe(thresholdFor(seed, 2, round))
        expect(v).toBeGreaterThanOrEqual(THRESHOLD_MIN)
        expect(v).toBeLessThanOrEqual(max)
        seen.add(v)
      }
    }
    // 不同 seed 至少派生出不同的阈值序列。
    const a: number[] = []
    const b: number[] = []
    for (let round = 1; round <= ROUNDS_PER_LEVEL; round += 1) {
      a.push(thresholdFor(7, 1, round))
      b.push(thresholdFor(8, 1, round))
    }
    expect(a).not.toEqual(b)
    // 区间内多个值都可被抽到（覆盖率抽样）。
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })

  it('payout doubles from the base every pump; level targets are progressive', () => {
    expect(payout(0)).toBe(10)
    expect(payout(1)).toBe(20)
    expect(payout(4)).toBe(160)
    expect(payout(12)).toBe(40960)
    expect(levelTarget(1)).toBe(LEVEL_TARGETS[0])
    expect(levelTarget(5)).toBe(LEVEL_TARGETS[4])
    for (let level = 2; level <= LEVEL_COUNT; level += 1) {
      expect(levelTarget(level)).toBeGreaterThan(levelTarget(level - 1))
    }
  })

  it('pump grows potential; cash banks the payout and enters review with projection', () => {
    const state = createBalloonBank(42)
    expect(state.phase).toBe('pumping')
    expect(state.potential).toBe(10)
    pump(state)
    pump(state)
    expect(state.pumps).toBe(2)
    expect(state.potential).toBe(40)
    cash(state)
    expect(state.phase).toBe('review')
    expect(state.bank).toBe(40)
    const review = state.review!
    expect(review.banked).toBe(40)
    expect(review.nextPayout).toBe(80)
    expect(review.maxPayout).toBe(payout(review.threshold - 1))
    expect(review.evNext).toBeGreaterThan(0)
    expect(popCounts(state)).toEqual([])
  })

  it('pumping to the hidden threshold pops: round banks nothing, review reveals it', () => {
    const seed = 3
    const state = createBalloonBank(seed)
    const threshold = thresholdFor(seed, 1, 1)
    while (state.pumps < threshold - 1) {
      pump(state)
      expect(state.phase).toBe('pumping')
    }
    pump(state)
    expect(state.pumps).toBe(threshold)
    expect(state.phase).toBe('review')
    expect(state.bank).toBe(0)
    expect(state.review!.banked).toBe(0)
    expect(state.review!.threshold).toBe(threshold)
    expect(state.history[0]!.popped).toBe(true)
    expect(popCounts(state)).toEqual([threshold])
    expect(state.events.some(ev => ev.type === 'pop')).toBe(true)
  })

  it('pump during review advances rounds; the 10th round resolves a failing level', () => {
    const state = createBalloonBank(99)
    for (let round = 1; round <= ROUNDS_PER_LEVEL - 1; round += 1) {
      // 每轮立刻兑现 payout(0)=10，稳拿但不达标。
      cash(state)
      expect(state.phase).toBe('review')
      pump(state)
      expect(state.phase).toBe('pumping')
      expect(state.round).toBe(round + 1)
      expect(state.pumps).toBe(0)
    }
    cash(state)
    pump(state)
    expect(state.history).toHaveLength(ROUNDS_PER_LEVEL)
    expect(state.phase).toBe('gameover')
    expect(state.levelBanks).toEqual([ROUNDS_PER_LEVEL * 10])
    expect(state.events.some(ev => ev.type === 'levelFail')).toBe(true)
  })

  it('meeting the target levels up: bank and history reset, next level starts clean', () => {
    const state = createBalloonBank(5)
    // 最优打满 10 轮：每轮至少 payout(3)=80，总额必超第 1 关目标 150。
    for (let round = 1; round <= ROUNDS_PER_LEVEL; round += 1) {
      while (state.phase === 'pumping' && state.pumps < state.threshold - 1) pump(state)
      cash(state)
      pump(state)
    }
    expect(state.phase).toBe('levelup')
    expect(state.level).toBe(2)
    expect(state.levelBanks).toEqual([state.levelBanks[0]])
    expect(state.events.some(ev => ev.type === 'levelup')).toBe(true)
    beginLevel(state)
    expect(state.phase).toBe('pumping')
    expect(state.level).toBe(2)
    expect(state.round).toBe(1)
    expect(state.bank).toBe(0)
    expect(state.history).toHaveLength(0)
    expect(state.pumps).toBe(0)
    expect(remaining(state)).toBe(levelTarget(2))
    // beginLevel 在非 levelup 阶段是空操作。
    beginLevel(state)
    expect(state.phase).toBe('pumping')
  })

  it('the same seed replays the identical round outcomes', () => {
    const play = (seed: number): number[] => {
      const state = createBalloonBank(seed)
      const out: number[] = []
      while (state.phase === 'pumping' || state.phase === 'review' || state.phase === 'levelup') {
        if (state.phase === 'levelup') { beginLevel(state); continue }
        const before = state.pumps
        pump(state)
        if (state.phase === 'review') out.push(state.review!.banked > 0 ? before + 1000 : -state.pumps)
      }
      return out
    }
    expect(play(2024)).toEqual(play(2024))
    expect(play(2024)).not.toEqual(play(2025))
  })

  it('evNextPump falls as pumps rise and hits zero when survival is impossible', () => {
    const min = THRESHOLD_MIN
    const max = thresholdMax(1, 1)
    // 打 1 次永远安全（阈值最小 4）：期望值就是 payout(1)。
    expect(evNextPump(0, min, max)).toBeCloseTo(payout(1))
    expect(evNextPump(3, min, max)).toBeCloseTo(payout(4) * 8 / 9)
    // 期望值 = 存活概率 × 奖金：存活概率随打气次数严格下降。
    const ratio = (pumps: number): number => evNextPump(pumps, min, max) / payout(pumps + 1)
    expect(ratio(0)).toBe(1)
    for (let pumps = 2; pumps < max - 1; pumps += 1) {
      expect(ratio(pumps)).toBeGreaterThan(ratio(pumps + 1))
    }
    expect(evNextPump(max - 1, min, max)).toBe(0)
    expect(evNextPump(max + 3, min, max)).toBe(0)
  })

  it('winning level 5 completes the run with level banks recorded', () => {
    const state = createBalloonBank(1)
    let guard = 0
    while (state.phase !== 'gamewin' && state.phase !== 'gameover' && guard < 200) {
      if (state.phase === 'levelup') beginLevel(state)
      else playOptimalRound(state)
      guard += 1
    }
    expect(state.phase).toBe('gamewin')
    expect(state.levelBanks).toHaveLength(LEVEL_COUNT)
    expect(state.events.some(ev => ev.type === 'runComplete')).toBe(true)
  })

  it('cash and pump are no-ops outside their phases', () => {
    const state = createBalloonBank(1)
    cash(state)
    expect(state.phase).toBe('review')
    // cash 在 review 阶段不再结算。
    cash(state)
    expect(state.bank).toBe(payout(0))
    expect(state.history).toHaveLength(1)
    const over = createBalloonBank(1)
    over.phase = 'gameover'
    pump(over)
    cash(over)
    advance(over)
    expect(over.pumps).toBe(0)
    expect(over.phase).toBe('gameover')
  })
})
