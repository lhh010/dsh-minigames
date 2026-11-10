/**
 * 弹跳机器人（Ricochet Robots）纯逻辑：10×10 盘面，外圈全墙 + 内部散墙
 * （生成器用 flood-fill 保证空闲格连通）。4 个不同色机器人 + 1 个目标格；
 * 每回合玩家选一个方向，所有机器人同时向该方向滑行，直到各自撞墙或撞上
 * 其他机器人（同伴 = 垫脚石）。指定颜色的机器人抵达目标格即过关，步数
 * 上限 limit = par + 4（par 由 BFS 预计算最优步数）。同向滑行按「先行者
 * 先落定」结算（朝移动方向最前的机器人先停），结果与处理顺序无关，
 * 可脱离 DOM 直接模拟验证。
 */

/** 逻辑画布宽度 px。 */
export const W = 440
/** 逻辑画布高度 px。 */
export const H = 512
/** 盘面边长格数（10×10）。 */
export const SIZE = 10
/** 单格边长 px。 */
export const CELL = 36
/** 盘面左上角 x px。 */
export const BOARD_X = 40
/** 盘面左上角 y px。 */
export const BOARD_Y = 44
/** 机器人数量（四色）。 */
export const ROBOT_COUNT = 4
/** 生成器允许的最大 par（BFS 搜索深度上限同值）。 */
export const MAX_PAR = 12

/** 一个滑动方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right'

/** 格坐标。 */
export interface Pos {
  /** 行号（0 起）。 */
  row: number
  /** 列号（0 起）。 */
  col: number
}

/** 一局状态。 */
export interface RicochetState {
  /** 基础 seed（与 level 联合决定布局）。 */
  seed: number
  /** 关卡号（从 1 起）。 */
  level: number
  /** SIZE×SIZE 墙矩阵：true 为墙（外圈恒为墙）。 */
  walls: boolean[][]
  /** 机器人位置（索引即颜色索引 0-3）。 */
  robots: Pos[]
  /** 目标格。 */
  target: Pos
  /** 必须抵达目标格的机器人（颜色）索引。 */
  targetRobot: number
  /** 已走步数（每次有效滑动 +1）。 */
  moves: number
  /** BFS 最优步数（计分与限步基准）。 */
  par: number
  /** 步数上限（par + 4，超出未胜即失败）。 */
  limit: number
  /** 当前潜在得分（胜利时定格为最终得分）。 */
  score: number
  /** 是否已过关（目标机器人停在目标格）。 */
  won: boolean
  /** 是否已失败（步数耗尽仍未过关）。 */
  failed: boolean
}

/** 四个方向的方向向量。 */
const DIR_VEC: Record<Dir, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
}

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
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

/**
 * 深拷贝一局状态（undo 快照用）。
 * @param state - 原状态。
 * @returns 结构相等的新状态。
 */
export function cloneState(state: RicochetState): RicochetState {
  return {
    seed: state.seed,
    level: state.level,
    walls: state.walls.map((row) => row.slice()),
    robots: state.robots.map((r) => ({ ...r })),
    target: { ...state.target },
    targetRobot: state.targetRobot,
    moves: state.moves,
    par: state.par,
    limit: state.limit,
    score: state.score,
    won: state.won,
    failed: state.failed,
  }
}

/**
 * 统一滑动模拟：所有机器人同时向 dir 滑行到稳定。按「朝移动方向最前
 * 的机器人先落定」的顺序结算——先行者停定后成为后行者的阻挡物，同向
 * 机器人彼此不能穿越，故结果与机器人索引顺序无关。
 * @param walls - 墙矩阵。
 * @param robots - 机器人位置。
 * @param dir - 滑动方向。
 * @returns 滑定后的新位置数组；没有任何机器人移动返回 null。
 */
export function slideRobots(walls: boolean[][], robots: Pos[], dir: Dir): Pos[] | null {
  const [dr, dc] = DIR_VEC[dir]
  const result = robots.map((r) => ({ ...r }))
  const occupied = new Set<number>(robots.map((r) => r.row * SIZE + r.col))
  // 先行度：移动方向最前的机器人 metric 最大，先结算。
  const order = result
    .map((_, i) => i)
    .sort((a, b) => {
      const ma = dr !== 0 ? robots[a]!.row * dr : robots[a]!.col * dc
      const mb = dr !== 0 ? robots[b]!.row * dr : robots[b]!.col * dc
      return mb - ma
    })
  let moved = false
  for (const i of order) {
    const start = result[i]!
    occupied.delete(start.row * SIZE + start.col)
    let row = start.row
    let col = start.col
    for (;;) {
      const nr = row + dr
      const nc = col + dc
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) break
      if (walls[nr]![nc]) break
      if (occupied.has(nr * SIZE + nc)) break
      row = nr
      col = nc
    }
    occupied.add(row * SIZE + col)
    if (row !== start.row || col !== start.col) {
      moved = true
      result[i] = { row, col }
    }
  }
  return moved ? result : null
}

/**
 * 计算当前潜在得分：基础分随关卡递增，超出 par 每步扣 25，下限 100。
 * @param level - 关卡号。
 * @param moves - 已走步数。
 * @param par - 最优步数。
 * @returns 得分。
 */
export function computeScore(level: number, moves: number, par: number): number {
  const base = 600 + (level - 1) * 40
  const over = Math.max(0, moves - par)
  return Math.max(100, base - over * 25)
}

/**
 * 执行一回合：所有机器人向 dir 滑行（纯函数：不改原状态）。
 * @param state - 当前状态。
 * @param dir - 滑动方向。
 * @returns 新状态（步数、胜负与得分更新）；没有任何机器人移动（无效
 * 回合）返回 null。
 */
export function slideAll(state: RicochetState, dir: Dir): RicochetState | null {
  if (state.won || state.failed) return null
  const robots = slideRobots(state.walls, state.robots, dir)
  if (robots === null) return null
  const next = cloneState(state)
  next.robots = robots
  next.moves = state.moves + 1
  const t = robots[state.targetRobot]!
  if (t.row === state.target.row && t.col === state.target.col) {
    next.won = true
    next.failed = false
  } else if (next.moves >= next.limit) {
    next.won = false
    next.failed = true
  }
  next.score = computeScore(next.level, next.moves, next.par)
  return next
}

/**
 * BFS 最优步数：每步四方向全量滑动，目标为 targetRobot 停在 target。
 * @param walls - 墙矩阵。
 * @param robots - 机器人初始位置。
 * @param target - 目标格。
 * @param targetRobot - 目标机器人索引。
 * @param maxDepth - 搜索深度上限（默认 MAX_PAR）。
 * @returns 最短步数；超深度或不可解返回 -1。
 */
export function solve(walls: boolean[][], robots: Pos[], target: Pos, targetRobot: number, maxDepth: number = MAX_PAR): number {
  const atTarget = (rs: Pos[]): boolean => {
    const t = rs[targetRobot]!
    return t.row === target.row && t.col === target.col
  }
  if (atTarget(robots)) return 0
  const keyOf = (rs: Pos[]): string => rs.map((r) => r.row * SIZE + r.col).join(',')
  const dirs: Dir[] = ['up', 'down', 'left', 'right']
  const visited = new Set<string>([keyOf(robots)])
  let frontier: Pos[][] = [robots.map((r) => ({ ...r }))]
  let depth = 0
  while (frontier.length > 0) {
    depth += 1
    if (depth > maxDepth) return -1
    const next: Pos[][] = []
    for (const rs of frontier) {
      for (const dir of dirs) {
        const slid = slideRobots(walls, rs, dir)
        if (slid === null) continue
        const key = keyOf(slid)
        if (visited.has(key)) continue
        visited.add(key)
        if (atTarget(slid)) return depth
        next.push(slid)
      }
    }
    frontier = next
  }
  return -1
}

/**
 * 空闲格连通性检查：flood-fill 统计从首个空闲格可达的空闲格数。
 * @param walls - 墙矩阵。
 * @returns true 当所有空闲格彼此连通。
 */
export function freeCellsConnected(walls: boolean[][]): boolean {
  let start: Pos | null = null
  let free = 0
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!walls[r]![c]) {
        free += 1
        if (start === null) start = { row: r, col: c }
      }
    }
  }
  if (start === null) return false
  const seen: boolean[][] = walls.map((row) => row.map(() => false))
  const queue: Pos[] = [start]
  seen[start.row]![start.col] = true
  let count = 0
  while (queue.length > 0) {
    const p = queue.pop()!
    count += 1
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = p.row + dr
      const nc = p.col + dc
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue
      if (walls[nr]![nc] || seen[nr]![nc]) continue
      seen[nr]![nc] = true
      queue.push({ row: nr, col: nc })
    }
  }
  return count === free
}

/** 由已验证的布局组装初始状态。 */
function makeState(
  seed: number, level: number, walls: boolean[][], robots: Pos[], target: Pos, targetRobot: number, par: number,
): RicochetState {
  return {
    seed,
    level,
    walls,
    robots,
    target,
    targetRobot,
    moves: 0,
    par,
    limit: par + 4,
    score: computeScore(level, 0, par),
    won: false,
    failed: false,
  }
}

/**
 * 生成第 level 关：确定性随机放内部散墙（数量随关卡递增）并校验空闲格
 * 连通，随机放 4 机器人与目标格，BFS 求 par，要求落在目标区间
 * [3+level, min(5+level, 12)]（关卡越深 par 越高、越紧）；不满足则换
 * 尝试重掷；耗尽时退回「可解且 par 最接近目标」的候选，保证返回有效
 * 关卡（par ≤ 12 可解）。
 * @param seed - 基础种子（与 level、尝试次数联合散列）。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（won=false、failed=false、moves=0）。
 */
export function generateLevel(seed: number, level: number): RicochetState {
  const innerWalls = Math.min(7 + (level - 1) * 2, 15)
  const parTarget = Math.min(3 + level, 9)
  const parMin = parTarget
  const parMax = Math.min(parTarget + 2, MAX_PAR)
  let best: RicochetState | null = null
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const rand = mulberry32((seed + level * 7919 + attempt * 104729) >>> 0)
    const walls: boolean[][] = []
    for (let r = 0; r < SIZE; r += 1) walls.push(new Array<boolean>(SIZE).fill(false))
    for (let r = 0; r < SIZE; r += 1) {
      walls[r]![0] = true
      walls[r]![SIZE - 1] = true
      walls[0]![r] = true
      walls[SIZE - 1]![r] = true
    }
    const used = new Set<number>()
    for (let i = 0; i < innerWalls; i += 1) {
      for (;;) {
        const r = 1 + Math.floor(rand() * (SIZE - 2))
        const c = 1 + Math.floor(rand() * (SIZE - 2))
        const k = r * SIZE + c
        if (used.has(k)) continue
        used.add(k)
        walls[r]![c] = true
        break
      }
    }
    if (!freeCellsConnected(walls)) continue
    const freeCells: Pos[] = []
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (!walls[r]![c]) freeCells.push({ row: r, col: c })
      }
    }
    const pick = (): Pos => freeCells[Math.floor(rand() * freeCells.length)]!
    const target = pick()
    const targetRobot = Math.floor(rand() * ROBOT_COUNT)
    const taken = new Set<number>([target.row * SIZE + target.col])
    const robots: Pos[] = []
    let ok = true
    for (let i = 0; i < ROBOT_COUNT; i += 1) {
      let pos = pick()
      for (let guard = 0; taken.has(pos.row * SIZE + pos.col) && guard < 200; guard += 1) pos = pick()
      if (taken.has(pos.row * SIZE + pos.col)) { ok = false; break }
      taken.add(pos.row * SIZE + pos.col)
      robots.push({ ...pos })
    }
    if (!ok) continue
    const tr = robots[targetRobot]!
    if (tr.row === target.row && tr.col === target.col) continue
    const par = solve(walls, robots, target, targetRobot, MAX_PAR)
    if (par < 0) continue
    const st = makeState(seed, level, walls, robots, target, targetRobot, par)
    if (par >= parMin && par <= parMax) return st
    if (best === null || Math.abs(par - parTarget) < Math.abs(best.par - parTarget)) best = st
  }
  if (best !== null) return best
  // 兜底：外圈墙 + 少量散墙、放宽到任意可解（理论上极少到达）。
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const rand = mulberry32((seed + level * 104729 + attempt * 7919) >>> 0)
    const walls: boolean[][] = []
    for (let r = 0; r < SIZE; r += 1) walls.push(new Array<boolean>(SIZE).fill(false))
    for (let r = 0; r < SIZE; r += 1) {
      walls[r]![0] = true
      walls[r]![SIZE - 1] = true
      walls[0]![r] = true
      walls[SIZE - 1]![r] = true
    }
    const freeCells: Pos[] = []
    for (let r = 1; r < SIZE - 1; r += 1) {
      for (let c = 1; c < SIZE - 1; c += 1) freeCells.push({ row: r, col: c })
    }
    const target = freeCells[Math.floor(rand() * freeCells.length)]!
    const targetRobot = Math.floor(rand() * ROBOT_COUNT)
    const taken = new Set<number>([target.row * SIZE + target.col])
    const robots: Pos[] = []
    for (let i = 0; i < ROBOT_COUNT; i += 1) {
      let pos = freeCells[Math.floor(rand() * freeCells.length)]!
      for (let guard = 0; taken.has(pos.row * SIZE + pos.col) && guard < 200; guard += 1) {
        pos = freeCells[Math.floor(rand() * freeCells.length)]!
      }
      taken.add(pos.row * SIZE + pos.col)
      robots.push({ ...pos })
    }
    const par = solve(walls, robots, target, targetRobot, MAX_PAR)
    if (par < 0) continue
    return makeState(seed, level, walls, robots, target, targetRobot, par)
  }
  throw new Error('ricochet: generateLevel failed to produce a solvable level')
}
