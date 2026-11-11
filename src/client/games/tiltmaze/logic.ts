/**
 * 旋转迷宫（Tilt Maze）纯逻辑：seed 生成「同心环墙 + 辐条墙」的圆形迷宫
 * 盘——生成器先从中心随机游走 carve 出一条通往外圈的缺口路径（路径终点
 * 所在外环格即为终点孔），再按关卡密度随机补开额外缺口，保证起点到
 * 终点恒有通路；沿途在非路径格布置尖刺陷阱。小球在屏幕系受恒定向下的
 * 重力加速、撞墙反弹衰减；玩家旋转盘面（boardAngle 变化，墙与陷阱在
 * 盘面局部系静止），碰撞时把球坐标旋到盘面系检测，推出量与法线再旋回
 * 屏幕系——重力恒为屏幕向下。固定子步（1/240 s）确定性物理，全部函数
 * 可脱离 DOM 直接模拟验证。
 */

/** 逻辑画布宽度 px。 */
export const W = 480
/** 逻辑画布高度 px。 */
export const H = 560
/** 盘面中心 x px。 */
export const CX = 240
/** 盘面中心 y px。 */
export const CY = 300
/** 小球半径 px。 */
export const BALL_R = 6
/** 屏幕系重力加速度 px/s²（恒向下）。 */
export const GRAVITY = 760
/** 按住左/右时盘面旋转角速度 rad/s。 */
export const SPIN_SPEED = 1.9
/** 撞墙法向反弹恢复系数。 */
export const RESTITUTION = 0.42
/** 空气阻力系数（每秒速度线性衰减比例）。 */
export const AIR_DRAG = 0.08
/** 固定物理子步时长 s。 */
export const SUBSTEP = 1 / 240
/** 尖刺陷阱判定半径 px。 */
export const TRAP_R = 10
/** 中心轮毂半径 px（环 1 辐条不伸进轮毂，出生点无墙重叠）。 */
export const HUB_R = 14
/** 撞墙切向摩擦保留系数（每次反弹后整体速度乘子）。 */
const WALL_FRICTION = 0.985
/** 低速法向速度阈值 px/s（低于则贴合墙面不反弹）。 */
const REST_SPEED = 40
/** 碰撞用弧弦最大长度 px（弧墙以短弦近似，弦在弧内侧）。 */
const MAX_CHORD = 10
/** 圆周率的两倍。 */
const TAU = Math.PI * 2

/** 每关递进配置：环数 / 辐条数 / 陷阱数 / 额外缺口概率。 */
const LEVEL_CONFIG = [
  { rings: 4, spokes: 8, traps: 2, open: 0.30 },
  { rings: 5, spokes: 10, traps: 3, open: 0.24 },
  { rings: 6, spokes: 10, traps: 4, open: 0.18 },
  { rings: 7, spokes: 12, traps: 5, open: 0.12 },
  { rings: 8, spokes: 12, traps: 6, open: 0.07 },
] as const

/** 二维向量 / 点。 */
export interface Vec {
  /** x 分量。 */
  x: number
  /** y 分量。 */
  y: number
}

/** 盘面局部系中的一条碰撞线段（含弧墙的短弦近似）。 */
export interface Segment {
  /** 端点 1 x。 */
  x1: number
  /** 端点 1 y。 */
  y1: number
  /** 端点 2 x。 */
  x2: number
  /** 端点 2 y。 */
  y2: number
}

/** 一关的迷宫盘布局（全部坐标为盘面局部系，盘心为原点）。 */
export interface TiltMazeLevel {
  /** 关卡号（从 1 起）。 */
  level: number
  /** 环数（径向格层数）。 */
  rings: number
  /** 辐条数（角向格数）。 */
  spokes: number
  /** 盘面外半径 px。 */
  outerR: number
  /** 单环径向宽度 px（outerR / rings）。 */
  ringGap: number
  /** 环墙矩阵：ringWalls[i][s] = 半径 i*ringGap、跨格 (i,s) 角度的弧墙；i=rings 为外环。 */
  ringWalls: boolean[][]
  /** 辐墙矩阵：spokeWalls[i][s] = 角度 s*TAU/spokes、跨环 i-1..i 的径向墙。 */
  spokeWalls: boolean[][]
  /** 尖刺陷阱位置（格心，盘面系）。 */
  traps: Vec[]
  /** 终点孔所在外环格辐条号。 */
  goalSpoke: number
  /** 终点孔中心角 rad。 */
  goalAngle: number
  /** 终点孔判定半弧角 rad。 */
  goalHalfArc: number
  /** 本关时限 s。 */
  timeLimit: number
}

/** 一局运行时状态（球坐标为屏幕系、盘心为原点的相对坐标）。 */
export interface TiltMazeState {
  /** 基础种子。 */
  seed: number
  /** 关卡号。 */
  level: number
  /** 迷宫布局。 */
  maze: TiltMazeLevel
  /** 碰撞线段（盘面系，由布局展开）。 */
  segments: Segment[]
  /** 盘面当前旋转角 rad（墙随它旋转）。 */
  boardAngle: number
  /** 球心 x。 */
  bx: number
  /** 球心 y。 */
  by: number
  /** 球速度 x px/s。 */
  vx: number
  /** 球速度 y px/s。 */
  vy: number
  /** 旋转输入：-1 逆时针 / 0 静止 / 1 顺时针。 */
  spin: -1 | 0 | 1
  /** 剩余时间 s。 */
  timeLeft: number
  /** 对局状态。 */
  status: 'playing' | 'won' | 'lost'
  /** 失败原因（仅 status='lost' 时有意义）。 */
  loseReason: '' | 'trap' | 'timeout'
  /** 当前潜在得分（过关时定格为最终得分）。 */
  score: number
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
 * 点绕原点旋转。
 * @param x - 原横坐标。
 * @param y - 原纵坐标。
 * @param a - 旋转角 rad（正为顺时针，屏幕系 y 向下）。
 * @returns 旋转后的点。
 */
export function rotatePoint(x: number, y: number, a: number): Vec {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: x * c - y * s, y: x * s + y * c }
}

/**
 * 两角之差归一到 [0, π]。
 * @param a - 角 1 rad。
 * @param b - 角 2 rad。
 * @returns 最小角差。
 */
export function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % TAU
  if (d > Math.PI) d = TAU - d
  return d
}

/**
 * 点到线段的最近点。
 * @param px - 点 x。
 * @param py - 点 y。
 * @param seg - 线段。
 * @returns 线段上的最近点。
 */
export function closestPointOnSegment(px: number, py: number, seg: Segment): Vec {
  const dx = seg.x2 - seg.x1
  const dy = seg.y2 - seg.y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { x: seg.x1, y: seg.y1 }
  let t = ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return { x: seg.x1 + t * dx, y: seg.y1 + t * dy }
}

/** 圆对线段的碰撞解算结果。 */
export interface CircleHit {
  /** 推出方向单位法线 x（由线段指向圆心）。 */
  nx: number
  /** 推出方向单位法线 y。 */
  ny: number
  /** 穿透深度 px。 */
  depth: number
}

/**
 * 圆 vs 线段碰撞检测与推出量解算。
 * @param px - 圆心 x。
 * @param py - 圆心 y。
 * @param r - 圆半径。
 * @param seg - 线段。
 * @returns 命中时返回推出法线与深度；未命中返回 null。
 */
export function resolveCircleSegment(px: number, py: number, r: number, seg: Segment): CircleHit | null {
  const q = closestPointOnSegment(px, py, seg)
  let dx = px - q.x
  let dy = py - q.y
  const dSq = dx * dx + dy * dy
  if (dSq >= r * r) return null
  let d = Math.sqrt(dSq)
  if (d === 0) {
    // 圆心恰在线段上：取线段垂线方向推出。
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)
    dx = -(seg.y2 - seg.y1) / len
    dy = (seg.x2 - seg.x1) / len
    d = 1
  }
  return { nx: dx / d, ny: dy / d, depth: r - d }
}

/**
 * 把布局的墙矩阵展开为碰撞线段（弧墙以不超过 MAX_CHORD 的短弦近似，
 * 弦位于弧内侧，视觉弧与碰撞误差 < 1px）。
 * @param maze - 迷宫布局。
 * @returns 碰撞线段数组（盘面系）。
 */
export function buildSegments(maze: TiltMazeLevel): Segment[] {
  const segs: Segment[] = []
  const step = TAU / maze.spokes
  const arcSteps = (radius: number): number => {
    const arcLen = radius * step
    return Math.max(1, Math.ceil(arcLen / MAX_CHORD))
  }
  for (let i = 1; i <= maze.rings; i += 1) {
    const radius = HUB_R + i * maze.ringGap
    for (let s = 0; s < maze.spokes; s += 1) {
      if (!maze.ringWalls[i]![s]) continue
      const n = arcSteps(radius)
      for (let k = 0; k < n; k += 1) {
        const a0 = s * step + (k / n) * step
        const a1 = s * step + ((k + 1) / n) * step
        segs.push({
          x1: Math.cos(a0) * radius, y1: Math.sin(a0) * radius,
          x2: Math.cos(a1) * radius, y2: Math.sin(a1) * radius,
        })
      }
    }
  }
  for (let i = 1; i <= maze.rings; i += 1) {
    const inner = HUB_R + (i - 1) * maze.ringGap
    const outer = HUB_R + i * maze.ringGap
    for (let s = 0; s < maze.spokes; s += 1) {
      if (!maze.spokeWalls[i]![s]) continue
      const a = s * step
      segs.push({
        x1: Math.cos(a) * inner, y1: Math.sin(a) * inner,
        x2: Math.cos(a) * outer, y2: Math.sin(a) * outer,
      })
    }
  }
  return segs
}

/**
 * 盘面连通性检查：以全部环 1 格为起点（中心轮毂向各环 1 格开放），
 * 沿未封闭的辐墙与内环墙 BFS，可达任一外环缺口格即有通路。
 * @param ringWalls - 环墙矩阵。
 * @param spokeWalls - 辐墙矩阵。
 * @param rings - 环数。
 * @param spokes - 辐条数。
 * @returns true 当中心区域可达外环任一缺口。
 */
export function pathExists(ringWalls: boolean[][], spokeWalls: boolean[][], rings: number, spokes: number): boolean {
  const seen: boolean[][] = []
  for (let i = 0; i <= rings; i += 1) seen.push(new Array<boolean>(spokes).fill(false))
  const queue: Array<[number, number]> = []
  for (let s = 0; s < spokes; s += 1) {
    seen[1]![s] = true
    queue.push([1, s])
  }
  while (queue.length > 0) {
    const [i, s] = queue.pop()!
    if (ringWalls[rings]![s] === false) return true
    const push = (ni: number, ns: number): void => {
      if (ni < 1 || ni > rings || ns < 0 || ns >= spokes) return
      if (seen[ni]![ns]) return
      seen[ni]![ns] = true
      queue.push([ni, ns])
    }
    const sPrev = (s - 1 + spokes) % spokes
    if (!spokeWalls[i]![s]) push(i, sPrev)
    if (!spokeWalls[i]![(s + 1) % spokes]) push(i, (s + 1) % spokes)
    if (i > 1 && !ringWalls[i - 1]![s]) push(i - 1, s)
    if (i < rings && !ringWalls[i]![s]) push(i + 1, s)
  }
  return false
}

/**
 * 生成第 level 关布局：全墙初始化 → 从中心随机游走 carve 一条到外环的
 * 缺口路径（终点孔即路径终格）→ 按关卡密度随机补开额外内墙缺口 → 在
 * 非路径格随机放置尖刺陷阱。
 * @param seed - 基础种子（与关卡号联合散列）。
 * @param level - 关卡号（从 1 起，超出 5 封顶到 5 档配置）。
 * @returns 迷宫布局（恒含通路）。
 */
export function generateLevel(seed: number, level: number): TiltMazeLevel {
  const cfg = LEVEL_CONFIG[Math.min(Math.max(level, 1), LEVEL_CONFIG.length) - 1]!
  const rings = cfg.rings
  const spokes = cfg.spokes
  const outerR = 150 + Math.min(Math.max(level, 1), 5) * 13
  // 环半径从轮毂起均匀分布（原 0..outerR 使内环格径向 ~27px、弧向更窄，
  // 球径 12px 几乎卡死）。改为 HUB_R..outerR 分布，内环格显著加宽。
  const ringGap = (outerR - HUB_R) / rings
  const rand = mulberry32((seed + level * 7919) >>> 0)

  const ringWalls: boolean[][] = []
  const spokeWalls: boolean[][] = []
  for (let i = 0; i <= rings; i += 1) {
    ringWalls.push(new Array<boolean>(spokes).fill(true))
    spokeWalls.push(new Array<boolean>(spokes).fill(true))
  }

  // 中心随机游走 carve 通路：每环向外开一个环墙缺口，下一环内随机侧移
  // （侧移跨越的辐墙同步开口）；终环的缺口即终点孔。
  const pathCells = new Set<number>()
  const cellKey = (i: number, s: number): number => i * spokes + s
  let c = Math.floor(rand() * spokes)
  for (let i = 1; i <= rings; i += 1) {
    ringWalls[i]![c] = false
    pathCells.add(cellKey(i, c))
    if (i < rings) {
      const r = rand()
      const d = r < 0.4 ? 1 : r < 0.8 ? -1 : 0
      if (d === 1) spokeWalls[i + 1]![(c + 1) % spokes] = false
      else if (d === -1) spokeWalls[i + 1]![c] = false
      c = (c + d + spokes) % spokes
      pathCells.add(cellKey(i + 1, c))
    }
  }
  const goalSpoke = c

  // 补开额外缺口（只开内环墙与辐墙，外环除终点孔外恒封闭）。
  for (let i = 1; i < rings; i += 1) {
    for (let s = 0; s < spokes; s += 1) {
      if (rand() < cfg.open) ringWalls[i]![s] = false
    }
  }
  for (let i = 1; i <= rings; i += 1) {
    for (let s = 0; s < spokes; s += 1) {
      if (rand() < cfg.open) spokeWalls[i]![s] = false
    }
  }

  // 非路径格（且不在最内环，避开出生区）随机放置尖刺陷阱。
  const traps: Vec[] = []
  const candidates: Array<[number, number]> = []
  for (let i = 2; i <= rings; i += 1) {
    for (let s = 0; s < spokes; s += 1) {
      if (!pathCells.has(cellKey(i, s))) candidates.push([i, s])
    }
  }
  for (let n = 0; n < cfg.traps && candidates.length > 0; n += 1) {
    const idx = Math.floor(rand() * candidates.length)
    const [i, s] = candidates.splice(idx, 1)[0]!
    const rad = HUB_R + (i - 0.5) * ringGap
    const ang = (s + 0.5) * TAU / spokes
    traps.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad })
  }

  return {
    level,
    rings,
    spokes,
    outerR,
    ringGap,
    ringWalls,
    spokeWalls,
    traps,
    goalSpoke,
    goalAngle: (goalSpoke + 0.5) * TAU / spokes,
    goalHalfArc: (Math.PI / spokes) * 0.9,
    timeLimit: 40 + level * 5,
  }
}

/**
 * 计算当前潜在得分：基础分随关卡递增，剩余时间每秒加 8。
 * @param level - 关卡号。
 * @param timeLeft - 剩余时间 s。
 * @returns 得分。
 */
export function computeScore(level: number, timeLeft: number): number {
  return 400 + level * 120 + Math.max(0, Math.ceil(timeLeft)) * 8
}

/**
 * 建立一局初始状态：球生于盘心静止，盘角 0，计时满额。
 * @param seed - 基础种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（status='playing'）。
 */
export function createState(seed: number, level: number): TiltMazeState {
  const maze = generateLevel(seed, level)
  return {
    seed,
    level,
    maze,
    segments: buildSegments(maze),
    boardAngle: 0,
    bx: 0,
    by: 0,
    vx: 0,
    vy: 0,
    spin: 0,
    timeLeft: maze.timeLimit,
    status: 'playing',
    loseReason: '',
    score: computeScore(level, maze.timeLimit),
  }
}

/** 过关：定格最终得分。 */
function win(state: TiltMazeState): void {
  state.status = 'won'
  state.score = computeScore(state.level, state.timeLeft)
}

/** 失败：记录原因。 */
function lose(state: TiltMazeState, reason: 'trap' | 'timeout'): void {
  state.status = 'lost'
  state.loseReason = reason
}

/**
 * 单个子步：旋转输入积分 → 重力/阻力积分 → 位移 → 盘面系碰撞解算 →
 * 终点/陷阱/超时判定。
 * @param state - 状态（就地更新）。
 */
function substep(state: TiltMazeState): void {
  if (state.status !== 'playing') return
  state.boardAngle += state.spin * SPIN_SPEED * SUBSTEP
  const drag = 1 - AIR_DRAG * SUBSTEP
  state.vx *= drag
  state.vy = state.vy * drag + GRAVITY * SUBSTEP
  state.bx += state.vx * SUBSTEP
  state.by += state.vy * SUBSTEP

  // 碰撞：球旋到盘面系逐段检测，推出与法线再旋回屏幕系（重力恒屏幕向下）。
  let p = rotatePoint(state.bx, state.by, -state.boardAngle)
  for (const seg of state.segments) {
    const hit = resolveCircleSegment(p.x, p.y, BALL_R, seg)
    if (hit === null) continue
    p = { x: p.x + hit.nx * hit.depth, y: p.y + hit.ny * hit.depth }
    const nScreen = rotatePoint(hit.nx, hit.ny, state.boardAngle)
    const vn = state.vx * nScreen.x + state.vy * nScreen.y
    if (vn < 0) {
      if (-vn < REST_SPEED) {
        // 低速贴合：消去法向分量，避免贴墙微抖。
        state.vx -= vn * nScreen.x
        state.vy -= vn * nScreen.y
      } else {
        state.vx -= (1 + RESTITUTION) * vn * nScreen.x
        state.vy -= (1 + RESTITUTION) * vn * nScreen.y
        state.vx *= WALL_FRICTION
        state.vy *= WALL_FRICTION
      }
    }
  }
  const s = rotatePoint(p.x, p.y, state.boardAngle)
  state.bx = s.x
  state.by = s.y

  // 判定顺序：滚出盘外（只可能经终点孔）→ 终点孔 → 陷阱 → 超时。
  const dist = Math.hypot(p.x, p.y)
  if (dist > state.maze.outerR + 40) {
    win(state)
    return
  }
  if (dist > state.maze.outerR - BALL_R * 0.4) {
    const ang = Math.atan2(p.y, p.x)
    if (angDiff(ang, state.maze.goalAngle) <= state.maze.goalHalfArc) {
      win(state)
      return
    }
  }
  for (const t of state.maze.traps) {
    if (Math.hypot(p.x - t.x, p.y - t.y) < TRAP_R + BALL_R - 3) {
      lose(state, 'trap')
      return
    }
  }
  state.timeLeft -= SUBSTEP
  if (state.timeLeft <= 0) {
    state.timeLeft = 0
    lose(state, 'timeout')
    return
  }
  state.score = computeScore(state.level, state.timeLeft)
}

/**
 * 步进固定数量个子步（确定性入口：同状态同输入序列结果恒一致）。
 * @param state - 状态（就地更新）。
 * @param count - 子步数。
 */
export function stepSubsteps(state: TiltMazeState, count: number): void {
  for (let n = 0; n < count; n += 1) substep(state)
}

/**
 * 步进指定时长（四舍五入到整数个子步，便于测试精确复现）。
 * @param state - 状态（就地更新）。
 * @param seconds - 时长 s。
 */
export function stepSeconds(state: TiltMazeState, seconds: number): void {
  stepSubsteps(state, Math.max(0, Math.round(seconds / SUBSTEP)))
}
