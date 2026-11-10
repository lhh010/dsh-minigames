/**
 * 潮汐赶海（Tide）纯逻辑：海滩网格上的定时博弈。海在网格顶部，滩涂在
 * 下部；水线按完全确定的时刻表进退——前 24s 退潮（水线 6→2 行线性后退），
 * 24s~40s 平潮（滩涂全露，拾贝黄金期），最后 20s 涨潮（水线以固定速度
 * 2→6 推进）。淹到的格子：物品被冲走，玩家被卷走扣 1 命并回到岸边起点。
 * 物品由 seed+round 经 mulberry32 确定性生成：贝壳/海星/珍珠基础价值
 * 1/3/10，深度带系数 ×1~×4（越靠近水线越贵）；每件物品只在暴露窗口内
 * 可拾取。3 命 5 轮，总分 = 拾获价值合计。全部函数确定性可测，时间
 * 单位毫秒。
 */

/** 逻辑画布尺寸。 */
export const W = 480
export const H = 560

/** 网格列数（水平）。 */
export const COLS = 10
/** 网格行数（垂直，第 0 行是最深的海侧，最后一行是岸边）。 */
export const ROWS = 8
/** 退潮终点水线（滩涂最深处暴露到第 2 行）。 */
export const LOW_ROW = 2
/** 涨潮终点水线（第 6、7 行永不淹没，是安全区）。 */
export const MAX_FLOOD_ROW = 6
/** 水线从 6 退到 2 所需 ms。 */
export const RETREAT_MS = 24_000
/** 退潮完成到涨潮开始之间的平潮 ms。 */
export const LULL_MS = 16_000
/** 涨潮 ms（水线固定速度 4 行 / 20000ms 推进）。 */
export const FLOOD_MS = 20_000
/** 一轮潮汐周期 ms。 */
export const ROUND_MS = RETREAT_MS + LULL_MS + FLOOD_MS
/** 总轮数。 */
export const ROUNDS = 5
/** 初始命数。 */
export const LIVES = 3
/** 每轮生成物品数。 */
export const ITEMS_PER_ROUND = 16

/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 物品表：名称 / 基础价值 / 渲染色。索引即 kind。 */
export const ITEM_KINDS = [
  { name: '贝壳', value: 1, color: '#7dcfff' },
  { name: '海星', value: 3, color: '#e0af68' },
  { name: '珍珠', value: 10, color: '#f7768e' },
] as const

/** 潮汐相位：退潮 / 平潮 / 涨潮。 */
export type TidePhaseKind = 'ebb' | 'lull' | 'flood'

/**
 * 轮内时刻 → 潮汐相位（时刻表完全确定）。
 * @param t - 轮内毫秒。
 * @returns 退潮 / 平潮 / 涨潮。
 */
export function tidePhaseAt(t: number): TidePhaseKind {
  if (t < RETREAT_MS) return 'ebb'
  if (t < RETREAT_MS + LULL_MS) return 'lull'
  return 'flood'
}

/**
 * 轮内时刻 → 水线位置（浮点行号：行号 < 水线的格子被淹没）。
 * 退潮线性后退（4 行 / 24000ms），平潮停在 LOW_ROW，涨潮线性推进
 * （4 行 / 20000ms，比退潮快——涨潮不等人）。
 * @param t - 轮内毫秒。
 * @returns 水线行号（LOW_ROW ~ MAX_FLOOD_ROW）。
 */
export function waterLineAt(t: number): number {
  const span = MAX_FLOOD_ROW - LOW_ROW
  if (t <= 0) return MAX_FLOOD_ROW
  if (t < RETREAT_MS) return MAX_FLOOD_ROW - (span / RETREAT_MS) * t
  const floodStart = RETREAT_MS + LULL_MS
  if (t < floodStart) return LOW_ROW
  if (t < ROUND_MS) return LOW_ROW + (span / FLOOD_MS) * (t - floodStart)
  return MAX_FLOOD_ROW
}

/**
 * 某行滩涂在本轮的暴露时刻（退潮水线退过该行的瞬间）。
 * @param row - 行号（滩涂范围 LOW_ROW..MAX_FLOOD_ROW-1）。
 * @returns 该行开始可踏 / 物品开始可拾的轮内毫秒。
 */
export function exposeMsAt(row: number): number {
  const r = Math.max(LOW_ROW, Math.min(MAX_FLOOD_ROW - 1, Math.round(row)))
  return ((MAX_FLOOD_ROW - r) / (MAX_FLOOD_ROW - LOW_ROW)) * RETREAT_MS
}

/**
 * 深度带系数：越靠近低潮水线（行号越小）越贵。行 5 → ×1，行 4 → ×2，
 * 行 3 → ×3，行 2 → ×4。
 * @param row - 行号。
 * @returns 价值倍数。
 */
export function bandOf(row: number): number {
  return Math.max(1, MAX_FLOOD_ROW - Math.round(row))
}

/** 一件滩涂物品（位置 / 品种 / 结算价值 / 暴露时刻 / 是否已消失）。 */
export interface TideItem {
  col: number
  row: number
  kind: number
  /** 结算价值 = 基础价值 × 深度带系数。 */
  value: number
  /** 本轮暴露时刻 ms（此前不可见不可拾）。 */
  appearAt: number
  /** 已拾取或被淹冲走。 */
  taken: boolean
}

/** 阶段：进行中 / 结束。 */
export type TidePhase = 'playing' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type TideEvent =
  | { type: 'pickup', col: number, row: number, kind: number, value: number }
  | { type: 'wash', col: number, row: number, kind: number }
  | { type: 'swept', col: number, row: number }
  | { type: 'round', round: number }
  | { type: 'over' }

/** 一局游戏的完整可测状态。 */
export interface TideState {
  /** 当前轮内已流逝 ms。 */
  t: number
  /** 当前轮（1 起）。 */
  round: number
  score: number
  lives: number
  phase: TidePhase
  playerCol: number
  playerRow: number
  items: TideItem[]
  events: TideEvent[]
  rng: () => number
}

/** 玩家本轮出生点（岸边安全带中央）。 */
export const START_COL = Math.floor(COLS / 2)
export const START_ROW = ROWS - 1

/**
 * 确定性生成本轮物品：只落在滩涂行（LOW_ROW..MAX_FLOOD_ROW-1），不与
 * 已有物品同格；品种按 55% 贝壳 / 30% 海星 / 15% 珍珠抽取，价值 =
 * 基础价值 × 深度带系数。
 * @param rng - 局内随机源。
 * @returns 本轮物品列表。
 */
function rollItems(rng: () => number): TideItem[] {
  const items: TideItem[] = []
  const takenCells = new Set<number>()
  let guard = 0
  while (items.length < ITEMS_PER_ROUND && guard < ITEMS_PER_ROUND * 20) {
    guard += 1
    const row = LOW_ROW + Math.floor(rng() * (MAX_FLOOD_ROW - LOW_ROW))
    const col = Math.floor(rng() * COLS)
    const cell = row * COLS + col
    if (takenCells.has(cell)) continue
    takenCells.add(cell)
    const r = rng()
    const kind = r < 0.15 ? 2 : r < 0.45 ? 1 : 0
    items.push({
      col,
      row,
      kind,
      value: ITEM_KINDS[kind]!.value * bandOf(row),
      appearAt: exposeMsAt(row),
      taken: false,
    })
  }
  return items
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param run - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createTide(seed: number, run = 1): TideState {
  const rng = mulberry32((Math.floor(seed) * 97 + run * 131) >>> 0)
  return {
    t: 0,
    round: 1,
    score: 0,
    lives: LIVES,
    phase: 'playing',
    playerCol: START_COL,
    playerRow: START_ROW,
    items: rollItems(rng),
    events: [],
    rng,
  }
}

/**
 * 当前水线（state.t 的便捷读取）。
 * @param state - 当前状态。
 * @returns 水线行号（浮点）。
 */
export function waterLine(state: TideState): number {
  return waterLineAt(state.t)
}

/**
 * 某格当前是否被淹。
 * @param state - 当前状态。
 * @param row - 行号。
 * @returns true 表示水线已漫过该行。
 */
export function isSubmerged(state: TideState, row: number): boolean {
  // 严格在水线之下才算淹没：水线恰好齐脚（row == line）是"踩在水边"，
  // 可站可拾——涨潮推进越过该行才真正被卷走。
  return row < waterLine(state) - 1e-9
}

/**
 * 玩家当前所在格的物品（已暴露且未消失时）。
 * @param state - 当前状态。
 * @returns 命中的物品，无则 null。
 */
export function itemAtPlayer(state: TideState): TideItem | null {
  for (const it of state.items) {
    if (!it.taken && it.col === state.playerCol && it.row === state.playerRow && state.t >= it.appearAt) return it
  }
  return null
}

/**
 * 玩家被浪卷走：扣 1 命并回到出生点；命尽则结束。
 * @param state - 目标状态。
 */
function sweep(state: TideState): void {
  state.events.push({ type: 'swept', col: state.playerCol, row: state.playerRow })
  state.lives -= 1
  state.playerCol = START_COL
  state.playerRow = START_ROW
  if (state.lives <= 0) {
    state.lives = 0
    state.phase = 'over'
    state.events.push({ type: 'over' })
  }
}

/**
 * 玩家移动一步（方向键 / WASD）：目标出界则原地不动；走到已暴露物品格
 * 立即拾取计分；主动走进水下格立即被卷走。
 * @param state - 目标状态。
 * @param dx - 水平步长（-1/0/1）。
 * @param dy - 垂直步长（-1 向海 / +1 向岸）。
 * @returns 是否实际移动。
 */
export function moveTide(state: TideState, dx: number, dy: number): boolean {
  if (state.phase !== 'playing') return false
  state.events.length = 0
  const col = state.playerCol + Math.sign(dx)
  const row = state.playerRow + Math.sign(dy)
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false
  if (col === state.playerCol && row === state.playerRow) return false
  state.playerCol = col
  state.playerRow = row
  const item = itemAtPlayer(state)
  if (item !== null) {
    item.taken = true
    state.score += item.value
    state.events.push({ type: 'pickup', col, row, kind: item.kind, value: item.value })
  }
  // 只有涨潮推进中的淹没才卷人：退潮时站在退去的浅水里捡漏正是赶海
  // 本身（危险来自涨潮，不是水线位置）。
  if (tidePhaseAt(state.t) === 'flood' && isSubmerged(state, row)) sweep(state)
  return true
}

/**
 * 推进一帧：潮汐时钟、淹没物品冲走、玩家淹没判定、轮次推进与新一轮
 * 物品生成。事件写入 state.events，调用方每帧消费。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepTide(state: TideState, dtMs: number): void {
  state.events.length = 0
  if (state.phase !== 'playing') return
  state.t += dtMs

  const line = waterLineAt(Math.min(state.t, ROUND_MS))
  // 冲走只发生在「已暴露后被涨潮重新淹没」：轮开始的高水位阶段物品
  // 只是潜在水下（尚未暴露），不该被冲走——否则退潮后滩涂空空如也。
  for (const it of state.items) {
    if (!it.taken && state.t > it.appearAt && it.row < line) {
      it.taken = true
      state.events.push({ type: 'wash', col: it.col, row: it.row, kind: it.kind })
    }
  }
  if (tidePhaseAt(state.t) === 'flood' && isSubmerged(state, state.playerRow)) {
    sweep(state)
    // sweep 可能置 over（类型窄化看不到突变，经 string 再比）。
    if ((state.phase as string) === 'over') return
  }

  if (state.t >= ROUND_MS) {
    state.t -= ROUND_MS
    state.round += 1
    if (state.round > ROUNDS) {
      state.round = ROUNDS
      state.t = ROUND_MS
      state.phase = 'over'
      state.events.push({ type: 'over' })
      return
    }
    state.playerCol = START_COL
    state.playerRow = START_ROW
    state.items = rollItems(state.rng)
    state.events.push({ type: 'round', round: state.round })
  }
}
