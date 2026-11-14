/**
 * 接雨水（Rainwater）纯逻辑：经典 trapping rain water 谜题的玩法反转。
 * seed 生成一排高低不一的柱子（剖面地形），玩家有限定砖块预算，在槽位
 * 上点击升高柱高（耗 1 砖）、右键降低（拆回已放的砖并返还），目标让盘面
 * 总蓄水量（每格 min(左侧最高, 右侧最高) - 柱高 的正部之和）达到该关给
 * 定的目标水量；用砖越少剩余预算越多、得分越高。5 关递进（槽位 8→14、
 * 目标 4→12）。生成器保证可解：每关地形必含一个「凹槽盆地」——两侧柱
 * 基高 3、中间 3 列基高 0~2，把两侧柱升到 MAX_H 即可在预算内蓄满目标。
 * 全部函数确定性可测，随机只经注入 seed（mulberry32）。
 */

/** 逻辑画布尺寸（渲染层共用）。 */
export const W = 560
export const H = 420

/** 柱高上限（格数）。 */
export const MAX_H = 6

/** 地形随机段基高上限（盆地侧柱固定为 3）。 */
export const BASE_MAX = 3

/** 关卡配置：槽位数 / 目标水量 / 砖块预算。 */
export interface RainwaterLevel {
  /** 槽位（柱子）数量。 */
  slots: number
  /** 本关目标总蓄水量。 */
  target: number
  /** 本关砖块预算（每升高 1 格耗 1 砖，降低返还）。 */
  budget: number
}

/** 5 关递进：槽位 8→14、目标 4→12。 */
export const LEVELS: readonly RainwaterLevel[] = [
  { slots: 8, target: 4, budget: 6 },
  { slots: 9, target: 5, budget: 8 },
  { slots: 11, target: 7, budget: 9 },
  { slots: 12, target: 9, budget: 11 },
  { slots: 14, target: 12, budget: 13 },
] as const

/** 总关数。 */
export const LEVEL_COUNT = LEVELS.length

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

/**
 * 生成一关的地形基高：各槽位 0..BASE_MAX 随机，再在内部刻出一个可解
 * 盆地——basin 与 basin+4 两柱基高 3，中间 3 列基高 0..2（升两侧到
 * MAX_H 后至少蓄 3*(MAX_H-2)=12 格，覆盖最高目标）。
 * @param rng - 注入的随机数函数。
 * @param slots - 槽位数（至少 7）。
 * @returns 地形基高数组与盆地左柱位置。
 */
export function generateTerrain(
  rng: () => number,
  slots: number,
): { base: number[], basin: number } {
  const base: number[] = []
  for (let i = 0; i < slots; i += 1) base.push(Math.floor(rng() * (BASE_MAX + 1)))
  const basin = 1 + Math.floor(rng() * Math.max(1, slots - 5))
  base[basin] = BASE_MAX
  base[basin + 4] = BASE_MAX
  for (let i = basin + 1; i <= basin + 3; i += 1) base[i] = Math.floor(rng() * 3)
  return { base, basin }
}

/**
 * 每列蓄水量：第 i 列 = max(0, min(左侧最高, 右侧最高) - heights[i])。
 * @param heights - 柱高数组。
 * @returns 与 heights 等长的每列蓄水格数。
 */
export function waterColumns(heights: readonly number[]): number[] {
  const n = heights.length
  const leftMax: number[] = new Array<number>(n).fill(0)
  const rightMax: number[] = new Array<number>(n).fill(0)
  let run = 0
  for (let i = 0; i < n; i += 1) {
    leftMax[i] = run
    if (heights[i]! > run) run = heights[i]!
  }
  run = 0
  for (let i = n - 1; i >= 0; i -= 1) {
    rightMax[i] = run
    if (heights[i]! > run) run = heights[i]!
  }
  const water: number[] = []
  for (let i = 0; i < n; i += 1) {
    const level = Math.min(leftMax[i]!, rightMax[i]!)
    water.push(Math.max(0, level - heights[i]!))
  }
  return water
}

/**
 * 盘面总蓄水量。
 * @param heights - 柱高数组。
 * @returns 各列蓄水格数之和。
 */
export function totalWater(heights: readonly number[]): number {
  let sum = 0
  for (const w of waterColumns(heights)) sum += w
  return sum
}

/** 一局的运行时状态。 */
export interface RainwaterState {
  /** 当前关（1 起）。 */
  level: number
  /** 注入种子与局号（共同决定各关地形，可复现）。 */
  seed: number
  run: number
  /** 初始地形基高（可降到的下限）。 */
  base: number[]
  /** 盆地左柱位置（生成保证，可解性测试与提示用）。 */
  basin: number
  /** 当前柱高（base + 已放砖）。 */
  heights: number[]
  /** 本关砖块预算与已用砖数。 */
  budget: number
  bricksUsed: number
  /** 本关目标水量。 */
  target: number
  /** playing 进行中；won 本关达成（finished=true 表示全部通关）。 */
  phase: 'playing' | 'won'
  finished: boolean
  /** 跨关累计分与本关得分。 */
  totalScore: number
  levelScore: number
  /** 最近一次非法操作的提示文案（'' 表示无）。 */
  hint: string
}

/**
 * 建一局（从第 1 关开始）。
 * @param seed - 种子。
 * @param run - 局号（与 seed 混合决定地形）。
 * @returns 第 1 关的初始状态。
 */
export function createRainwater(seed: number, run: number): RainwaterState {
  return createLevel(seed, run, 1, 0)
}

/**
 * 建指定关（携带累计分）。地形由 seed/run/level 三者决定，确定性。
 * @param seed - 种子。
 * @param run - 局号。
 * @param level - 关号（1..LEVEL_COUNT）。
 * @param totalScore - 进入本关前的累计分。
 * @returns 该关初始状态。
 */
export function createLevel(seed: number, run: number, level: number, totalScore: number): RainwaterState {
  const lv = LEVELS[Math.min(LEVEL_COUNT, Math.max(1, level)) - 1]!
  const rng = mulberry32((seed * 977 + run * 131 + level * 7919) >>> 0)
  const { base, basin } = generateTerrain(rng, lv.slots)
  return {
    level, seed, run,
    base, basin,
    heights: [...base],
    budget: lv.budget,
    bricksUsed: 0,
    target: lv.target,
    phase: 'playing',
    finished: false,
    totalScore,
    levelScore: 0,
    hint: '',
  }
}

/**
 * 进入下一关（保留累计分）；最后一关达成后调用返回原状态（finished）。
 * @param s - 当前已达成的状态。
 * @returns 下一关的初始状态或原状态。
 */
export function nextLevel(s: RainwaterState): RainwaterState {
  if (s.finished || s.level >= LEVEL_COUNT) return s
  return createLevel(s.seed, s.run, s.level + 1, s.totalScore)
}

/** 某列还能否升高：进行中、未到 MAX_H、预算有剩余。 */
export function canRaise(s: RainwaterState, col: number): boolean {
  if (s.phase !== 'playing') return false
  if (col < 0 || col >= s.heights.length) return false
  if (s.heights[col]! >= MAX_H) return false
  return s.bricksUsed < s.budget
}

/** 某列还能否降低：进行中且该列有已放置的砖（高于地形基高）。 */
export function canLower(s: RainwaterState, col: number): boolean {
  if (s.phase !== 'playing') return false
  if (col < 0 || col >= s.heights.length) return false
  return s.heights[col]! > s.base[col]!
}

/**
 * 升高某列 1 格（耗 1 砖）；非法时只写提示不动盘面。放砖后若总蓄水
 * 达到目标即判过关计分：本关得分 = 60 + 目标*10 + 剩余预算*8。
 * @param s - 状态。
 * @param col - 列号。
 */
export function raiseColumn(s: RainwaterState, col: number): void {
  if (col < 0 || col >= s.heights.length) return
  if (s.heights[col]! >= MAX_H) {
    s.hint = '这根柱子已到最高 ' + MAX_H + ' 格'
    return
  }
  if (s.bricksUsed >= s.budget) {
    s.hint = '砖块预算不足——试试拆别处的砖（右键）'
    return
  }
  if (s.phase !== 'playing') return
  s.hint = ''
  s.heights[col] = s.heights[col]! + 1
  s.bricksUsed += 1
  checkWin(s)
}

/**
 * 降低某列 1 格（拆回 1 砖并返还预算）。
 * @param s - 状态。
 * @param col - 列号。
 */
export function lowerColumn(s: RainwaterState, col: number): void {
  if (col < 0 || col >= s.heights.length) return
  if (s.heights[col]! <= s.base[col]!) {
    s.hint = '地形本身拆不动——只能拆你放上去的砖'
    return
  }
  if (s.phase !== 'playing') return
  s.hint = ''
  s.heights[col] = s.heights[col]! - 1
  s.bricksUsed -= 1
}

/**
 * 目标达成判定与计分（raiseColumn 内部调用）。
 * @param s - 状态。
 */
function checkWin(s: RainwaterState): void {
  if (s.phase !== 'playing') return
  if (totalWater(s.heights) < s.target) return
  s.phase = 'won'
  s.levelScore = 60 + s.target * 10 + (s.budget - s.bricksUsed) * 8
  s.totalScore += s.levelScore
  if (s.level >= LEVEL_COUNT) s.finished = true
}
