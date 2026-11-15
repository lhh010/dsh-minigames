/**
 * 猜拳心理战纯逻辑：15 轮制石头剪刀布的规则判定、一阶/二阶马尔可夫
 * 转移表（AI 记住「你出 A 之后常出 B」）、随轮数爬坡的学习率（前 5 轮
 * 基本随机，之后越来越准）、50% 真话的「说漏嘴」提示、连赢加成计分与
 * 完整对局流程。全部状态走注入 seed（mulberry32），确定性可重放。
 */

/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 拳种编号：0=石头 1=剪刀 2=布（克制关系 (a+1)%3===b 即 a 胜 b）。 */
export type Hand = 0 | 1 | 2

/** 全部拳种，按编号顺序。 */
export const HANDS: readonly Hand[] = [0, 1, 2]

/** 拳种中文名（提示文案与复盘气泡用）。 */
export const HAND_LABELS: readonly string[] = ['石头', '剪刀', '布']

/** 单轮胜负（玩家视角）。 */
export type Outcome = 'win' | 'draw' | 'loss'

/** 一轮的完整复盘信息。 */
export interface RpsRoundResult {
  /** 本轮序号（1 起）。 */
  round: number
  /** 玩家出的拳。 */
  player: Hand
  /** AI 出的拳（克制它预测的拳）。 */
  ai: Hand
  /** AI 赛前对玩家本拳的预测。 */
  predicted: Hand
  outcome: Outcome
  /** 本轮得分增量（含连赢加成）。 */
  gained: number
  /** 玩家是否被读心（预测 === 实际出拳）。 */
  wasRead: boolean
}

/** AI「说漏嘴」的一句模糊提示（每 3 轮一句）。 */
export interface RpsHint {
  /** 提示原文。 */
  text: string
  /** 是否真话（声称的拳 === AI 真正的预测）。 */
  truthful: boolean
  /** 声称玩家接下来会出的拳。 */
  claimed: Hand
}

/** 一局对局的全部可测状态。 */
export interface RpsState {
  /** 注入的确定性随机源。 */
  rng: () => number
  /** 已完成轮数（0..15）。 */
  round: number
  score: number
  /** 当前连赢轮数（平/输清零）。 */
  streak: number
  bestStreak: number
  wins: number
  draws: number
  losses: number
  /** 被读心总次数（AI 预测 === 玩家实际）。 */
  readCount: number
  /** 玩家历史出拳（转移表的数据源）。 */
  history: Hand[]
  /** 一阶转移表：上一拳 -> 三种后继的计数。 */
  table1: Map<number, number[]>
  /** 二阶转移表：上两拳（'a:b'）-> 三种后继的计数。 */
  table2: Map<string, number[]>
  /** 提示时提前算好的下一轮预测（保证提示真假的承诺可兑现）。 */
  pendingPrediction: Hand | null
  /** 最近一次提示（每 3 轮更新，其余轮为 null）。 */
  lastHint: RpsHint | null
  /** 最近一轮复盘（render 用）。 */
  last: RpsRoundResult | null
  over: boolean
}

/** 总轮数。 */
export const TOTAL_ROUNDS = 15

const ZERO_COUNTS = (): number[] => [0, 0, 0]

/**
 * 开新局：注入 seed，得到干净状态。
 * @param seed - 种子（同 seed 同输入序列完全重放）。
 */
export function createRpsState(seed: number): RpsState {
  return {
    rng: mulberry32(seed),
    round: 0, score: 0, streak: 0, bestStreak: 0,
    wins: 0, draws: 0, losses: 0, readCount: 0,
    history: [], table1: new Map(), table2: new Map(),
    pendingPrediction: null, lastHint: null, last: null, over: false,
  }
}

/**
 * 克制判定：(a+1)%3 === b 即 a 胜 b（石>剪、剪>布、布>石）。
 */
export function beats(a: Hand, b: Hand): boolean {
  return (a + 1) % 3 === b
}

/**
 * 克制 h 的拳（石头->布、剪刀->石头、布->剪刀）。
 */
export function counterOf(h: Hand): Hand {
  return ((h + 2) % 3) as Hand
}

/**
 * 学习率：前 5 轮 0（纯随机），之后每轮 +0.12，封顶 0.9。
 * @param roundsDone - 已完成轮数。
 */
export function learningRate(roundsDone: number): number {
  if (roundsDone <= 5) return 0
  return Math.min(0.9, (roundsDone - 5) * 0.12)
}

/**
 * 转移表更新：记录玩家一次出拳（一阶 + 二阶各记一笔）。
 * @param state - 对局状态（就地更新）。
 * @param hand - 玩家本拳。
 */
export function updateMarkov(state: RpsState, hand: Hand): void {
  const h = state.history
  if (h.length >= 1) {
    const prev = h[h.length - 1]!
    const row1 = state.table1.get(prev) ?? ZERO_COUNTS()
    row1[hand]! += 1
    state.table1.set(prev, row1)
  }
  if (h.length >= 2) {
    const key = String(h[h.length - 2]!) + ':' + String(h[h.length - 1]!)
    const row2 = state.table2.get(key) ?? ZERO_COUNTS()
    row2[hand]! += 1
    state.table2.set(key, row2)
  }
  state.history.push(hand)
}

/**
 * 预测玩家下一拳：随机掷点低于学习率才启用马尔可夫，否则纯随机；
 * 二阶行样本 >=2 优先，退化到一阶行，再退化随机。行内取平滑后
 * （每拳 +0.5 伪计数）的最高频后继，平票按编号序确定性取胜。
 * @param state - 对局状态（只读）。
 * @param rand - 随机源（决定走随机还是学习分支）。
 * @returns AI 对玩家下一拳的预测。
 */
export function predictNext(state: RpsState, rand: () => number): Hand {
  if (rand() >= learningRate(state.round)) {
    return Math.floor(rand() * 3) as Hand
  }
  const h = state.history
  let row: number[] | null = null
  if (h.length >= 2) {
    const key = String(h[h.length - 2]!) + ':' + String(h[h.length - 1]!)
    const row2 = state.table2.get(key)
    if (row2 !== undefined && row2[0]! + row2[1]! + row2[2]! >= 2) row = row2
  }
  if (row === null && h.length >= 1) {
    const row1 = state.table1.get(h[h.length - 1]!)
    if (row1 !== undefined && row1[0]! + row1[1]! + row1[2]! >= 2) row = row1
  }
  if (row === null) return Math.floor(rand() * 3) as Hand
  let best = 0
  let bestValue = -1
  for (let i = 0; i < 3; i += 1) {
    const value = row[i]! + 0.5
    if (value > bestValue) { bestValue = value; best = i }
  }
  return best as Hand
}

/**
 * 连赢加成：第 n 连胜额外 +50*(n-1)，封顶 +150。
 * @param streakAfterWin - 含本轮在内的连赢数。
 */
export function streakBonus(streakAfterWin: number): number {
  if (streakAfterWin <= 1) return 0
  return Math.min(streakAfterWin - 1, 3) * 50
}

/**
 * 生成一句「说漏嘴」提示：50% 真话（声称 AI 真实的预测），50% 谎话
 * （声称另外两种拳之一）；谎话句尾带「…才怪」，真话只带「…」。
 * @param predicted - AI 对玩家下一拳的真实预测。
 * @param rand - 随机源。
 */
export function generateHint(predicted: Hand, rand: () => number): RpsHint {
  const truthful = rand() < 0.5
  const claimed = truthful
    ? predicted
    : ((predicted + 1 + Math.floor(rand() * 2)) % 3) as Hand
  return {
    text: '我觉得你接下来会出' + HAND_LABELS[claimed] + (truthful ? '…' : '…才怪'),
    truthful, claimed,
  }
}

/**
 * 打一轮：复用 pendingPrediction（提示时提前算好的承诺）或现场预测，
 * AI 出克制拳，判定胜负并计分（赢 +100+连击加成、平 +20、输 0），
 * 更新转移表与统计；每到第 3 的倍数轮且未结束，提前算好下一轮预测
 * 并生成一句提示。
 * @param state - 对局状态（就地更新）。
 * @param player - 玩家本拳。
 * @returns 本轮复盘；对局已结束时返回 null。
 */
export function playRound(state: RpsState, player: Hand): RpsRoundResult | null {
  if (state.over) return null
  const predicted = state.pendingPrediction ?? predictNext(state, state.rng)
  state.pendingPrediction = null
  const ai = counterOf(predicted)
  const outcome: Outcome = beats(player, ai) ? 'win' : player === ai ? 'draw' : 'loss'
  let gained = 0
  if (outcome === 'win') {
    state.streak += 1
    state.bestStreak = Math.max(state.bestStreak, state.streak)
    state.wins += 1
    gained = 100 + streakBonus(state.streak)
  } else if (outcome === 'draw') {
    state.streak = 0
    state.draws += 1
    gained = 20
  } else {
    state.streak = 0
    state.losses += 1
  }
  state.score += gained
  const wasRead = predicted === player
  if (wasRead) state.readCount += 1
  updateMarkov(state, player)
  state.round += 1
  state.over = state.round >= TOTAL_ROUNDS
  const result: RpsRoundResult = {
    round: state.round, player, ai, predicted, outcome, gained, wasRead,
  }
  state.last = result
  if (state.round % 3 === 0 && !state.over) {
    state.pendingPrediction = predictNext(state, state.rng)
    state.lastHint = generateHint(state.pendingPrediction, state.rng)
  } else {
    state.lastHint = null
  }
  return result
}
