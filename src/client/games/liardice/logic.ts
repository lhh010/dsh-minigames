/**
 * 吹牛骰（Liar's Dice，1v1 对 AI）纯逻辑：每方 5 颗骰暗掷
 * （mulberry32 混合局号确定性掷骰），轮流出价（数量 × 点数），新价必须
 * 严格抬高；任何一方可喊「吹牛」开骰：全场（双方）该点数骰总数（1 为
 * 万能百搭，计任意点数）≥ 报数则怀疑方输 1 颗，否则出价方输 1 颗；
 * 同一局内骰子扣完为止，输光的方输一局，下一局双方重掷 5 颗，
 * 3 局 2 胜。AI 三层策略：概率评估（己方骰已知 + 对方剩余颗数的二项
 * 分布精确尾概率）+ 诈唬层（小概率故意抬高压制）+ 抓诈层（真实概率
 * 低于阈值即开骰，阈值随局数收紧）。
 *
 * 所有操作直接修改传入 state；AI 决策随机数由 seed/局号/日志长度派生，
 * 不藏私有随机源，因此同一 seed 与同一操作序列必然得到同一状态，可
 * 脱离 DOM 直接模拟与序列化重放。
 */

/** 每方每局起始骰子数。 */
export const START_DICE = 5
/** 夺冠所需局数（3 局 2 胜）。 */
export const ROUNDS_TO_WIN = 2
/** 万能百搭点数（1 计入任意非 1 点数的报数）。 */
export const WILD_FACE = 1

/** 一次出价：count 颗 face 点。 */
export interface Bid {
  /** 报的数量（颗）。 */
  count: number
  /** 报的点数（1-6；1 只按 1 计，不为自身百搭）。 */
  face: number
}

/** 一方标识：you 玩家 / ai 电脑。 */
export type Side = 'you' | 'ai'

/** 阶段：出价中 / 一局结束 / 比赛结束。 */
export type LiarDicePhase = 'bidding' | 'roundOver' | 'matchOver'

/** 一条出价记录（prob 为出价时刻玩家视角的真实概率，用于概率色条）。 */
export interface BidEntry {
  bid: Bid
  by: Side
  /** 玩家视角（己方骰已知 + 对方剩余颗数）该价为真的概率。 */
  prob: number
  /** AI 出价是否为诈唬层触发（复盘展示）。 */
  bluff: boolean
}

/** 一次开骰记录。 */
export interface ChallengeEntry {
  /** 被质疑的出价。 */
  bid: Bid
  /** 全场该点数总数（含万能 1）。 */
  total: number
  /** 输家（怀疑失败为怀疑方，吹牛被抓为出价方）。 */
  loser: Side
  /** 全场万能 1 的颗数。 */
  wilds: number
}

/** 日志条目：出价或开骰（按时间序累积，跨局保留）。 */
export type LogEntry = ({ kind: 'bid' } & BidEntry) | ({ kind: 'challenge' } & ChallengeEntry)

/** AI 一次决策：开骰，或出价（bluff 标记诈唬层触发）。 */
export type AiDecision = { action: 'liar' } | { action: 'bid'; bid: Bid; bluff: boolean }

/** 一场比赛的完整可测状态（全部为 JSON 可序列化的纯数据）。 */
export interface LiarDiceState {
  seed: number
  /** 局号（从 1 起）。 */
  round: number
  phase: LiarDicePhase
  turn: Side
  /** 本局先出价方（奇数局你、偶数局对方）。 */
  roundStarter: Side
  /** 己方本局骰面（1-6）。 */
  yourDice: number[]
  /** 对方本局骰面（对玩家保密，仅开骰后展示）。 */
  aiDice: number[]
  /** 当前出价；开骰后清空。 */
  currentBid: Bid | null
  /** 当前出价方。 */
  bidBy: Side | null
  log: LogEntry[]
  roundWinsYou: number
  roundWinsAi: number
  /** 比赛冠军（仅 matchOver 时非 null）。 */
  matchWinner: Side | null
  /** 最近一次开骰（下一局开始时清空）。 */
  lastChallenge: ChallengeEntry | null
  message: string
}

/**
 * mulberry32 确定性伪随机数发生器。
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

/** 局号混合进种子：同 seed 不同局得到独立掷骰序列。 */
function rollSeed(seed: number, round: number): number {
  return (seed + round * 0x9e3779b9) >>> 0
}

/**
 * 掷 n 颗骰（1-6，按传入 rng 顺序生成）。
 * @param rng - 随机源。
 * @param n - 颗数。
 * @returns 骰面数组。
 */
export function rollDice(rng: () => number, n: number): number[] {
  const dice: number[] = []
  for (let i = 0; i < n; i += 1) dice.push(1 + Math.floor(rng() * 6))
  return dice
}

/**
 * 全场某点数的命中数：1 为万能百搭，计入任何非 1 点数；报 1 时只按
 * 真实 1 计（1 不为自身翻倍）。
 * @param dice - 一方的骰面数组。
 * @param face - 报的点数（1-6）。
 * @returns 该方计入百搭后的命中颗数。
 */
export function countFace(dice: readonly number[], face: number): number {
  let n = 0
  for (const v of dice) {
    if (v === face || (face !== WILD_FACE && v === WILD_FACE)) n += 1
  }
  return n
}

/**
 * 出价是否严格抬高：无当前价时任何合法价（count≥1、点数 1-6）皆可；
 * 否则须数量更多，或同数量更大点数。
 * @param cur - 当前出价（可为 null）。
 * @param next - 拟出的新价。
 */
export function isLegalRaise(cur: Bid | null, next: Bid): boolean {
  if (next.count < 1 || next.face < 1 || next.face > 6) return false
  if (cur === null) return true
  return next.count > cur.count || (next.count === cur.count && next.face > cur.face)
}

/**
 * 二项分布精确尾概率 P(X ≥ m)，X ~ B(n, p)。
 * @param n - 试验次数。
 * @param p - 单次成功概率。
 * @param m - 至少成功的次数。
 * @returns 尾概率（边界：m≤0 为 1，m>n 为 0，p 为 0/1 时退化）。
 */
export function binomialAtLeast(n: number, p: number, m: number): number {
  if (m <= 0) return 1
  if (m > n || p <= 0) return 0
  if (p >= 1) return 1
  const q = 1 - p
  let pmf = Math.pow(q, n)
  let sum = 0
  for (let i = 0; i <= n; i += 1) {
    if (i >= m) sum += pmf
    pmf = pmf * ((n - i) / (i + 1)) * (p / q)
  }
  return sum
}

/**
 * 己方视角某出价为真的概率：己方命中已知，对方 unknownCount 颗未知骰
 * 按二项分布计（每颗命中概率：报 1 为 1/6，报 2-6 为 2/6——该点或万能 1）。
 * @param knownDice - 己方骰面。
 * @param unknownCount - 对方剩余颗数。
 * @param bid - 被评估的出价。
 * @returns 全场总数 ≥ 报数的概率。
 */
export function challengeProbability(knownDice: readonly number[], unknownCount: number, bid: Bid): number {
  const known = countFace(knownDice, bid.face)
  const p = bid.face === WILD_FACE ? 1 / 6 : 2 / 6
  return binomialAtLeast(unknownCount, p, bid.count - known)
}

/** AI 抓诈阈值（按局号 1-3 收紧：概率低于阈值即开骰）。 */
export const AI_CHALLENGE_THRESHOLDS: readonly number[] = [0.38, 0.46, 0.54]
/** AI 诈唬层触发概率（决定性随机数低于它则故意抬高压制）。 */
export const AI_BLUFF_CHANCE = 0.14

/**
 * AI 派生决策随机数：由 seed、局号与日志长度混合——每口决策独立且
 * 完全可重放，无需在 state 里藏随机源。
 * @param state - 当前状态。
 * @returns [0,1) 决策随机数。
 */
export function aiRoll(state: LiarDiceState): number {
  const mixed = (state.seed ^ Math.imul(state.round, 0x9e3779b9) ^ Math.imul(state.log.length, 0x85ebca6b)) >>> 0
  return mulberry32(mixed)()
}

/**
 * AI 最优抬价：枚举各点数的最小抬价及其上两档，取己方视角为真概率
 * 最高者（平局取点数小、数量小者），确定性。
 * @param state - 当前状态。
 * @param cur - 当前出价（null 为本局首价）。
 * @returns 抬价后的出价。
 */
function bestRaise(state: LiarDiceState, cur: Bid | null): Bid {
  const total = state.yourDice.length + state.aiDice.length
  if (cur === null) {
    // 首价：报己方（含百搭 1）持有最多的点数，数量即持有数（至少 1）。
    let face = 2
    let best = -1
    for (let f = 2; f <= 6; f += 1) {
      const c = countFace(state.aiDice, f)
      if (c >= best) {
        best = c
        face = f
      }
    }
    return { count: Math.max(1, best), face }
  }
  let bestBid: Bid | null = null
  let bestProb = -1
  for (let f = 2; f <= 6; f += 1) {
    const minCount = f > cur.face ? cur.count : cur.count + 1
    for (let c = minCount; c <= minCount + 2 && c <= total; c += 1) {
      const p = challengeProbability(state.aiDice, state.yourDice.length, { count: c, face: f })
      if (p > bestProb + 1e-12) {
        bestProb = p
        bestBid = { count: c, face: f }
      }
    }
  }
  return bestBid ?? { count: cur.count + 1, face: Math.max(2, cur.face) }
}

/**
 * AI 诈唬抬价：同点数硬加一颗（点数为 1 时改报 2），必为合法抬升。
 * @param cur - 当前出价。
 */
function aggressiveRaise(cur: Bid): Bid {
  return { count: cur.count + 1, face: Math.max(2, cur.face) }
}

/**
 * AI 三层决策（纯函数，不修改状态）：无当前价必开价；真实概率低于
 * 本局抓诈阈值则开骰；否则小概率诈唬抬价，或按概率评估抬最优价。
 * @param state - 当前状态。
 * @param roll - 决策随机数（见 aiRoll）。
 * @returns 开骰或出价决策。
 */
export function aiDecide(state: LiarDiceState, roll: number): AiDecision {
  const cur = state.currentBid
  if (cur === null) return { action: 'bid', bid: bestRaise(state, null), bluff: false }
  const prob = challengeProbability(state.aiDice, state.yourDice.length, cur)
  const threshold = AI_CHALLENGE_THRESHOLDS[Math.min(state.round - 1, AI_CHALLENGE_THRESHOLDS.length - 1)]!
  if (prob < threshold) return { action: 'liar' }
  if (roll < AI_BLUFF_CHANCE) return { action: 'bid', bid: aggressiveRaise(cur), bluff: true }
  return { action: 'bid', bid: bestRaise(state, cur), bluff: false }
}

/**
 * 开新比赛：第 1 局、双方各掷 5 颗、你先出价。
 * @param seed - 基础种子。
 */
export function createLiarDice(seed: number): LiarDiceState {
  const rng = mulberry32(rollSeed(seed, 1))
  const state: LiarDiceState = {
    seed,
    round: 1,
    phase: 'bidding',
    turn: 'you',
    roundStarter: 'you',
    yourDice: [],
    aiDice: [],
    currentBid: null,
    bidBy: null,
    log: [],
    roundWinsYou: 0,
    roundWinsAi: 0,
    matchWinner: null,
    lastChallenge: null,
    message: '第 1 局 · 你先出价',
  }
  state.yourDice = rollDice(rng, START_DICE)
  state.aiDice = rollDice(rng, START_DICE)
  return state
}

/**
 * 玩家视角的出价可信度（概率条）：己方骰已知 + 对方剩余颗数未知。
 * @param state - 当前状态。
 * @param bid - 被评估的出价。
 */
export function bidCredibility(state: LiarDiceState, bid: Bid): number {
  return challengeProbability(state.yourDice, state.aiDice.length, bid)
}

/**
 * 玩家出价：校验回合与严格抬升，记入日志（含玩家视角概率）并把回合
 * 交给对方。
 * @param state - 当前状态。
 * @param count - 报的数量。
 * @param face - 报的点数。
 * @returns 非法（回合不对/参数非法/未严格抬高）为 false。
 */
export function playerBid(state: LiarDiceState, count: number, face: number): boolean {
  if (state.phase !== 'bidding' || state.turn !== 'you') return false
  if (!Number.isInteger(count) || !Number.isInteger(face)) return false
  const next: Bid = { count, face }
  if (!isLegalRaise(state.currentBid, next)) {
    state.message = '出价必须严格抬高'
    return false
  }
  state.currentBid = next
  state.bidBy = 'you'
  state.log.push({ kind: 'bid', bid: next, by: 'you', prob: bidCredibility(state, next), bluff: false })
  state.turn = 'ai'
  state.message = '对方思考中…'
  return true
}

/**
 * 开骰结算（内部共用）：计全场命中（含万能 1），报数成立则怀疑方输
 * 1 颗、否则出价方输 1 颗；输家先出下一口价；骰子输光即输一局，
 * 先取 2 局者胜。
 * @param state - 当前状态。
 * @param caller - 喊吹牛的一方。
 */
function applyChallenge(state: LiarDiceState, caller: Side): void {
  const bid = state.currentBid
  if (bid === null || state.bidBy === null) return
  const total = countFace(state.yourDice, bid.face) + countFace(state.aiDice, bid.face)
  const truthful = total >= bid.count
  const bidder = state.bidBy
  const loser = truthful ? caller : bidder
  const wilds = countFace(state.yourDice, WILD_FACE) + countFace(state.aiDice, WILD_FACE)
  if (loser === 'you') state.yourDice.pop()
  else state.aiDice.pop()
  const entry: ChallengeEntry = { bid, total, loser, wilds }
  state.log.push({ kind: 'challenge', ...entry })
  state.lastChallenge = entry
  state.currentBid = null
  state.bidBy = null
  const loserDice = loser === 'you' ? state.yourDice.length : state.aiDice.length
  if (loserDice === 0) {
    const winner: Side = loser === 'you' ? 'ai' : 'you'
    if (winner === 'you') state.roundWinsYou += 1
    else state.roundWinsAi += 1
    if (state.roundWinsYou >= ROUNDS_TO_WIN || state.roundWinsAi >= ROUNDS_TO_WIN) {
      state.phase = 'matchOver'
      state.matchWinner = winner
      state.message = winner === 'you' ? '比赛胜利！R 重开' : '比赛失利 · R 重开'
    } else {
      state.phase = 'roundOver'
      state.message = (winner === 'you' ? '你拿下本局' : '对方拿下本局') + ' · Enter 下一局'
    }
    state.turn = winner
    return
  }
  state.turn = loser
  const callerName = caller === 'you' ? '你' : '对方'
  const loserName = loser === 'you' ? '你' : '对方'
  state.message = truthful
    ? '开骰：报数成立，' + callerName + '输 1 颗'
    : '开骰：吹牛被抓，' + loserName + '输 1 颗'
}

/**
 * 玩家喊吹牛：对对方的当前出价开骰并结算。
 * @param state - 当前状态。
 * @returns 条件不满足（非你回合/无可质疑出价）为 false。
 */
export function playerCallLiar(state: LiarDiceState): boolean {
  if (state.phase !== 'bidding' || state.turn !== 'you') return false
  if (state.currentBid === null || state.bidBy !== 'ai') return false
  applyChallenge(state, 'you')
  return true
}

/**
 * AI 行动：按 aiRoll 派生的随机数做三层决策并落子（开骰或出价）。
 * @param state - 当前状态。
 * @returns 所执行的决策；非对方回合返回 null。
 */
export function aiTurn(state: LiarDiceState): AiDecision | null {
  if (state.phase !== 'bidding' || state.turn !== 'ai') return null
  const decision = aiDecide(state, aiRoll(state))
  if (decision.action === 'liar') {
    applyChallenge(state, 'ai')
    return decision
  }
  state.currentBid = decision.bid
  state.bidBy = 'ai'
  state.log.push({ kind: 'bid', bid: decision.bid, by: 'ai', prob: bidCredibility(state, decision.bid), bluff: decision.bluff })
  state.turn = 'you'
  state.message = '对方出价 ' + decision.bid.count + ' × ' + decision.bid.face + ' · 抬价或叫吹牛'
  return decision
}

/**
 * 开下一局：双方重掷 5 颗、先出价方交替、清当前价与开骰记录。
 * @param state - 当前状态。
 * @returns 非一局结束阶段为 false。
 */
export function startNextRound(state: LiarDiceState): boolean {
  if (state.phase !== 'roundOver') return false
  state.round += 1
  state.roundStarter = state.round % 2 === 1 ? 'you' : 'ai'
  const rng = mulberry32(rollSeed(state.seed, state.round))
  state.yourDice = rollDice(rng, START_DICE)
  state.aiDice = rollDice(rng, START_DICE)
  state.currentBid = null
  state.bidBy = null
  state.lastChallenge = null
  state.turn = state.roundStarter
  state.phase = 'bidding'
  state.message = '第 ' + state.round + ' 局 · ' + (state.turn === 'you' ? '你先出价' : '对方先出价')
  return true
}

/**
 * 序列化整场比赛状态（纯 JSON，含骰面与日志）。
 * @param state - 当前状态。
 */
export function serializeState(state: LiarDiceState): string {
  return JSON.stringify(state)
}

/**
 * 反序列化状态：与 serializeState 互逆，用于克隆与重放。
 * @param json - serializeState 的输出。
 * @returns 重建的状态。
 */
export function deserializeState(json: string): LiarDiceState {
  return JSON.parse(json) as LiarDiceState
}
