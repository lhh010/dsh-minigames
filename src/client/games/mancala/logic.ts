/**
 * 播棋（Kalaha 4×2 棋制）纯规则模块：棋盘 14 槽——索引 0-5 为玩家（下排）
 * 六坑、6 为玩家粮仓、7-12 为 AI（上排）六坑、13 为 AI 粮仓。逆时针播种序
 * 即 0→1→…→6→7→…→13→0，播种方跳过对侧粮仓。全部函数为纯函数，随机性
 * 一律经注入的 mulberry32 种子发生器，保证对局可确定性重放。
 */

/** 每侧坑数。 */
export const PIT_COUNT = 6
/** 每坑初始籽数。 */
export const INITIAL_SEEDS = 4
/** 玩家粮仓索引。 */
export const PLAYER_STORE = 6
/** AI 粮仓索引。 */
export const AI_STORE = 13

/** 执子一方：human=玩家（下排），ai=AI（上排）。 */
export type Side = 'human' | 'ai'
/** 终局胜者：draw=平局，null=未终局。 */
export type Winner = 'human' | 'ai' | 'draw' | null

/** 一局盘面状态。 */
export interface MancalaState {
  /** 14 槽籽数（两排坑 + 两端粮仓）。 */
  pits: number[]
  /** 当前执子方。 */
  turn: Side
  /** 是否已终局（含收割）。 */
  finished: boolean
  /** 终局胜者，未终局为 null。 */
  winner: Winner
}

/** applyMove 的完整结果，供动画与测试观测。 */
export interface MoveResult {
  state: MancalaState
  /** 播种路径（逐籽落点索引顺序，绕圈会出现重复索引）。 */
  path: number[]
  /** 最后一籽落点索引。 */
  lastLand: number
  /** 最后一籽落己方粮仓：获得再走一次。 */
  extraTurn: boolean
  /** 是否触发吃子（落点籽 + 对侧全部入己方粮仓）。 */
  captured: boolean
  /** 吃子入仓总籽数（未吃为 0）。 */
  capturedCount: number
}

/** 某方的粮仓索引。
 * @param side - 执子方。
 * @returns 粮仓槽索引（6 或 13）。
 */
export function storeOf(side: Side): number {
  return side === 'human' ? PLAYER_STORE : AI_STORE
}

/** 某方六个坑的索引列表（human: 0-5，ai: 7-12）。
 * @param side - 执子方。
 * @returns 坑索引数组。
 */
export function ownPits(side: Side): number[] {
  return side === 'human' ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]
}

/** 槽是否属于某方的坑（非粮仓）。
 * @param side - 执子方。
 * @param index - 槽索引。
 * @returns 属于该方六坑之一时为 true。
 */
export function isOwnPit(side: Side, index: number): boolean {
  return side === 'human' ? index >= 0 && index <= 5 : index >= 7 && index <= 12
}

/** 坑的对侧坑索引（0↔12、1↔11、…、5↔7）。
 * @param index - 己方坑索引（0-5 或 7-12）。
 * @returns 对侧坑索引。
 */
export function opposite(index: number): number {
  return 12 - index
}

/** 初始盘面：两排各 6 坑每坑 4 籽，粮仓为空，玩家先行。
 * @returns 初始状态。
 */
export function createMancala(): MancalaState {
  return {
    pits: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0],
    turn: 'human',
    finished: false,
    winner: null,
  }
}

/** 当前执子方的合法走法（己方非空坑）。
 * @param state - 盘面状态。
 * @returns 合法坑索引升序列表；终局为空数组。
 */
export function legalMoves(state: MancalaState): number[] {
  if (state.finished) return []
  return ownPits(state.turn).filter(i => state.pits[i]! > 0)
}

/** 播种序中的下一槽：越过对侧粮仓（human 跳过 13，ai 跳过 6）。
 * @param index - 当前槽索引。
 * @param side - 播种方。
 * @returns 下一槽索引。
 */
export function nextSlot(index: number, side: Side): number {
  const next = index + 1
  if (next > 13) return 0
  const skip = side === 'human' ? AI_STORE : PLAYER_STORE
  return next === skip ? (next + 1 > 13 ? 0 : next + 1) : next
}

/** 收割终局：任一方六坑全空时，对侧剩余籽全入其粮仓并判定胜负。
 * @param pits - 待收割的 14 槽籽数（原地修改）。
 * @returns 胜者（'human' | 'ai' | 'draw'）；未触发收割返回 null。
 */
export function finishSweep(pits: number[]): Winner {
  const humanEmpty = ownPits('human').every(i => pits[i] === 0)
  const aiEmpty = ownPits('ai').every(i => pits[i] === 0)
  if (!humanEmpty && !aiEmpty) return null
  for (const side of ['human', 'ai'] as const) {
    if (!ownPits(side).every(i => pits[i] === 0)) {
      let rest = 0
      for (const i of ownPits(side)) {
        rest += pits[i]!
        pits[i] = 0
      }
      pits[storeOf(side)]! += rest
    }
  }
  const h = pits[PLAYER_STORE]!
  const a = pits[AI_STORE]!
  return h > a ? 'human' : a > h ? 'ai' : 'draw'
}

/** 执行一步走子：捡起己方坑全部籽逆时针逐坑播种，处理再走、吃子与终局收割。
 * 非法走法（终局、非己方坑、空坑）返回 null。
 * @param state - 走子前状态。
 * @param pit - 己方坑索引。
 * @returns 走子结果，非法时为 null。
 */
export function applyMove(state: MancalaState, pit: number): MoveResult | null {
  if (state.finished) return null
  if (!isOwnPit(state.turn, pit)) return null
  const seeds = state.pits[pit]!
  if (seeds === 0) return null

  const pits = [...state.pits]
  const side = state.turn
  pits[pit] = 0
  const path: number[] = []
  let idx = pit
  for (let s = 0; s < seeds; s += 1) {
    idx = nextSlot(idx, side)
    pits[idx]! += 1
    path.push(idx)
  }
  const lastLand = idx
  const extraTurn = idx === storeOf(side)
  let captured = false
  let capturedCount = 0
  if (!extraTurn && isOwnPit(side, idx) && pits[idx] === 1) {
    const opp = opposite(idx)
    if (pits[opp]! > 0) {
      capturedCount = 1 + pits[opp]!
      pits[opp] = 0
      pits[idx] = 0
      pits[storeOf(side)]! += capturedCount
      captured = true
    }
  }
  const winner = finishSweep(pits)
  const finished = winner !== null
  const next: MancalaState = {
    pits,
    turn: finished ? side : (extraTurn ? side : (side === 'human' ? 'ai' : 'human')),
    finished,
    winner,
  }
  return { state: next, path, lastLand, extraTurn, captured, capturedCount }
}

/** mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 对局面后 AI 的即时最大吃子威胁（用于暴露惩罚）。
 * @param state - AI 走完后的局面（human 执子）。
 * @returns human 一步内可得的最大入仓籽数。
 */
function humanThreat(state: MancalaState): number {
  let best = 0
  for (const pit of legalMoves(state)) {
    const res = applyMove(state, pit)
    if (res === null) continue
    const gain = res.state.pits[PLAYER_STORE]! - state.pits[PLAYER_STORE]!
    if (gain > best) best = gain
  }
  return best
}

/** 递归评估一步 AI 走法（连走链最多追 3 层）。
 * @param state - 局面。
 * @param rng - 噪声随机源。
 * @param depth - 剩余连走搜索层。
 * @param noise - 噪声幅度。
 * @param threatW - 暴露惩罚权重。
 * @returns 该走法评分。
 */
function scoreMove(state: MancalaState, rng: () => number, depth: number, noise: number, threatW: number): number {
  const moves = legalMoves(state)
  if (moves.length === 0 || depth <= 0) return 0
  let best = -Infinity
  for (const pit of moves) {
    const res = applyMove(state, pit)
    if (res === null) continue
    const gain = res.state.pits[AI_STORE]! - state.pits[AI_STORE]!
    let score = gain
    if (res.extraTurn && !res.state.finished) {
      score += scoreMove(res.state, rng, depth - 1, noise, threatW)
    } else if (!res.state.finished) {
      score -= humanThreat(res.state) * threatW
    }
    if (res.state.finished) {
      if (res.state.winner === 'ai') score += 24
      else if (res.state.winner === 'human') score -= 24
    }
    score += rng() * noise
    if (score > best) best = score
  }
  return best === -Infinity ? 0 : best
}

/** AI 选步：贪心 + 一层展望（连走链、吃子、避免暴露），难度越高噪声越小、
 * 暴露惩罚越重。同种子同局面结果确定。
 * @param state - 当前局面（应为 AI 执子）。
 * @param difficulty - 难度 0-2（随局数递增）。
 * @param rng - 注入的 mulberry32 随机源。
 * @returns 选中的坑索引；无合法走法为 -1。
 */
export function chooseAiMove(state: MancalaState, difficulty: number, rng: () => number): number {
  const moves = legalMoves(state)
  if (moves.length === 0) return -1
  const level = difficulty < 0 ? 0 : difficulty > 2 ? 2 : difficulty
  const noise = [2.5, 1.0, 0.25][level]!
  const threatW = [0.25, 0.55, 0.85][level]!
  let bestPit = -1
  let bestScore = -Infinity
  for (const pit of moves) {
    const res = applyMove(state, pit)
    if (res === null) continue
    let score = res.state.pits[AI_STORE]! - state.pits[AI_STORE]!
    if (res.extraTurn && !res.state.finished) {
      score += scoreMove(res.state, rng, 2, noise, threatW)
    } else if (!res.state.finished) {
      score -= humanThreat(res.state) * threatW
    }
    if (res.state.finished) {
      if (res.state.winner === 'ai') score += 24
      else if (res.state.winner === 'human') score -= 24
    }
    score += rng() * noise
    if (score > bestScore) {
      bestScore = score
      bestPit = pit
    }
  }
  return bestPit
}
