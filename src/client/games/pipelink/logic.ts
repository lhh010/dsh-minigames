/**
 * 「管道连连 Pipelink」纯逻辑：管件表示与旋转、从随机完整解逆推打乱的
 * 关卡生成（seed 保证可解）、多源 BFS 水流填充序、毒水管阻断、步数计
 * 与上限、提示与过关计分。全部随机走注入的 mulberry32，同 seed 逐位
 * 重放；渲染与输入不触碰本文件，测试只依赖这里的纯函数。
 */

/** 方向编码：0=上 1=右 2=下 3=左；对边为 (d+2)%4。 */
export type Pos = { r: number; c: number }

/** 可旋转管型（源头/出口是固定角色件，不参与旋转）。 */
export type PipeKind = 'straight' | 'elbow' | 'tee' | 'cross' | 'cap' | 'source' | 'drain'

/** 一格管件：kind+rot 决定开口；fixed 件（源/出口/毒管）不可旋转。 */
export interface PipeCell {
  kind: PipeKind
  rot: number
  /** 角色件标记：'source' | 'drain' | null。 */
  role: 'source' | 'drain' | null
  /** 毒水管：水流被阻断，必须绕开；固定不可旋转。 */
  poison: boolean
  /** 不可旋转（源头/出口/毒管）。 */
  fixed: boolean
  /** 生成时的解方向（提示与最优步数下界用）。 */
  solutionRot: number
}

/** 一关的静态盘面（不含运行状态）。 */
export interface LevelGrid {
  size: number
  grid: PipeCell[][]
  sources: Pos[]
  drain: Pos
  /** 允许的旋转次数上限。 */
  moveLimit: number
}

/** 水流计算结果：填充序 + 每个源头是否汇到出口。 */
export interface FlowResult {
  /** BFS 层序填充的格子（含源头；毒管不进水）。 */
  order: Pos[]
  /** 逐源头：其水是否能到出口。 */
  perSource: boolean[]
  /** 所有源头都汇到出口（过关条件）。 */
  allConnected: boolean
}

/** 游戏状态：'playing' 旋转中，'flowing' 放水动画，'won'/'lost' 终局。 */
export type PipelinkStatus = 'playing' | 'flowing' | 'won' | 'lost'

export interface PipelinkState {
  seed: number
  level: number
  size: number
  grid: PipeCell[][]
  sources: Pos[]
  drain: Pos
  moves: number
  moveLimit: number
  status: PipelinkStatus
  score: number
  /** 放水动画：填充序与当前进度（格）。 */
  flow: { order: Pos[]; progress: number } | null
}

/** 水流动画速度（格/秒）。 */
export const FLOW_CELLS_PER_SEC = 8
/** 关卡数与逐关尺寸 5×5→9×9。 */
export const LEVEL_COUNT = 5
export const LEVEL_SIZES = [5, 6, 7, 8, 9] as const

/** 各管型 rot=0 时的开口方向。 */
export const BASE_DIRS: Record<PipeKind, readonly number[]> = {
  straight: [1, 3],
  elbow: [0, 1],
  tee: [3, 0, 1],
  cross: [0, 1, 2, 3],
  cap: [0],
  source: [1, 2],
  drain: [0, 3],
}

/** 确定性伪随机（mulberry32）：同 seed 同序列。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 关卡 seed：基地址 + 关卡号混合，避免相邻关共用随机流。 */
export function levelSeed(seed: number, level: number): number {
  return (Math.imul(seed, 7919) + Math.imul(level, 104729)) >>> 0
}

/** 管件当前开口（base 绕 rot 转 90° 的倍数）。 */
export function connectionsOf(cell: PipeCell): number[] {
  const out: number[] = []
  for (const d of BASE_DIRS[cell.kind]) out.push((d + cell.rot) % 4)
  return out.sort((x, y) => x - y)
}

/** 两开口集合是否等价（排序后比较）。 */
function connectionsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** 管件工厂：默认非固定、无毒、解方向等于初始 rot。 */
export function makeCell(kind: PipeKind, rot = 0, init?: Partial<PipeCell>): PipeCell {
  return {
    kind,
    rot: ((rot % 4) + 4) % 4,
    role: null,
    poison: false,
    fixed: false,
    solutionRot: ((rot % 4) + 4) % 4,
    ...init,
  }
}

/** 从当前 rot 顺时针最少点几下到解方向（直管两个等价朝向取小；四通为 0）。 */
export function minRotDelta(cell: PipeCell): number {
  if (cell.fixed || cell.kind === 'cross') return 0
  const sol = cell.solutionRot
  if (cell.kind === 'straight') {
    const a = (sol - cell.rot + 4) % 4
    const b = (sol + 2 - cell.rot + 4) % 4
    return Math.min(a, b)
  }
  return (sol - cell.rot + 4) % 4
}

/** 四向偏移：上右下左，与方向编码同序。 */
const DELTA: readonly [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]]

/** 随机简单路径（随机化 DFS，取 3 条候选中最短的一条）：网格连通必有解。 */
export function randomSimplePath(rng: () => number, size: number, start: Pos, end: Pos): Pos[] {
  let best: Pos[] | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const visited: boolean[][] = []
    for (let r = 0; r < size; r += 1) visited.push(new Array<boolean>(size).fill(false))
    const path: Pos[] = []
    const dfs = (r: number, c: number): boolean => {
      visited[r]![c] = true
      path.push({ r, c })
      if (r === end.r && c === end.c) return true
      const order = [0, 1, 2, 3]
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1))
        const t = order[i]!
        order[i] = order[j]!
        order[j] = t
      }
      for (const d of order) {
        const nr = r + DELTA[d]![0]
        const nc = c + DELTA[d]![1]
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue
        if (visited[nr]![nc]) continue
        if (dfs(nr, nc)) return true
      }
      path.pop()
      return false
    }
    dfs(start.r, start.c)
    if (best === null || path.length < best.length) best = path
  }
  return best!
}

/** 从开口集合反解管型与朝向（|S| 1..4 → 堵头/直/弯/三通/四通）。 */
export function solvePiece(dirs: number[]): { kind: PipeKind; rot: number } | null {
  const want = [...dirs].sort((x, y) => x - y)
  const kinds: PipeKind[] = ['straight', 'elbow', 'tee', 'cross', 'cap']
  for (const kind of kinds) {
    for (let rot = 0; rot < 4; rot += 1) {
      const got = [...BASE_DIRS[kind]].map((d) => (d + rot) % 4).sort((x, y) => x - y)
      if (connectionsEqual(got, want)) return { kind, rot }
    }
  }
  return null
}

/** 盘面里格子的开口缓存，供 BFS 复用。 */
type ConnMap = number[][][]

function connMapOf(grid: PipeCell[][]): ConnMap {
  return grid.map((row) => row.map((cell) => connectionsOf(cell)))
}

/** 从单个源头 BFS：返回 (到达出口?, 填充层序)；毒管视作堵死。 */
function floodFrom(
  size: number, conns: ConnMap, grid: PipeCell[][], src: Pos, drain: Pos,
): { reached: boolean; order: Pos[] } {
  const seen: boolean[][] = []
  for (let r = 0; r < size; r += 1) seen.push(new Array<boolean>(size).fill(false))
  const order: Pos[] = []
  let frontier: Pos[] = [src]
  seen[src.r]![src.c] = true
  let reached = false
  while (frontier.length > 0) {
    const next: Pos[] = []
    for (const p of frontier) order.push(p)
    for (const p of frontier) {
      if (p.r === drain.r && p.c === drain.c) reached = true
      for (const d of conns[p.r]![p.c]!) {
        const nr = p.r + DELTA[d]![0]
        const nc = p.c + DELTA[d]![1]
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue
        if (grid[nr]![nc]!.poison || seen[nr]![nc]) continue
        const back = conns[nr]![nc]!
        if (!back.includes((d + 2) % 4)) continue
        seen[nr]![nc] = true
        next.push({ r: nr, c: nc })
      }
    }
    frontier = next
  }
  return { reached, order }
}

/** 全盘水流：并集填充序（动画用）+ 逐源头汇合判定（过关用）。 */
export function computeFlow(state: {
  size: number; grid: PipeCell[][]; sources: Pos[]; drain: Pos
}): FlowResult {
  const conns = connMapOf(state.grid)
  const perSource: boolean[] = []
  const seenAll: boolean[][] = []
  for (let r = 0; r < state.size; r += 1) seenAll.push(new Array<boolean>(state.size).fill(false))
  const union: Pos[] = []
  for (const src of state.sources) {
    const res = floodFrom(state.size, conns, state.grid, src, state.drain)
    perSource.push(res.reached)
    for (const p of res.order) {
      if (!seenAll[p.r]![p.c]) {
        seenAll[p.r]![p.c] = true
        union.push(p)
      }
    }
  }
  const allConnected = perSource.length > 0 && perSource.every((v) => v)
  return { order: union, perSource, allConnected }
}

/** 全盘剩余最少点击数（步数下界）。 */
function moveLowerBound(grid: PipeCell[][]): number {
  let sum = 0
  for (const row of grid) {
    for (const cell of row) sum += minRotDelta(cell)
  }
  return sum
}

/** 生成一关：先铺随机完整解，再逆旋转打乱；保证初始未通、可解。 */
export function generateLevel(level: number, rng: () => number): LevelGrid {
  const size = LEVEL_SIZES[Math.min(LEVEL_COUNT, Math.max(1, level)) - 1]!
  const dual = level >= 4
  const drain: Pos = { r: size - 1, c: size - 1 }
  const sources: Pos[] = [{ r: 0, c: 0 }]
  if (dual) sources.push({ r: 0, c: size - 1 })
  const pathA = randomSimplePath(rng, size, sources[0]!, drain)
  const pathB = dual ? randomSimplePath(rng, size, sources[1]!, drain) : []
  // 路径上每格的必要开口 = 前后邻格方向并集。
  const need: (Set<number> | null)[][] = []
  for (let r = 0; r < size; r += 1) need.push(new Array<Set<number> | null>(size).fill(null))
  const stamp = (path: Pos[], si: number): void => {
    for (let i = 0; i < path.length; i += 1) {
      const p = path[i]!
      if (need[p.r]![p.c] === null) need[p.r]![p.c] = new Set<number>()
      if (i > 0) {
        const prev = path[i - 1]!
        need[p.r]![p.c]!.add(dirTo(p, prev))
      }
      if (i < path.length - 1) {
        const nxt = path[i + 1]!
        need[p.r]![p.c]!.add(dirTo(p, nxt))
      }
      void si
    }
  }
  stamp(pathA, 0)
  stamp(pathB, 1)

  const grid: PipeCell[][] = []
  for (let r = 0; r < size; r += 1) {
    const row: PipeCell[] = []
    for (let c = 0; c < size; c += 1) {
      if (r === 0 && c === 0) {
        row.push(makeCell('source', 0, { role: 'source', fixed: true, solutionRot: 0 }))
        continue
      }
      if (dual && r === 0 && c === size - 1) {
        row.push(makeCell('source', 1, { role: 'source', fixed: true, solutionRot: 1 }))
        continue
      }
      if (r === drain.r && c === drain.c) {
        row.push(makeCell('drain', 0, { role: 'drain', fixed: true, solutionRot: 0 }))
        continue
      }
      const want = need[r]![c]
      if (want !== null) {
        const solved = solvePiece([...want!])
        if (solved !== null) {
          row.push(makeCell(solved.kind, solved.rot))
          continue
        }
      }
      // 路径外随机填充件。
      const pool: PipeKind[] = ['elbow', 'elbow', 'straight', 'straight', 'cap', 'tee']
      row.push(makeCell(pool[Math.floor(rng() * pool.length)]!, Math.floor(rng() * 4)))
    }
    grid.push(row)
  }
  // 毒水管：只放在解路径之外，不破坏可解性。
  const poisonCount = level >= 3 ? level - 1 : 0
  if (poisonCount > 0) {
    const cand: Pos[] = []
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (need[r]![c] === null) cand.push({ r, c })
      }
    }
    for (let i = cand.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const t = cand[i]!
      cand[i] = cand[j]!
      cand[j] = t
    }
    for (let i = 0; i < Math.min(poisonCount, cand.length); i += 1) {
      const p = cand[i]!
      const cell = grid[p.r]![p.c]!
      cell.poison = true
      cell.fixed = true
    }
  }
  // 打乱：解路径件大概率偏移 1..3 格，路径外随机。
  const rotatable: Pos[] = []
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const cell = grid[r]![c]!
      if (cell.fixed) continue
      rotatable.push({ r, c })
    }
  }
  const scramble = (): void => {
    for (const p of rotatable) {
      const cell = grid[p.r]![p.c]!
      const onPath = need[p.r]![p.c] !== null
      const delta = onPath && rng() < 0.75 ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 4)
      cell.rot = (cell.solutionRot + delta) % 4
    }
    // 全零打乱（开局即通）兜底：第一件强制偏 1 格。
    if (rotatable.length > 0 && rotatable.every((p) => grid[p.r]![p.c]!.rot === grid[p.r]![p.c]!.solutionRot)) {
      const p0 = rotatable[0]!
      grid[p0.r]![p0.c]!.rot = (grid[p0.r]![p0.c]!.solutionRot + 1) % 4
    }
  }
  scramble()
  let levelData: LevelGrid = { size, grid, sources, drain, moveLimit: 0 }
  for (let guard = 0; guard < 16; guard += 1) {
    const lower = moveLowerBound(grid)
    levelData.moveLimit = lower + Math.ceil(lower * 0.6) + 6
    const probe = computeFlow({ size, grid, sources, drain })
    if (!probe.allConnected) return levelData
    // 打乱后仍意外连通：再扰动一件路径件。
    const pathCells = rotatable.filter((p) => need[p.r]![p.c] !== null)
    if (pathCells.length === 0) return levelData
    const p = pathCells[Math.floor(rng() * pathCells.length)]!
    const cell = grid[p.r]![p.c]!
    cell.rot = (cell.rot + 1 + Math.floor(rng() * 3)) % 4
  }
  return levelData
}

/** p 指向 q 的方向编码。 */
function dirTo(p: Pos, q: Pos): number {
  if (q.r === p.r - 1) return 0
  if (q.c === p.c + 1) return 1
  if (q.r === p.r + 1) return 2
  return 3
}

/** 由静态盘面构建运行状态（测试可手工造盘）。 */
export function buildState(def: LevelGrid, seed: number, level: number, score = 0): PipelinkState {
  return {
    seed,
    level,
    size: def.size,
    grid: def.grid,
    sources: def.sources,
    drain: def.drain,
    moves: 0,
    moveLimit: def.moveLimit,
    status: 'playing',
    score,
    flow: null,
  }
}

/** 新开一局（level 从 1 起）。 */
export function createPipelinkState(seed: number, level = 1, score = 0): PipelinkState {
  const def = generateLevel(level, mulberry32(levelSeed(seed, level)))
  return buildState(def, seed, level, score)
}

/** 把全部管件转回解方向（验证生成可解性用）。 */
export function applySolution(state: PipelinkState): void {
  for (const row of state.grid) {
    for (const cell of row) cell.rot = cell.solutionRot
  }
}

/** 旋转后自动验证：连通即放水；步数耗尽且未通判负。 */
function checkAfterMove(state: PipelinkState): void {
  const flow = computeFlow(state)
  if (flow.allConnected) {
    state.status = 'flowing'
    state.flow = { order: flow.order, progress: 0 }
    return
  }
  if (state.moves >= state.moveLimit) state.status = 'lost'
}

/** 点击旋转一格 +90°：非 playing、固定件拒绝；成功计步并自动验证。 */
export function rotateCell(state: PipelinkState, r: number, c: number): boolean {
  if (state.status !== 'playing') return false
  if (r < 0 || c < 0 || r >= state.size || c >= state.size) return false
  const cell = state.grid[r]![c]!
  if (cell.fixed) return false
  if (state.moves >= state.moveLimit) return false
  cell.rot = (cell.rot + 1) % 4
  state.moves += 1
  checkAfterMove(state)
  return true
}

/** 空格放水验证：连通启动水流动画，未通无事发生。 */
export function validateNow(state: PipelinkState): boolean {
  if (state.status !== 'playing') return false
  checkAfterMove(state)
  const status = state.status as PipelinkStatus
  return status === 'flowing'
}

/** 提示：把第一个未对齐的可旋转件顺时针转一格（计步）并复验。 */
export function applyHint(state: PipelinkState): Pos | null {
  if (state.status !== 'playing') return null
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const cell = state.grid[r]![c]!
      if (cell.fixed || cell.kind === 'cross') continue
      const sol = [...BASE_DIRS[cell.kind]].map((d) => (d + cell.solutionRot) % 4).sort((x, y) => x - y)
      if (connectionsEqual(connectionsOf(cell), sol)) continue
      if (state.moves >= state.moveLimit) return null
      cell.rot = (cell.rot + 1) % 4
      state.moves += 1
      checkAfterMove(state)
      return { r, c }
    }
  }
  return null
}

/** 过关得分：关卡基础分 + 剩余步数奖励。 */
export function winScore(state: PipelinkState): number {
  return state.level * 100 + Math.max(0, state.moveLimit - state.moves) * 5
}

/** 推进放水动画；灌满时结算 won 并计分，返回是否本次刚通关。 */
export function tickFlow(state: PipelinkState, dt: number): boolean {
  if (state.status !== 'flowing' || state.flow === null) return false
  state.flow.progress += dt * FLOW_CELLS_PER_SEC
  if (state.flow.progress >= state.flow.order.length) {
    state.flow.progress = state.flow.order.length
    state.status = 'won'
    state.score += winScore(state)
    return true
  }
  return false
}

/** 下一关（循环 5 关），保留累计分。 */
export function advanceLevel(state: PipelinkState): void {
  const next = (state.level % LEVEL_COUNT) + 1
  const def = generateLevel(next, mulberry32(levelSeed(state.seed, next)))
  const fresh = buildState(def, state.seed, next, state.score)
  state.level = fresh.level
  state.size = fresh.size
  state.grid = fresh.grid
  state.sources = fresh.sources
  state.drain = fresh.drain
  state.moves = fresh.moves
  state.moveLimit = fresh.moveLimit
  state.status = fresh.status
  state.flow = fresh.flow
}

/** 重开本关：同 seed 同盘面，步数清零。 */
export function restartLevel(state: PipelinkState): void {
  const def = generateLevel(state.level, mulberry32(levelSeed(state.seed, state.level)))
  state.grid = def.grid
  state.size = def.size
  state.sources = def.sources
  state.drain = def.drain
  state.moves = 0
  state.moveLimit = def.moveLimit
  state.status = 'playing'
  state.flow = null
}
