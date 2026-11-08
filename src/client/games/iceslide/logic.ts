/**
 * 冰面滑行（Ice Slide）纯逻辑：网格关卡由注入 seed 的生成器从解路径
 * 反推生成——先走出一条「按键 → 一路滑行到墙前停下」的解路径，再沿路径
 * 外侧补墙，宝石只放在路径上、尖刺只放在路径外，因此按记录的按键序列
 * 一定可以吃满宝石并停在出口。所有随机走 mulberry32(seed)，同 seed
 * 必生成同一关卡；无 DOM、无定时器，渲染层与测试共用。
 */

/** 滑行方向。 */
export type SlideDir = 'up' | 'down' | 'left' | 'right'

/** 方向 → 格增量（按列主序 x 向右、y 向下）。 */
const DX: Record<SlideDir, number> = { up: 0, down: 0, left: -1, right: 1 }
const DY: Record<SlideDir, number> = { up: -1, down: 1, left: 0, right: 0 }

/** 格内标记位：墙 / 尖刺 / 宝石。 */
export const CELL_WALL = 1
export const CELL_SPIKE = 2
export const CELL_GEM = 4

/** 生成解里单次滑行的最大格数（越大墙越稀、谜题越散）。 */
const MAX_SLIDE = 4
/** 生成器重试次数上限（每次换派生 seed，仍失败则抛错）。 */
const GEN_ATTEMPTS = 64

/** 一个冰面关卡：静态布局 + 保证可解的按键序列。 */
export interface IceLevel {
  /** 列数。 */
  w: number
  /** 行数。 */
  h: number
  /** 每格标记位掩码（row-major，索引 y*w+x）。 */
  cells: Uint8Array
  /** 起点格索引。 */
  start: number
  /** 出口格索引（需集齐宝石后停在此格）。 */
  exit: number
  /** 生成时记录的解（按键序列；长度即该关最优参考步数 par）。 */
  solution: SlideDir[]
  /** 宝石总数。 */
  gemTotal: number
}

/** 一次滑行的结果（也驱动渲染层的拖尾/粒子/结算）。 */
export interface SlideResult {
  /** 按下的方向。 */
  dir: SlideDir
  /** 出发格。 */
  from: number
  /** 停留格；滑出界时为 -1。 */
  to: number
  /** 途经格（不含出发格，含终点；滑出界时不含界外）。 */
  path: number[]
  /** 结算类型：wall=撞墙停 / spike=踩尖刺 / fell=滑出界。 */
  outcome: 'wall' | 'spike' | 'fell'
  /** 本次沿途新收集的宝石格。 */
  gems: number[]
  /** 是否过关（停在出口且宝石集齐）。 */
  cleared: boolean
}

/** 游戏状态：当前关卡布局 + 玩家进度。 */
export interface IceState {
  /** 当前关下标（0 起）。 */
  levelIndex: number
  /** 当前关布局。 */
  level: IceLevel
  /** 玩家所在格。 */
  pos: number
  /** 已收集的宝石格集合。 */
  collected: Set<number>
  /** 本关按键数（步数，越少评价越高）。 */
  moves: number
  /** 本关死亡次数。 */
  retries: number
  /** playing=滑行中 / dead=踩尖刺或滑出界 / cleared=过关待进入下一关。 */
  status: 'playing' | 'dead' | 'cleared'
  /** 死因（仅 status==='dead' 时有值）。 */
  deathCause: 'spike' | 'fell' | null
  /** 已结算分数（宝石分 + 过关奖励）；当前关宝石分另见 iceScore。 */
  score: number
  /** 最后一关也过关后为 true。 */
  finished: boolean
  /** 撤销栈：每次成功滑行前的快照。 */
  history: Array<{ pos: number; moves: number; collected: number[] }>
}

/** 每颗宝石的分值。 */
export const GEM_SCORE = 10
/** 过关奖励分档：步数 ≤ par / ≤ par+2 / 更慢。 */
export const CLEAR_BONUS = [300, 150, 50] as const

/**
 * mulberry32 确定性伪随机数发生器（与其他游戏同构）。
 * @param seed 32 位种子
 * @returns 返回 [0,1) 均匀随机数的函数
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 用 rng 做 Fisher-Yates 原地洗牌。 */
function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const t = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = t
  }
  return arr
}

/**
 * 手工构造关卡（测试与自定义用）：walls/spikes/gems 为格索引数组。
 * @param w 列数
 * @param h 行数
 * @param opts 墙/尖刺/宝石/起点/出口/解序列
 */
export function makeLevel(
  w: number,
  h: number,
  opts: {
    walls?: number[]
    spikes?: number[]
    gems?: number[]
    start: number
    exit: number
    solution?: SlideDir[]
  },
): IceLevel {
  const cells = new Uint8Array(w * h)
  for (const i of opts.walls ?? []) cells[i] = cells[i]! | CELL_WALL
  for (const i of opts.spikes ?? []) cells[i] = cells[i]! | CELL_SPIKE
  for (const i of opts.gems ?? []) cells[i] = cells[i]! | CELL_GEM
  return {
    w,
    h,
    cells,
    start: opts.start,
    exit: opts.exit,
    solution: opts.solution ?? [],
    gemTotal: (opts.gems ?? []).length,
  }
}

/** 一次生成尝试：成功返回关卡，死路返回 null。 */
function attemptLevel(
  rand: () => number,
  w: number,
  h: number,
  moveCount: number,
  gemCount: number,
  spikeCount: number,
  extraWalls: number,
): IceLevel | null {
  const blocked = new Uint8Array(w * h)
  const pathCells = new Set<number>()
  const solution: SlideDir[] = []
  const dirs: SlideDir[] = ['up', 'down', 'left', 'right']
  const startCell = Math.floor(rand() * w * h)
  let pos = startCell
  pathCells.add(pos)
  for (let m = 0; m < moveCount; m += 1) {
    const x = pos % w
    const y = (pos / w) | 0
    const candidates: Array<{ dir: SlideDir; dest: number; wall: number; path: number[] }> = []
    for (const dir of dirs) {
      const dx = DX[dir]
      const dy = DY[dir]
      const edge = dx !== 0
        ? (dx > 0 ? w - 1 - x : x)
        : (dy > 0 ? h - 1 - y : y)
      // 墙放在 dest 后一格，因此 dest 至少离边 1 格：d ≤ edge-1。
      const maxD = Math.min(edge - 1, MAX_SLIDE)
      const segment: number[] = []
      for (let d = 1; d <= maxD; d += 1) {
        const next = pos + dx * d + dy * d * w
        if (blocked[next] === 1) break
        segment.push(next)
        const wall = pos + dx * (d + 1) + dy * (d + 1) * w
        if (blocked[wall] === 1) continue
        if (pathCells.has(wall)) continue
        candidates.push({ dir, dest: next, wall, path: [...segment] })
      }
    }
    if (candidates.length === 0) return null
    const pick = candidates[Math.floor(rand() * candidates.length)]!
    for (const c of pick.path) pathCells.add(c)
    pos = pick.dest
    solution.push(pick.dir)
    blocked[pick.wall] = 1
  }
  const exit = pos
  // 路径外补墙 / 尖刺：避开一切路径格与起终点，只加不减可解性。
  const extras = (count: number, mark: number): void => {
    let placed = 0
    let guard = 0
    while (placed < count && guard < count * 20 + 50) {
      guard += 1
      const i = Math.floor(rand() * w * h)
      if (pathCells.has(i)) continue
      if (i === exit) continue
      if (blocked[i]! !== 0 && (blocked[i]! & mark) !== 0) continue
      if (blocked[i]! !== 0) continue
      blocked[i] = blocked[i]! | mark
      placed += 1
    }
  }
  extras(extraWalls, CELL_WALL)
  extras(spikeCount, CELL_SPIKE)
  // 宝石只放路径格（重放解必然吃到），避开起点与出口，尽量两两隔开。
  const gemPool = shuffle([...pathCells].filter(c => c !== exit && c !== startCell), rand)
  const gems: number[] = []
  const tryPick = (minDist: number): void => {
    for (const c of gemPool) {
      if (gems.length >= gemCount) return
      if (gems.includes(c)) continue
      const cx = c % w
      const cy = (c / w) | 0
      const spread = gems.every(g => {
        const gx = g % w
        const gy = (g / w) | 0
        return Math.abs(gx - cx) + Math.abs(gy - cy) >= minDist
      })
      if (spread || minDist <= 1) gems.push(c)
    }
  }
  tryPick(3)
  tryPick(2)
  tryPick(1)
  if (gems.length === 0) return null
  const cells = new Uint8Array(blocked)
  for (const g of gems) cells[g] = cells[g]! | CELL_GEM
  return { w, h, cells, start: startCell, exit, solution, gemTotal: gems.length }
}

/**
 * 生成一个保证可解的关卡：从解路径反推布局（详见模块头）。内部按派生
 * seed 重试，通常一次成功；全部失败时抛错。
 * @param seed 种子；同 seed + 同参数必得同一关卡
 * @param w 列数（≥ 4）
 * @param h 行数（≥ 4）
 * @param moveCount 解路径的滑行段数（也是该关参考步数 par）
 * @param gemCount 宝石数（至少 1；空间不足时自动取可达上限）
 * @param spikeCount 路径外尖刺数
 * @param extraWalls 路径外额外墙数
 */
export function generateLevel(
  seed: number,
  w: number,
  h: number,
  moveCount: number,
  gemCount: number,
  spikeCount: number,
  extraWalls: number,
): IceLevel {
  for (let attempt = 0; attempt < GEN_ATTEMPTS; attempt += 1) {
    const rand = mulberry32((seed + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0)
    const level = attemptLevel(rand, w, h, moveCount, gemCount, spikeCount, extraWalls)
    if (level !== null) return level
  }
  throw new Error('iceslide: level generation failed for seed ' + seed)
}

/** 五关递进：网格增大、墙与尖刺更多、宝石更散。 */
const LEVEL_CONFIGS = [
  { seed: 20260101, w: 7, h: 6, moves: 4, gems: 2, spikes: 1, walls: 1 },
  { seed: 20260102, w: 9, h: 7, moves: 5, gems: 3, spikes: 2, walls: 2 },
  { seed: 20260103, w: 10, h: 8, moves: 6, gems: 4, spikes: 3, walls: 4 },
  { seed: 20260104, w: 12, h: 9, moves: 7, gems: 5, spikes: 4, walls: 6 },
  { seed: 20260105, w: 13, h: 10, moves: 8, gems: 6, spikes: 6, walls: 8 },
] as const

/** 预生成关卡库（模块加载时确定，同进程内恒定）。 */
export const LEVELS: IceLevel[] = LEVEL_CONFIGS.map(c =>
  generateLevel(c.seed, c.w, c.h, c.moves, c.gems, c.spikes, c.walls),
)

/** 关卡总数。 */
export const LEVEL_COUNT = LEVELS.length

/**
 * 创建一局新状态（从第 levelIndex 关开始，默认第 1 关）。
 * @param levelIndex 起始关下标（0 起，越界钳制）
 */
export function createIceState(levelIndex = 0): IceState {
  const state: IceState = {
    levelIndex: 0,
    level: LEVELS[0]!,
    pos: 0,
    collected: new Set(),
    moves: 0,
    retries: 0,
    status: 'playing',
    deathCause: null,
    score: 0,
    finished: false,
    history: [],
  }
  loadIceLevel(state, levelIndex)
  return state
}

/** 就地切换到第 index 关（保留累计 score，清空本关进度）。 */
export function loadIceLevel(state: IceState, index: number): void {
  const clamped = Math.max(0, Math.min(LEVEL_COUNT - 1, index))
  state.levelIndex = clamped
  state.level = LEVELS[clamped]!
  state.pos = state.level.start
  state.collected = new Set()
  state.moves = 0
  state.retries = 0
  state.status = 'playing'
  state.deathCause = null
  state.finished = false
  state.history = []
}

/** 本关死亡后重来：回到起点、宝石复原、步数清零、死亡计数 +1。 */
export function resetLevel(state: IceState): void {
  if (state.status === 'dead') state.retries += 1
  state.pos = state.level.start
  state.collected = new Set()
  state.moves = 0
  state.status = 'playing'
  state.deathCause = null
  state.history = []
}

/**
 * 当前展示分数：已结算 + 本关已吃宝石分。过关瞬间宝石分已并入 score、
 * 死亡待重来时宝石分即将回退，两种状态下都不再重复计入。
 */
export function iceScore(state: IceState): number {
  const pending = state.status === 'playing' ? state.collected.size * GEM_SCORE : 0
  return state.score + pending
}

/**
 * 按方向滑行：逐格前进直到撞墙（或踩尖刺 / 滑出界），沿途吃宝石；
 * 停在出口且宝石集齐时过关并结算奖励分。dead/cleared 状态或紧贴墙原地不动时
 * 忽略输入、不计步数。
 * @param state 游戏状态（就地更新）
 * @param dir 按下的方向
 * @returns 滑行结果；状态不允许滑行（已死/已过关/原地不动）时返回 null
 */
export function applySlide(state: IceState, dir: SlideDir): SlideResult | null {
  if (state.status !== 'playing') return null
  const { level } = state
  const w = level.w
  const h = level.h
  const cells = level.cells
  const prev = { pos: state.pos, moves: state.moves, collected: [...state.collected] }
  const path: number[] = []
  const gems: number[] = []
  let cur = state.pos
  let outcome: SlideResult['outcome'] = 'wall'
  for (;;) {
    const cx = cur % w
    const cy = (cur / w) | 0
    const nx = cx + DX[dir]
    const ny = cy + DY[dir]
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
      outcome = 'fell'
      break
    }
    const next = cur + DX[dir] + DY[dir] * w
    if ((cells[next]! & CELL_WALL) !== 0) {
      outcome = 'wall'
      break
    }
    path.push(next)
    if ((cells[next]! & CELL_SPIKE) !== 0) {
      cur = next
      outcome = 'spike'
      break
    }
    if ((cells[next]! & CELL_GEM) !== 0 && !state.collected.has(next)) {
      gems.push(next)
    }
    cur = next
  }
  // 紧贴墙/边界按方向 = 原地不动：不计步、不产生结果。
  if (outcome === 'wall' && path.length === 0) return null
  for (const g of gems) state.collected.add(g)
  state.moves += 1
  state.history.push(prev)
  if (outcome === 'fell') {
    state.pos = cur
    state.status = 'dead'
    state.deathCause = 'fell'
  } else if (outcome === 'spike') {
    state.pos = cur
    state.status = 'dead'
    state.deathCause = 'spike'
  } else {
    state.pos = cur
    const cleared = cur === level.exit && state.collected.size === level.gemTotal
    if (cleared) {
      state.status = 'cleared'
      const par = level.solution.length
      const bonus = state.moves <= par ? CLEAR_BONUS[0] : state.moves <= par + 2 ? CLEAR_BONUS[1] : CLEAR_BONUS[2]
      state.score += state.collected.size * GEM_SCORE + bonus
    }
    return { dir, from: prev.pos, to: cur, path, outcome, gems, cleared }
  }
  return { dir, from: prev.pos, to: outcome === 'fell' ? -1 : cur, path, outcome, gems, cleared: false }
}

/**
 * 撤回上一步滑行：位置、步数、宝石全部还原（不撤销死亡，死亡须重来）。
 * @returns 是否真的撤销了一步
 */
export function undoSlide(state: IceState): boolean {
  if (state.status !== 'playing' || state.history.length === 0) return false
  const snap = state.history.pop()!
  state.pos = snap.pos
  state.moves = snap.moves
  state.collected = new Set(snap.collected)
  return true
}

/** 过关后进入下一关；最后一关过关则标记 finished。 */
export function advanceLevel(state: IceState): void {
  if (state.status !== 'cleared') return
  if (state.levelIndex + 1 < LEVEL_COUNT) {
    loadIceLevel(state, state.levelIndex + 1)
  } else {
    state.finished = true
  }
}
