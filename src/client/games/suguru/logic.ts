/**
 * 数块 Suguru 纯逻辑。盘面划分为正交连通区域，每块区域大小 s ∈ [1,5]；
 * 区域内格子填 1..s 且不重复，任意正交或斜向（王步）相邻的两格数字
 * 不同。生成流程：先抽各区域目标大小（总和 = 格数，每区 1..5），撒锚
 * 后同步生长到目标（可选项最少者优先）；随后用受限回溯（候选 = 区域
 * 内未用 & 王邻域未用，MRV 选格）求出一个完整解，最后逐步揭示给定格
 * 并用同一回溯计数解，解唯一即发布；预算用尽仍未唯一则带「多解」徽
 * 章发布（胜负判定纯按规则，不依赖唯一解）。
 */

/** 五个关卡的盘面边长（5×5 → 9×9，第 5 关后循环）。 */
export const LEVEL_SIZES = [5, 6, 7, 8, 9] as const

/** 区域大小上限（经典 Suguru 规则）。 */
export const MAX_REGION = 5

/** 一个生成好的关卡。 */
export interface SuguruPuzzle {
  /** 盘面边长（格）。 */
  size: number
  /** 格 → 区域编号（0 基，连续）。 */
  region: readonly number[]
  /** 区域编号 → 区域大小。 */
  regionSizes: readonly number[]
  /** 区域编号 → 成员格下标。 */
  regionCells: readonly (readonly number[])[]
  /** 给定格：格下标 → 锁定值。 */
  givens: ReadonlyMap<number, number>
  /** 生成时的完整解（提示用）。 */
  solution: readonly number[]
  /** 求解器是否证明了唯一解（false = 多解徽章）。 */
  unique: boolean
  /** 生成消耗的掷次（诊断）。 */
  attempts: number
}

/** 求解计数结果。 */
export interface SolveResult {
  /** 找到的解数（封顶 2）。 */
  solutions: number
  /** 节点预算耗尽前是否搜完了整个空间。 */
  exhausted: boolean
  /** 消耗的搜索节点数。 */
  nodes: number
}

/** mulberry32 PRNG：小而快，同种子确定性。 */
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

/** 1 基关卡的盘面边长（第 5 关后循环）。 */
export function levelSize(level: number): number {
  return LEVEL_SIZES[((level - 1) % LEVEL_SIZES.length + LEVEL_SIZES.length) % LEVEL_SIZES.length]!
}

/**
 * 目标区域数：max(边长, ceil(格数/5))，即恰好覆盖全盘的下限密度。经
 * 典 Suguru 区域 ≤5 格；密度更高时区域数逼近王步独立数 ceil(边长/2)²
 * （每个区域的解必含 1，两个 1 不能王步相邻），有机划分的可解率骤降，
 * 生成大量重掷后仍退条带，故取覆盖下限。
 * @param size - 盘面边长。
 * @returns 该边长的目标区域数。
 */
export function regionCountFor(size: number): number {
  return Math.max(size, Math.ceil((size * size) / MAX_REGION))
}

/** 过关得分：基础 100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/** 正交（上下左右）邻居。 */
export function neighbors(size: number, cell: number): number[] {
  const r = Math.floor(cell / size)
  const c = cell % size
  const out: number[] = []
  if (r > 0) out.push(cell - size)
  if (r < size - 1) out.push(cell + size)
  if (c > 0) out.push(cell - 1)
  if (c < size - 1) out.push(cell + 1)
  return out
}

/** 王步邻居：正交 + 斜向共 8 格。 */
export function kingNeighbors(size: number, cell: number): number[] {
  const r = Math.floor(cell / size)
  const c = cell % size
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
      out.push(nr * size + nc)
    }
  }
  return out
}

/** Fisher-Yates 洗牌（in place，返回同一数组）。 */
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
 * 划分是否是合法 Suguru 底盘：覆盖全盘、每区域正交连通、大小 ∈ [1,5]。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 */
export function patternValid(size: number, region: readonly number[]): boolean {
  const total = size * size
  if (region.length !== total) return false
  const groups = new Map<number, number[]>()
  for (let cell = 0; cell < total; cell += 1) {
    const id = region[cell]!
    if (!Number.isInteger(id) || id < 0) return false
    const members = groups.get(id) ?? []
    members.push(cell)
    groups.set(id, members)
  }
  for (const members of groups.values()) {
    if (members.length < 1 || members.length > MAX_REGION) return false
    // 连通性：从首员洪水填充，能触达全部成员。
    const memberSet = new Set(members)
    const seen = new Set<number>([members[0]!])
    const stack = [members[0]!]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const n of neighbors(size, cur)) {
        if (memberSet.has(n) && !seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    if (seen.size !== members.length) return false
  }
  return true
}

/** 抽取各区域目标大小：每区 1 起步，随机补齐到总和 = 格数（每区 ≤5）。 */
function drawSizes(total: number, count: number, rng: () => number): number[] {
  const sizes = new Array<number>(count).fill(1)
  let left = total - count
  while (left > 0) {
    const i = Math.floor(rng() * count)
    if (sizes[i]! < MAX_REGION) {
      sizes[i]! += 1
      left -= 1
    }
  }
  return sizes
}

/**
 * 受限回溯找一个完整解：每步选候选最少的空格（MRV），候选升序。找不
 * 到（或预算耗尽）返回 null。
 */
function findOne(size: number, regionCells: readonly (readonly number[])[], maxNodes = 500_000): number[] | null {
  const total = size * size
  const regionOf = new Array<number>(total).fill(-1)
  const spans = regionCells.map(m => m.length)
  regionCells.forEach((members, id) => members.forEach(cell => { regionOf[cell] = id }))
  const grid = new Array<number>(total).fill(0)
  let nodes = 0
  const mrv = (): { cell: number; vals: number[] } | null => {
    let bestCell = -1
    let bestVals: number[] = []
    for (let cell = 0; cell < total; cell += 1) {
      if (grid[cell] !== 0) continue
      const vals: number[] = []
      for (let v = 1; v <= spans[regionOf[cell]!]!; v += 1) {
        if (fits(size, regionCells, regionOf, grid, cell, v)) vals.push(v)
      }
      if (vals.length === 0) return { cell, vals }
      if (bestCell === -1 || vals.length < bestVals.length) {
        bestCell = cell
        bestVals = vals
        if (vals.length === 1) break
      }
    }
    return bestCell === -1 ? null : { cell: bestCell, vals: bestVals }
  }
  const dfs = (): boolean => {
    const pick = mrv()
    if (pick === null) return true
    nodes += 1
    if (nodes > maxNodes) return false
    for (const v of pick.vals) {
      grid[pick.cell] = v
      if (dfs()) return true
      grid[pick.cell] = 0
    }
    return false
  }
  return dfs() ? grid : null
}

/**
 * 值 v 放入 cell 是否与当前 grid 相容：区域内未用 & 王邻域未用。
 * grid 中 0 为空。
 */
function fits(size: number, regionCells: readonly (readonly number[])[], regionOf: readonly number[],
  grid: readonly number[], cell: number, v: number): boolean {
  for (const member of regionCells[regionOf[cell]!]!) {
    if (grid[member] === v) return false
  }
  for (const n of kingNeighbors(size, cell)) {
    if (grid[n] === v) return false
  }
  return true
}

/**
 * 数解（封顶 2）：空格按区域优先的固定顺序 DFS，候选升序。给定格来自
 * givens；预算耗尽返回 exhausted=true。
 */
export function countSolutions(
  size: number,
  regionCells: readonly (readonly number[])[],
  givens: ReadonlyMap<number, number>,
  maxNodes = 60_000,
): SolveResult {
  const total = size * size
  const regionOf = new Array<number>(total).fill(-1)
  const spans = regionCells.map(m => m.length)
  regionCells.forEach((members, id) => members.forEach(cell => { regionOf[cell] = id }))
  const grid = new Array<number>(total).fill(0)
  for (const [cell, v] of givens) grid[cell] = v
  let nodes = 0
  let solutions = 0
  let exhausted = false
  /** MRV 选格；返回 null 表示无空格。 */
  const mrv = (): { cell: number; vals: number[] } | null => {
    let bestCell = -1
    let bestVals: number[] = []
    for (let cell = 0; cell < total; cell += 1) {
      if (grid[cell] !== 0) continue
      const vals: number[] = []
      for (let v = 1; v <= spans[regionOf[cell]!]!; v += 1) {
        if (fits(size, regionCells, regionOf, grid, cell, v)) vals.push(v)
      }
      if (vals.length === 0) return { cell, vals }
      if (bestCell === -1 || vals.length < bestVals.length) {
        bestCell = cell
        bestVals = vals
        if (vals.length === 1) break
      }
    }
    return bestCell === -1 ? null : { cell: bestCell, vals: bestVals }
  }
  const dfs = (): boolean => {
    const pick = mrv()
    if (pick === null) {
      solutions += 1
      return solutions >= 2
    }
    nodes += 1
    if (nodes > maxNodes) {
      exhausted = true
      return true
    }
    for (const v of pick.vals) {
      grid[pick.cell] = v
      if (dfs()) {
        grid[pick.cell] = 0
        return true
      }
      grid[pick.cell] = 0
    }
    return false
  }
  dfs()
  return { solutions, exhausted, nodes }
}

/** 对已生成关卡的给定格数解（测试/诊断）。 */
export function solveCount(puzzle: SuguruPuzzle, maxNodes = 60_000): SolveResult {
  return countSolutions(puzzle.size, puzzle.regionCells, puzzle.givens, maxNodes)
}

/**
 * 胜负纯判定：每格填 1..区域大小，区域内恰好是 1..s 的排列（s 格不
 * 重复），任意王步相邻两格数字不同。
 */
export function isWon(puzzle: SuguruPuzzle, grid: readonly number[]): boolean {
  const total = puzzle.size * puzzle.size
  if (grid.length !== total) return false
  for (const members of puzzle.regionCells) {
    const used = new Set<number>()
    for (const cell of members) {
      const v = grid[cell] ?? 0
      if (v < 1 || v > members.length) return false
      if (used.has(v)) return false
      used.add(v)
    }
    if (used.size !== members.length) return false
  }
  for (let cell = 0; cell < total; cell += 1) {
    const v = grid[cell]!
    for (const n of kingNeighbors(puzzle.size, cell)) {
      if (n > cell && grid[n] === v) return false
    }
  }
  return true
}

/**
 * 冲突格清单（渲染红显用）：区域内重复、越界值、王邻域同数，双方格
 * 都标红；返回升序格下标。
 */
export function findConflicts(puzzle: SuguruPuzzle, grid: readonly number[]): number[] {
  const bad = new Set<number>()
  const total = puzzle.size * puzzle.size
  for (const members of puzzle.regionCells) {
    for (let i = 0; i < members.length; i += 1) {
      const a = members[i]!
      const va = grid[a] ?? 0
      if (va !== 0 && (va < 1 || va > members.length)) bad.add(a)
      for (let j = i + 1; j < members.length; j += 1) {
        const b = members[j]!
        if (va !== 0 && va === (grid[b] ?? 0)) { bad.add(a); bad.add(b) }
      }
    }
  }
  for (let cell = 0; cell < total; cell += 1) {
    const v = grid[cell] ?? 0
    if (v === 0) continue
    for (const n of kingNeighbors(puzzle.size, cell)) {
      if (n > cell && grid[n] === v) { bad.add(cell); bad.add(n) }
    }
  }
  return [...bad].sort((a, b) => a - b)
}

/**
 * 一掷：定大小 → 撒锚 → 同步生长到各自目标（可选项最少的区域优先，
 * 随机平局）→ 回溯求一个完整解 → 揭示给定格至唯一或预算尽。死锁（某
 * 区域被围死无法达标 / 回溯无解）返回 null 由外层重掷。
 */
function tryGenerate(seed: number, size: number): SuguruPuzzle | null {
  const rng = mulberry32(seed)
  const total = size * size
  const count = regionCountFor(size)
  const targets = drawSizes(total, count, rng)
  // 撒锚：优先两两 Chebyshev ≥2（每区的解必含 1，锚点错开显著提高可解
  // 率），铺不满再用任意空格补齐；锚点值不预设，由回溯求解统一分配。
  const pool = shuffle(Array.from({ length: total }, (_, i) => i), rng)
  const anchors: number[] = []
  for (const c of pool) {
    if (anchors.length >= count) break
    const far = anchors.every((s) => {
      const dr = Math.abs(Math.floor(s / size) - Math.floor(c / size))
      const dc = Math.abs((s % size) - (c % size))
      return Math.max(dr, dc) >= 2
    })
    if (far) anchors.push(c)
  }
  for (const c of pool) {
    if (anchors.length >= count) break
    if (!anchors.includes(c)) anchors.push(c)
  }
  const owner = new Array<number>(total).fill(-1)
  const members: number[][] = anchors.map((a) => [a] as number[])
  anchors.forEach((a, i) => { owner[a] = i })
  const need = targets.slice()
  anchors.forEach((_, i) => { need[i]! -= 1 })
  let free = total - anchors.length
  // 同步生长：可选项最少的区域优先（随机平局），长到目标即止；无处
  // 可长（某区域被围死）整掷失败，由外层换种子重试。
  while (free > 0) {
    let best = -1
    let bestOpts: number[] = []
    let bestScore = Infinity
    for (let i = 0; i < members.length; i += 1) {
      if (need[i]! <= 0) continue
      const opts = new Set<number>()
      for (const c of members[i]!) {
        for (const n of neighbors(size, c)) if (owner[n] === -1) opts.add(n)
      }
      if (opts.size === 0) continue
      const score = opts.size + rng() * 0.9
      if (score < bestScore) { bestScore = score; best = i; bestOpts = [...opts] }
    }
    if (best === -1) {
      // 未达标区域全部无处可长：从空格撒一个新区吃剩余（≤5 格）。
      const seedCell = pool.find((c) => owner[c] === -1)
      if (seedCell === undefined) return null
      members.push([seedCell])
      need.push(Math.min(free, MAX_REGION) - 1)
      owner[seedCell] = members.length - 1
      free -= 1
      continue
    }
    const pick = bestOpts[Math.floor(rng() * bestOpts.length)]!
    owner[pick] = best
    members[best]!.push(pick)
    need[best]! -= 1
    free -= 1
  }
  if (!patternValid(size, owner)) return null
  // 受限回溯求完整解（区域内恰为 1..s 且王邻域互异）；无解换种子。
  // 可解的有机划分 MRV 通常数百节点内出解，30k 预算足够；无解盘快速
  // 耗尽预算返回 null，避免单掷拖秒。
  const solution = findOne(size, members, 30_000)
  if (solution === null) return null
  // 揭示：每区先露一格，再成批补露直到唯一或预算尽。
  const givens = new Map<number, number>()
  for (const group of members) {
    const cell = group[Math.floor(rng() * group.length)]!
    givens.set(cell, solution[cell]!)
  }
  const revealOrder = shuffle(Array.from({ length: total }, (_, i) => i), rng)
    .filter(cell => !givens.has(cell))
  const batch = Math.max(2, Math.ceil(total * 0.07))
  const cap = Math.ceil(total * 0.6)
  let unique = false
  let revealIdx = 0
  for (;;) {
    const res = countSolutions(size, members, givens, 20_000)
    if (!res.exhausted && res.solutions === 1) { unique = true; break }
    if (res.solutions === 0 || givens.size >= cap || revealIdx >= revealOrder.length) break
    for (let k = 0; k < batch && revealIdx < revealOrder.length; k += 1) {
      const cell = revealOrder[revealIdx]!
      revealIdx += 1
      givens.set(cell, solution[cell]!)
    }
  }
  return { size, region: owner, regionSizes: members.map(m => m.length), regionCells: members, givens, solution, unique, attempts: 1 }
}

/** 条带兜底划分：每行按 5 格切段（末段可短），解由受限回溯找一个。 */
function stripePuzzle(seed: number, size: number): SuguruPuzzle {
  const rng = mulberry32(seed ^ 0x5bf03635)
  const total = size * size
  const owner = new Array<number>(total).fill(-1)
  const members: number[][] = []
  for (let r = 0; r < size; r += 1) {
    // 奇偶行错开切点：小区域（≤2 格）若逐行同列堆叠，相邻行的 1..2
    // 取值必然王步冲突（曾致 6..8 盘面条带无解）。
    const cuts = r % 2 === 0
      ? [[0, Math.min(size, MAX_REGION)], [MAX_REGION, size]]
      : [[0, 2], [2, Math.min(size, 7)], [7, size]]
    for (const pair of cuts) {
      const c0 = pair[0] ?? 0
      const c1 = pair[1] ?? 0
      if (c1 - c0 <= 0) continue
      const id = members.length
      const group: number[] = []
      for (let k = c0; k < c1; k += 1) {
        owner[r * size + k] = id
        group.push(r * size + k)
      }
      members.push(group)
    }
  }
  const solution = findOne(size, members) ?? new Array<number>(total).fill(1)
  const givens = new Map<number, number>()
  const cells = shuffle(Array.from({ length: total }, (_, i) => i), rng)
  for (let i = 0; i < Math.ceil(total * 0.6); i += 1) givens.set(cells[i]!, solution[cells[i]!]!)
  const res = countSolutions(size, members, givens)
  return {
    size, region: owner, regionSizes: members.map(m => m.length), regionCells: members,
    givens, solution, unique: !res.exhausted && res.solutions === 1, attempts: 0,
  }
}

/** 生成掷次上限：全失败时用条带兜底（仍完整可玩）。 */
export const ATTEMPT_CAP = 8

/**
 * 由种子确定性生成一关：先找唯一解掷次；未命中预算内则发布最后一次
 * 生成结果（多解徽章）；全部失败退条带。
 * @param seed - 种子（关卡号 × 常量即可）。
 * @param size - 盘面边长。
 */
export function puzzleFromSeed(seed: number, size: number): SuguruPuzzle {
  let last: SuguruPuzzle | null = null
  for (let attempt = 0; attempt < ATTEMPT_CAP; attempt += 1) {
    const roll = tryGenerate(seed + attempt * 0x85ebca6b, size)
    if (roll === null) continue
    roll.attempts = attempt + 1
    last = roll
    if (roll.unique) return roll
  }
  if (last !== null) return last
  return stripePuzzle(seed, size)
}