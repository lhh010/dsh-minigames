/**
 * 节奏打击（Rhythm）纯逻辑：4 轨道下落式节奏游戏。谱面由注入 seed
 * 经 mulberry32 确定性生成（BPM 100-140，音符密度随时间上升，同轨道
 * 最小间隔 1.5 拍）；音符到达判定线时按键：PERFECT（±30ms）500 分 /
 * GOOD（±80ms）200 分，倍率随连击每 50 递增（x1→x4 封顶）；MISS 或
 * 漏接扣 1 命，共 3 命，命尽或谱面打完即结束。全部时间单位毫秒，
 * 状态只依赖 seed 与输入序列，可确定性重放。
 */

/** 逻辑画布尺寸（纵向下落区 + 顶部 HUD + 底部按键提示）。 */
export const W = 560
export const H = 640
/** 轨道数（D / F / J / K）。 */
export const LANE_COUNT = 4
/** 谱面 BPM 区间。 */
export const MIN_BPM = 100
export const MAX_BPM = 140
/** 谱面总拍数（含 4 拍前导）。 */
export const CHART_BEATS = 128
/** 前导拍数：第一颗音符之前的准备时间。 */
export const LEAD_IN_BEATS = 4
/** 同轨道两颗音符的最小间隔（拍）。 */
export const MIN_LANE_GAP_BEATS = 1.5
/** PERFECT 判定窗口（|Δ| ≤ 30ms）。 */
export const PERFECT_MS = 30
/** GOOD 判定窗口（|Δ| ≤ 80ms）。 */
export const GOOD_MS = 80
/** 超过音符时刻 +120ms 未击中即判 MISS（漏接）。 */
export const MISS_LATE_MS = 120
/** PERFECT 基础分。 */
export const SCORE_PERFECT = 500
/** GOOD 基础分。 */
export const SCORE_GOOD = 200
/** 初始生命。 */
export const START_LIVES = 3
/** 连击每达到 50 的倍数升一档倍率。 */
export const COMBO_STEP = 50
/** 倍率上限 x4。 */
export const MAX_MULTIPLIER = 4

/** 单颗音符的判定结果。 */
export type RhythmJudgement = 'perfect' | 'good' | 'miss'

/** 谱面音符：轨道 + 判定线时刻（judged 为运行态，生成时为 null）。 */
export interface RhythmNote {
  lane: number
  timeMs: number
  judged: RhythmJudgement | null
}

/** 由 seed 确定性生成的谱面。 */
export interface RhythmChart {
  seed: number
  bpm: number
  /** 一拍的毫秒数。 */
  beatMs: number
  notes: RhythmNote[]
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type RhythmEvent =
  | { type: 'judge', judgement: RhythmJudgement, lane: number, delta: number, gained: number }
  | { type: 'over' }
  | { type: 'complete', score: number }

/** 一局游戏的完整可测状态。 */
export interface RhythmState {
  /** 全局时钟 ms（从 0 起，第一颗音符前有前导时间）。 */
  t: number
  seed: number
  bpm: number
  beatMs: number
  notes: RhythmNote[]
  combo: number
  maxCombo: number
  score: number
  lives: number
  events: RhythmEvent[]
  over: boolean
  /** 谱面全部判定完毕（命未尽）。 */
  finished: boolean
}

/**
 * mulberry32 伪随机数生成器：seed 相同则序列完全相同，供谱面生成与
 * 测试确定性注入。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 由 seed 确定性生成谱面：BPM 在 [100, 140]；从第 4 拍起逐拍按随进度
 * 上升的概率落音符，后半段再按概率补半拍音符；轨道从「距上次使用
 * 已满 1.5 拍」的候选里随机挑，保证同轨道最小间隔。
 * @param seed - 种子（32 位整数）。
 * @returns 谱面（音符按时刻升序）。
 */
export function createRhythmChart(seed: number): RhythmChart {
  const rng = mulberry32(seed)
  const bpm = MIN_BPM + Math.floor(rng() * (MAX_BPM - MIN_BPM + 1))
  const beatMs = 60000 / bpm
  const notes: RhythmNote[] = []
  const lastLaneMs: number[] = new Array(LANE_COUNT).fill(-Infinity)
  const minGapMs = MIN_LANE_GAP_BEATS * beatMs
  const place = (timeMs: number): void => {
    const eligible: number[] = []
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      if (timeMs - lastLaneMs[lane]! >= minGapMs) eligible.push(lane)
    }
    if (eligible.length === 0) return
    const lane = eligible[Math.floor(rng() * eligible.length)]!
    lastLaneMs[lane] = timeMs
    notes.push({ lane, timeMs, judged: null })
  }
  const beats = CHART_BEATS - LEAD_IN_BEATS
  for (let b = 0; b < beats; b += 1) {
    const progress = b / (beats - 1)
    const timeMs = (LEAD_IN_BEATS + b) * beatMs
    // 正拍：落音概率 0.5 → 1.0 线性上升。
    if (rng() < 0.5 + 0.5 * progress) place(timeMs)
    // 半拍：进度 0.3 之后以随进度上升的概率补一颗（密度递增）。
    if (progress > 0.3 && rng() < 0.3 * progress) place(timeMs + beatMs / 2)
  }
  notes.sort((x, y) => x.timeMs - y.timeMs)
  return { seed, bpm, beatMs, notes }
}

/**
 * 新开一局。
 * @param seed - 谱面种子；省略时取当前时间派生的整数。
 * @returns 初始状态（时钟为 0，尚无判定）。
 */
export function createRhythm(seed?: number): RhythmState {
  const usedSeed = seed ?? (Date.now() & 0x7fffffff)
  const chart = createRhythmChart(usedSeed)
  return {
    t: 0,
    seed: usedSeed,
    bpm: chart.bpm,
    beatMs: chart.beatMs,
    notes: chart.notes,
    combo: 0,
    maxCombo: 0,
    score: 0,
    lives: START_LIVES,
    events: [],
    over: false,
    finished: false,
  }
}

/**
 * 当前连击对应的得分倍率：1 + floor(combo / 50)，封顶 x4。
 * @param combo - 当前连击数。
 * @returns 倍率（1-4）。
 */
export function comboMultiplier(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP))
}

/**
 * 玩家在指定轨道按键：取该轨道未判定且 |Δ| 最小的音符，|Δ| ≤ 30 为
 * PERFECT、≤ 80 为 GOOD（得分 = 基础分 × 当前倍率），窗口外忽略；
 * 命中连击 +1。
 * @param state - 目标状态。
 * @param lane - 轨道下标（0-3）。
 */
export function hitRhythm(state: RhythmState, lane: number): void {
  if (state.over || state.finished) return
  let best: RhythmNote | null = null
  let bestAbs = Infinity
  for (const note of state.notes) {
    if (note.lane !== lane || note.judged !== null) continue
    const abs = Math.abs(state.t - note.timeMs)
    if (abs < bestAbs) {
      best = note
      bestAbs = abs
    }
  }
  if (best === null || bestAbs > GOOD_MS) return
  const delta = Math.round(state.t - best.timeMs)
  const judgement: RhythmJudgement = bestAbs <= PERFECT_MS ? 'perfect' : 'good'
  best.judged = judgement
  state.combo += 1
  if (state.combo > state.maxCombo) state.maxCombo = state.combo
  const gained = (judgement === 'perfect' ? SCORE_PERFECT : SCORE_GOOD) * comboMultiplier(state.combo)
  state.score += gained
  state.events.push({ type: 'judge', judgement, lane, delta, gained })
}

/** 漏接一颗音符：判 MISS、清连击、扣 1 命，命尽即结束。 */
function missNote(state: RhythmState, note: RhythmNote): void {
  note.judged = 'miss'
  state.combo = 0
  state.lives -= 1
  state.events.push({ type: 'judge', judgement: 'miss', lane: note.lane, delta: MISS_LATE_MS, gained: 0 })
  if (state.lives <= 0) {
    state.lives = 0
    state.over = true
    state.events.push({ type: 'over' })
  }
}

/**
 * 推进一帧：时钟前进 dtMs，超过时刻 +120ms 仍未击中的音符判 MISS；
 * 全部音符判定完毕且命未尽则 finished 并发 complete 事件。事件写入
 * state.events，调用方每帧消费后在下一帧开头被清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepRhythm(state: RhythmState, dtMs: number): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs
  let pending = 0
  for (const note of state.notes) {
    if (note.judged !== null) continue
    if (state.t > note.timeMs + MISS_LATE_MS) missNote(state, note)
    if (state.over) return
    pending += 1
  }
  if (pending === 0) {
    state.finished = true
    state.events.push({ type: 'complete', score: state.score })
  }
}
