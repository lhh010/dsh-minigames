/**
 * 水排序 WaterSort 纯逻辑：试管状态、倾倒规则、死局检测、DFS 求解器与
 * seed 生成器。全部为纯计算（随机源注入），渲染层与测试共用同一套规则。
 *
 * 数据约定：每根试管是一个颜色编号数组，下标 0 为管底、末位为管顶；
 * 每种颜色在盘面上恰好出现 TUBE_CAPACITY 层；空管是空数组。
 */

/** 每根试管的容量（层数）。 */
export const TUBE_CAPACITY = 4

/** 关卡定义：色数与空管数，管数 = 色数 + 空管数。 */
export interface WaterSortLevelDef {
  /** 颜色种类数（每色恰好 TUBE_CAPACITY 层）。 */
  colors: number
  /** 额外空管数。 */
  empties: number
}

/** 关卡递进表：色数 3→8、空管 1→2，共 5 关。 */
export const LEVELS: readonly WaterSortLevelDef[] = [
  { colors: 3, empties: 1 },
  { colors: 4, empties: 1 },
  { colors: 5, empties: 2 },
  { colors: 6, empties: 2 },
  { colors: 8, empties: 2 },
]

/** mulberry32 确定性伪随机数发生器，返回 [0,1) 均匀分布。
 * @param seed - 非负整数种子。
 * @returns 产生 [0,1) 随机数的函数。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 一局游戏的完整局面（不可变快照，供历史栈与渲染直接持有）。 */
export interface WaterSortState {
  /** 1 基关卡号（已钳制到 LEVELS 范围）。 */
  level: number
  /** 颜色种类数。 */
  colorCount: number
  /** 每根试管的水层（下标 0 = 管底）；空管为空数组。 */
  tubes: number[][]
  /** 已用步数（每次成功倾倒 +1）。 */
  moves: number
  /** 生成器给出的参考步数（求解器解长度）。 */
  par: number
  /** 本关加管道具是否已用。 */
  extraUsed: boolean
  /** playing 进行中；won 全部纯色完成。 */
  status: 'playing' | 'won'
}

/** 求解器结果：倾倒序列（[源管, 目标管]）与搜索节点数。 */
export interface SolveResult {
  moves: Array<[number, number]>
  nodes: number
}

/** 生成器输出：盘面、参考步数、一条可行解与尝试次数（0 = 兜底构造）。 */
export interface GeneratedLevel {
  tubes: number[][]
  par: number
  solution: Array<[number, number]>
  attempts: number
}

/** 把关卡号钳制到 [1, LEVELS.length]。
 * @param n - 任意关卡号。
 * @returns 合法关卡号。 */
export function clampLevel(n: number): number {
  return Math.min(LEVELS.length, Math.max(1, Math.round(n)))
}

/** 试管顶部连续同色段的长度；空管为 0。
 * @param tube - 单根试管的水层数组。
 * @returns 顶部连续同色层数。 */
export function topRun(tube: readonly number[]): number {
  if (tube.length === 0) return 0
  const top = tube[tube.length - 1]!
  let n = 0
  for (let i = tube.length - 1; i >= 0 && tube[i] === top; i -= 1) n += 1
  return n
}

/** 倾倒合法性：源非空、非自倒、目标有空位、目标为空或顶色相同。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 是否合法。 */
export function canPour(tubes: readonly number[][], from: number, to: number): boolean {
  if (from === to) return false
  if (from < 0 || from >= tubes.length || to < 0 || to >= tubes.length) return false
  const src = tubes[from]!
  const dst = tubes[to]!
  if (src.length === 0) return false
  if (dst.length >= TUBE_CAPACITY) return false
  return dst.length === 0 || dst[dst.length - 1] === src[src.length - 1]
}

/** 一次倾倒会移动的层数：min(源顶段长, 目标剩余空间)；非法为 0。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 移动层数（0 = 不移动）。 */
export function pourAmount(tubes: readonly number[][], from: number, to: number): number {
  if (!canPour(tubes, from, to)) return 0
  const src = tubes[from]!
  const dst = tubes[to]!
  return Math.min(topRun(src), TUBE_CAPACITY - dst.length)
}

/** 执行倾倒，返回新盘面；非法返回 null。输入数组不被修改。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 新盘面，非法时 null。 */
export function pourTubes(tubes: readonly number[][], from: number, to: number): number[][] | null {
  const amount = pourAmount(tubes, from, to)
  if (amount <= 0) return null
  const src = tubes[from]!
  const next = tubes.map(t => t.slice())
  const moved = next[from]!.splice(src.length - amount, amount)
  next[to]!.push(...moved)
  return next
}

/** 试管是否已完成：整管纯色且装满。
 * @param tube - 单根试管的水层数组。
 * @returns 是否完成。 */
export function isTubeComplete(tube: readonly number[]): boolean {
  if (tube.length !== TUBE_CAPACITY) return false
  const c = tube[0]!
  return tube.every(v => v === c)
}

/** 胜利判定：每根试管要么为空，要么整管纯色装满（每色恰好 4 层时
 * 等价于所有颜色各自集中成一管）。
 * @param tubes - 盘面。
 * @returns 是否完成。 */
export function isWon(tubes: readonly number[][]): boolean {
  return tubes.every(t => t.length === 0 || isTubeComplete(t))
}

/** 倾倒是否“有意义”：排除两类永不推进局面的倒法——把整根纯管倒进
 * 空管（只是换个位置）、从已完成纯管倒出。求解与死局检测共用。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 是否有意义。 */
export function isUsefulPour(tubes: readonly number[][], from: number, to: number): boolean {
  if (!canPour(tubes, from, to)) return false
  const src = tubes[from]!
  const dst = tubes[to]!
  if (isTubeComplete(src)) return false
  return !(dst.length === 0 && topRun(src) === src.length)
}

/** 是否还存在有意义的倒法。
 * @param tubes - 盘面。
 * @returns true 表示还有可行倒法。 */
export function hasAnyMove(tubes: readonly number[][]): boolean {
  for (let f = 0; f < tubes.length; f += 1) {
    for (let t = 0; t < tubes.length; t += 1) {
      if (isUsefulPour(tubes, f, t)) return true
    }
  }
  return false
}

/** 向盘面追加 k 根空管（加管道具的纯函数形式）。
 * @param tubes - 盘面。
 * @param k - 追加空管数。
 * @returns 新盘面（浅拷贝）。 */
export function addTubes(tubes: readonly number[][], k: number): number[][] {
  const next = tubes.map(t => t.slice())
  for (let i = 0; i < k; i += 1) next.push([])
  return next
}

/** 死局检测：未完成且没有任何有意义的倒法。
 * @param tubes - 盘面。
 * @returns 是否死局。 */
export function isDeadlocked(tubes: readonly number[][]): boolean {
  return !isWon(tubes) && !hasAnyMove(tubes)
}

/** 求解器动作排序启发：先试能装满一管的倒法，其次倒到同色顶上，再按
 * 移动层数降序——让 DFS 近似贪心，尽早命中解。
 */
function orderedMoves(tubes: readonly number[][]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let f = 0; f < tubes.length; f += 1) {
    for (let t = 0; t < tubes.length; t += 1) {
      if (isUsefulPour(tubes, f, t)) out.push([f, t])
    }
  }
  const score = (m: readonly [number, number]): number => {
    const amount = pourAmount(tubes, m[0], m[1])
    const dst = tubes[m[1]]!
    let s = amount
    if (dst.length > 0) {
      s += 10
      if (dst.length + amount === TUBE_CAPACITY) s += 100
    }
    return s
  }
  return out.sort((a, b) => score(b) - score(a))
}

/** 盘面规范化 key：试管描述排序后拼接（试管排列等价的局面共用一个
 * key），大幅压缩搜索空间。
 */
function canonicalKey(tubes: readonly number[][]): string {
  return tubes.map(t => t.join('.')).sort().join('|')
}

/** DFS 求解器：带访问去重与节点预算，返回一条从当前盘面到完成的倾倒
 * 序列。预算耗尽与确实无解都返回 null（测试中用于验证生成盘面可解）。
 * @param tubes - 初始盘面。
 * @param maxNodes - 搜索节点预算（默认 120000）。
 * @returns 解与节点数，未找到则 null。 */
export function solveTubes(tubes: readonly number[][], maxNodes = 120000): SolveResult | null {
  const seen = new Set<string>()
  const path: Array<[number, number]> = []
  let nodes = 0
  const visit = (ts: number[][]): SolveResult | null => {
    if (isWon(ts)) return { moves: path.slice(), nodes }
    if (nodes >= maxNodes) return null
    const key = canonicalKey(ts)
    if (seen.has(key)) return null
    seen.add(key)
    nodes += 1
    for (const m of orderedMoves(ts)) {
      const next = pourTubes(ts, m[0], m[1])
      if (next === null) continue
      path.push([m[0], m[1]])
      const r = visit(next)
      if (r !== null) return r
      path.pop()
    }
    return null
  }
  return visit(tubes.map(t => t.slice()))
}

/** 兜底构造：颜色两两交叉装管（[a,a,b,b] 与 [b,b,a,a]），落单颜色整管
 * 纯色——结构性必可解，用于随机尝试全部失败时。
 */
function crossedTubes(def: WaterSortLevelDef): number[][] {
  const tubes: number[][] = []
  for (let c = 0; c + 1 < def.colors; c += 2) {
    tubes.push([c, c, c + 1, c + 1])
    tubes.push([c + 1, c + 1, c, c])
  }
  if (def.colors % 2 === 1) {
    const last = def.colors - 1
    tubes.push([last, last, last, last])
  }
  for (let e = 0; e < def.empties; e += 1) tubes.push([])
  return tubes
}

/** seed 关卡生成器：把 4×色数 层随机洗牌分布进色数根管（空管留空），
 * 再用求解器验证可解且解不太浅；不合格换下一段随机流重摇（确定性）。
 * 随机尝试全败时退回两两交叉的必可解构造。
 * @param level - 关卡号（自动钳制）。
 * @param rng - 注入的随机源（mulberry32）。
 * @returns 盘面、参考步数、一条可行解与尝试次数。 */
export function generateLevel(level: number, rng: () => number): GeneratedLevel {
  const def = LEVELS[clampLevel(level) - 1]!
  const minMoves = def.colors + 1
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    const pool: number[] = []
    for (let c = 0; c < def.colors; c += 1) {
      for (let i = 0; i < TUBE_CAPACITY; i += 1) pool.push(c)
    }
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = pool[i]!
      pool[i] = pool[j]!
      pool[j] = tmp
    }
    const tubes: number[][] = []
    for (let i = 0; i < def.colors; i += 1) tubes.push(pool.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY))
    for (let e = 0; e < def.empties; e += 1) tubes.push([])
    if (isWon(tubes)) continue
    const solved = solveTubes(tubes, 60000)
    if (solved === null || solved.moves.length < minMoves) continue
    return { tubes, par: solved.moves.length, solution: solved.moves, attempts: attempt }
  }
  const fb = crossedTubes(def)
  const fr = solveTubes(fb, 200000)
  return { tubes: fb, par: fr !== null ? fr.moves.length : def.colors * 2, solution: fr !== null ? fr.moves : [], attempts: 0 }
}

/** 按关卡与种子构造初始局面；同 (level, seed) 严格重现同一盘面。
 * @param level - 关卡号（自动钳制）。
 * @param seed - 随机种子。
 * @returns 初始局面。 */
export function createWaterSortState(level: number, seed: number): WaterSortState {
  const lv = clampLevel(level)
  const def = LEVELS[lv - 1]!
  const gen = generateLevel(lv, mulberry32((seed + lv * 1013) >>> 0))
  return {
    level: lv,
    colorCount: def.colors,
    tubes: gen.tubes,
    moves: 0,
    par: gen.par,
    extraUsed: false,
    status: 'playing',
  }
}

/** 撤回历史上限（快照直接堆叠）。 */
const MAX_HISTORY = 300

/** 带撤回栈与加管道具的一局控制器：封装“倾倒/撤回/加管/重开”，渲染
 * 层只读它的 state。倾倒与加管成功时把前一局面压入历史栈；道具标记
 * 不随撤回回退（用了就用了），但加出的空管会随撤回消失。
 */
export class WaterSortGame {
  private cur: WaterSortState
  private readonly history: WaterSortState[] = []

  /** @param level - 关卡号（自动钳制）。
   *  @param seed - 随机种子，同种子同盘面。 */
  constructor(private readonly level: number, private readonly seed: number) {
    this.cur = createWaterSortState(level, seed)
  }

  /** 当前局面（只读快照，勿修改）。 */
  get state(): WaterSortState {
    return this.cur
  }

  /** 是否还有可撤回的步。 */
  canUndo(): boolean {
    return this.history.length > 0
  }

  /** 倾倒：合法则应用并压历史栈。
   * @param from - 源管下标。
   * @param to - 目标管下标。
   * @returns 是否成功。 */
  pour(from: number, to: number): boolean {
    if (this.cur.status !== 'playing') return false
    const tubes = pourTubes(this.cur.tubes, from, to)
    if (tubes === null) return false
    this.pushHistory()
    const won = isWon(tubes)
    this.cur = { ...this.cur, tubes, moves: this.cur.moves + 1, status: won ? 'won' : 'playing' }
    return true
  }

  /** 撤回一步（倾倒或加管）；仅进行中可用，道具标记不回退。
   * @returns 是否撤回了。 */
  undo(): boolean {
    if (this.cur.status !== 'playing') return false
    const prev = this.history.pop()
    if (prev === undefined) return false
    this.cur = { ...prev, extraUsed: this.cur.extraUsed }
    return true
  }

  /** 加管道具：追加一根空管，每关限一次；结束局面不可用。
   * @returns 是否成功。 */
  addTube(): boolean {
    if (this.cur.status !== 'playing' || this.cur.extraUsed) return false
    this.pushHistory()
    this.cur = { ...this.cur, tubes: [...this.cur.tubes, []], extraUsed: true }
    return true
  }

  /** 重开本关：同关卡同种子，重现同一盘面并清空历史。 */
  reset(): void {
    this.cur = createWaterSortState(this.level, this.seed)
    this.history.length = 0
  }

  private pushHistory(): void {
    this.history.push(this.cur)
    if (this.history.length > MAX_HISTORY) this.history.shift()
  }
}
