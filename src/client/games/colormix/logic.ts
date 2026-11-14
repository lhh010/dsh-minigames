/**
 * 调色大师纯逻辑：红/黄/蓝滴剂按通道线性平均混合、欧氏色差、阈值
 * 判定、计分与种子关卡生成（从原色比例反推目标色，天然可解）。
 * 全部为确定性纯函数，随机只走注入的 mulberry32 种子。
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

/** 一格 RGB 颜色（各通道 0..255）。 */
export type RGB = readonly [number, number, number]

/** 三原色滴剂：红 / 黄 / 蓝（色号 0 / 1 / 2）。 */
export const PRIMARIES: readonly RGB[] = [
  [255, 0, 0],
  [255, 255, 0],
  [0, 0, 255],
] as const

/** 一关的难度参数。 */
export interface LevelConfig {
  /** 显示用短标签。 */
  label: string
  /** 本关滴数上限。 */
  maxDrops: number
  /** 过关色差阈值（欧氏距离，越小越难）。 */
  threshold: number
}

/** 五关递进：滴数收紧、阈值逐关收窄。 */
export const LEVELS: readonly LevelConfig[] = [
  { label: 'L1', maxDrops: 6, threshold: 60 },
  { label: 'L2', maxDrops: 5, threshold: 48 },
  { label: 'L3', maxDrops: 5, threshold: 38 },
  { label: 'L4', maxDrops: 4, threshold: 30 },
  { label: 'L5', maxDrops: 4, threshold: 22 },
] as const

/**
 * 混合累积平均：所有已滴滴剂按通道线性平均后四舍五入。
 * @param drops - 已滴的原色色号序列（每个 0..2）。
 * @returns 混合色；空序列返回 [0,0,0]（表示尚未滴入，画布以空盘呈现）。
 */
export function mixColor(drops: readonly number[]): RGB {
  if (drops.length === 0) return [0, 0, 0]
  let r = 0
  let y = 0
  let b = 0
  for (const drop of drops) {
    const primary = PRIMARIES[drop]
    if (primary === undefined) continue
    r += primary[0]
    y += primary[1]
    b += primary[2]
  }
  const n = drops.length
  return [Math.round(r / n), Math.round(y / n), Math.round(b / n)]
}

/**
 * 两色的欧氏距离（RGB 三通道方差和开方）。
 * @returns 距离，0..442（黑白极值约 441.67）。
 */
export function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

/**
 * 过关判定：色差不超过阈值（含等号——恰好压线也算过）。
 * @param distance - 当前混合与目标的色差。
 * @param threshold - 本关阈值。
 */
export function isWithinThreshold(distance: number, threshold: number): boolean {
  return distance <= threshold
}

/**
 * 过关计分：基础 100 + 剩余滴数奖励（每滴 30，鼓励压线少用）+ 精度奖励
 * （色差越贴近 0 越高，至多 50）。
 * @param distance - 过关时的色差（须 ≤ threshold）。
 * @param threshold - 本关阈值。
 * @param remaining - 提前达标时省下的滴数。
 * @returns 本关得分。
 */
export function scoreFor(distance: number, threshold: number, remaining: number): number {
  const accuracy = Math.max(0, 1 - distance / threshold)
  return 100 + remaining * 30 + Math.round(accuracy * 50)
}

/**
 * 目标色的中文名（展示用）：按 HSV 色相分桶，低饱和归灰。
 * @param rgb - 目标色。
 * @returns 红/橙/黄/绿/青/蓝/紫/粉/灰 之一。
 */
export function nameFor(rgb: RGB): string {
  const [r, y, b] = rgb
  const max = Math.max(r, y, b)
  const min = Math.min(r, y, b)
  if (max - min < 24) return '灰'
  const d = max - min
  let hue: number
  if (max === r) hue = 60 * (((y - b) / d) % 6)
  else if (max === y) hue = 60 * ((b - r) / d + 2)
  else hue = 60 * ((r - y) / d + 4)
  if (hue < 0) hue += 360
  if (hue < 15 || hue >= 345) return '红'
  if (hue < 40) return '橙'
  if (hue < 70) return '黄'
  if (hue < 165) return '绿'
  if (hue < 200) return '青'
  if (hue < 260) return '蓝'
  if (hue < 300) return '紫'
  return '粉'
}

/** 一关的完整出题结果。 */
export interface LevelRound {
  /** 目标色（恰等于 recipe 的混合结果，可解）。 */
  target: RGB
  /** 目标色名称（展示用）。 */
  name: string
  /** 反推出目标色的滴剂序列（每项 0..2）。 */
  recipe: number[]
  /** 本关难度。 */
  config: LevelConfig
}

/**
 * 用种子确定性出一关：先随机一条 2..(maxDrops-1) 滴的配方（保证至少
 * 两种原色参与、且至少剩 1 滴余量），再取配方混合为目标色——目标永远
 * 可以在滴数上限内零误差复现。
 * @param seed - 整数种子（同种子同关）。
 * @param levelIdx - 关卡下标（0..LEVELS.length-1）。
 */
export function makeLevel(seed: number, levelIdx: number): LevelRound {
  const config = LEVELS[levelIdx]!
  const rng = mulberry32((seed ^ Math.imul(levelIdx + 1, 0x9e3779b9)) >>> 0)
  const maxTotal = Math.max(2, config.maxDrops - 1)
  let recipe: number[] = []
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const total = 2 + Math.floor(rng() * (maxTotal - 1))
    recipe = []
    for (let i = 0; i < total; i += 1) recipe.push(Math.floor(rng() * 3))
    if (new Set(recipe).size >= 2) break
  }
  const target = mixColor(recipe)
  return { target, name: nameFor(target), recipe, config }
}
