/**
 * 圆周挑战 (Circle Math) 纯逻辑：3~4 个同心数字圆环可独立旋转，每环
 * 划分为相同的 S 个扇区；任一时刻每个径向列（各环同一角度位）有一个
 * 数字之和，目标是旋转各环让所有列之和都等于同一个目标值 T。
 *
 * 生成：先随机取每列前 R-1 环的数字，末环数字由 T 补差（保证落在数字
 * 范围内，逐列重掷），因此"全部偏移对齐"恒为一个解；起始偏移随机且不
 * 为已解状态。求解器在 S^R 个偏移组合中暴力搜索（8^4=4096 上限，可承受），
 * 供判定多解与 H 提示使用。每旋转一步计步，超过步数上限判负。
 */

/** 各关卡配置（1 基关卡 → 下标 0..4）：环数/扇区数/数字上限/步数上限递增。 */
export interface CircleLevelConfig {
  /** 同心圆环数量（3~4）。 */
  rings: number
  /** 每环扇区数（6~8，各环相同）。 */
  sectors: number
  /** 扇区数字上限（数字范围 1..maxValue）。 */
  maxValue: number
  /** 本关步数上限，超出判负。 */
  maxSteps: number
}

/** 5 个关卡的递进配置。 */
export const LEVEL_CONFIGS: readonly CircleLevelConfig[] = [
  { rings: 3, sectors: 6, maxValue: 6, maxSteps: 24 },
  { rings: 3, sectors: 7, maxValue: 9, maxSteps: 28 },
  { rings: 4, sectors: 7, maxValue: 12, maxSteps: 32 },
  { rings: 4, sectors: 8, maxValue: 15, maxSteps: 36 },
  { rings: 4, sectors: 8, maxValue: 19, maxSteps: 40 },
] as const

/** 局面状态：游玩中 / 过关 / 超步判负。 */
export type CircleStatus = 'playing' | 'won' | 'lost'

/** 一个生成的圆周挑战关卡。 */
export interface CirclePuzzle {
  /** 环数 R。 */
  rings: number
  /** 每环扇区数 S。 */
  sectors: number
  /** 目标列和 T。 */
  target: number
  /** 环 r 的扇区 j 的数字（r=0 为最内环）。 */
  numbers: readonly (readonly number[])[]
  /** 起始偏移（环 r 的旋转量，扇区 j 显示在列 (j+offset)%S）。 */
  startOffsets: readonly number[]
}

/** 可渲染/可推进的一局状态（不可变，操作返回新状态）。 */
export interface CircleState {
  /** 关卡数据。 */
  puzzle: CirclePuzzle
  /** 当前各环偏移。 */
  offsets: readonly number[]
  /** 已用步数。 */
  steps: number
  /** 步数上限（同 puzzle 来源关卡）。 */
  maxSteps: number
  /** 局面状态。 */
  status: CircleStatus
}

/** mulberry32 PRNG：小而快，按种子确定。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 1 基关卡的配置（超过第 5 关后循环）。 */
export function levelConfig(level: number): CircleLevelConfig {
  return LEVEL_CONFIGS[(level - 1) % LEVEL_CONFIGS.length]!
}

/**
 * 计算当前偏移下每个径向列的数字之和。
 * @param puzzle - 关卡。
 * @param offsets - 各环偏移。
 * @returns 长度为 S 的列和数组。
 */
export function columnSums(puzzle: CirclePuzzle, offsets: readonly number[]): number[] {
  const sums = new Array<number>(puzzle.sectors).fill(0)
  for (let r = 0; r < puzzle.rings; r += 1) {
    const off = ((offsets[r] ?? 0) % puzzle.sectors + puzzle.sectors) % puzzle.sectors
    for (let j = 0; j < puzzle.sectors; j += 1) {
      sums[(j + off) % puzzle.sectors]! += puzzle.numbers[r]![j]!
    }
  }
  return sums
}

/**
 * 纯胜利判定：所有径向列之和都等于目标值。
 * @param puzzle - 关卡。
 * @param offsets - 各环偏移。
 * @returns 是否已解。
 */
export function isSolved(puzzle: CirclePuzzle, offsets: readonly number[]): boolean {
  return columnSums(puzzle, offsets).every((s) => s === puzzle.target)
}

/**
 * 暴力求解：枚举全部偏移组合（≤ 8^4），返回第一个让所有列和等于目标
 * 值的组合。
 * @param puzzle - 关卡。
 * @returns 一个已解偏移组合，无解时为 null。
 */
export function solveOffsets(puzzle: CirclePuzzle): number[] | null {
  const total = puzzle.sectors ** puzzle.rings
  for (let code = 0; code < total; code += 1) {
    const offsets: number[] = []
    let rest = code
    for (let r = 0; r < puzzle.rings; r += 1) {
      offsets.push(rest % puzzle.sectors)
      rest = Math.floor(rest / puzzle.sectors)
    }
    if (isSolved(puzzle, offsets)) return offsets
  }
  return null
}

/**
 * 由种子确定性地生成一关：目标值取环数与数字范围的中位乘积附近，每列
 * 前 R-1 环随机取数、末环由目标补差（越界逐列重掷，保底均分回退），
 * 起始偏移随机且保证开局未解。
 * @param seed - 种子（不同关卡用不同种子）。
 * @param level - 1 基关卡号。
 * @returns 生成的关卡。
 */
export function puzzleFromSeed(seed: number, level: number): CirclePuzzle {
  const cfg = levelConfig(level)
  const rng = mulberry32(seed)
  const target = Math.max(cfg.rings, Math.round((cfg.rings * (1 + cfg.maxValue)) / 2))
  const numbers: number[][] = []
  for (let r = 0; r < cfg.rings; r += 1) numbers.push(new Array<number>(cfg.sectors).fill(0))
  for (let col = 0; col < cfg.sectors; col += 1) {
    // 前 R-1 环随机取数，末环 = 目标 - 其余之和，须落在 1..maxValue。
    let placed = false
    for (let attempt = 0; attempt < 64 && !placed; attempt += 1) {
      let sum = 0
      for (let r = 0; r < cfg.rings - 1; r += 1) {
        const v = 1 + Math.floor(rng() * cfg.maxValue)
        numbers[r]![col] = v
        sum += v
      }
      const last = target - sum
      if (last >= 1 && last <= cfg.maxValue) {
        numbers[cfg.rings - 1]![col] = last
        placed = true
      }
    }
    if (!placed) {
      // 回退：本列全部取目标均分（整除性由目标 ≥ 环数且余数摊到前几环保证）。
      const base = Math.floor(target / cfg.rings)
      let rest = target - base * cfg.rings
      for (let r = 0; r < cfg.rings; r += 1) {
        const extra = rest > 0 ? 1 : 0
        rest -= extra
        numbers[r]![col] = Math.min(cfg.maxValue, base + extra)
      }
    }
  }
  // 起始偏移：随机非零组合且保证开局未解。
  let startOffsets: number[] = []
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate: number[] = []
    for (let r = 0; r < cfg.rings; r += 1) {
      // 每环至少 1/2 概率偏离 0，避免开局即解。
      candidate.push(Math.floor(rng() * cfg.sectors))
    }
    if (!isSolved({ ...cfgShape(cfg, numbers, target), startOffsets: candidate }, candidate)) {
      startOffsets = candidate
      break
    }
  }
  if (startOffsets.length === 0) startOffsets = new Array<number>(cfg.rings).fill(0).map((_, r) => (r === 0 ? 1 : 0))
  return { rings: cfg.rings, sectors: cfg.sectors, target, numbers, startOffsets }
}

/** 组装校验用关卡对象（puzzleFromSeed 内部使用）。 */
function cfgShape(cfg: CircleLevelConfig, numbers: readonly (readonly number[])[], target: number): CirclePuzzle {
  return { rings: cfg.rings, sectors: cfg.sectors, target, numbers, startOffsets: [] }
}

/**
 * 由关卡构造开局状态。
 * @param puzzle - 关卡。
 * @param maxSteps - 本关步数上限。
 * @returns 游玩中的初始状态。
 */
export function initialState(puzzle: CirclePuzzle, maxSteps: number): CircleState {
  return { puzzle, offsets: [...puzzle.startOffsets], steps: 0, maxSteps, status: 'playing' }
}

/**
 * 旋转一个环一步（dir=+1 顺时针视觉偏移 / -1 逆推），计一步；已结束的
 * 局面原样返回；超步且未解则判负。不修改传入状态。
 * @param state - 当前状态。
 * @param ring - 环下标（0 基，越界原样返回）。
 * @param dir - +1 或 -1。
 * @returns 新状态。
 */
export function rotateRing(state: CircleState, ring: number, dir: number): CircleState {
  if (state.status !== 'playing') return state
  if (ring < 0 || ring >= state.puzzle.rings) return state
  const sectors = state.puzzle.sectors
  const offsets = [...state.offsets]
  offsets[ring] = (((offsets[ring]! + dir) % sectors) + sectors) % sectors
  const steps = state.steps + 1
  if (isSolved(state.puzzle, offsets)) {
    return { ...state, offsets, steps, status: 'won' }
  }
  if (steps > state.maxSteps) {
    return { ...state, offsets, steps, status: 'lost' }
  }
  return { ...state, offsets, steps }
}

/**
 * 过关得分：基础 100×关卡 + 步数奖励（剩余步数占比 × 2000，向下取整，
 * 用过提示则步数奖励归零）。
 * @param level - 1 基关卡号。
 * @param steps - 已用步数。
 * @param maxSteps - 本关步数上限。
 * @param hintUsed - 本关是否用过提示。
 * @returns 得分。
 */
export function computeScore(level: number, steps: number, maxSteps: number, hintUsed: boolean): number {
  const base = 100 * level
  if (hintUsed) return base
  const remain = Math.max(0, maxSteps - steps)
  return base + Math.floor((remain / maxSteps) * 2000)
}
