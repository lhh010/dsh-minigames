/**
 * 飞镖 501 纯逻辑：标准 20 分区镖盘（双倍环 / 三倍环 / 内外靶心），
 * 玩家与可选 AI 从 501 分逐镖扣减。落点判定按「极径 → 环型、极角 →
 * 分区」完成；恰好归零且最后一镖命中双倍环或红心（50）才算结账获胜；
 * 扣成负数、归零但末镖非双倍、或恰好剩 1 分即为爆分（bust），本 turn
 * 分数回退到回合起点并交出投掷权。所有随机（漂移相位、AI 抖动）都来自
 * 注入的 mulberry32 种子，同种子序列完全确定、可测。
 */

/** 逻辑画布宽度（渲染与逻辑共用坐标系）。 */
export const LOGICAL_W = 480
/** 逻辑画布高度。 */
export const LOGICAL_H = 340
/** 镖盘半径（逻辑像素）。 */
export const BOARD_R = 138

/** 标准分区顺序：从正上方顺时针开始的 20 个扇区分值。 */
export const SECTORS: readonly number[] = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
]

/** 各环半径（镖盘半径倍率，取标准镖盘 170mm 归一化）。 */
export const DOUBLE_OUTER = 1
export const DOUBLE_INNER = 162 / 170
export const TRIPLE_OUTER = 107 / 170
export const TRIPLE_INNER = 99 / 170
export const BULL_OUTER = 15.9 / 170
export const BULL_INNER = 6.35 / 170

/** 起始分数与赛制。 */
export const START_SCORE = 501
export const DARTS_PER_TURN = 3
export const MAX_ROUNDS = 5

/** 手抖漂移幅度（镖盘半径倍率）：两路正弦叠加的类 perlin 游走。 */
export const DRIFT_AMPL = 0.05

/** 落点环型。 */
export type Ring = 'miss' | 'single' | 'double' | 'triple' | 'bull25' | 'bull50'

/** 一次投掷的判定结果（坐标为相对盘心的镖盘半径倍率单位）。 */
export interface ThrowResult {
  x: number
  y: number
  /** 命中分区分值（1-20；靶心为 25/50，脱靶为 0）。 */
  sector: number
  ring: Ring
  /** 本镖得分（分区 × 环倍率或靶心分）。 */
  points: number
  bust: boolean
  checkout: boolean
}

/** 一方的计分状态。 */
interface PlayerScore {
  /** 当前剩余（501 逐镖扣减）。 */
  remaining: number
  /** 本 turn 开始时的剩余（bust 回退基准）。 */
  turnStart: number
}

/** 飞镖对局状态（可变对象 + 注入 rng，纯函数操作）。 */
export interface DartsState {
  seed: number
  rng: () => number
  vsAI: boolean
  /** 漂移相位（创建时由种子派生，driftAt 只读）。 */
  driftPhase: [number, number, number, number]
  /** 当前轮次（human 回合计数，1 起）。 */
  round: number
  turn: 'human' | 'ai'
  human: PlayerScore
  ai: PlayerScore
  /** 本 turn 已投镖数。 */
  dartIndex: number
  /** 本 turn 的落点标记（渲染用，turn 开始时清空）。 */
  marks: { x: number; y: number; player: 'human' | 'ai' }[]
  /** 最近一镖判定（HUD 显示）。 */
  lastResult: ThrowResult | null
  /** 最近一次爆分提示（渲染高亮，新 turn 清除）。 */
  lastBust: boolean
  winner: null | 'human' | 'ai' | 'draw'
}

/** mulberry32：注入用确定性伪随机源。
 * @param seed - 32 位种子。
 * @returns 返回 0..1 随机数的函数。
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

/** 判定相对盘心一点的分区与环型。
 * @param dx - 相对盘心 x（镖盘半径倍率，x 向右、y 向上为正）。
 * @param dy - 相对盘心 y。
 * @returns 分区分值、环型与得分。
 */
export function scoreAt(dx: number, dy: number): { sector: number; ring: Ring; points: number } {
  const r = Math.hypot(dx, dy)
  if (r > DOUBLE_OUTER) return { sector: 0, ring: 'miss', points: 0 }
  if (r <= BULL_INNER) return { sector: 50, ring: 'bull50', points: 50 }
  if (r <= BULL_OUTER) return { sector: 25, ring: 'bull25', points: 25 }
  // 极角：从正上方顺时针，归一到 [0, 2π)。
  let a = Math.atan2(dx, -dy)
  if (a < 0) a += Math.PI * 2
  const sectorAngle = Math.PI * 2 / SECTORS.length
  const idx = Math.floor((a + sectorAngle / 2) / sectorAngle) % SECTORS.length
  const sector = SECTORS[idx]!
  if (r >= DOUBLE_INNER) return { sector, ring: 'double', points: sector * 2 }
  if (r >= TRIPLE_INNER && r <= TRIPLE_OUTER) return { sector, ring: 'triple', points: sector * 3 }
  return { sector, ring: 'single', points: sector }
}

/** 手抖漂移向量（类 perlin：两路不同频率正弦叠加，相位来自种子）。
 * @param state - 对局状态（只读 driftPhase）。
 * @param t - 时间秒。
 * @returns 漂移偏移（镖盘半径倍率单位）。
 */
export function driftAt(state: DartsState, t: number): { dx: number; dy: number } {
  const [p0, p1, p2, p3] = state.driftPhase
  const dx = DRIFT_AMPL * (Math.sin(t * 1.7 + p0) * 0.6 + Math.sin(t * 3.1 + p1) * 0.4)
  const dy = DRIFT_AMPL * (Math.sin(t * 2.3 + p2) * 0.6 + Math.sin(t * 4.7 + p3) * 0.4)
  return { dx, dy }
}

/** 新对局：双方 501，human 先手，第 1 轮。
 * @param seed - 随机种子（漂移相位与 AI 用）。
 * @param vsAI - true 时对手为简单 AI。
 * @returns 初始状态。
 */
export function createDartsState(seed: number, vsAI: boolean): DartsState {
  const rng = mulberry32(seed)
  const phase: [number, number, number, number] = [
    rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2,
  ]
  return {
    seed, rng, vsAI, driftPhase: phase,
    round: 1, turn: 'human',
    human: { remaining: START_SCORE, turnStart: START_SCORE },
    ai: { remaining: START_SCORE, turnStart: START_SCORE },
    dartIndex: 0, marks: [], lastResult: null, lastBust: false, winner: null,
  }
}

/** 常用结账（checkout）路线提示表：剩余 ≤170 时的标准三镖/两镖收法。 */
const CHECKOUT_TABLE: Record<number, string> = {
  170: 'T20 T20 红心', 167: 'T20 T19 红心', 164: 'T20 T18 红心', 161: 'T20 T17 红心',
  160: 'T20 T20 D20', 158: 'T20 T20 D19', 157: 'T20 T19 D20', 156: 'T20 T20 D18',
  155: 'T20 T19 D19', 154: 'T20 T18 D20', 153: 'T20 T19 D18', 152: 'T20 T16 D20',
  151: 'T20 T17 D20', 150: 'T20 T18 D18', 149: 'T20 T19 D16', 148: 'T20 T16 D20',
  141: 'T20 T15 D18', 140: 'T20 T20 D10', 137: 'T20 T19 D11', 136: 'T20 T20 D8',
  132: 'T20 T16 D12', 130: 'T20 T20 D5', 128: 'T18 T14 D16', 126: 'T19 T19 D6',
  125: '25 T20 D20', 121: 'T20 T11 D14', 118: 'T20 T18 D2', 117: 'T20 S19 D20',
  114: 'T20 S18 D20', 111: 'T20 S19 D17', 110: 'T20 S18 D17', 107: 'T19 S18 D16',
  104: 'T18 S18 D16', 101: 'T17 S16 D18', 100: 'T20 D20', 98: 'T20 D19',
  96: 'T20 D18', 90: 'T20 D15', 85: 'T19 D14', 81: 'T19 D12', 77: 'T19 D10',
  73: 'T19 D8', 69: 'T19 D6', 65: '25 D20', 60: 'T20', 57: 'S17 D20',
  54: 'S14 D20', 51: 'S11 D20', 48: 'S16 D16', 45: 'S13 D16', 42: 'S10 D16',
  39: 'S7 D16', 36: 'D18', 34: 'D17', 33: 'S1 D16', 30: 'D15', 28: 'D14',
  26: 'D13', 24: 'D12', 22: 'D11', 20: 'D10', 18: 'D9', 16: 'D8', 12: 'D6',
  10: 'D5', 8: 'D4', 6: 'D3', 4: 'D2', 2: 'D1',
}

/** 剩余分结账建议；无法一 turn 结账（>170 或著名的不可结算分）返回 null。
 * @param remaining - 当前剩余分。
 * @returns 建议路线文本，或 null。
 */
export function checkoutHint(remaining: number): string | null {
  if (remaining > 170 || remaining < 2) return null
  if (remaining === 50) return '红心'
  if (remaining <= 40 && remaining % 2 === 0) return 'D' + (remaining / 2).toString()
  const hit = CHECKOUT_TABLE[remaining]
  return hit !== undefined ? hit : null
}

/** 按剩余分选择 AI 瞄准点（偏好双倍收尾，其余在 T20 / 大分区里随机）。
 * @param remaining - AI 当前剩余分。
 * @param rng - 注入随机源。
 * @returns 瞄准点（镖盘半径倍率单位）。
 */
export function aiAim(remaining: number, rng: () => number): { x: number; y: number } {
  if (remaining === 50) return { x: 0, y: 0 }
  if (remaining % 2 === 0 && remaining / 2 >= 2 && remaining / 2 <= 20) {
    return sectorPoint(remaining / 2, 'double')
  }
  const pick = rng()
  if (pick < 0.55) return sectorPoint(20, 'triple')
  if (pick < 0.85) return sectorPoint(20, 'single')
  return sectorPoint(SECTORS[Math.floor(rng() * SECTORS.length)]!, 'single')
}

/** 某分区某环中心点坐标。
 * @param sector - 分区分值（2-20 须为整数分值；双倍收尾用 sector = 目标/2）。
 * @param ring - 环型。
 * @returns 瞄准点坐标。
 */
export function sectorPoint(sector: number, ring: 'single' | 'double' | 'triple'): { x: number; y: number } {
  const idx = SECTORS.indexOf(sector)
  const a = (idx < 0 ? 0 : idx) * Math.PI * 2 / SECTORS.length
  let r = (TRIPLE_OUTER + DOUBLE_INNER) / 2
  if (ring === 'double') r = (DOUBLE_INNER + DOUBLE_OUTER) / 2
  if (ring === 'triple') r = (TRIPLE_INNER + TRIPLE_OUTER) / 2
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r }
}

/** 把一镖判定应用到计分（501 规则：结账 / 爆分 / 普通扣减）。 */
function applyThrow(state: DartsState, player: PlayerScore, who: 'human' | 'ai', res: ThrowResult): void {
  const next = player.remaining - res.points
  const isDoubleOut = res.ring === 'double' || res.ring === 'bull50'
  res.checkout = next === 0 && isDoubleOut
  res.bust = next < 0 || (next === 0 && !isDoubleOut) || next === 1
  state.lastResult = res
  state.marks.push({ x: res.x, y: res.y, player: who })
  if (res.checkout) {
    player.remaining = 0
    state.winner = who
    state.lastBust = false
    return
  }
  if (res.bust) {
    player.remaining = player.turnStart
    state.lastBust = true
    endTurn(state, who)
    return
  }
  player.remaining = next
  state.lastBust = false
  state.dartIndex += 1
  if (state.dartIndex >= DARTS_PER_TURN) endTurn(state, who)
}

/** turn 结束：清标记、换手（或进入下一轮），满 5 轮按剩余分定胜负。 */
function endTurn(state: DartsState, who: 'human' | 'ai'): void {
  state.dartIndex = 0
  if (!state.vsAI) {
    nextHumanRound(state)
    return
  }
  if (who === 'human') {
    state.turn = 'ai'
    state.ai.turnStart = state.ai.remaining
    // 标记不清：展示窗口里玩家还要看自己第三镖的落点——AI 开投前
    // 由 runAiTurn 开头清（原先这里立即清导致第三镖瞬间消失）。
  } else {
    state.turn = 'human'
    nextHumanRound(state)
  }
}

/** 进入 human 的下一轮；超出赛制回合数则结算整场。 */
function nextHumanRound(state: DartsState): void {
  state.marks = []
  if (state.round >= MAX_ROUNDS) {
    settleByRemaining(state)
    return
  }
  state.round += 1
  state.turn = 'human'
  state.human.turnStart = state.human.remaining
  state.lastBust = false
}

/** 5 轮打满无人结账：剩余分低者胜，平则为平局。 */
function settleByRemaining(state: DartsState): void {
  state.winner = state.human.remaining < state.ai.remaining
    ? 'human'
    : state.ai.remaining < state.human.remaining ? 'ai' : 'draw'
}

/** 玩家投一镖：落点 = 瞄准点 + 手抖漂移（同种子同时间完全确定）。
 * @param state - 对局状态。
 * @param aimX - 瞄准点 x（镖盘半径倍率单位）。
 * @param aimY - 瞄准点 y。
 * @param t - 当前时间秒（驱动漂移）。
 * @returns 本镖判定；非玩家 turn 或对局已结束时返回 null。
 */
export function throwDart(state: DartsState, aimX: number, aimY: number, t: number): ThrowResult | null {
  if (state.winner !== null || state.turn !== 'human') return null
  const d = driftAt(state, t)
  const x = aimX + d.dx
  const y = aimY + d.dy
  const hit = scoreAt(x, y)
  const res: ThrowResult = {
    x, y, sector: hit.sector, ring: hit.ring, points: hit.points,
    bust: false, checkout: false,
  }
  applyThrow(state, state.human, 'human', res)
  return res
}

/** AI 连投一整个 turn（最多三镖，遇爆分 / 结账提前停）。
 * @param state - 对局状态（须处于 ai turn）。
 * @returns 本 turn 各镖判定。
 */
export function runAiTurn(state: DartsState): ThrowResult[] {
  if (state.winner !== null || state.turn !== 'ai') return []
  // AI 开始投掷时才清玩家标记（endTurn 不再清——给第三镖留展示窗口）。
  state.marks = []
  const out: ThrowResult[] = []
  while (state.turn === 'ai' && state.winner === null) {
    const aim = aiAim(state.ai.remaining, state.rng)
    const t = state.rng() * 1000
    const d = driftAt(state, t)
    // 近似高斯抖动：三次均匀采样求和归一。
    const jx = (state.rng() + state.rng() + state.rng() - 1.5) / 1.5 * 0.09
    const jy = (state.rng() + state.rng() + state.rng() - 1.5) / 1.5 * 0.09
    const x = aim.x + d.dx + jx
    const y = aim.y + d.dy + jy
    const hit = scoreAt(x, y)
    const res: ThrowResult = {
      x, y, sector: hit.sector, ring: hit.ring, points: hit.points,
      bust: false, checkout: false,
    }
    applyThrow(state, state.ai, 'ai', res)
    out.push(res)
  }
  return out
}
