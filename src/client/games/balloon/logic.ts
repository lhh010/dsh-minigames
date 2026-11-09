/**
 * 吹气球（Balloon）纯逻辑：推运气博弈。按住充气，充气量越大潜在
 * 分越高；松手把当前充气量按 100 分/满格换算成得分存入本局总分并
 * 换新气球。每只气球有一个隐藏爆点阈值：充气量达到阈值即爆，本局
 * 总分清零、整局结束。阈值由注入 seed 经 mulberry32 按 (seed, n)
 * 派生，且其上限随成功次数递减——第 n 只气球的爆点上限 = 90% −
 * (n−1)×6%，下限 40%：越贪心越危险。一轮共 10 只气球，全部存入后
 * 结算总分。逻辑不含任何非注入随机源，同 seed 同操作序列必然得到
 * 同一状态，可脱离 DOM 确定性重放。
 */

/** 逻辑画布尺寸（含顶部 HUD 与底部气球进度点区域）。 */
export const W = 560
export const H = 460
/** 一轮气球总数。 */
export const BALLOON_COUNT = 10
/** 充气速率：每秒增长的充气量（0..1 满格约 2 秒）。 */
export const INFLATE_RATE = 0.5
/** 满格充气量换算的分值（松手得分 = floor(inflate × 100)）。 */
export const SCORE_PER_FULL = 100
/** 第 1 只气球的爆点上限。 */
export const BASE_CAP = 0.9
/** 爆点上限随气球序号的每只递减量。 */
export const CAP_DECAY = 0.06
/** 爆点上限下限。 */
export const MIN_CAP = 0.4
/** 阈值在上限区间内的下探系数：阈值 ∈ [cap×0.75, cap)。 */
export const THRESHOLD_FLOOR = 0.75

/**
 * mulberry32 确定性伪随机数发生器（与 blackjack/avalanche 同构造）。
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
 * 气球序号混合进种子：同 seed 不同 n 得到独立随机序列。
 * @param seed - 对局种子。
 * @param n - 气球序号（1 起）。
 * @returns 该气球专属的 32 位种子。
 */
export function balloonSeed(seed: number, n: number): number {
  return (Math.imul(seed >>> 0, 374761393) + Math.imul(n, 668265263)) >>> 0
}

/**
 * 第 n 只气球的爆点上限曲线：90% − (n−1)×6%，收敛到下限 40%。
 * @param n - 气球序号（1 起，越界收敛）。
 * @returns 爆点上限（充气量比例）。
 */
export function popCap(n: number): number {
  const idx = Math.min(BALLOON_COUNT, Math.max(1, Math.floor(n)))
  return Math.max(MIN_CAP, BASE_CAP - (idx - 1) * CAP_DECAY)
}

/**
 * 第 n 只气球的爆点阈值：mulberry32(seed, n) 派生，落在上限的
 * [75%, 100%) 区间内——玩家只知上限曲线，不知确切阈值。
 * @param seed - 对局种子。
 * @param n - 气球序号（1 起）。
 * @returns 爆点阈值（充气量比例，充气量 ≥ 阈值即爆）。
 */
export function popThreshold(seed: number, n: number): number {
  const rng = mulberry32(balloonSeed(seed, n))
  const cap = popCap(n)
  return cap * (THRESHOLD_FLOOR + (1 - THRESHOLD_FLOOR) * rng())
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type BalloonEvent =
  | { type: 'bank', index: number, inflate: number, gained: number }
  | { type: 'pop', index: number, inflate: number }
  | { type: 'complete', score: number }

/** 一局游戏的完整可测状态。 */
export interface BalloonState {
  /** 对局种子（爆点阈值的唯一随机源）。 */
  seed: number
  /** 全局动画时钟 ms（渲染动画用）。 */
  t: number
  /** 当前气球序号（1 起，≤ BALLOON_COUNT）。 */
  balloonIndex: number
  /** 当前充气量（0 起增长，≥ 阈值即爆）。 */
  inflate: number
  /** 是否按住中（true 时充气）。 */
  holding: boolean
  /** 本局累计总分（爆掉即清零）。 */
  runScore: number
  /** 每只已存入气球的得分（爆掉后保留作展示）。 */
  banked: number[]
  /** 当前气球的爆点阈值（逻辑判定用；渲染仅用于近爆抖动强度）。 */
  threshold: number
  over: boolean
  /** 因充爆结束（over 的原因之一）。 */
  popped: boolean
  /** 10 只全部存入、正常结算结束。 */
  complete: boolean
  events: BalloonEvent[]
}

/**
 * 新开一局：第 1 只气球的阈值由 seed 派生。
 * @param seed - 对局种子。
 * @returns 初始状态。
 */
export function createBalloon(seed: number): BalloonState {
  return {
    seed: seed >>> 0,
    t: 0,
    balloonIndex: 1,
    inflate: 0,
    holding: false,
    runScore: 0,
    banked: [],
    threshold: popThreshold(seed, 1),
    over: false,
    popped: false,
    complete: false,
    events: [],
  }
}

/**
 * 当前充气量的潜在分（松手能存入的分）。
 * @param state - 目标状态。
 * @returns 潜在分（0..100）。
 */
export function potential(state: BalloonState): number {
  return Math.floor(state.inflate * SCORE_PER_FULL)
}

/**
 * 按住：开始充气（over 后忽略）。
 * @param state - 目标状态。
 */
export function startHold(state: BalloonState): void {
  if (state.over) return
  state.holding = true
}

/**
 * 换下一只气球：序号推进、充气量归零、阈值按 seed 重新派生。
 * @param state - 目标状态。
 */
function nextBalloon(state: BalloonState): void {
  state.balloonIndex += 1
  state.inflate = 0
  state.holding = false
  state.threshold = popThreshold(state.seed, state.balloonIndex)
}

/**
 * 松手：把当前充气量存入本局总分并换新气球；第 10 只存入后正常
 * 结算结束。未按住或已结束时仅解除按住状态，不产生事件。
 * @param state - 目标状态。
 */
export function release(state: BalloonState): void {
  const wasHolding = state.holding
  state.holding = false
  if (state.over || !wasHolding) return
  const gained = potential(state)
  state.runScore += gained
  state.banked.push(gained)
  state.events.push({ type: 'bank', index: state.balloonIndex, inflate: state.inflate, gained })
  if (state.balloonIndex >= BALLOON_COUNT) {
    state.complete = true
    state.over = true
    state.events.push({ type: 'complete', score: state.runScore })
    return
  }
  nextBalloon(state)
}

/**
 * 推进一帧：按住时充气量增长；充气量 ≥ 阈值即爆——本局总分清零、
 * 整局结束。事件写入 state.events，调用方每帧消费后在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepBalloon(state: BalloonState, dtMs: number): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs
  if (!state.holding) return
  state.inflate += (INFLATE_RATE * dtMs) / 1000
  if (state.inflate >= state.threshold) {
    state.popped = true
    state.over = true
    state.runScore = 0
    state.holding = false
    state.events.push({ type: 'pop', index: state.balloonIndex, inflate: state.inflate })
  }
}
