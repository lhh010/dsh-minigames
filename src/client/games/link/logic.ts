/**
 * 连连看 Link 纯逻辑：N×M 网格上按注入 seed（mulberry32）确定性生成成对
 * 牌面；两张同图案牌之间存在「水平/垂直线段、最多两次拐弯、不穿过未消牌」
 * 的路径即可消除——路径由带转弯计数的 BFS 求得，场外一圈虚拟格可通行。
 * 无可连对时可主动洗牌（每关 3 次，保持牌面多重集并保证洗后可解）；全部
 * 消除过关，共 5 关递进（10×8 → 14×10）；计时倒扣分、超时或死局无洗牌判负。
 * 全部为纯函数 + 普通状态对象；index.ts 驱动输入与动画，单元测试直接驱动逻辑。
 */

/** 网格坐标（行 r、列 c；路径坐标允许 -1 / rows / cols 的场外虚拟圈）。 */
export interface Pos { r: number; c: number }

/** 对局状态：playing 进行中 / cleared 过关待进下一关 / won 全部通关 / lost 失败。 */
export type LinkStatus = 'playing' | 'cleared' | 'won' | 'lost'

export interface LinkState {
  /** 当前关卡（1..5）。 */
  level: number
  rows: number
  cols: number
  /** rows x cols 牌面图案 id（0 起，图案池见渲染层）；null = 已消除的空格。 */
  grid: (number | null)[][]
  /** 当前选中格（行优先索引）；null = 未选。 */
  selected: number | null
  /** 剩余洗牌次数。 */
  shufflesLeft: number
  /** 剩余未消对数。 */
  pairsLeft: number
  /** 本关剩余秒数与总秒数。 */
  timeLeft: number
  timeLimit: number
  /** 本关已进行秒数（计时倒扣分的扣分依据，过关时结算归零）。 */
  elapsed: number
  /** 累计所得分（消除分 + 过关时间奖励 - 过关时结算的计时扣分），跨关累计。 */
  earned: number
  status: LinkStatus
  /** 最近一次成功消除的路径拐点序列（含两端），供连线动画使用。 */
  lastPath: Pos[] | null
  /** 死局标记：还有牌但不存在任何可连对。 */
  deadlock: boolean
  rng: () => number
}

/** 5 关布局：行 x 列与挑战时长（秒），从 10x8 递进到 14x10。 */
export const LEVELS = [
  { rows: 8, cols: 10, time: 200 },
  { rows: 8, cols: 12, time: 220 },
  { rows: 9, cols: 12, time: 240 },
  { rows: 9, cols: 14, time: 260 },
  { rows: 10, cols: 14, time: 280 },
] as const

/** 图案池大小（渲染层按图案 id 取 emoji）。 */
export const POOL_SIZE = 20

/** 某关可用的图案种数（第 1 关 12 种，每关 +2，封顶 20）。 */
export function levelKinds(level: number): number {
  return Math.min(POOL_SIZE, 10 + level * 2)
}

/** 每消一对的基础分（关卡越高每对分越高）。 */
export function pairValue(level: number): number {
  return 10 + level * 2
}

/** 每关洗牌次数上限。 */
export const SHUFFLES_PER_LEVEL = 3

/** 过关时每剩 1 秒的时间奖励分。 */
export const CLEAR_BONUS_PER_SEC = 2

/**
 * mulberry32 确定性随机数生成器：同一 seed 产生同一序列，全部随机性都由它驱动。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 均匀随机数的函数。
 */
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

/** 当前展示分数：累计所得分减去本关每整秒 1 分的计时倒扣，下限 0。 */
export function currentScore(state: LinkState): number {
  return Math.max(0, state.earned - Math.floor(state.elapsed))
}

/** 行优先索引转网格坐标（不校验边界）。 */
export function idxToPos(index: number, cols: number): Pos {
  return { r: Math.floor(index / cols), c: index % cols }
}

/** Fisher-Yates 洗牌（不修改入参）。 */
function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0]]

/** BFS 节点：到达该格时的移动方向、已用转弯数与父节点。 */
interface PathNode { r: number; c: number; dir: number; turns: number; parent: PathNode | null }

/**
 * 求两张牌之间「最多两次拐弯」的合法连接路径（带转弯计数的 BFS）。
 * 场外一圈虚拟格（-1 / rows / cols）恒可通行；线段不得穿过未消牌，终点牌格自身可进入。
 * @param grid - 当前牌面网格（null = 空格）。
 * @param rows - 网格行数。
 * @param cols - 网格列数。
 * @param a - 起点牌格。
 * @param b - 终点牌格。
 * @returns 折线拐点序列（含两端点，共线段已压缩）；a、b 同格或无路径时返回 null。
 */
export function findPath(
  grid: (number | null)[][], rows: number, cols: number, a: Pos, b: Pos,
): Pos[] | null {
  if (a.r === b.r && a.c === b.c) return null
  const passable = (r: number, c: number): boolean => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return true
    if (r === b.r && c === b.c) return true
    return grid[r]![c] === null
  }
  // 每个 (格, 方向) 保留已见最小转弯数，避免重复扩展。
  // BFS 只在「棋盘 + 场外一圈虚拟格」内游走：线段绕场外永远贴着外沿即可，
  // 更远的场外格与外沿格等价，限制在一圈内保证状态空间有界。
  const inRing = (r: number, c: number): boolean =>
    r >= -1 && r <= rows && c >= -1 && c <= cols
  const seen = new Int16Array((rows + 2) * (cols + 2) * 4).fill(999)
  const key = (r: number, c: number, dir: number): number =>
    ((r + 1) * (cols + 2) + (c + 1)) * 4 + dir
  // 按转弯数分层波次推进（每层内按步数 FIFO）：先找到转弯最少、其次最短的路径。
  const waves: PathNode[][] = [[], [], []]
  for (let dir = 0; dir < 4; dir += 1) {
    const [dr, dc] = DIRS[dir]!
    const r = a.r + dr
    const c = a.c + dc
    if (!inRing(r, c) || !passable(r, c)) continue
    seen[key(r, c, dir)] = 0
    waves[0]!.push({ r, c, dir, turns: 0, parent: null })
  }
  let end: PathNode | null = null
  for (let wave = 0; wave < 3 && end === null; wave += 1) {
    const cur = waves[wave]!
    for (let i = 0; i < cur.length && end === null; i += 1) {
      const node = cur[i]!
      if (node.r === b.r && node.c === b.c) {
        end = node
        break
      }
      for (let dir = 0; dir < 4; dir += 1) {
        const turns = wave + (dir === node.dir ? 0 : 1)
        if (turns > 2) continue
        const [dr, dc] = DIRS[dir]!
        const r = node.r + dr
        const c = node.c + dc
        if (!inRing(r, c) || !passable(r, c)) continue
        if ((seen[key(r, c, dir)] ?? 999) <= turns) continue
        seen[key(r, c, dir)] = turns
        waves[turns]!.push({ r, c, dir, turns, parent: node })
      }
    }
  }
  if (end === null) return null
  return compress(a, end)
}

/** 回溯 BFS 终点并压缩共线点，得到拐点序列（含两端）。 */
function compress(a: Pos, end: PathNode): Pos[] {
  const chain: PathNode[] = []
  for (let n: PathNode | null = end; n !== null; n = n.parent) chain.push(n)
  chain.reverse()
  const points: Pos[] = [a]
  for (let i = 0; i < chain.length; i += 1) {
    const cur = chain[i]!
    const prev = i === 0 ? null : chain[i - 1]!
    if (prev !== null && cur.dir !== prev.dir) points.push({ r: prev.r, c: prev.c })
    if (i === chain.length - 1) points.push({ r: cur.r, c: cur.c })
  }
  return points
}

/**
 * 两格是否为可消对：均为牌面、同图案且存在合法路径。
 * @param grid - 当前牌面网格（null = 空格）。
 * @param rows - 网格行数。
 * @param cols - 网格列数。
 * @param a - 第一张牌格。
 * @param b - 第二张牌格。
 */
export function canLink(
  grid: (number | null)[][], rows: number, cols: number, a: Pos, b: Pos,
): boolean {
  const fa = grid[a.r]?.[a.c] ?? null
  const fb = grid[b.r]?.[b.c] ?? null
  if (fa === null || fb === null || fa !== fb) return false
  if (a.r === b.r && a.c === b.c) return false
  return findPath(grid, rows, cols, a, b) !== null
}

/**
 * 暴力搜索第一对可连牌（同图案分组后两两试路径；牌面 ≤140 张足够快）。
 * @param state - 当前状态。
 * @returns 第一对可连牌坐标；无可连对（死局）时返回 null。
 */
export function findLinkablePair(state: LinkState): [Pos, Pos] | null {
  const byFace = new Map<number, Pos[]>()
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const face = state.grid[r]![c] ?? null
      if (face === null) continue
      const list = byFace.get(face) ?? []
      list.push({ r, c })
      byFace.set(face, list)
    }
  }
  for (const face of [...byFace.keys()].sort((x, y) => x - y)) {
    const positions = byFace.get(face)!
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i]!
        const b = positions[j]!
        if (findPath(state.grid, state.rows, state.cols, a, b) !== null) return [a, b]
      }
    }
  }
  return null
}

/** 重算死局标记；死局且无洗牌次数时直接判负。 */
export function refreshDeadlock(state: LinkState): void {
  if (state.status !== 'playing') return
  state.deadlock = state.pairsLeft > 0 && findLinkablePair(state) === null
  if (state.deadlock && state.shufflesLeft <= 0) state.status = 'lost'
}

/** 用 state.rng 随机生成本关满牌面（每种图案成对出现）。 */
function generateGrid(state: LinkState): void {
  const pairs = (state.rows * state.cols) / 2
  const kinds = levelKinds(state.level)
  const deck: number[] = []
  for (let i = 0; i < pairs; i += 1) {
    const face = Math.floor(state.rng() * kinds)
    deck.push(face, face)
  }
  const order = shuffled(deck, state.rng)
  state.grid = []
  let next = 0
  for (let r = 0; r < state.rows; r += 1) {
    const row: (number | null)[] = []
    for (let c = 0; c < state.cols; c += 1) {
      row.push(order[next]!)
      next += 1
    }
    state.grid.push(row)
  }
  state.pairsLeft = pairs
}

/** 重建指定关卡：尺寸/时长/洗牌次数复位并生成保证可解的满牌面（最多重试 64 次）。 */
function setupLevel(state: LinkState, level: number): void {
  const conf = LEVELS[level - 1]!
  state.level = level
  state.rows = conf.rows
  state.cols = conf.cols
  state.timeLimit = conf.time
  state.timeLeft = conf.time
  state.elapsed = 0
  state.selected = null
  state.lastPath = null
  state.shufflesLeft = SHUFFLES_PER_LEVEL
  state.status = 'playing'
  state.deadlock = false
  for (let attempt = 0; attempt < 64; attempt += 1) {
    generateGrid(state)
    if (findLinkablePair(state) !== null) break
  }
}

/**
 * 建立指定关卡的全新状态；同 seed 同关卡结果完全一致（可测确定性）。
 * @param seed - mulberry32 种子，驱动全部随机性。
 * @param level - 起始关卡（1..5），默认 1。
 */
export function createLinkState(seed: number, level = 1): LinkState {
  const state: LinkState = {
    rows: 0,
    cols: 0,
    level,
    grid: [],
    selected: null,
    shufflesLeft: SHUFFLES_PER_LEVEL,
    pairsLeft: 0,
    timeLeft: 0,
    timeLimit: 0,
    elapsed: 0,
    earned: 0,
    status: 'playing',
    lastPath: null,
    deadlock: false,
    rng: mulberry32(seed),
  }
  setupLevel(state, level)
  return state
}

/**
 * 点击一张牌：选中/取消/尝试消除。第二张与选中同图案且路径可达即消除并记录
 * 路径；否则选中切换到这张牌。消除后重算死局；清场时结算过关（含时间奖励与
 * 计时扣分），第 5 关清场则通关。
 * @param state - 当前状态。
 * @param index - 行优先格索引。
 * @returns 'select' 切换选中 | 'deselect' 取消选中 | 'match' 消除一对 | 'none' 无效点击。
 */
export function tapTile(state: LinkState, index: number): 'select' | 'deselect' | 'match' | 'none' {
  if (state.status !== 'playing') return 'none'
  const pos = idxToPos(index, state.cols)
  if (pos.r < 0 || pos.r >= state.rows || pos.c < 0 || pos.c >= state.cols) return 'none'
  const face = state.grid[pos.r]![pos.c]
  if (face === null) return 'none'
  if (state.selected === index) {
    state.selected = null
    return 'deselect'
  }
  if (state.selected === null) {
    state.selected = index
    return 'select'
  }
  const a = idxToPos(state.selected, state.cols)
  const faceA = state.grid[a.r]![a.c]
  if (faceA !== null && faceA === face) {
    const path = findPath(state.grid, state.rows, state.cols, a, pos)
    if (path !== null) {
      state.grid[a.r]![a.c] = null
      state.grid[pos.r]![pos.c] = null
      state.pairsLeft -= 1
      state.earned += pairValue(state.level)
      state.lastPath = path
      state.selected = null
      if (state.pairsLeft === 0) {
        // 结算本关计时扣分并发放剩余时间奖励，分数连续不跳变。
        state.earned += Math.floor(state.timeLeft) * CLEAR_BONUS_PER_SEC - Math.floor(state.elapsed)
        state.elapsed = 0
        state.status = state.level >= LEVELS.length ? 'won' : 'cleared'
      } else {
        refreshDeadlock(state)
      }
      return 'match'
    }
  }
  state.selected = index
  return 'select'
}

/**
 * 主动洗牌：保持剩余牌面多重集与占格不变重排图案（选中清空），重试至出现可
 * 连对（最多 64 次）；每次消耗 1 次洗牌机会，洗后死局且无次数则判负。
 * @param state - 当前状态。
 * @returns 是否执行了洗牌（非进行中 / 无次数 / 已清场返回 false）。
 */
export function shuffleRemaining(state: LinkState): boolean {
  if (state.status !== 'playing' || state.shufflesLeft <= 0 || state.pairsLeft === 0) return false
  const cells: Pos[] = []
  const faces: number[] = []
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const face = state.grid[r]![c] ?? null
      if (face !== null) {
        cells.push({ r, c })
        faces.push(face)
      }
    }
  }
  let solvable = false
  for (let attempt = 0; attempt < 64 && !solvable; attempt += 1) {
    const order = shuffled(faces, state.rng)
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i]!
      state.grid[cell.r]![cell.c] = order[i]!
    }
    solvable = findLinkablePair(state) !== null
  }
  state.shufflesLeft -= 1
  state.selected = null
  state.lastPath = null
  state.deadlock = !solvable
  if (state.deadlock && state.shufflesLeft <= 0) state.status = 'lost'
  return true
}

/**
 * 计时推进：扣减剩余时间并累计已进行秒数；剩余时间归零判负。
 * @param state - 当前状态。
 * @param dtSec - 推进的秒数。
 * @returns 'lost' 已判负（含此前已负），否则 'ok'。
 */
export function tick(state: LinkState, dtSec: number): 'ok' | 'lost' {
  if (state.status === 'lost') return 'lost'
  if (state.status !== 'playing') return 'ok'
  state.timeLeft = Math.max(0, state.timeLeft - dtSec)
  state.elapsed += dtSec
  if (state.timeLeft === 0) state.status = 'lost'
  return state.status === 'lost' ? 'lost' : 'ok'
}

/**
 * 过关后进入下一关（累计分保留）。
 * @param state - 当前状态。
 * @returns 是否进入了下一关（仅在 cleared 状态有效）。
 */
export function advanceLevel(state: LinkState): boolean {
  if (state.status !== 'cleared') return false
  setupLevel(state, Math.min(LEVELS.length, state.level + 1))
  return true
}
