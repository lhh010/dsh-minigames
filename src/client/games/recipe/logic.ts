/**
 * 配方厨房纯逻辑：灶台调度 + 火候时序的多任务管理。每张订单是一串
 * 工序（切/煮/炒，各有时长），必须按序完成；灶台 = 2 个灶眼（煮/炒）
 * + 1 块砧板（切），同一工位同时只能放一道工序。工序倒计时结束后进入
 * 火候期：游标在 0..1 上往复，取料落在绿区=完美加分，落在两端红区=糊
 * （该工序重来并扣分），火候期超时也会自动糊。订单有倒计时，到点作废
 * 扣分并补新单（队列最多 3 张）。后期关卡的「同煮」订单允许最后两道
 * 工序同时上灶，两道工序完成间隔足够近时拿同煮奖励。5 关递进：菜谱
 * 3→5 道工序、时限收紧、第 4 关起出现同煮单。全部为确定性纯函数（随
 * 机走注入 seed 的 mulberry32），无 DOM、无计时器。
 */

/** 工序种类：cut 砧板切，boil/fry 灶眼煮/炒。 */
export type StepKind = 'cut' | 'boil' | 'fry'

/** 各工序的基础倒计时（毫秒）。 */
export const STEP_MS: Record<StepKind, number> = { cut: 3000, boil: 5000, fry: 4000 }

/** 订单队列上限（同时最多 3 张排队）。 */
export const MAX_QUEUE = 3
/** 每关需出餐的订单数。 */
export const TARGET_PER_LEVEL = 4
/** 总关数。 */
export const TOTAL_LEVELS = 5

/** 火候游标往复周期（毫秒）。 */
export const HEAT_PERIOD_MS = 1600
/** 绿区下/上界（游标值区间，完美取料）。 */
export const GREEN_LO = 0.4
export const GREEN_HI = 0.6
/** 红区边界：游标 <= 该值或 >= 1-该值即糊。 */
export const RED_EDGE = 0.1
/** 火候期最长等待（毫秒），超过自动糊。 */
export const TIMING_MAX_MS = 6000

/** 计分常量。 */
export const STEP_SCORE = 60
export const PERFECT_BONUS = 40
export const ORDER_BONUS = 100
export const PAIR_BONUS = 200
export const BURN_PENALTY = 20
export const VOID_PENALTY = 100
/** 同煮订单：最后两道工序完成时刻的最大间隔（毫秒）。 */
export const PAIR_WINDOW_MS = 3000

/** 一关的难度参数。 */
export interface LevelConfig {
  /** 菜谱工序数。 */
  ingredientCount: number
  /** 订单时限（毫秒），逐关收紧。 */
  limitMs: number
  /** 本关生成「同煮」订单的概率（0 = 不出现）。 */
  pairedChance: number
}

/** 5 关难度表：3→5 工序、时限收紧、第 4 关起出现同煮单（时限按三张
 * 单并行节奏给足，顺序独占灶台也能救回）。 */
export const LEVELS: LevelConfig[] = [
  { ingredientCount: 3, limitMs: 95000, pairedChance: 0 },
  { ingredientCount: 3, limitMs: 88000, pairedChance: 0 },
  { ingredientCount: 4, limitMs: 80000, pairedChance: 0 },
  { ingredientCount: 4, limitMs: 76000, pairedChance: 0.6 },
  { ingredientCount: 5, limitMs: 72000, pairedChance: 0.6 },
]

/** 一张订单：工序序列 + 倒计时 + 完成进度。 */
export interface RecipeOrder {
  /** 全局递增订单号（区分同关内先后生成的单）。 */
  id: number
  /** 按序执行的工序序列。 */
  steps: StepKind[]
  /** 同煮单：允许最后两道工序同时上灶，间隔足够近有奖励。 */
  paired: boolean
  /** 本单时限（毫秒）。 */
  limitMs: number
  /** 剩余时间（毫秒）。 */
  timeLeftMs: number
  /** 下一道待做工序的下标（已完成 steps.length 道即出餐）。 */
  stepIndex: number
  /** 完美取料次数（卡面展示）。 */
  perfectCount: number
  /** 每道工序完成时的全局时钟刻度（同煮判定用）。 */
  doneAtMs: number[]
}

/** 工位上正在加工的一道工序。 */
export interface SlotItem {
  orderId: number
  /** 该订单的第几道工序（下标）。 */
  stepIndex: number
  kind: StepKind
  /** cooking = 倒计时中；timing = 火候期等取料。 */
  phase: 'cooking' | 'timing'
  /** 剩余倒计时（毫秒）。 */
  cookLeftMs: number
  /** 火候期已流逝毫秒（游标相位来源）。 */
  timingMs: number
}

/** 游戏状态：3 个工位（0/1 = 灶眼，2 = 砧板）。 */
export interface RecipeState {
  phase: 'playing' | 'over'
  /** 当前关（1 起）。 */
  level: number
  /** 本关已出餐数。 */
  servedInLevel: number
  /** 全场累计出餐数。 */
  servedTotal: number
  score: number
  /** 全局时钟（毫秒），同煮间隔与烟效计时基准。 */
  elapsedMs: number
  /** 累计糊掉次数。 */
  burnCount: number
  /** 累计作废订单数。 */
  voidedCount: number
  orders: RecipeOrder[]
  slots: (SlotItem | null)[]
  /** 当前选中的订单下标（点击工位时对它下单）。 */
  selectedOrderIdx: number
  /** 下一张订单的编号。 */
  nextOrderId: number
  rng: () => number
}

/**
 * mulberry32 确定性伪随机数发生器（与 burger/balloon 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
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
 * 火候游标值：timingMs 在 HEAT_PERIOD_MS 上取三角波（0→1→0 往复）。
 * @param timingMs - 火候期已流逝毫秒。
 * @returns [0,1] 游标值（确定性纯函数）。
 */
export function heatCursor(timingMs: number): number {
  const p = (timingMs % HEAT_PERIOD_MS) / HEAT_PERIOD_MS
  return p < 0.5 ? p * 2 : 2 - p * 2
}

/**
 * 判定游标值所在的火候区。
 * @param value - heatCursor 的返回值。
 * @returns 'red' 两端红区（糊）；'green' 中央绿区（完美）；'plain' 其余。
 */
export function judgeHeat(value: number): 'red' | 'green' | 'plain' {
  if (value <= RED_EDGE || value >= 1 - RED_EDGE) return 'red'
  if (value >= GREEN_LO && value <= GREEN_HI) return 'green'
  return 'plain'
}

/**
 * 生成一张当前关卡难度的订单并入队（首道工序固定为切，末道固定为
 * 煮/炒，保证砧板与灶眼都会被用到）。
 * @param state - 游戏状态，原地更新。
 */
export function makeOrder(state: RecipeState): void {
  if (state.orders.length >= MAX_QUEUE) return
  const cfg = LEVELS[state.level - 1]!
  const n = cfg.ingredientCount
  const steps: StepKind[] = ['cut']
  for (let i = 1; i < n - 1; i += 1) {
    const r = state.rng()
    steps.push(r < 0.34 ? 'cut' : r < 0.67 ? 'boil' : 'fry')
  }
  steps.push(state.rng() < 0.5 ? 'boil' : 'fry')
  state.orders.push({
    id: state.nextOrderId,
    steps,
    paired: state.rng() < cfg.pairedChance,
    limitMs: cfg.limitMs,
    timeLeftMs: cfg.limitMs,
    stepIndex: 0,
    perfectCount: 0,
    doneAtMs: [],
  })
  state.nextOrderId += 1
}

/**
 * 创建初始状态：第 1 关、3 张订单排队、选中第 0 张。
 * @param seed - 注入的随机种子，同种子整局可复现。
 * @returns 就绪的 RecipeState（phase='playing'）。
 */
export function createRecipeState(seed: number): RecipeState {
  const state: RecipeState = {
    phase: 'playing',
    level: 1,
    servedInLevel: 0,
    servedTotal: 0,
    score: 0,
    elapsedMs: 0,
    burnCount: 0,
    voidedCount: 0,
    orders: [],
    slots: [null, null, null],
    selectedOrderIdx: 0,
    nextOrderId: 1,
    rng: mulberry32(seed),
  }
  for (let i = 0; i < MAX_QUEUE; i += 1) makeOrder(state)
  return state
}

/**
 * 选中一张排队订单（点击下单目标）。
 * @param state - 游戏状态。
 * @param orderIdx - 订单下标。
 * @returns 是否选中成功。
 */
export function selectOrder(state: RecipeState, orderIdx: number): boolean {
  if (orderIdx < 0 || orderIdx >= state.orders.length) return false
  state.selectedOrderIdx = orderIdx
  return true
}

/**
 * 空格循环切换选中的订单。
 * @param state - 游戏状态。
 */
export function cycleOrder(state: RecipeState): void {
  if (state.orders.length === 0) return
  state.selectedOrderIdx = (state.selectedOrderIdx + 1) % state.orders.length
}

/**
 * 工位接受的工序类别。
 * @param station - 工位下标（0/1 灶眼，2 砧板）。
 * @returns 'heat' 接受煮/炒；'cut' 接受切。
 */
export function stationKind(station: number): 'heat' | 'cut' {
  return station === 2 ? 'cut' : 'heat'
}

/**
 * 糊掉一道工序：清空所在工位、扣分计数；该工序回到待做（重来）。
 * @param state - 游戏状态。
 * @param slotIdx - 工位下标。
 */
function burnStep(state: RecipeState, slotIdx: number): void {
  state.slots[slotIdx] = null
  state.score -= BURN_PENALTY
  state.burnCount += 1
}

/**
 * 出餐结算：末道工序分 + 完美加成 + 订单奖励 + 同煮奖励；补新单；本关
 * 出满则升关（清空订单与工位重新生成）或终局。
 * @param state - 游戏状态。
 * @param orderIdx - 刚完成的订单下标。
 * @param perfect - 末道工序是否完美取料。
 */
function serveOrder(state: RecipeState, orderIdx: number): void {
  const order = state.orders[orderIdx]!
  // 末道工序的分与完美加成已在 pickup 里结算，这里只补订单奖励与同煮奖励
  state.score += ORDER_BONUS
  if (order.paired && order.doneAtMs.length >= 2) {
    const gap = order.doneAtMs[order.doneAtMs.length - 1]! - order.doneAtMs[order.doneAtMs.length - 2]!
    if (gap <= PAIR_WINDOW_MS) state.score += PAIR_BONUS
  }
  state.orders.splice(orderIdx, 1)
  state.servedInLevel += 1
  state.servedTotal += 1
  makeOrder(state)
  if (state.servedInLevel >= TARGET_PER_LEVEL) {
    if (state.level >= TOTAL_LEVELS) {
      state.phase = 'over'
      return
    }
    state.level += 1
    state.servedInLevel = 0
    state.orders = []
    state.slots = [null, null, null]
    for (let i = 0; i < MAX_QUEUE; i += 1) makeOrder(state)
  }
  if (state.selectedOrderIdx >= state.orders.length) state.selectedOrderIdx = 0
}

/**
 * 把选中订单的下一道工序放上工位。
 * @param state - 游戏状态。
 * @param orderIdx - 下单的订单下标。
 * @param station - 目标工位（0/1 灶眼，2 砧板）。
 * @returns 'placed' 成功；'ignored' 终局；'no-step' 无待做工序；
 *   'busy' 工位占用；'wrong-station' 工序类别不符；'pair-rule' 已有
 *   同单工序在灶上且不满足同煮规则。
 */
export function placeStep(state: RecipeState, orderIdx: number, station: number): 'placed' | 'ignored' | 'no-step' | 'busy' | 'wrong-station' | 'pair-rule' {
  if (state.phase !== 'playing') return 'ignored'
  if (station < 0 || station > 2) return 'ignored'
  const order = state.orders[orderIdx]
  if (order === undefined) return 'ignored'
  if (order.stepIndex >= order.steps.length) return 'no-step'
  if (state.slots[station] !== null) return 'busy'
  const kind = order.steps[order.stepIndex]!
  if (stationKind(station) === 'cut' ? kind !== 'cut' : kind === 'cut') return 'wrong-station'
  const existing = state.slots.find((s) => s !== null && s.orderId === order.id)
  if (existing !== undefined && existing !== null) {
    const last = order.steps.length - 1
    const overlapOk = order.paired && existing.stepIndex === last - 1 && order.stepIndex === last
    if (!overlapOk) return 'pair-rule'
  }
  state.slots[station] = {
    orderId: order.id,
    stepIndex: order.stepIndex,
    kind,
    phase: 'cooking',
    cookLeftMs: STEP_MS[kind],
    timingMs: 0,
  }
  order.stepIndex += 1
  return 'placed'
}

/**
 * 从工位取料：火候期才可取。绿区=完美，红区=糊（工序重来），其余=及
 * 格；末道工序取料即出餐结算。
 * @param state - 游戏状态。
 * @param station - 工位下标。
 * @returns 'empty' 空工位；'cooking' 还在倒计时；'burnt' 取在红区；
 *   'perfect'/'ok' 中间工序完成；'served-perfect'/'served-ok' 末道
 *   工序完成并出餐（可能升关/终局）。
 */
export function pickup(state: RecipeState, station: number): 'empty' | 'cooking' | 'burnt' | 'perfect' | 'ok' | 'served-perfect' | 'served-ok' {
  if (state.phase !== 'playing') return 'empty'
  const item = state.slots[station]
  if (item === undefined || item === null) return 'empty'
  if (item.phase === 'cooking') return 'cooking'
  const zone = judgeHeat(heatCursor(item.timingMs))
  const orderIdx = state.orders.findIndex((o) => o.id === item.orderId)
  const isFinalStep = orderIdx >= 0 && item.stepIndex === state.orders[orderIdx]!.steps.length - 1
  if (zone === 'red') {
    burnStep(state, station)
    if (orderIdx >= 0) {
      const order = state.orders[orderIdx]!
      order.stepIndex = item.stepIndex // 该工序重来
    }
    return 'burnt'
  }
  const perfect = zone === 'green'
  state.slots[station] = null
  state.score += STEP_SCORE + (perfect ? PERFECT_BONUS : 0)
  if (orderIdx < 0) return perfect ? 'perfect' : 'ok'
  const order = state.orders[orderIdx]!
  order.doneAtMs.push(state.elapsedMs)
  if (perfect) order.perfectCount += 1
  if (isFinalStep) {
    serveOrder(state, orderIdx)
    return perfect ? 'served-perfect' : 'served-ok'
  }
  return perfect ? 'perfect' : 'ok'
}

/**
 * 作废一张超时订单：扣分、清掉它占用的工位、补新单。
 * @param state - 游戏状态。
 * @param orderIdx - 订单下标。
 */
function voidOrder(state: RecipeState, orderIdx: number): void {
  const order = state.orders[orderIdx]!
  for (let i = 0; i < 3; i += 1) {
    const slot = state.slots[i]
    if (slot !== null && slot !== undefined && slot.orderId === order.id) state.slots[i] = null
  }
  state.orders.splice(orderIdx, 1)
  state.score -= VOID_PENALTY
  state.voidedCount += 1
  makeOrder(state)
  if (state.selectedOrderIdx >= state.orders.length) state.selectedOrderIdx = 0
}

/**
 * 推进模拟：全局时钟、各工位倒计时→火候期、火候超时自动糊、订单倒计
 * 时到点作废。
 * @param state - 游戏状态。
 * @param dtMs - 本帧毫秒（由调用方钳制）。
 * @returns 'none' 无事件；'burnt' 有工序自动糊；'void' 有订单超时作废
 *   （同一帧多事件时 void 优先报告）。
 */
export function tickRecipe(state: RecipeState, dtMs: number): 'none' | 'burnt' | 'void' {
  if (state.phase !== 'playing') return 'none'
  state.elapsedMs += dtMs
  let burnt = false
  for (let i = 0; i < 3; i += 1) {
    const item = state.slots[i]
    if (item === null || item === undefined) continue
    if (item.phase === 'cooking') {
      item.cookLeftMs -= dtMs
      if (item.cookLeftMs <= 0) {
        item.phase = 'timing'
        item.timingMs = 0
      }
    } else {
      item.timingMs += dtMs
      if (item.timingMs >= TIMING_MAX_MS) {
        const orderIdx = state.orders.findIndex((o) => o.id === item.orderId)
        burnStep(state, i)
        if (orderIdx >= 0) state.orders[orderIdx]!.stepIndex = item.stepIndex
        burnt = true
      }
    }
  }
  for (let i = state.orders.length - 1; i >= 0; i -= 1) {
    const order = state.orders[i]!
    order.timeLeftMs -= dtMs
    if (order.timeLeftMs <= 0) {
      voidOrder(state, i)
      return 'void'
    }
  }
  return burnt ? 'burnt' : 'none'
}
