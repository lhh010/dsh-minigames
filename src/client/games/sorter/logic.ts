/**
 * 传送带分拣（Sorter）纯逻辑：三条传送带从左向右输送四种颜色的包裹，
 * 每条带末端有一个分流挡板；色键 1-4 一次性把全部挡板切到对应颜色。
 * 包裹抵达分流口时判定：挡板颜色与包裹颜色一致则滑入对应车厢（得分
 * + 连击），否则包裹坠出带尾（1 次失误，累计 3 次结束）。带速与生成
 * 密度随回合时间升档，全部由 mulberry32(seed, round) 确定性驱动；帧
 * 间隔先累加再按固定 10ms 子步推进，任意调用节奏下轨迹一致。输入以
 * 纯数据传入，同 seed + 同输入序列重放一致。
 */

/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export const W = 520
export const H = 560

/** 三条传送带。 */
export const LANES = 3
/** 包裹颜色数（同时也是车厢数与色键数）。 */
export const COLOR_COUNT = 4
/** 带左端与分流口逻辑 x。 */
export const BELT_LEFT = 24
export const DIVERT_X = 404
/** 传送带厚度。 */
export const BELT_H = 28
/** 包裹边长。 */
export const PACKAGE_SIZE = 26
/** 允许的失误次数，超出即结束。 */
export const MAX_MISSES = 3
/** 连击窗口 ms：窗口内再分拣成功则连击 +1。 */
export const COMBO_WINDOW_MS = 1200
/** 连击上限。 */
export const COMBO_CAP = 10
/** 每级连击附加分。 */
export const COMBO_BONUS = 1
/** 分拣成功基础分。 */
export const BASE_SCORE = 2
/** 每 12 秒升一档难度。 */
export const LEVEL_MS = 12_000
/** 固定子步 ms：stepSorter 内部按该粒度推进模拟。 */
export const SUBSTEP_MS = 10
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 800

/** 四种包裹颜色（与主题色板对齐的固定十六进制，供渲染与测试断言）。 */
export const PACKAGE_COLORS = ['#7aa2f7', '#9ece6a', '#f7768e', '#7dcfff'] as const

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

/** 一件在途包裹：颜色索引与带内逻辑 x。 */
export interface Package {
  color: 0 | 1 | 2 | 3
  x: number
}

/** 一条传送带：挡板当前指向的颜色、在途包裹与下一次生成时刻。 */
export interface Belt {
  lane: 0 | 1 | 2
  flap: 0 | 1 | 2 | 3
  packages: Package[]
  /** 下一次生成包裹的回合钟时刻 ms。 */
  nextSpawnAt: number
}

/** 上浮渐隐的飘字（得分 / 失误提示）。 */
export interface FloatText {
  x: number, y: number
  text: string
  life: number
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type SorterEvent =
  | { type: 'sort', lane: 0 | 1 | 2, color: 0 | 1 | 2 | 3, x: number, y: number }
  | { type: 'miss', lane: 0 | 1 | 2, color: 0 | 1 | 2 | 3, x: number, y: number }

/** 一帧输入：flap 为按下色键对应的颜色（1-4 键 → 0-3），null 表示无。 */
export interface SorterInput {
  flap: 0 | 1 | 2 | 3 | null
}

/** 一局游戏的完整可测状态。 */
export interface SorterState {
  /** 回合内已流逝 ms。 */
  t: number
  /** 未消费的帧时间累加器 ms（固定子步用）。 */
  acc: number
  score: number
  misses: number
  combo: number
  /** 连击失效时刻 ms（回合钟）。 */
  comboExpire: number
  /** 四节车厢各自的装载数。 */
  wagons: number[]
  belts: Belt[]
  events: SorterEvent[]
  floats: FloatText[]
  rng: () => number
  over: boolean
}

/**
 * 传送带中心线逻辑 y。
 * @param lane - 带索引 0-2。
 * @returns 该带包裹中心的 y 坐标。
 */
export function laneY(lane: 0 | 1 | 2): number {
  return 118 + lane * 80
}

/**
 * 当前难度档位：随回合时间每 12 秒 +1。
 * @param tMs - 回合内毫秒钟。
 * @returns 从 1 开始的档位。
 */
export function levelOf(tMs: number): number {
  return 1 + Math.floor(Math.max(0, tMs) / LEVEL_MS)
}

/**
 * 带速 px/s：1 档 90，每档 +18，封顶 250。
 * @param level - 当前档位。
 * @returns 该档位的带速。
 */
export function beltSpeed(level: number): number {
  return Math.min(250, 90 + (level - 1) * 18)
}

/**
 * 每条带生成包裹的平均间隔 ms：1 档 1900，每档 -150，下限 650。
 * @param level - 当前档位。
 * @returns 生成间隔的期望值。
 */
export function spawnMeanMs(level: number): number {
  return Math.max(650, 1900 - (level - 1) * 150)
}

/**
 * 泊松间隔采样：指数分布 -ln(1-u)*mean，截断到 [0.35, 2.2] 倍期望。
 * @param rng - 随机源。
 * @param mean - 间隔期望 ms。
 * @returns 本次到下一次生成的间隔 ms。
 */
export function poissonInterval(rng: () => number, mean: number): number {
  const u = rng()
  const raw = -Math.log(1 - u) * mean
  return Math.max(mean * 0.35, Math.min(mean * 2.2, raw))
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createSorter(seed: number, round = 1): SorterState {
  const rng = mulberry32((Math.floor(seed) * 31 + round) >>> 0)
  const belts: Belt[] = []
  for (let lane = 0; lane < LANES; lane += 1) {
    belts.push({
      lane: lane as 0 | 1 | 2,
      flap: 0,
      packages: [],
      nextSpawnAt: 700 + lane * 260 + rng() * 500,
    })
  }
  return {
    t: 0,
    acc: 0,
    score: 0,
    misses: 0,
    combo: 0,
    comboExpire: 0,
    wagons: [0, 0, 0, 0],
    belts,
    events: [],
    floats: [],
    rng,
    over: false,
  }
}

/**
 * 按泊松节奏尝试生成一件包裹：带入口附近已有包裹则推迟（避免重叠）。
 * @param state - 目标状态（使用其 rng）。
 * @param belt - 目标传送带。
 * @param level - 当前档位。
 */
function trySpawn(state: SorterState, belt: Belt, level: number): void {
  const mean = spawnMeanMs(level)
  if (state.t < belt.nextSpawnAt) return
  const blocked = belt.packages.some((p) => p.x < BELT_LEFT + PACKAGE_SIZE + 34)
  if (blocked) {
    belt.nextSpawnAt = state.t + 140
    return
  }
  const roll = state.rng() * COLOR_COUNT
  const color = Math.min(COLOR_COUNT - 1, Math.floor(roll)) as 0 | 1 | 2 | 3
  belt.packages.push({ color, x: BELT_LEFT - PACKAGE_SIZE / 2 })
  belt.nextSpawnAt = state.t + poissonInterval(state.rng, mean)
}

/**
 * 记 1 次失误：连击清零，累计达上限即结束。
 * @param state - 目标状态。
 */
function registerMiss(state: SorterState): void {
  state.misses += 1
  state.combo = 0
  if (state.misses >= MAX_MISSES) state.over = true
}

/**
 * 包裹抵达分流口的判定：挡板颜色一致则装车计分（连击加成），否则坠出
 * 记失误。事件与飘字写入 state 供渲染消费。
 * @param state - 目标状态。
 * @param belt - 包裹所在传送带。
 * @param pkg - 被判定的包裹。
 */
function divert(state: SorterState, belt: Belt, pkg: Package): void {
  const y = laneY(belt.lane)
  if (belt.flap === pkg.color) {
    state.combo = state.comboExpire > state.t ? Math.min(COMBO_CAP, state.combo + 1) : 1
    state.comboExpire = state.t + COMBO_WINDOW_MS
    const gained = BASE_SCORE + (state.combo - 1) * COMBO_BONUS
    state.score += gained
    state.wagons[pkg.color] = state.wagons[pkg.color]! + 1
    state.events.push({ type: 'sort', lane: belt.lane, color: pkg.color, x: DIVERT_X, y })
    state.floats.push({ x: DIVERT_X - 10, y: y - 24, text: '+' + gained, life: FLOAT_MS })
    if (state.combo >= 3) {
      state.floats.push({ x: DIVERT_X - 10, y: y - 46, text: 'x' + state.combo + ' 连击', life: FLOAT_MS })
    }
  } else {
    registerMiss(state)
    state.events.push({ type: 'miss', lane: belt.lane, color: pkg.color, x: DIVERT_X, y })
    state.floats.push({ x: DIVERT_X - 10, y: y - 24, text: '失误', life: FLOAT_MS })
  }
}

/**
 * 推进一个固定子步：生成、带推进、分流判定、飘字衰减。
 * @param state - 目标状态。
 * @param dtMs - 子步时长 ms（固定 SUBSTEP_MS）。
 */
function substep(state: SorterState, dtMs: number): void {
  const dt = dtMs / 1000
  state.t += dtMs
  const level = levelOf(state.t)
  const speed = beltSpeed(level)
  for (const belt of state.belts) {
    trySpawn(state, belt, level)
    for (let i = belt.packages.length - 1; i >= 0; i -= 1) {
      const pkg = belt.packages[i]!
      pkg.x += speed * dt
      if (pkg.x >= DIVERT_X) {
        belt.packages.splice(i, 1)
        divert(state, belt, pkg)
        if (state.over) return
      }
    }
  }
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 30 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }
}

/**
 * 推进一帧：先应用色键输入（把全部挡板切到 flap 色），再把帧时间累加
 * 并按固定 SUBSTEP_MS 子步确定性推进。事件写入 state.events，调用方每
 * 帧消费（下一帧开头清空）。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（色键 / 无）。
 */
export function stepSorter(state: SorterState, dtMs: number, input: SorterInput): void {
  state.events.length = 0
  if (state.over) {
    state.acc = 0
    return
  }
  if (input.flap !== null) {
    for (const belt of state.belts) belt.flap = input.flap
  }
  state.acc += Math.max(0, dtMs)
  while (state.acc >= SUBSTEP_MS) {
    state.acc -= SUBSTEP_MS
    substep(state, SUBSTEP_MS)
    if (state.over) {
      state.acc = 0
      return
    }
  }
}
