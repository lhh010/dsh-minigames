/**
 * 星之战 (Star Battle) 纯逻辑。N×N 盘划分为 N 个正交连通区域（每格恰
 * 属一区、恰 N 个区域，区域大小可不等——等大区域约束过松，大盘解数
 * 爆炸、唯一解不可达）；玩家放 k = N ≥ 8 ? 2 : 1 颗星（物
 * 理上限：k 颗互邻禁区要求 N ≥ 4k-4，故 6 盘 k=1、8/9/10 盘 k=2），
 * 使每
 * 行、每列、每个区域恰好 k 颗，且任意两颗星王步（八邻接）不相邻。生
 * 成流程：随机种子格 BFS 同步生长划分（可选项最少区域优先）→ 随机
 * 分支序回溯种植一个完整解 → 同一回溯求解器计数解（封顶 2）验证唯
 * 一；不唯一则扰动种子重掷，掷次用尽发布最后一掷（多解徽章）。胜负
 * 与冲突判定纯按规则，不依赖唯一解。所有随机经注入 rng，同种子确定。
 */

/** 五个关卡的盘面边长（6/8/8/9/10，第 5 关后循环）。 */
export const LEVEL_SIZES = [6, 8, 8, 9, 10] as const

/** 生成掷次上限：用尽后发布最后一次生成结果（多解徽章）。 */
export const ATTEMPT_CAP = 12

/** 格面标记：0 空、1 星、2 ✗。 */
export type CellMark = 0 | 1 | 2

/** 一个生成好的关卡。 */
export interface StarPuzzle {
  /** 盘面边长（格）。 */
  size: number
  /** 每行/列/区域的星数（size ≥ 9 ? 2 : 1：6/8→1，9/10→2）。 */
  k: number
  /** 格 → 区域编号（0 基，连续；每区非空正交连通，大小可不等）。 */
  region: readonly number[]
  /** 区域编号 → 成员格下标。 */
  regionCells: readonly (readonly number[])[]
  /** 生成时种植的完整解（星格下标，长度 k×size）。 */
  solution: readonly number[]
  /** 求解器是否证明了唯一解（false = 多解徽章）。 */
  unique: boolean
  /** 消耗的掷次（诊断）。 */
  attempts: number
}

/** 求解计数结果。 */
export interface SolveResult {
  /** 找到的解数（封顶 maxSolutions）。 */
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

/**
 * 每行/列/区域的星数：N ≥ 9 取 2，否则取 1（6/8→1，9/10→2）。穷举可
 * 证 k=2 需 N ≥ 8、k=3 需 N ≥ 12，故 round(N/3) 之类配比对 6/8/9/10
 * 盘全部无解；且 8×8 满足行列约束的布局仅 2 种，叠加区域约束后几乎
 * 不可解，这里按「盘面下实际可生成唯一解的最大 k」取值。
 * @param size - 盘面边长。
 * @returns 每行/列/区域的星数。
 */
export function starsFor(size: number): number {
  return size >= 9 ? 2 : 1
}

/** 1 基关卡的盘面边长（第 5 关后循环）。 */
export function levelSize(level: number): number {
  return LEVEL_SIZES[((level - 1) % LEVEL_SIZES.length + LEVEL_SIZES.length) % LEVEL_SIZES.length]!
}

/** 过关得分：基础 100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/**
 * 点击循环状态机：空 → 星 → ✗ → 空。
 * @param mark - 当前格标记。
 * @returns 下一格标记。
 */
export function cycleMark(mark: CellMark): CellMark {
  return ((mark + 1) % 3) as CellMark
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

/** 两格是否王步相邻（含自身算 false：a === b 不算相邻）。 */
export function touches(size: number, a: number, b: number): boolean {
  if (a === b) return false
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size))
  const dc = Math.abs((a % size) - (b % size))
  return dr <= 1 && dc <= 1
}

/**
 * 划分是否合法：覆盖全盘、恰好 size 个区域（编号 0..size-1 各至少一
 * 格）、每区正交连通；区域大小可不等。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 */
export function partitionValid(size: number, region: readonly number[]): boolean {
  const total = size * size
  if (region.length !== total) return false
  const groups = new Map<number, number[]>()
  for (let cell = 0; cell < total; cell += 1) {
    const id = region[cell]!
    if (!Number.isInteger(id) || id < 0 || id >= size) return false
    const members = groups.get(id) ?? []
    members.push(cell)
    groups.set(id, members)
  }
  if (groups.size !== size) return false
  for (const members of groups.values()) {
    // 连通性：从首员洪水填充，能触达全部成员。
    const memberSet = new Set<number>(members)
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

/**
 * 单掷雕刻：先给 size 个区域随机分配目标大小（每区至少 2k+2 格、总
 * 和 N²，大小可不等），再逐个雕刻：每次从剩余空格中挑空邻最少（最角落）
 * 的格作种子，向空邻最少的方向随机长满该区目标；每吞一格都校验剩余
 * 空格保持正交连通（否则后续区域会被切碎），无法继续则本掷失败返回
 * null。最后一个区域直接取全部剩余格。
 * @param rng - 注入随机源。
 * @param size - 盘面边长。
 * @returns 格 → 区域编号，或 null（本掷中途卡死）。
 */
function carveOnce(rng: () => number, size: number): number[] | null {
  const total = size * size
  const owner = new Array<number>(total).fill(-1)
  const freeSet = new Set<number>()
  for (let cell = 0; cell < total; cell += 1) freeSet.add(cell)

  /** 去掉 keep 后剩余空格是否仍正交连通（空集视为连通）。 */
  const restConnected = (keep: number): boolean => {
    freeSet.delete(keep)
    const first = freeSet.values().next().value as number | undefined
    if (first === undefined) {
      freeSet.add(keep)
      return true
    }
    const seen = new Set<number>([first])
    const stack = [first]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const n of neighbors(size, cur)) {
        if (freeSet.has(n) && !seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    const restCount = freeSet.size
    freeSet.add(keep)
    return seen.size === restCount
  }

  // 目标大小：每区 2k+2 格起步（k 颗互不邻接的星至少需要这么大的
  // 区域，L 形三格 / 2×2 块之类的小区放不下 k 颗星），剩余名额随机撒。
  const floor = 2 * starsFor(size) + 2
  const targets = new Array<number>(size).fill(floor)
  let quota = total - floor * size
  while (quota > 0) {
    targets[Math.floor(rng() * size)]! += 1
    quota -= 1
  }
  for (let id = 0; id < size - 1; id += 1) {
    const target = targets[id]!
    let start = -1
    let startScore = Infinity
    for (const c of freeSet) {
      let fn = 0
      for (const n of neighbors(size, c)) if (freeSet.has(n)) fn += 1
      const score = fn + rng() * 0.9
      if (score < startScore) { startScore = score; start = c }
    }
    freeSet.delete(start)
    owner[start] = id
    const members = [start]
    while (members.length < target) {
      const frontier = new Set<number>()
      for (const c of members) {
        for (const n of neighbors(size, c)) if (freeSet.has(n)) frontier.add(n)
      }
      let pick = -1
      let pickScore = Infinity
      for (const n of frontier) {
        let fn = 0
        for (const m of neighbors(size, n)) if (freeSet.has(m)) fn += 1
        const score = fn + rng() * 0.9
        if (score < pickScore && restConnected(n)) { pickScore = score; pick = n }
      }
      if (pick === -1) return null
      freeSet.delete(pick)
      owner[pick] = id
      members.push(pick)
    }
  }
  if (freeSet.size !== targets[size - 1]!) return null
  for (const c of freeSet) owner[c] = size - 1
  return owner
}

/**
 * 区域划分：单掷雕刻（见 carveOnce）失败就在函数内换随机流重试（上限
 * 32 掷，单掷成功率约 98%）；size 6–10 的盘基本总能成功，全部失败才
 * 返回 null。
 * @param rng - 注入随机源。
 * @param size - 盘面边长。
 * @returns 格 → 区域编号，或 null（32 掷全卡死，实际不可达）。
 */
export function generatePartition(rng: () => number, size: number): number[] | null {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const owner = carveOnce(rng, size)
    if (owner !== null) return owner
  }
  return null
}

/**
 * 共享回溯核心：按格下标升序逐格决定放/不放星，维护行/列/区计数与
 * 被星封锁（王邻域）的可用余量。放星后做扩展可行性检查——受影响的
 * 行、列、区域的剩余可用格仍能凑满 k，否则剪枝。mode 'count' 按
 * 放-first 确定性计数（封顶 maxSolutions）；mode 'one' 随机分支序找
 * 第一个解（种植用）。计数到顶或预算耗尽即停。
 */
function search(
  size: number, region: readonly number[], k: number,
  mode: 'count' | 'one', rng: (() => number) | null,
  maxSolutions: number, maxNodes: number,
): { solutions: number; exhausted: boolean; nodes: number; list: number[][] } {
  const total = size * size
  const regionCells: number[][] = []
  for (let id = 0; id < size; id += 1) regionCells.push([])
  for (let cell = 0; cell < total; cell += 1) regionCells[region[cell]!]!.push(cell)

  const rowCount = new Array<number>(size).fill(0)
  const colCount = new Array<number>(size).fill(0)
  const regionCount = new Array<number>(size).fill(0)
  // 可用余量：该行/列/区域中「未定且未被封锁」的格数。
  const availRow = new Array<number>(size).fill(size)
  const availCol = new Array<number>(size).fill(size)
  const availRegion = regionCells.map(m => m.length)
  const blocked = new Uint8Array(total)
  const stars: number[] = []
  let nodes = 0
  let solutions = 0
  let exhausted = false
  const list: number[][] = []
  let stop = false

  const dfs = (cell: number): void => {
    if (stop) return
    if (cell === total) {
      // 行/列/区计数在各自最后一个可达格处已被逼成恰 k，这里兜底校验。
      if (rowCount.every(v => v === k) && colCount.every(v => v === k) && regionCount.every(v => v === k)) {
        solutions += 1
        list.push(stars.slice())
        if (solutions >= maxSolutions) stop = true
      }
      return
    }
    nodes += 1
    if (nodes > maxNodes) { exhausted = true; stop = true; return }
    const r = Math.floor(cell / size)
    const c = cell % size
    const id = region[cell]!
    // cell 由未定转为已定：可用余量减一。已被星封锁的格在封锁时就已
    // 扣减，此处不可重复扣（否则余量可为负、误剪可行分支）。
    const wasBlocked = blocked[cell] === 1
    if (!wasBlocked) {
      availRow[r]!--
      availCol[c]!--
      availRegion[id]!--
    }
    const rowRemain = size - 1 - c
    const placeable = blocked[cell] === 0 && rowCount[r]! < k && colCount[c]! < k && regionCount[id]! < k
    const orders = rng === null ? [true, false] : (rng() < 0.5 ? [true, false] : [false, true])
    for (const wantPlace of orders) {
      if (stop) break
      if (wantPlace) {
        if (!placeable) continue
        if (rowCount[r]! + 1 + rowRemain < k) continue
        if (colCount[c]! + 1 + availCol[c]! < k) continue
        if (regionCount[id]! + 1 + availRegion[id]! < k) continue
        rowCount[r]! += 1
        colCount[c]! += 1
        regionCount[id]! += 1
        stars.push(cell)
        // 封锁王邻域未定格，记录受影响区域做扩展可行性。
        const fresh: number[] = []
        const touchedRegions = new Set<number>()
        for (const n of kingNeighbors(size, cell)) {
          if (n <= cell) continue
          if (blocked[n] === 0) {
            blocked[n] = 1
            fresh.push(n)
            availRow[Math.floor(n / size)]!--
            availCol[n % size]!--
            const nid = region[n]!
            availRegion[nid]!--
            touchedRegions.add(nid)
          }
        }
        let ok = true
        for (let rr = r - 1; rr <= r + 1 && ok; rr += 1) {
          if (rr < 0 || rr >= size) continue
          if (rowCount[rr]! + availRow[rr]! < k) ok = false
        }
        for (let cc = c - 1; cc <= c + 1 && ok; cc += 1) {
          if (cc < 0 || cc >= size) continue
          if (colCount[cc]! + availCol[cc]! < k) ok = false
        }
        for (const nid of touchedRegions) {
          if (!ok) break
          if (regionCount[nid]! + availRegion[nid]! < k) ok = false
        }
        if (ok) dfs(cell + 1)
        for (const n of fresh) {
          blocked[n] = 0
          availRow[Math.floor(n / size)]! += 1
          availCol[n % size]! += 1
          availRegion[region[n]!]! += 1
        }
        stars.pop()
        rowCount[r]! -= 1
        colCount[c]! -= 1
        regionCount[id]! -= 1
      } else {
        if (rowCount[r]! + rowRemain < k) continue
        if (colCount[c]! + availCol[c]! < k) continue
        if (regionCount[id]! + availRegion[id]! < k) continue
        dfs(cell + 1)
      }
    }
    if (!wasBlocked) {
      availRow[r]! += 1
      availCol[c]! += 1
      availRegion[id]! += 1
    }
  }
  dfs(0)
  return { solutions, exhausted, nodes, list }
}

/**
 * 数解（封顶 2，确定性）：同一回溯核心按放-first 分支序穷举，用于唯
 * 一性验证与小盘全解计数。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 * @param k - 每行/列/区域的星数。
 * @param maxNodes - 节点预算（耗尽返回 exhausted=true）。
 */
export function solveCount(size: number, region: readonly number[], k: number, maxNodes = 300_000): SolveResult {
  const out = search(size, region, k, 'count', null, 2, maxNodes)
  return { solutions: out.solutions, exhausted: out.exhausted, nodes: out.nodes }
}

/** 对已生成关卡数解（测试/诊断）。 */
export function solvePuzzle(puzzle: StarPuzzle, maxNodes = 300_000): SolveResult {
  return solveCount(puzzle.size, puzzle.region, puzzle.k, maxNodes)
}

/**
 * 种植一个完整解：随机分支序回溯找第一个合法星集（放-first 或
 * 放-last 每节点随机掷），预算内无解返回 null 由外层重掷。
 * @param rng - 注入随机源。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 * @param k - 每行/列/区域的星数。
 * @param maxNodes - 节点预算。
 */
export function plantSolution(rng: () => number, size: number, region: readonly number[], k: number, maxNodes = 60_000): number[] | null {
  const out = search(size, region, k, 'one', rng, 1, maxNodes)
  return out.list[0] ?? null
}

/** 成员集合是否正交连通（空集视为连通）。 */
function regionConnected(size: number, members: readonly number[]): boolean {
  if (members.length === 0) return true
  const set = new Set(members)
  const seen = new Set<number>([members[0]!])
  const stack = [members[0]!]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const n of neighbors(size, cur)) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return seen.size === set.size
}

/**
 * 定向爬山逼近唯一解：取前两个解，优先把「竞争解独有星」所在格与邻
 * 区做保形交换（交换双方各让一格、区域大小与连通不变），使竞争解失
 * 效而保留解仍合法；解数不增则按 0.3 概率平移。解数变多或归零即回
 * 退。步数上限内解数降到 1 返回 true。
 * @param rng - 注入随机源。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号（就地修改）。
 * @param k - 每行/列/区域的星数。
 * @param planted - 生成时种植的完整解（优先保住）。
 * @returns 爬山结束后的存活解清单（≥1 个，第 1 个用作发布解）。
 */
function refineUnique(rng: () => number, size: number, region: number[], k: number, planted: readonly number[]): number[][] {
  const total = size * size
  // 封顶 60 个解：给爬山一个真实的下降梯度（封顶 2 只有「≥2」二元信号）。
  let sols = search(size, region, k, 'count', null, 60, 300_000).list
  for (let step = 0; step < 400 && sols.length > 1; step += 1) {
    const sol2 = sols.find(s => s.join() !== planted.join()) ?? sols[1]!
    const plantedSet = new Set(planted)
    const diff = sol2.filter(c => !plantedSet.has(c))
    const moves: Array<[number, number]> = []
    for (let cell = 0; cell < total; cell += 1) {
      const a = region[cell]!
      for (const n of neighbors(size, cell)) {
        if (region[n] !== a) moves.push([cell, region[n]!])
      }
    }
    if (moves.length === 0) return sols
    const diffMoves = moves.filter(([cell]) => diff.includes(cell))
    const move = diffMoves.length > 0 && rng() < 0.7
      ? diffMoves[Math.floor(rng() * diffMoves.length)]!
      : moves[Math.floor(rng() * moves.length)]!
    const [c1, b] = move
    const a = region[c1]!
    const membersA: number[] = []
    const membersB: number[] = []
    for (let i = 0; i < total; i += 1) {
      if (region[i] === a) membersA.push(i)
      else if (region[i] === b) membersB.push(i)
    }
    if (rng() < 0.5) {
      // 单格转移：c1 从 a 划给 b（区域大小随之变化，是强扰动）；
      // a 剩余至少 2 格，避免产出 1 格孤区。
      const aAfter = membersA.filter(m => m !== c1)
      if (aAfter.length < 2) continue
      if (!regionConnected(size, aAfter) || !regionConnected(size, membersB.concat([c1]))) continue
      region[c1] = b
      const next = search(size, region, k, 'count', null, 60, 300_000).list
      if (next.length === 0 || next.length > sols.length) {
        region[c1] = a
        continue
      }
      if (next.length < sols.length || rng() < 0.3) sols = next
      else region[c1] = a
    } else {
      // 保形交换：a 让 c1、b 让 c2，区域大小不变。
      const partners: number[] = []
      for (let cell = 0; cell < total; cell += 1) {
        if (region[cell] !== b) continue
        for (const n of neighbors(size, cell)) {
          if (region[n] === a) { partners.push(cell); break }
        }
      }
      if (partners.length === 0) continue
      const c2 = partners[Math.floor(rng() * partners.length)]!
      const aAfter = membersA.filter(m => m !== c1).concat([c2])
      const bAfter = membersB.filter(m => m !== c2).concat([c1])
      if (!regionConnected(size, aAfter) || !regionConnected(size, bAfter)) continue
      region[c1] = b
      region[c2] = a
      const next = search(size, region, k, 'count', null, 60, 300_000).list
      if (next.length === 0 || next.length > sols.length) {
        region[c1] = a
        region[c2] = b
        continue
      }
      if (next.length < sols.length || rng() < 0.3) sols = next
      else {
        region[c1] = a
        region[c2] = b
      }
    }
  }
  return sols
}

/**
 * 一掷：雕刻划分 → 种植完整解 → 定向爬山收敛唯一解；划分死锁/种植
 * 无解返回 null；爬山未收敛返回 unique=false 由外层决定是否重掷。
 */
function tryGenerate(seed: number, size: number): StarPuzzle | null {
  const rng = mulberry32(seed)
  const region = generatePartition(rng, size)
  if (region === null) return null
  if (!partitionValid(size, region)) return null
  const k = starsFor(size)
  const planted = plantSolution(rng, size, region, k)
  if (planted === null) return null
  const sols = refineUnique(rng, size, region, k, planted)
  if (sols.length === 0) return null
  const solution = sols[0]!
  const regionCells = regionCellsOf(size, region)
  const res = solveCount(size, region, k)
  return {
    size, k, region, regionCells, solution,
    unique: !res.exhausted && res.solutions === 1,
    attempts: 1,
  }
}

/** 由 region 数组归组出每区成员（保持格下标升序）。 */
function regionCellsOf(size: number, region: readonly number[]): number[][] {
  const cells: number[][] = []
  for (let id = 0; id < size; id += 1) cells.push([])
  for (let cell = 0; cell < size * size; cell += 1) cells[region[cell]!]!.push(cell)
  return cells
}

/** 条带兜底划分：每行一区（每区恰 size 格且连通），种植必有解。 */
function stripePuzzle(seed: number, size: number): StarPuzzle {
  const k = starsFor(size)
  const region = new Array<number>(size * size)
  for (let cell = 0; cell < size * size; cell += 1) region[cell] = Math.floor(cell / size)
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const rng = mulberry32((seed ^ 0x5bf03635) + attempt * 0x85ebca6b)
    const solution = plantSolution(rng, size, region, k, 500_000)
    if (solution !== null) {
      return {
        size, k, region, regionCells: regionCellsOf(size, region), solution,
        unique: false, attempts: 0,
      }
    }
  }
  throw new Error('dsh-minigames: starbattle stripe fallback failed to plant a solution')
}

/**
 * 由种子确定性生成一关：逐掷扰动种子（+attempt×常量）直到求解器证
 * 明唯一解；掷次用尽发布最后一掷（多解徽章）；全部失败退条带兜底。
 * @param seed - 种子（关卡号 × 常量即可）。
 * @param size - 盘面边长。
 */
export function puzzleFromSeed(seed: number, size: number): StarPuzzle {
  let last: StarPuzzle | null = null
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

/**
 * 胜负纯判定：星数恰为 k×size，每行/列/区域恰 k 颗，任意两颗不王步
 * 相邻。
 */
export function isWon(puzzle: StarPuzzle, stars: readonly number[]): boolean {
  const { size, k } = puzzle
  if (stars.length !== k * size) return false
  const total = size * size
  const rowCount = new Array<number>(size).fill(0)
  const colCount = new Array<number>(size).fill(0)
  const regionCount = new Array<number>(size).fill(0)
  const seen = new Set<number>()
  for (const s of stars) {
    if (!Number.isInteger(s) || s < 0 || s >= total) return false
    if (seen.has(s)) return false
    seen.add(s)
    rowCount[Math.floor(s / size)]! += 1
    colCount[s % size]! += 1
    regionCount[puzzle.region[s]!]! += 1
  }
  for (let i = 0; i < size; i += 1) {
    if (rowCount[i] !== k || colCount[i] !== k || regionCount[i] !== k) return false
  }
  for (let i = 0; i < stars.length; i += 1) {
    for (let j = i + 1; j < stars.length; j += 1) {
      if (touches(size, stars[i]!, stars[j]!)) return false
    }
  }
  return true
}

/**
 * 冲突格清单（即时红显用，不强制阻止）：所在行/列/区域计数超 k 的
 * 星、以及王步相邻星对（双方），全部标红；返回升序格下标。合法或
 * 未完成的中局返回空数组。
 */
export function findConflicts(puzzle: StarPuzzle, stars: readonly number[]): number[] {
  const { size, k } = puzzle
  const bad = new Set<number>()
  const rowCount = new Array<number>(size).fill(0)
  const colCount = new Array<number>(size).fill(0)
  const regionCount = new Array<number>(size).fill(0)
  for (const s of stars) {
    rowCount[Math.floor(s / size)]! += 1
    colCount[s % size]! += 1
    regionCount[puzzle.region[s]!]! += 1
  }
  for (const s of stars) {
    if (rowCount[Math.floor(s / size)]! > k) bad.add(s)
    if (colCount[s % size]! > k) bad.add(s)
    if (regionCount[puzzle.region[s]!]! > k) bad.add(s)
  }
  for (let i = 0; i < stars.length; i += 1) {
    for (let j = i + 1; j < stars.length; j += 1) {
      if (touches(size, stars[i]!, stars[j]!)) {
        bad.add(stars[i]!)
        bad.add(stars[j]!)
      }
    }
  }
  return [...bad].sort((a, b) => a - b)
}
