/**
 * 气球银行（BalloonBank）纯逻辑：打气押注 push-your-luck。每轮一只
 * 气球：空格打气一次，本轮潜在奖金翻倍（10→20→40…）；Enter 兑现把
 * 潜在奖金存入银行；打气次数达到隐藏爆炸阈值（由注入 seed 派生，位
 * 于第 4-12 次之间，轮次越靠后、关卡越靠后阈值分布越低）则爆炸，本
 * 轮奖金归零。10 轮一关，关末银行余额 ≥ 目标即过关（共 5 关递进），
 * 否则整局失败。所有随机只来自注入 seed（mulberry32），同 seed 同操
 * 作序列必然得到同一状态，可脱离 DOM 确定性重放。
 */

/** 逻辑画布尺寸（含顶部 HUD、左右侧栏与底部速览条）。 */
export const W = 640
export const H = 480
/** 每关轮数。 */
export const ROUNDS_PER_LEVEL = 10
/** 总关数。 */
export const LEVEL_COUNT = 5
/** 第 0 次打气（未打）时的基础潜在奖金。 */
export const BASE_PAYOUT = 10
/** 爆炸阈值下限：最早第 4 次打气就可能爆炸。 */
export const THRESHOLD_MIN = 4
/** 爆炸阈值基准上限：第 12 次。 */
export const THRESHOLD_MAX_BASE = 12
/** 阈值保底下限之上的最低上限（上限永远比下限多出安全空间）。 */
export const THRESHOLD_MAX_FLOOR = 6
/** 各关过关目标总分（递进）。 */
export const LEVEL_TARGETS: readonly number[] = [150, 320, 600, 1000, 1600]

/**
 * mulberry32 确定性伪随机数发生器（与 blackjack/balloon 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 关号与轮号混合进种子：同 seed 不同 (level, round) 得到独立阈值。
 * @param seed - 对局种子。
 * @param level - 关号（1 起）。
 * @param round - 轮号（1 起）。
 * @returns 该轮专属的 32 位种子。
 */
export function roundSeed(seed: number, level: number, round: number): number {
  return (Math.imul(seed >>> 0, 374761393) + Math.imul(level, 668265263) + Math.imul(round, 2246822519)) >>> 0
}

/**
 * 后期轮次的阈值上限削减量：第 1-4 轮不减，第 5-8 轮减 1，第 9-10 轮
 * 减 2——一轮 10 次里越到后面越险。
 * @param round - 轮号（1 起，越界收敛）。
 * @returns 削减量（0..2）。
 */
export function roundPenalty(round: number): number {
  const r = Math.min(ROUNDS_PER_LEVEL, Math.max(1, Math.floor(round)))
  return Math.min(2, Math.floor((r - 1) / 4))
}

/**
 * 后两关的阈值上限整体削减量：第 4 关减 1、第 5 关减 2，分布更低。
 * @param level - 关号（1 起，越界收敛）。
 * @returns 削减量（0..2）。
 */
export function lateLevelPenalty(level: number): number {
  const l = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level)))
  return l >= 4 ? l - 3 : 0
}

/**
 * 指定关/轮的阈值上限：12 − 轮次削减 − 关卡削减，下限 6。
 * @param level - 关号（1 起）。
 * @param round - 轮号（1 起）。
 * @returns 阈值上限（打气次数）。
 */
export function thresholdMax(level: number, round: number): number {
  return Math.max(THRESHOLD_MAX_FLOOR, THRESHOLD_MAX_BASE - roundPenalty(round) - lateLevelPenalty(level))
}

/**
 * 指定关/轮的爆炸阈值：mulberry32(seed, level, round) 派生，均匀落在
 * [THRESHOLD_MIN, thresholdMax] 内——玩家只知分布区间，不知确切值。
 * @param seed - 对局种子。
 * @param level - 关号（1 起）。
 * @param round - 轮号（1 起）。
 * @returns 爆炸阈值（第几次打气爆炸）。
 */
export function thresholdFor(seed: number, level: number, round: number): number {
  const rng = mulberry32(roundSeed(seed, level, round))
  const max = thresholdMax(level, round)
  return THRESHOLD_MIN + Math.floor(rng() * (max - THRESHOLD_MIN + 1))
}

/**
 * 打气 pumps 次后的潜在奖金：10 × 2^pumps。
 * @param pumps - 打气次数（0 起）。
 * @returns 潜在奖金。
 */
export function payout(pumps: number): number {
  return BASE_PAYOUT * 2 ** Math.max(0, Math.floor(pumps))
}

/**
 * 第 level 关的过关目标总分。
 * @param level - 关号（1 起，越界取边界）。
 * @returns 目标总分。
 */
export function levelTarget(level: number): number {
  const idx = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level))) - 1
  return LEVEL_TARGETS[idx]!
}

/**
 * 「再打一次就收」的期望值：阈值均匀分布于 [min,max] 时，多打一次
 * 存活（阈值 > pumps+1）的概率 × 存活后的潜在奖金；必定爆炸时为 0。
 * @param pumps - 当前打气次数。
 * @param min - 阈值区间下限。
 * @param max - 阈值区间上限。
 * @returns 期望奖金。
 */
export function evNextPump(pumps: number, min: number, max: number): number {
  const span = max - min + 1
  const survivors = Math.max(0, max - Math.max(pumps + 1, min - 1))
  if (survivors <= 0) return 0
  return (survivors / span) * payout(pumps + 1)
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type BalloonBankEvent =
  | { type: 'pump'; pumps: number; potential: number }
  | { type: 'cash'; round: number; pumps: number; gained: number; bank: number }
  | { type: 'pop'; round: number; pumps: number; threshold: number }
  | { type: 'levelup'; level: number; bank: number }
  | { type: 'levelFail'; level: number; bank: number; target: number }
  | { type: 'runComplete'; bank: number }

/** 一轮的结算记录（供历史气压计复盘）。 */
export interface RoundRecord {
  /** 轮号（1 起）。 */
  round: number
  /** 结束时的打气次数（爆掉时即爆炸那次）。 */
  pumps: number
  /** 是否爆炸。 */
  popped: boolean
  /** 存入银行的奖金（爆炸为 0）。 */
  banked: number
  /** 该轮隐藏阈值（结算后揭晓，供复盘）。 */
  threshold: number
}

/** 轮末复盘数据：兑现/爆炸后「如果继续打」的推演。 */
export interface ReviewInfo {
  /** 本轮存入金额（爆炸为 0）。 */
  banked: number
  /** 结束时的打气次数。 */
  pumps: number
  /** 该轮阈值。 */
  threshold: number
  /** 再打一次的潜在奖金（未爆前提下）。 */
  nextPayout: number
  /** 打到阈值前一刻（第 threshold-1 次）的最大可得奖金。 */
  maxPayout: number
  /** 结束时刻「再打一次就收」的期望值。 */
  evNext: number
}

/** 对局阶段。 */
export type BalloonBankPhase =
  | 'pumping'
  | 'review'
  | 'levelup'
  | 'gameover'
  | 'gamewin'

/** 一局游戏的完整可测状态。 */
export interface BalloonBankState {
  /** 对局种子（阈值的唯一随机源）。 */
  seed: number
  /** 当前关号（1..LEVEL_COUNT）。 */
  level: number
  /** 当前轮号（1..ROUNDS_PER_LEVEL）。 */
  round: number
  /** 本轮已打气次数。 */
  pumps: number
  /** 本轮潜在奖金（= payout(pumps)）。 */
  potential: number
  /** 本关银行余额（各轮兑现累计）。 */
  bank: number
  /** 各已完成关的银行余额。 */
  levelBanks: number[]
  /** 本关每轮结算记录（历史气压计数据源）。 */
  history: RoundRecord[]
  /** 当前轮隐藏阈值（逻辑判定用；渲染仅用于复盘揭晓）。 */
  threshold: number
  /** 轮末复盘（phase === 'review' 时非空）。 */
  review: ReviewInfo | null
  phase: BalloonBankPhase
  events: BalloonBankEvent[]
}

/**
 * 新开一局（第 1 关第 1 轮）。
 * @param seed - 对局种子。
 * @returns 初始状态。
 */
export function createBalloonBank(seed: number): BalloonBankState {
  return {
    seed: seed >>> 0,
    level: 1,
    round: 1,
    pumps: 0,
    potential: payout(0),
    bank: 0,
    levelBanks: [],
    history: [],
    threshold: thresholdFor(seed, 1, 1),
    review: null,
    phase: 'pumping',
    events: [],
  }
}

/**
 * 结束一轮、进入复盘：记录 history 与 review 数据。
 * @param state - 目标状态。
 * @param popped - 是否爆炸结束。
 */
function endRound(state: BalloonBankState, popped: boolean): void {
  const banked = popped ? 0 : payout(state.pumps)
  if (!popped) state.bank += banked
  state.history.push({
    round: state.round,
    pumps: state.pumps,
    popped,
    banked,
    threshold: state.threshold,
  })
  state.review = {
    banked,
    pumps: state.pumps,
    threshold: state.threshold,
    nextPayout: payout(state.pumps + 1),
    maxPayout: payout(Math.max(0, state.threshold - 1)),
    evNext: evNextPump(state.pumps, THRESHOLD_MIN, thresholdMax(state.level, state.round)),
  }
  state.phase = 'review'
}

/**
 * 复盘后的推进：轮次未满则开下一轮（阈值按 seed 重派生）；第 10 轮结
 * 束则结算本关——达标进下一关（第 5 关达标则整局胜利），未达标整局
 * 失败。
 * @param state - 目标状态。
 */
export function advance(state: BalloonBankState): void {
  if (state.phase !== 'review') return
  state.review = null
  if (state.round < ROUNDS_PER_LEVEL) {
    state.round += 1
    state.pumps = 0
    state.potential = payout(0)
    state.threshold = thresholdFor(state.seed, state.level, state.round)
    state.phase = 'pumping'
    return
  }
  const target = levelTarget(state.level)
  state.levelBanks.push(state.bank)
  if (state.bank >= target) {
    if (state.level >= LEVEL_COUNT) {
      state.phase = 'gamewin'
      state.events.push({ type: 'runComplete', bank: state.bank })
      return
    }
    state.events.push({ type: 'levelup', level: state.level, bank: state.bank })
    state.level += 1
    state.phase = 'levelup'
    return
  }
  state.phase = 'gameover'
  state.events.push({ type: 'levelFail', level: state.level, bank: state.bank, target })
}

/**
 * 过关确认后的开新关：银行清零、历史清空、轮次复位。
 * @param state - 目标状态。
 */
export function beginLevel(state: BalloonBankState): void {
  if (state.phase !== 'levelup') return
  state.round = 1
  state.pumps = 0
  state.potential = payout(0)
  state.bank = 0
  state.history = []
  state.threshold = thresholdFor(state.seed, state.level, 1)
  state.phase = 'pumping'
}

/**
 * 打气：pumping 阶段打一次气（达到阈值即爆、进入复盘）；review 阶段
 * 等同推进下一轮；levelup 阶段等同开新关；结束阶段忽略。
 * @param state - 目标状态。
 */
export function pump(state: BalloonBankState): void {
  if (state.phase === 'review') {
    advance(state)
    return
  }
  if (state.phase === 'levelup') {
    beginLevel(state)
    return
  }
  if (state.phase !== 'pumping') return
  state.pumps += 1
  if (state.pumps >= state.threshold) {
    state.events.push({ type: 'pop', round: state.round, pumps: state.pumps, threshold: state.threshold })
    endRound(state, true)
    return
  }
  state.potential = payout(state.pumps)
  state.events.push({ type: 'pump', pumps: state.pumps, potential: state.potential })
}

/**
 * 兑现：把当前潜在奖金存入银行并进入复盘；非 pumping 阶段忽略。
 * @param state - 目标状态。
 */
export function cash(state: BalloonBankState): void {
  if (state.phase !== 'pumping') return
  const gained = payout(state.pumps)
  state.events.push({ type: 'cash', round: state.round, pumps: state.pumps, gained, bank: state.bank + gained })
  endRound(state, false)
}

/**
 * 本关还差多少分过关（负数表示已达标）。
 * @param state - 目标状态。
 * @returns 目标 − 银行余额。
 */
export function remaining(state: BalloonBankState): number {
  return levelTarget(state.level) - state.bank
}

/**
 * 本关历史中已爆气球的爆炸打气次数列表（历史气压计直方图数据）。
 * @param state - 目标状态。
 * @returns 爆炸记录的打气次数升序列表。
 */
export function popCounts(state: BalloonBankState): number[] {
  return state.history.filter(r => r.popped).map(r => r.pumps).sort((a, b) => a - b)
}
