/**
 * 贤贤 (KenKen) 纯逻辑：6×6 拉丁方（每行每列 1-6 各出现一次），盘面划
 * 分为若干相邻格组成的「笼」（2-4 格），每笼标注目标数与运算
 * (+−×÷)；笼内数字按运算恰好得出目标数。
 *
 * 生成流程（全部随机走注入 seed 的 mulberry32，确定性可测）：
 * 1. 由随机行位移 + 随机列置换 + 随机数字置换构造合法拉丁方解；
 * 2. 贪心生长划分笼：随机起点、随机相邻扩展至目标大小；
 * 3. 从解反推每笼的运算与目标数（减/除为任意顺序的两格），保证解存在。
 */

/** 盘面边长（6×6，数字 1-6）。 */
export const KENKEN_SIZE = 6

/** 关卡总数。 */
export const LEVEL_COUNT = 5

/** 笼运算符：加、减、乘、除。 */
export type CageOp = '+' | '-' | '×' | '÷'

/** 一个笼：连通的同笼格子 + 目标数与运算。 */
export interface KenkenCage {
  op: CageOp
  target: number
  cells: { r: number; c: number }[]
}

/** 一关的完整盘面。 */
export interface KenkenPuzzle {
  /** 1 基关卡号（1-5）。 */
  level: number
  /** 笼列表（合起来恰好覆盖全盘）。 */
  cages: KenkenCage[]
  /** 每格所属笼下标 cageOf[r][c]。 */
  cageOf: readonly (readonly number[])[]
  /** 生成时的完整解（拉丁方）。 */
  solution: readonly (readonly number[])[]
}

/** mulberry32 伪随机数发生器：同 seed 序列完全一致。 */
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

/** 关卡难度配置：笼大小候选与本关开放的运算符（逐关加码）。 */
export interface LevelConfig {
  sizes: number[]
  ops: CageOp[]
}

/** 1 基关卡（越界循环）的难度配置。 */
export function levelConfig(level: number): LevelConfig {
  const configs: LevelConfig[] = [
    { sizes: [2, 3], ops: ['+'] },
    { sizes: [2, 3], ops: ['+', '-'] },
    { sizes: [2, 3, 4], ops: ['+', '-', '×'] },
    { sizes: [2, 3, 4], ops: ['+', '-', '×', '÷'] },
    { sizes: [2, 3, 4], ops: ['+', '-', '×', '÷'] },
  ]
  return configs[(level - 1) % configs.length]!
}

/** 过关得分：100×关卡 + 随秒数衰减的时限奖励（每秒 -5，下限 0）。 */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/** 用 rng 原地洗牌（Fisher-Yates）。 */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = items[i]!
    items[i] = items[j]!
    items[j] = tmp
  }
  return items
}

/**
 * 构造 n×n 拉丁方：随机循环行位移（位移本身是 1..n 的置换）保证每行每列
 * 互不重复，再叠加随机列置换与随机数字置换打散外观。
 */
function latinSquare(rng: () => number, n: number): number[][] {
  const shifts = shuffle([...Array(n).keys()], rng)
  const cols = shuffle([...Array(n).keys()], rng)
  const digits = shuffle([...Array(n).keys()].map(i => i + 1), rng)
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => digits[(cols[c]! + shifts[r]!) % n]!))
}

/** 拉丁方校验：每行每列都是 1..n 的排列（0 视为已填非法值）。 */
export function isLatin(grid: readonly (readonly number[])[], n: number = KENKEN_SIZE): boolean {
  const want = new Set<number>()
  for (let v = 1; v <= n; v += 1) want.add(v)
  for (let r = 0; r < n; r += 1) {
    if (new Set(grid[r]).size !== n) return false
    for (let c = 0; c < n; c += 1) if (!want.has(grid[r]![c]!)) return false
  }
  for (let c = 0; c < n; c += 1) {
    const seen = new Set<number>()
    for (let r = 0; r < n; r += 1) {
      const v = grid[r]![c]!
      if (!want.has(v) || seen.has(v)) return false
      seen.add(v)
    }
  }
  return true
}

/** 笼标签文本，如 '12×'、'7+'、'3-'、'2÷'。 */
export function cageLabel(cage: KenkenCage): string {
  return String(cage.target) + cage.op
}

/** 笼内是否已全部填数。 */
export function cageComplete(cage: KenkenCage, grid: readonly (readonly number[])[]): boolean {
  return cage.cells.every(p => grid[p.r]![p.c]! >= 1)
}

/**
 * 笼运算判定：笼内数字按运算得出目标数则 true。'-' 与 '÷' 仅用于两格
 * 笼且不区分顺序（大减小 / 大除小）；'+ / ×' 为全笼求和 / 求积。任一格
 * 未填（0）视为未达成。
 */
export function cageSatisfied(cage: KenkenCage, grid: readonly (readonly number[])[]): boolean {
  const vals = cage.cells.map(p => grid[p.r]![p.c]!)
  if (vals.some(v => v < 1)) return false
  if (cage.op === '+') return vals.reduce((a, b) => a + b, 0) === cage.target
  if (cage.op === '×') return vals.reduce((a, b) => a * b, 1) === cage.target
  if (cage.op === '-') {
    return vals.length === 2 && Math.abs(vals[0]! - vals[1]!) === cage.target
  }
  const hi = Math.max(vals[0]!, vals[1]!)
  const lo = Math.min(vals[0]!, vals[1]!)
  return vals.length === 2 && lo > 0 && hi % lo === 0 && hi / lo === cage.target
}

/**
 * 实时错误格标记：同行或同列重复数字的格子、以及所在笼已填满但结果
 * 不等于目标数的格子标 true。
 */
export function cellErrors(puzzle: KenkenPuzzle, grid: readonly (readonly number[])[]): boolean[][] {
  const n = puzzle.solution.length
  const bad = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const v = grid[r]![c]!
      if (v < 1) continue
      for (let i = 0; i < n; i += 1) {
        if (i !== c && grid[r]![i]! === v) bad[r]![c] = true
        if (i !== r && grid[i]![c]! === v) bad[r]![c] = true
      }
    }
  }
  for (const cage of puzzle.cages) {
    if (!cageComplete(cage, grid)) continue
    if (cageSatisfied(cage, grid)) continue
    for (const p of cage.cells) bad[p.r]![p.c] = true
  }
  return bad
}

/** 完成判定：全盘填满且无任何行/列重复或笼运算错误。 */
export function isWon(puzzle: KenkenPuzzle, grid: readonly (readonly number[])[]): boolean {
  const n = puzzle.solution.length
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) if (grid[r]![c]! < 1) return false
  }
  const bad = cellErrors(puzzle, grid)
  return bad.every(row => row.every(v => !v))
}

/** 格子集合是否四连通。 */
function cellsConnected(cells: { r: number; c: number }[], n: number): boolean {
  if (cells.length <= 1) return true
  const all = new Set(cells.map(p => p.r * n + p.c))
  const seen = new Set<number>([cells[0]!.r * n + cells[0]!.c])
  const queue = [cells[0]!]
  while (queue.length > 0) {
    const p = queue.shift()!
    for (const d of [-1, 1]) {
      for (const [dr, dc] of [[d, 0], [0, d]] as const) {
        const r = p.r + dr
        const c = p.c + dc
        if (r < 0 || r >= n || c < 0 || c >= n) continue
        const key = r * n + c
        if (!all.has(key) || seen.has(key)) continue
        seen.add(key)
        queue.push({ r, c })
      }
    }
  }
  return seen.size === cells.length
}

/**
 * 贪心划分：随机顺序取未分笼格作起点，随机相邻扩展到目标大小；结束后
 * 修复落单格 —— 落单笼优先并入相邻的最小笼（仍 ≤4 格），四周都是 4 格
 * 笼时从相邻笼借一枚仍保持其连通的格子，保证每笼 2-4 格。
 */
function partition(rng: () => number, n: number, sizes: number[]): { r: number; c: number }[][] {
  const owner = Array.from({ length: n }, () => new Array<number>(n).fill(-1))
  const cells = shuffle(
    Array.from({ length: n * n }, (_, i) => ({ r: Math.floor(i / n), c: i % n })),
    rng,
  )
  const cages: { r: number; c: number }[][] = []
  for (const start of cells) {
    if (owner[start.r]![start.c]! !== -1) continue
    const id = cages.length
    owner[start.r]![start.c] = id
    const cage = [start]
    const target = sizes[Math.floor(rng() * sizes.length)]!
    while (cage.length < target) {
      const frontier: { r: number; c: number }[] = []
      for (const p of cage) {
        const dirs = [
          { r: p.r - 1, c: p.c }, { r: p.r + 1, c: p.c },
          { r: p.r, c: p.c - 1 }, { r: p.r, c: p.c + 1 },
        ]
        for (const d of dirs) {
          if (d.r < 0 || d.r >= n || d.c < 0 || d.c >= n) continue
          if (owner[d.r]![d.c]! !== -1) continue
          if (!frontier.some(f => f.r === d.r && f.c === d.c)) frontier.push(d)
        }
      }
      if (frontier.length === 0) break
      const pick = frontier[Math.floor(rng() * frontier.length)]!
      owner[pick.r]![pick.c] = id
      cage.push(pick)
    }
    cages.push(cage)
  }
  // 修复大小为 1 的笼（终局兜底：重复直到没有落单笼）。
  for (let pass = 0; pass < n * n; pass += 1) {
    const idx = cages.findIndex(c => c.length === 1)
    if (idx === -1) break
    const lone = cages[idx]![0]!
    const neighborIds = new Set<number>()
    for (const d of [-1, 1]) {
      for (const [dr, dc] of [[d, 0], [0, d]] as const) {
        const r = lone.r + dr
        const c = lone.c + dc
        if (r < 0 || r >= n || c < 0 || c >= n) continue
        for (let k = 0; k < cages.length; k += 1) {
          if (k !== idx && cages[k]!.some(p => p.r === r && p.c === c)) neighborIds.add(k)
        }
      }
    }
    // 首选：并入最小的且并入后仍 ≤4 格的相邻笼。
    const mergeable = [...neighborIds].filter(k => cages[k]!.length < 4).sort((a, b) => cages[a]!.length - cages[b]!.length)
    if (mergeable.length > 0) {
      cages[mergeable[0]!]!.push(lone)
      cages.splice(idx, 1)
      continue
    }
    // 兜底：从相邻 4 格笼借一枚与落单格相邻、且移出后原笼仍连通的格子。
    let stole = false
    for (const k of [...neighborIds].sort((a, b) => rng() - 0.5)) {
      const donor = cages[k]!
      for (let i = 0; i < donor.length; i += 1) {
        const p = donor[i]!
        if (Math.abs(p.r - lone.r) + Math.abs(p.c - lone.c) !== 1) continue
        const rest = donor.filter((_, j) => j !== i)
        if (!cellsConnected(rest, n)) continue
        donor.splice(i, 1)
        cages[idx]!.push(p)
        stole = true
        break
      }
      if (stole) break
    }
    if (!stole) cages.splice(idx, 1) // 理论不可达；丢弃避免死循环
  }
  return cages
}

/**
 * 从解反推笼标签：两格笼在允许运算内收集候选（÷ 需整除且商 ≥ 2，
 * 免出无信息量的 1÷），多格笼只用 + / ×；随机挑一个。每关配置都含
 * '+'，候选永远非空。
 */
function labelCage(rng: () => number, cells: { r: number; c: number }[], solution: readonly (readonly number[])[], ops: readonly CageOp[]): KenkenCage {
  const vals = cells.map(p => solution[p.r]![p.c]!)
  const candidates: KenkenCage[] = []
  if (cells.length === 2) {
    const a = vals[0]!
    const b = vals[1]!
    const hi = Math.max(a, b)
    const lo = Math.min(a, b)
    if (ops.includes('+')) candidates.push({ op: '+', target: a + b, cells })
    if (ops.includes('×')) candidates.push({ op: '×', target: a * b, cells })
    if (ops.includes('-')) candidates.push({ op: '-', target: hi - lo, cells })
    if (ops.includes('÷') && hi % lo === 0 && hi / lo >= 2) candidates.push({ op: '÷', target: hi / lo, cells })
  } else {
    if (ops.includes('+')) candidates.push({ op: '+', target: vals.reduce((x, y) => x + y, 0), cells })
    if (ops.includes('×')) candidates.push({ op: '×', target: vals.reduce((x, y) => x * y, 1), cells })
  }
  return candidates[Math.floor(rng() * candidates.length)]!
}

/**
 * 按 seed 确定性生成一关（level 1-5）：拉丁方解 + 贪心分笼 + 反推标注。
 * 同 seed 同关卡产物完全一致；解必然存在（即 puzzle.solution）。
 */
export function generateKenken(seed: number, level: number): KenkenPuzzle {
  const rng = mulberry32(seed)
  const n = KENKEN_SIZE
  const cfg = levelConfig(level)
  const solution = latinSquare(rng, n)
  const cages = partition(rng, n, cfg.sizes).map(cells => labelCage(rng, cells, solution, cfg.ops))
  const cageOf = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  cages.forEach((cage, i) => {
    for (const p of cage.cells) cageOf[p.r]![p.c] = i
  })
  return { level, cages, cageOf, solution }
}
