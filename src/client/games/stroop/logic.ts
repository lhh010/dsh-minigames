/**
 * 斯特鲁普（Stroop）纯逻辑：每轮抽出一张「颜色词 + 墨色」卡片，玩家必须在
 * 限时内按【墨色】作答（而不是字义）。答对得分并累积连击加成；答错或超时
 * 扣一条命，共 3 命；20 轮一局。所有随机都走注入的 seed（rng），同一 seed
 * 重放完全一致——逻辑层无 DOM、无定时器，时间由调用方以 dt 推进。
 */

/** 颜色词数量（红/绿/蓝/黄/紫/橙），也是底部色块按钮数。 */
export const COLOR_COUNT = 6
/** 一局总轮数。 */
export const TOTAL_ROUNDS = 20
/** 初始生命。 */
export const MAX_LIVES = 3
/** 第 1 轮的限时（毫秒）。 */
export const START_TIME_MS = 2000
/** 最后一轮的限时（毫秒）。 */
export const MIN_TIME_MS = 900
/** 首轮字义与墨色一致的概率。 */
export const START_CONGRUENT = 0.5
/** 末轮字义与墨色一致的概率（即 90% 冲突）。 */
export const END_CONGRUENT = 0.1
/** 答对基础分。 */
export const BASE_SCORE = 100
/** 每层连击追加的分（连击 n 时加 n * COMBO_BONUS）。 */
export const COMBO_BONUS = 20

/** 颜色词文案，索引即颜色编号（0-5）。 */
export const COLOR_NAMES = ['红', '绿', '蓝', '黄', '紫', '橙'] as const
/** 答题键盘码：主键盘 1-6。 */
export const COLOR_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'] as const

export type StroopPhase = 'idle' | 'prompt' | 'over' | 'won'

export interface StroopState {
  phase: StroopPhase
  /** 下一张（或当前）卡片的 0 基轮次，范围 [0, TOTAL_ROUNDS)。 */
  round: number
  lives: number
  score: number
  /** 当前连续答对次数（本次作答前已连对 n 次，则加成 n * COMBO_BONUS）。 */
  combo: number
  /** 本局最高连击。 */
  bestCombo: number
  /** 当前卡片字义（颜色编号）。 */
  word: number
  /** 当前卡片墨色（颜色编号）——答题的正确答案。 */
  ink: number
  /** 当前卡片剩余作答时间（毫秒），由调用方按 dt 递减。 */
  remainingMs: number
  rng: () => number
}

/**
 * mulberry32 确定性随机：同一 seed 生成同一序列。
 * @param seed - 32 位无符号整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 第 round 轮（0 基）的限时：从 START_TIME_MS 线性收紧到 MIN_TIME_MS。
 * @param round - 0 基轮次。
 * @returns 该轮的作答限时（毫秒）。
 */
export function roundTimeLimit(round: number): number {
  const t = Math.min(Math.max(round, 0), TOTAL_ROUNDS - 1) / (TOTAL_ROUNDS - 1)
  return START_TIME_MS + t * (MIN_TIME_MS - START_TIME_MS)
}

/**
 * 第 round 轮（0 基）字义与墨色一致的概率：从 START_CONGRUENT 线性降到
 * END_CONGRUENT（冲突率从 50% 升到 90%）。
 * @param round - 0 基轮次。
 * @returns 该轮抽到「字义 = 墨色」卡片的概率。
 */
export function congruentChance(round: number): number {
  const t = Math.min(Math.max(round, 0), TOTAL_ROUNDS - 1) / (TOTAL_ROUNDS - 1)
  return START_CONGRUENT + t * (END_CONGRUENT - START_CONGRUENT)
}

/**
 * 难度档位（HUD 展示用）：前 1/3 轮 1 档，中 1/3 轮 2 档，后 1/3 轮 3 档。
 * @param round - 0 基轮次。
 * @returns 难度档位 1-3。
 */
export function difficultyLevel(round: number): number {
  if (round < TOTAL_ROUNDS / 3) return 1
  if (round < (TOTAL_ROUNDS * 2) / 3) return 2
  return 3
}

/**
 * 建立初始状态并发出第一张卡片。
 * @param rng - 注入的 [0,1) 随机源（默认 Math.random；测试请注入 mulberry32）。
 * @returns 就绪的 StroopState（phase 为 'prompt'）。
 */
export function createStroopState(rng: () => number = Math.random): StroopState {
  const state: StroopState = {
    phase: 'idle', round: 0, lives: MAX_LIVES, score: 0, combo: 0, bestCombo: 0,
    word: 0, ink: 0, remainingMs: 0, rng,
  }
  dealCard(state)
  return state
}

/** 就地发出当前轮次的卡片（消耗 rng，字义与是否一致由 congruentChance 决定）。 */
function dealCard(state: StroopState): void {
  const word = Math.floor(state.rng() * COLOR_COUNT) % COLOR_COUNT
  let ink = word
  if (state.rng() >= congruentChance(state.round)) {
    // 冲突卡：墨色从「除字义外」的 5 种颜色中等概率选取。
    ink = (word + 1 + Math.floor(state.rng() * (COLOR_COUNT - 1))) % COLOR_COUNT
  }
  state.word = word
  state.ink = ink
  state.remainingMs = roundTimeLimit(state.round)
  state.phase = 'prompt'
}

/**
 * 按颜色作答。答对：得分（含连击加成）、连击 +1、进入下一轮；答错：扣 1 命、
 * 清连击，仍进入下一轮（命尽则结束）。
 * @param state - 当前状态（须处于 'prompt'）。
 * @param color - 玩家选择的颜色编号 0-5。
 * @returns 'ignored' 非答题阶段；'correct' 答对；'wrong' 答错。
 */
export function answer(state: StroopState, color: number): 'ignored' | 'correct' | 'wrong' {
  if (state.phase !== 'prompt') return 'ignored'
  if (color === state.ink) {
    state.score += BASE_SCORE + state.combo * COMBO_BONUS
    state.combo += 1
    state.bestCombo = Math.max(state.bestCombo, state.combo)
    advance(state)
    return 'correct'
  }
  loseLife(state)
  return 'wrong'
}

/**
 * 推进剩余作答时间；时间耗尽视为超时：扣 1 命、清连击、进入下一轮
 * （命尽则结束）。
 * @param state - 当前状态。
 * @param dtMs - 本帧流逝的毫秒数（非负）。
 * @returns 'ok' 继续作答；'timeout' 本轮超时（若命尽，phase 已变 'over'）。
 */
export function tick(state: StroopState, dtMs: number): 'ok' | 'timeout' {
  if (state.phase !== 'prompt') return 'ok'
  state.remainingMs -= Math.max(0, dtMs)
  if (state.remainingMs > 0) return 'ok'
  loseLife(state)
  return 'timeout'
}

/** 扣命并推进；命尽则结束，否则发下一张卡片。 */
function loseLife(state: StroopState): void {
  state.lives -= 1
  state.combo = 0
  if (state.lives <= 0) {
    state.lives = 0
    state.phase = 'over'
  } else {
    advance(state)
  }
}

/** 轮次 +1；打满 TOTAL_ROUNDS 则胜利，否则发下一张卡片。 */
function advance(state: StroopState): void {
  state.round += 1
  if (state.round >= TOTAL_ROUNDS) {
    state.phase = 'won'
  } else {
    dealCard(state)
  }
}
