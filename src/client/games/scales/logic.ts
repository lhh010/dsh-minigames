/**
 * 天平称重 Scales 纯逻辑：假币称重经典谜题的确定性核心。N 枚硬币中有
 * 一枚假币（偏轻或偏重未知，由注入 seed 决定）；玩家每次任选两组等数
 * 硬币上天平得到三态结果（左重/右重/平衡），称量次数用尽后指认假币及
 * 轻重。全部函数为纯函数（返回新状态、不改入参）；唯一随机源是
 * mulberry32(seed)，同种子同局面，确定性可测。
 */

/** 一次称量的三态结果：左盘重 / 右盘重 / 平衡。 */
export type WeighResult = 'left' | 'right' | 'balance'

/** 一关的静态参数。 */
export interface ScalesLevelDef {
  /** 硬币总数（第 5 关为 0，由注入 rng 在 9-15 中决定）。 */
  coins: number
  /** 允许的称量次数。 */
  weighings: number
  /** 是否默认开启推理助手（关 4 起关闭）。 */
  assistant: boolean
  /** 时间限制（秒），null 为不限时。 */
  timeLimitSec: number | null
}

/**
 * 五关递进表：12 枚 3 次（经典）→ 8 枚 2 次 → 13 枚 3 次（多一枚可能
 * 不用上秤）→ 硬模式（无助手 + 180 秒限时）→ 挑战（rng 取 9-15 枚，
 * 次数按信息论下限 minWeighings 现场计算）。
 */
export const LEVELS: readonly ScalesLevelDef[] = [
  { coins: 12, weighings: 3, assistant: true, timeLimitSec: null },
  { coins: 8, weighings: 2, assistant: true, timeLimitSec: null },
  { coins: 13, weighings: 3, assistant: true, timeLimitSec: null },
  { coins: 12, weighings: 3, assistant: false, timeLimitSec: 180 },
  { coins: 0, weighings: 0, assistant: false, timeLimitSec: null },
]

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
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
 * 信息论下限次数：N 枚硬币有 2N 种（哪枚 × 轻重）可能，每次称量最多
 * 区分三种结果，故需最小的 k 使 3^k ≥ 2N。
 * @param coins - 硬币总数（≥1）。
 * @returns 最少称量次数下限。
 */
export function minWeighings(coins: number): number {
  let k = 1
  let outcomes = 3
  while (outcomes < coins * 2) {
    k += 1
    outcomes *= 3
  }
  return k
}

/**
 * 解析一关的最终参数：第 5 关用 rng 取 9-15 枚并按 minWeighings 定次
 * 数，其余关按表返回（关卡号越界钳制到末关）。
 * @param level - 关卡号（1 起）。
 * @param rng - [0,1) 随机源（mulberry32 等）；仅第 5 关使用。
 * @returns 该关参数。
 */
export function levelParams(level: number, rng?: () => number): ScalesLevelDef {
  const idx = Math.min(Math.max(level, 1), LEVELS.length) - 1
  const def = LEVELS[idx]!
  if (def.coins > 0) return def
  const coins = 9 + Math.floor((rng?.() ?? 0.5) * 7)
  return { coins, weighings: minWeighings(coins), assistant: def.assistant, timeLimitSec: def.timeLimitSec }
}

/** 假币布置（谜底）：哪一枚（0 起下标）+ 是否偏重。 */
export interface FakeSetup {
  coin: number
  heavy: boolean
}

/** 一次已完成的称量：左右盘硬币下标 + 结果。 */
export interface Weighing {
  left: number[]
  right: number[]
  result: WeighResult
}

/** 游戏状态：不可变，weigh/accuse/expire 返回新对象。 */
export interface ScalesState {
  /** 当前关卡（1 起）。 */
  level: number
  /** 本关参数（含硬币数与次数上限）。 */
  params: ScalesLevelDef
  /** 本关种子（同种子可完整重放）。 */
  seed: number
  /** 谜底布置。 */
  setup: FakeSetup
  /** 已完成的称量（按时间序）。 */
  history: Weighing[]
  /** 进行中 / 指认正确 / 失败。 */
  status: 'playing' | 'won' | 'lost'
  /** 失败原因：指认错误或超时；进行中/过关为 null。 */
  lostReason: 'wrong' | 'timeout' | null
}

/**
 * 建立第 level 关的初始局面：seed 经 mulberry32 决定硬币数（仅第 5
 * 关）、假币位置与轻重。
 * @param level - 关卡号（1 起，越界钳制）。
 * @param seed - 非负整数种子。
 * @returns playing 状态的初始局面。
 */
export function createScalesState(level: number, seed: number): ScalesState {
  const rng = mulberry32(seed)
  const params = levelParams(level, rng)
  const coin = Math.floor(rng() * params.coins)
  const heavy = rng() < 0.5
  return {
    level: Math.min(Math.max(level, 1), LEVELS.length),
    params,
    seed,
    setup: { coin, heavy },
    history: [],
    status: 'playing',
    lostReason: null,
  }
}

/**
 * 应用一次称量：校验两侧等数、各至少一枚、互不相交、下标合法且尚有
 * 次数，再按谜底给出三态结果并记入历史。
 * @param state - 当前状态（不被修改）。
 * @param left - 左盘硬币下标数组。
 * @param right - 右盘硬币下标数组。
 * @returns 新状态；非法称量（已结束、次数用尽、两侧不等数、空盘、重
 *   复下标、跨盘重复、越界下标）返回 null，调用方据此提示且不消耗次数。
 */
export function weigh(state: ScalesState, left: readonly number[], right: readonly number[]): ScalesState | null {
  if (state.status !== 'playing') return null
  if (state.history.length >= state.params.weighings) return null
  if (left.length === 0 || left.length !== right.length) return null
  const coins = state.params.coins
  const seen = new Set<number>()
  for (const c of left) {
    if (c < 0 || c >= coins || seen.has(c)) return null
    seen.add(c)
  }
  for (const c of right) {
    if (c < 0 || c >= coins || seen.has(c)) return null
    seen.add(c)
  }
  const { coin, heavy } = state.setup
  let result: WeighResult
  if (left.includes(coin)) result = heavy ? 'left' : 'right'
  else if (right.includes(coin)) result = heavy ? 'right' : 'left'
  else result = 'balance'
  const history = state.history.concat([{ left: left.slice(), right: right.slice(), result }])
  return { ...state, history }
}

/**
 * 假设（coin 偏 heavy）下预测一次称量的结果。
 * @param weighing - 称量（只看 left/right）。
 * @param coin - 假设的假币下标。
 * @param heavy - 假设偏重。
 * @returns 该假设下的三态预测。
 */
function predictResult(weighing: Weighing, coin: number, heavy: boolean): WeighResult {
  if (weighing.left.includes(coin)) return heavy ? 'left' : 'right'
  if (weighing.right.includes(coin)) return heavy ? 'right' : 'left'
  return 'balance'
}

/**
 * 推理助手核心：与全部历史称量结果一致的候选（假设）集合——每次结果
 * 把不一致的假设排除，剩下的就是候选。空历史返回全部 2N 个。
 * @param history - 已完成的称量列表。
 * @param coins - 硬币总数。
 * @returns 仍可能的假设列表（按硬币序、先重后轻）。
 */
export function candidatesAfter(history: readonly Weighing[], coins: number): FakeSetup[] {
  const out: FakeSetup[] = []
  for (let c = 0; c < coins; c += 1) {
    for (const heavy of [true, false]) {
      let ok = true
      for (const wgt of history) {
        if (predictResult(wgt, c, heavy) !== wgt.result) {
          ok = false
          break
        }
      }
      if (ok) out.push({ coin: c, heavy })
    }
  }
  return out
}

/**
 * 指认假币：任意时刻可指认（用尽次数前也可提前）。
 * @param state - 当前状态（不被修改）。
 * @param coin - 指认的硬币下标。
 * @param heavy - 指认偏重。
 * @returns 新状态（won / lost）；已结束或下标越界返回 null。
 */
export function accuse(state: ScalesState, coin: number, heavy: boolean): ScalesState | null {
  if (state.status !== 'playing') return null
  if (coin < 0 || coin >= state.params.coins) return null
  const correct = coin === state.setup.coin && heavy === state.setup.heavy
  return {
    ...state,
    status: correct ? 'won' : 'lost',
    lostReason: correct ? null : 'wrong',
  }
}

/**
 * 时间到判负（硬模式限时）。
 * @param state - 当前状态。
 * @returns lost 状态；已结束的原样返回。
 */
export function expire(state: ScalesState): ScalesState {
  if (state.status !== 'playing') return state
  return { ...state, status: 'lost', lostReason: 'timeout' }
}

/**
 * 过关得分：关卡 ×100，本关开过推理助手则减半。
 * @param level - 关卡号。
 * @param assistantUsed - 本关是否用过推理助手。
 * @returns 得分数值。
 */
export function scoreFor(level: number, assistantUsed: boolean): number {
  return assistantUsed ? level * 50 : level * 100
}
