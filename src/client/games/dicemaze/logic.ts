/**
 * 骰子行军（DiceMaze）纯逻辑：标准骰子（对面点数和为 7）的翻滚朝向
 * 变换、数字门 / 碎地板 / 终点判定，以及带种子（mulberry32）的关卡生成。
 *
 * 生成策略保证可解：先以偏向终点的随机游走铺出一条起点→终点的解路径，
 * 再沿解路径按骰子到达那一刻的顶面撒数字门（门数字 = 解路径进入时的
 * 顶面，照解走必然全开），终点数字 = 进入终点时的顶面。岔路是纯死胡
 * 同（每个新格子只有一个非墙邻居），不会绕过门，因此解路径是唯一通
 * 路，确定性重放必然通关。无 DOM、无全局状态；同一种子逐位一致。
 */

/** 四个翻滚方向（也是棋盘行进方向）。 */
export type Dir = 'up' | 'right' | 'down' | 'left'

/** 骰子朝向三元组：顶 / 北 / 东三面的点数（各 1-6，对面和为 7）。 */
export interface Orientation {
  top: number
  north: number
  east: number
}

/** 初始朝向：1 朝上、2 朝北、3 朝东。 */
export const START_ORIENTATION: Orientation = { top: 1, north: 2, east: 3 }

/**
 * 朝指定方向翻滚 90° 后的新朝向。
 * 翻向北：顶→北、南→顶；翻向南：北→顶、顶→南；
 * 翻向东：顶→东、西→顶；翻向西：东→顶、顶→西（对面和恒为 7）。
 * @param o 翻滚前的朝向。
 * @param dir 翻滚（行进）方向。
 * @returns 翻滚后的新朝向（新对象）。
 */
export function roll(o: Orientation, dir: Dir): Orientation {
  if (dir === 'up') return { top: 7 - o.north, north: o.top, east: o.east }
  if (dir === 'down') return { top: o.north, north: 7 - o.top, east: o.east }
  if (dir === 'right') return { top: 7 - o.east, north: o.north, east: o.top }
  return { top: o.east, north: o.north, east: 7 - o.top }
}

/** 方向 → 网格位移。 */
const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
}

/** 格子类型码（kind 数组取值）。 */
export const KIND_WALL = 0
export const KIND_FLOOR = 1
export const KIND_DOOR = 2
export const KIND_CRACK = 3
export const KIND_START = 4
export const KIND_GOAL = 5

/**
 * 一张关卡地图：kind 每格类型码，num 为门 / 终点数字（0 表示无），
 * solution 是生成时的解路径方向序列（从起点逐步翻到终点）。
 */
export interface Board {
  w: number
  h: number
  kind: Uint8Array
  num: Uint8Array
  /** 起点格。 */
  start: { x: number; y: number }
  /** 终点格。 */
  goal: { x: number; y: number }
  /** 进入终点时必须恰好朝上的顶面点数。 */
  goalNum: number
  /** 解路径（保证逐方向执行 tryMove 最终 won）。 */
  solution: Dir[]
}

/** mulberry32：32 位确定性 PRNG，同种子同序列。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 关卡尺寸：L1 9×7，每级 +2×2，L5 17×15（外圈为墙）。 */
export function levelSize(level: number): { w: number; h: number } {
  const step = Math.min(level, 5) - 1
  return { w: 9 + step * 2, h: 7 + step * 2 }
}

/** 各关数字门数量：L1 两扇，每级 +1，L5 六扇。 */
function doorCount(level: number): number {
  return 1 + Math.min(level, 5)
}

/**
 * 偏向终点的自回避随机游走：生成起点到终点的简单路径（格子不重复，
 * 保证每格只经过一次、终点只在末尾出现——门数字与终点数字因此无歧
 * 义）。走死（无未访问邻居）或超步数上限则返回 null 由上层换种子重试。
 */
function walkSolution(rand: () => number, w: number, h: number): { x: number; y: number }[] | null {
  const goal = { x: w - 2, y: h - 2 }
  // 曼哈顿距离为 w+h-6；+2 强制至少一段绕行，路径不会是一条直线。
  const minLen = w + h - 4
  const maxSteps = 6 * (w + h)
  const path: { x: number; y: number }[] = [{ x: 1, y: 1 }]
  const visited = new Set<number>([w + 1])
  for (let steps = 0; steps < maxSteps; steps += 1) {
    const cur = path[path.length - 1]!
    if (cur.x === goal.x && cur.y === goal.y && path.length >= minLen) return path
    const options: { nx: number; ny: number; improves: boolean }[] = []
    const curDist = Math.abs(cur.x - goal.x) + Math.abs(cur.y - goal.y)
    for (const key of Object.keys(DELTA) as Dir[]) {
      const { dx, dy } = DELTA[key]
      const nx = cur.x + dx
      const ny = cur.y + dy
      if (nx < 1 || ny < 1 || nx > w - 2 || ny > h - 2) continue
      if (visited.has(ny * w + nx)) continue
      options.push({
        nx,
        ny,
        improves: Math.abs(nx - goal.x) + Math.abs(ny - goal.y) < curDist,
      })
    }
    if (options.length === 0) return null
    const improvers = options.filter(o => o.improves)
    const source = improvers.length > 0 && rand() < 0.62 ? improvers : options
    const pick = source[Math.floor(rand() * source.length)]!
    path.push({ x: pick.nx, y: pick.ny })
    visited.add(pick.ny * w + pick.nx)
  }
  return null
}

/** 两个相邻格之间的行进方向。 */
function dirBetween(from: { x: number; y: number }, to: { x: number; y: number }): Dir {
  if (to.y < from.y) return 'up'
  if (to.y > from.y) return 'down'
  return to.x > from.x ? 'right' : 'left'
}

/**
 * 生成一关：解路径随机游走 → 撒门（按解路径到达顶面）→ 死胡同岔路 →
 * 岔路尖端碎地板 → 终点数字。游走失败时换种子重试（确定性不变）。
 * @param seed RNG 种子。
 * @param level 关卡号（1-5，越界按边界截断）。
 * @returns 完整地图（含解路径与终点数字）。
 */
export function generateLevel(seed: number, level: number): Board {
  const { w, h } = levelSize(level)
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rand = mulberry32((seed + attempt * 1013904223) >>> 0)
    const path = walkSolution(rand, w, h)
    if (path === null) continue
    const kind = new Uint8Array(w * h).fill(KIND_WALL)
    const num = new Uint8Array(w * h)
    const inPath = new Uint8Array(w * h)
    for (const p of path) {
      kind[p.y * w + p.x] = KIND_FLOOR
      inPath[p.y * w + p.x] = 1
    }
    const startIdx = path[0]!
    kind[startIdx.y * w + startIdx.x] = KIND_START
    const goal = path[path.length - 1]!
    kind[goal.y * w + goal.x] = KIND_GOAL

    // 撒门：沿解路径等距取 doorCount 个格（避开起点与终点），门数字 =
    // 解路径进入该格那一刻的顶面——照解走必然全开。
    let doors = doorCount(level)
    while (doors > 0 && path.length < doors + 4) doors -= 1
    const doorIdx = new Set<number>()
    for (let k = 0; k < doors; k += 1) {
      doorIdx.add(2 + Math.round((k * (path.length - 4)) / doors))
    }
    let orient: Orientation = START_ORIENTATION
    let goalNum = 1
    for (let k = 1; k < path.length; k += 1) {
      orient = roll(orient, dirBetween(path[k - 1]!, path[k]!))
      const cell = path[k]!
      const idx = cell.y * w + cell.x
      if (doorIdx.has(k) && idx !== goal.y * w + goal.x && kind[idx] !== KIND_DOOR) {
        kind[idx] = KIND_DOOR
        num[idx] = orient.top
      }
      if (k === path.length - 1) goalNum = orient.top
    }

    // 死胡同岔路：从解路径格向墙内延伸，每个新格子只允许一个非墙邻居，
    // 保证不与路径回流（不产生绕过门的捷径）。
    const spurTips: number[] = []
    const spurTarget = 2 + Math.min(level, 5) * 2
    let spurs = 0
    for (let t = 0; t < spurTarget * 6 && spurs < spurTarget; t += 1) {
      const base = path[1 + Math.floor(rand() * (path.length - 2))]!
      const dirs = Object.keys(DELTA) as Dir[]
      const d = DELTA[dirs[Math.floor(rand() * dirs.length)]!]
      let cur = base
      const len = 1 + Math.floor(rand() * 3)
      const chain: number[] = []
      for (let j = 0; j < len; j += 1) {
        const nx = cur.x + d.dx
        const ny = cur.y + d.dy
        if (nx < 1 || ny < 1 || nx > w - 2 || ny > h - 2) break
        const idx = ny * w + nx
        if (kind[idx] !== KIND_WALL) break
        let openNeighbors = 0
        for (const key of Object.keys(DELTA) as Dir[]) {
          const dd = DELTA[key]
          const ax = nx + dd.dx
          const ay = ny + dd.dy
          if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue
          if (kind[ay * w + ax] !== KIND_WALL) openNeighbors += 1
        }
        if (openNeighbors !== 1) break
        kind[idx] = KIND_FLOOR
        chain.push(idx)
        cur = { x: nx, y: ny }
      }
      if (chain.length > 0) {
        spurs += 1
        if (rand() < 0.8) spurTips.push(chain[chain.length - 1]!)
      }
    }

    // 碎地板撒在岔路尖端：踩上即碎、不可再入，但都是死端，不影响可解性。
    let cracks = Math.min(level, 5)
    while (cracks > 0 && spurTips.length > 0) {
      const pick = Math.floor(rand() * spurTips.length)
      const idx = spurTips.splice(pick, 1)[0]!
      kind[idx] = KIND_CRACK
      cracks -= 1
    }

    const solution: Dir[] = []
    for (let k = 1; k < path.length; k += 1) {
      solution.push(dirBetween(path[k - 1]!, path[k]!))
    }
    return { w, h, kind, num, start: { x: startIdx.x, y: startIdx.y }, goal: { ...goal }, goalNum, solution }
  }
  // 200 次自回避游走全部失败在实践上不可达（偏向游走成功率远高于此），
  // 兜底抛显式错误而不是静默返回假图。
  throw new Error('dicemaze: generateLevel failed to produce a solvable walk')
}

/** 一局进行时状态（可变；历史快照支持撤回）。 */
export interface GameState {
  board: Board
  /** 骰子当前格。 */
  x: number
  y: number
  /** 骰子当前朝向。 */
  orient: Orientation
  /** 已走步数。 */
  steps: number
  /** 碎地板破坏标记（1 = 已碎，不可再入）。 */
  broken: Uint8Array
  /** 是否已通关。 */
  won: boolean
  /** 撤回快照栈（每步一次，最多 200）。 */
  history: { x: number; y: number; orient: Orientation; steps: number; broken: Uint8Array }[]
}

/** 从地图创建初始局面（骰子在起点、初始朝向）。 */
export function createState(board: Board): GameState {
  return {
    board,
    x: board.start.x,
    y: board.start.y,
    orient: { ...START_ORIENTATION },
    steps: 0,
    broken: new Uint8Array(board.w * board.h),
    won: false,
    history: [],
  }
}

/**
 * 能否朝 dir 翻滚一格：界内、非墙、碎而未修的地板不可再入、数字门要
 * 求翻滚后的顶面恰好等于门数字。
 * @returns true 表示该方向可走。
 */
export function canEnter(state: GameState, dir: Dir): boolean {
  const { dx, dy } = DELTA[dir]
  const nx = state.x + dx
  const ny = state.y + dy
  if (nx < 0 || ny < 0 || nx >= state.board.w || ny >= state.board.h) return false
  const idx = ny * state.board.w + nx
  const kind = state.board.kind[idx]!
  if (kind === KIND_WALL) return false
  if (kind === KIND_CRACK && state.broken[idx] === 1) return false
  if (kind === KIND_DOOR && roll(state.orient, dir).top !== state.board.num[idx]!) return false
  return true
}

/** 一次尝试翻滚的结果。 */
export type MoveResult = 'moved' | 'blocked' | 'won'

/**
 * 朝 dir 翻滚一格：成功则推进（进入碎地板即标记破坏、步数 +1、压入撤
 * 回快照），到达终点且顶面等于终点数字时置 won 并返回 'won'。
 * @returns 'blocked' 不可走（含已通关后的输入）；'moved' 普通前进；'won' 通关。
 */
export function tryMove(state: GameState, dir: Dir): MoveResult {
  if (state.won) return 'blocked'
  if (!canEnter(state, dir)) return 'blocked'
  state.history.push({
    x: state.x,
    y: state.y,
    orient: { ...state.orient },
    steps: state.steps,
    broken: state.broken.slice(),
  })
  if (state.history.length > 200) state.history.shift()
  const { dx, dy } = DELTA[dir]
  state.x += dx
  state.y += dy
  state.orient = roll(state.orient, dir)
  state.steps += 1
  const idx = state.y * state.board.w + state.x
  if (state.board.kind[idx] === KIND_CRACK) state.broken[idx] = 1
  if (idx === state.board.goal.y * state.board.w + state.board.goal.x && state.orient.top === state.board.goalNum) {
    state.won = true
    return 'won'
  }
  return 'moved'
}

/**
 * 撤回上一步：恢复位置、朝向、步数与碎地板状态，并清除通关标记。
 * @returns true 表示撤回成功；false 表示没有可撤回的步。
 */
export function undo(state: GameState): boolean {
  const snap = state.history.pop()
  if (snap === undefined) return false
  state.x = snap.x
  state.y = snap.y
  state.orient = { ...snap.orient }
  state.steps = snap.steps
  state.broken = snap.broken
  state.won = false
  return true
}

