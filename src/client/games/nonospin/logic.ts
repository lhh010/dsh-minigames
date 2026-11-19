/**
 * 诺诺旋转（NonogramSpin）纯逻辑：标准非ograms 盘面 + 旋转 twist。每执行一次
 * 校验（未通过时）盘面顺时针旋转 90°——玩家已填的格子跟着转，而线索按旋转后
 * 的行列重新对应（玩家需在脑内旋转线索推理）。图案由注入 seed 的 mulberry32
 * 生成：先布图案，再推导四向轮转的线索。全部纯函数，确定性可测。
 */

/** 玩家格子标记：0 空 / 1 填黑 / 2 打叉（叉不参与对错判定，仅辅助排除）。 */
export type Cell = 0 | 1 | 2

/** 行列线索：连续黑段长度；空线为 [0]。 */
export interface Clues {
  rows: number[][]
  cols: number[][]
}

/** 关卡盘面边长：5 关从 5x5 递增到 10x10。 */
export const LEVEL_SIZES: readonly number[] = [5, 6, 7, 8, 10]
/** 每关可用的校验（旋转）次数：后期更紧。 */
export const LEVEL_CHECKS: readonly number[] = [5, 5, 4, 4, 3]
/** 关卡总数。 */
export const LEVEL_COUNT = LEVEL_SIZES.length

/** mulberry32 PRNG：小而快，同 seed 严格同序列。 */
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

/** 一行（布尔线）的线索：连续 true 段长度；全空返回 [0]。 */
export function lineClue(line: boolean[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const v of line) {
    if (v) run += 1
    else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  if (run > 0) runs.push(run)
  return runs.length === 0 ? [0] : runs
}

/** 由方阵图案推导原始朝向（未旋转）的行列线索。 */
export function cluesFrom(pattern: boolean[][]): Clues {
  const n = pattern.length
  const rows = pattern.map(lineClue)
  const cols: number[][] = []
  for (let c = 0; c < n; c += 1) cols.push(lineClue(pattern.map(row => row[c]!)))
  return { rows, cols }
}

/** 方阵顺时针旋转 90°：dst[r][c] = src[n-1-c][r]。 */
export function rotateGridCW<T>(grid: T[][]): T[][] {
  const n = grid.length
  const out: T[][] = []
  for (let r = 0; r < n; r += 1) {
    const row: T[] = []
    for (let c = 0; c < n; c += 1) row.push(grid[n - 1 - c]![r]!)
    out.push(row)
  }
  return out
}

/**
 * 线索随盘面顺时针旋转：新行 r 的线索来自原列 r 自下而上（线索段顺序反转），
 * 新列 c 的线索来自原行 n-1-c（顺序不变）。恒等于 cluesFrom(rotateGridCW(pattern))。
 */
export function rotateCluesCW(clues: Clues): Clues {
  return {
    rows: clues.cols.map(c => [...c].reverse()),
    cols: [...clues.rows].reverse().map(c => [...c]),
  }
}

/** 图案生成的重roll上限（密度窗口宽松，实际一次通过）。 */
const MAX_RETRIES = 64

/**
 * 由 seed 确定性地生成一关图案：约 40–65% 密度的随机盘面，拒绝全空与全满
 * （无解或无趣），必要时重roll（PRNG 继续推进，序列仍确定）。
 * @param seed - 本关种子（建议由 levelSeed 派生）。
 * @param size - 盘面边长。
 * @returns size x size 布尔方阵，必含至少一个 true 与一个 false。
 */
export function makePattern(seed: number, size: number): boolean[][] {
  const rng = mulberry32(seed)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const p = 0.4 + rng() * 0.25
    const pattern = Array.from({ length: size }, () => Array.from({ length: size }, () => rng() < p))
    const filled = pattern.flat().filter(Boolean).length
    if (filled === 0 || filled === size * size) continue
    return pattern
  }
  // 理论不可达（每个独立 roll 全同的概率极小）；返回棋盘格保底可玩。
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (r + c) % 2 === 0))
}

/**
 * 关卡种子派生：同一总局 seed 在同一关卡恒得到同一图案（seed 重放可测）。
 * @param seed - 总局种子。
 * @param level - 0 起关卡序号。
 */
export function levelSeed(seed: number, level: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(level + 1, 0xc2b2ae35)) >>> 0
}

/** 当前盘面与图案的错格数：填黑不等于图案即错；空格与叉都算未填。 */
export function countErrors(cells: Cell[][], pattern: boolean[][]): number {
  let errors = 0
  for (let r = 0; r < pattern.length; r += 1) {
    for (let c = 0; c < pattern.length; c += 1) {
      if ((cells[r]![c]! === 1) !== pattern[r]![c]!) errors += 1
    }
  }
  return errors
}

/** 过关判定：错格数为 0（填黑与图案完全一致）。 */
export function isSolved(cells: Cell[][], pattern: boolean[][]): boolean {
  return countErrors(cells, pattern) === 0
}

/** 游戏阶段：进行中 / 过关 / 校验次数耗尽失败。 */
export type Phase = 'playing' | 'won' | 'failed'

/** 一局的完整可变状态（logic 直接改写，render 只读）。 */
export interface NonospinState {
  /** 总局种子。 */
  seed: number
  /** 0 起关卡序号。 */
  level: number
  /** 本关盘面边长。 */
  size: number
  /** 剩余校验次数。 */
  checksLeft: number
  /** 校验总次数（HUD 展示）。 */
  checksTotal: number
  /** 累计旋转次数 mod 4（指南针朝向）。 */
  rotation: 0 | 1 | 2 | 3
  /** 目标图案（原始朝向，永不旋转）。 */
  pattern: boolean[][]
  /** 玩家标记（当前朝向；旋转时整阵轮转）。 */
  cells: Cell[][]
  /** 原始朝向线索（派生自 pattern）。 */
  clues: Clues
  /** 最近一次校验的错格数（null = 尚未校验）。 */
  lastErrors: number | null
  /** 当前阶段。 */
  phase: Phase
}

/** 建立某一关的初始状态。 */
export function createLevelState(seed: number, level: number): NonospinState {
  const idx = Math.min(Math.max(level, 0), LEVEL_COUNT - 1)
  const size = LEVEL_SIZES[idx]!
  const checksTotal = LEVEL_CHECKS[idx]!
  const pattern = makePattern(levelSeed(seed, idx), size)
  return {
    seed,
    level: idx,
    size,
    checksLeft: checksTotal,
    checksTotal,
    rotation: 0,
    pattern,
    cells: Array.from({ length: size }, () => Array<Cell>(size).fill(0)),
    clues: cluesFrom(pattern),
    lastErrors: null,
    phase: 'playing',
  }
}

/** 建立第 0 关状态。 */
export function createNonospinState(seed: number): NonospinState {
  return createLevelState(seed, 0)
}

/** 就地重置当前关（保留关卡进度与种子）。 */
export function restartLevel(state: NonospinState): void {
  const fresh = createLevelState(state.seed, state.level)
  state.size = fresh.size
  state.checksLeft = fresh.checksLeft
  state.checksTotal = fresh.checksTotal
  state.rotation = fresh.rotation
  state.pattern = fresh.pattern
  state.cells = fresh.cells
  state.clues = fresh.clues
  state.lastErrors = fresh.lastErrors
  state.phase = fresh.phase
}

/**
 * 设置一格标记（越界或非进行中忽略）。填黑/打叉互斥。
 * @param state - 当前状态。
 * @param r - 行（当前朝向坐标）。
 * @param c - 列（当前朝向坐标）。
 * @param value - 目标标记。
 */
export function setCell(state: NonospinState, r: number, c: number, value: Cell): void {
  if (state.phase !== 'playing') return
  if (r < 0 || r >= state.size || c < 0 || c >= state.size) return
  state.cells[r]![c] = value
}

/** 校验结果：错格数、是否过关、本次是否触发了旋转。 */
export interface CheckResult {
  errors: number
  won: boolean
  rotated: boolean
}

/**
 * 执行一次校验（空格键）：统计当前错格数（不指出位置）。全对过关不旋转；
 * 有错则消耗一次校验并顺时针旋转盘面（玩家格子整阵轮转），次数耗尽即失败。
 * 非进行中调用是无害空操作（返回当前错格数）。
 */
export function checkBoard(state: NonospinState): CheckResult {
  const errors = countErrors(state.cells, state.pattern)
  state.lastErrors = errors
  if (state.phase !== 'playing') return { errors, won: state.phase === 'won', rotated: false }
  if (errors === 0) {
    state.phase = 'won'
    return { errors, won: true, rotated: false }
  }
  state.checksLeft -= 1
  if (state.checksLeft <= 0) {
    state.checksLeft = 0
    state.phase = 'failed'
    return { errors, won: false, rotated: false }
  }
  state.cells = rotateGridCW(state.cells)
  state.rotation = ((state.rotation + 1) % 4) as 0 | 1 | 2 | 3
  return { errors, won: false, rotated: true }
}

/**
 * 当前朝向应显示的线索：把原始线索顺时针轮转 rotation 次。
 * 恒等于 cluesFrom(rotateGridCW 应用 rotation 次后的 pattern)。
 */
export function displayClues(state: NonospinState): Clues {
  let clues = state.clues
  for (let i = 0; i < state.rotation; i += 1) clues = rotateCluesCW(clues)
  return clues
}

/**
 * 过关得分：基础 100 + 剩余校验奖励（每次 25）− 旋转惩罚（每次 5，下限 0）。
 * @param checksLeft - 过关时剩余校验次数。
 * @param rotations - 本关累计旋转次数。
 */
export function levelScore(checksLeft: number, rotations: number): number {
  return Math.max(0, 100 + checksLeft * 25 - rotations * 5)
}
