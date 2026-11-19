/**
 * 滚珠轨道 MarbleRun 纯逻辑：侧视网格上的轨道建造谜题求解器。玩家把
 * 有限库存的轨道件（直板 / 弯板 / 加速带 / 弹板）放置并旋转到网格空
 * 位，搭出一条从左上出珠口到右下目标杯的通路；释放后滚珠受重力沿轨
 * 道滚动（圆—线段碰撞 + 法向消除 + 切向保留 + 摩擦，加速带沿切向加
 * 速，弹板法向反弹增能），进入杯口过关，飞出边界、尖刺碰碎或低速停
 * 滞即失败。全部函数为纯函数或确定性状态机（不触碰 DOM / 计时器 /
 * Math.random，视觉噪声用注入 seed 的 mulberry32 派生），同输入必得
 * 同一结果，可离线单测。
 */

/**
 * mulberry32 确定性伪随机数生成器（物理本身不随机，仅关卡视觉噪声
 * 与渲染杂波使用，保证同 seed 同画面）。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0, 1) 区间随机数的函数；同种子必产出同一序列。
 */
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

/** 轨道件种类。 */
export type PieceKind = 'straight' | 'curveL' | 'curveR' | 'booster' | 'bumper'

/** 碰撞线段来源：轨道件种类或目标杯壁。 */
export type SegKind = PieceKind | 'wall'

/** 一个已放置的轨道件：网格格坐标 + 旋转档位（0 起，顺时针）。 */
export interface Placement {
  /** 列（0 起，向右增大）。 */
  x: number
  /** 行（0 起，向下增大）。 */
  y: number
  /** 件种类。 */
  kind: PieceKind
  /** 旋转档位（对 pieceOrientations 取模后有效）。 */
  rot: number
}

/** 一条碰撞线段（逻辑像素坐标，kind 决定接触行为）。 */
export interface Seg {
  ax: number
  ay: number
  bx: number
  by: number
  kind: SegKind
}

/** 一个尖刺障碍格。 */
export interface SpikeCell {
  x: number
  y: number
}

/** 一关的完整定义（手工模板，五关递进）。 */
export interface LevelDef {
  /** 关卡名（HUD 显示）。 */
  name: string
  /** 视觉噪声种子（同 seed 同画面；不影响物理）。 */
  seed: number
  /** 出珠口 X（逻辑像素，滚珠生成点）。 */
  spawnX: number
  /** 出珠口 Y（逻辑像素）。 */
  spawnY: number
  /** 出珠初速（水平向右，逻辑像素 / 秒）。 */
  spawnVX: number
  /** 目标杯所在列。 */
  cupX: number
  /** 目标杯所在行。 */
  cupY: number
  /** 尖刺障碍格列表。 */
  spikes: SpikeCell[]
  /** 各类轨道件库存数量。 */
  inventory: Record<PieceKind, number>
  /** 预置参考搭法（测试重放验证可解；也用作「卡关提示」基础）。 */
  reference: Placement[]
}

// ---- 常量（盘面与物理参数，测试依赖其确定性） ----

/** 网格列数。 */
export const COLS = 20
/** 网格行数。 */
export const ROWS = 12
/** 网格单元边长（逻辑像素）。 */
export const CELL = 36
/** 滚珠半径（逻辑像素）。 */
export const MARBLE_R = 7
/** 重力加速度（逻辑像素 / 秒²）。 */
export const GRAVITY = 900
/** 固定物理子步（秒）。 */
export const SUB_DT = 1 / 240
/** 接触切向阻尼（每秒比例）。 */
export const FRICTION = 1.2
/** 加速带沿切向加速度（逻辑像素 / 秒²）。 */
export const BOOST = 700
/** 弹板反弹恢复系数（法向速度放大倍率）。 */
export const BUMPER_REST = 1.4
/** 停滞判定速度阈值（逻辑像素 / 秒）。 */
export const STUCK_SPEED = 14
/** 停滞判定累计秒数。 */
export const STUCK_TIME = 0.75
/** 单次释放最长模拟秒数。 */
export const MAX_RUN_SECONDS = 15
/** 尖刺命中圆半径（格内 0.5,0.75 处）。 */
export const SPIKE_R = 10

/** 各件有效旋转档数（轮换时取模）。 */
export const PIECE_ORIENTATIONS: Record<PieceKind, number> = {
  straight: 3,
  curveL: 4,
  curveR: 4,
  booster: 2,
  bumper: 2,
}

/** 件种类的中文名（HUD 库存栏显示）。 */
export const PIECE_LABEL: Record<PieceKind, string> = {
  straight: '直板',
  curveL: '左弯',
  curveR: '右弯',
  booster: '加速带',
  bumper: '弹板',
}

/** 全部件种类（固定顺序：库存栏 / 选择键 1-5）。 */
export const PIECE_KINDS: readonly PieceKind[] = ['straight', 'curveL', 'curveR', 'booster', 'bumper']

/**
 * 单元坐标点绕格中心顺时针旋转 90°×rot（unit 空间 [0,1]²）。
 * @param px - 单元内横坐标 [0,1]。
 * @param py - 单元内纵坐标 [0,1]。
 * @param rot - 旋转档位（0-3）。
 */
function rotUnit(px: number, py: number, rot: number): [number, number] {
  const r = ((rot % 4) + 4) % 4
  if (r === 0) return [px, py]
  if (r === 1) return [1 - py, px]
  if (r === 2) return [1 - px, 1 - py]
  return [py, 1 - px]
}

/** 弯板基准折线：绕左上角、半径 0.66 格的四分之一圆弧（4 段采样）。 */
const CURVE_BASE: readonly (readonly [number, number])[] = [
  [0.637, 0.171],
  [0.506, 0.424],
  [0.279, 0.599],
  [0.023, 0.659],
]

/**
 * 一个轨道件在给定档位下的单元内折线（unit 空间 [0,1]²，相邻点连成
 * 碰撞线段）。
 * @param kind - 件种类。
 * @param rot - 旋转档位。
 */
function piecePolyline(kind: PieceKind, rot: number): [number, number][] {
  if (kind === 'straight') {
    const r = rot % 3
    if (r === 0) return [[0, 0.8], [1, 0.8]]
    if (r === 1) return [[0, 0], [1, 1]]
    return [[0, 1], [1, 0]]
  }
  if (kind === 'booster') {
    return rot % 2 === 0 ? [[0, 0.8], [1, 0.8]] : [[0, 0], [1, 1]]
  }
  if (kind === 'bumper') {
    return rot % 2 === 0 ? [[0.15, 0.85], [0.85, 0.15]] : [[0.15, 0.15], [0.85, 0.85]]
  }
  // 弯板：基准弧（或其水平镜像）绕格中心旋转。
  const base = kind === 'curveL'
    ? CURVE_BASE
    : CURVE_BASE.map(p => [1 - p[0], p[1]] as [number, number])
  return base.map(p => rotUnit(p[0], p[1], rot))
}

/**
 * 一个轨道件产出的碰撞线段（逻辑像素）。
 * @param p - 放置信息。
 * @returns 线段列表（折线相邻点相连）。
 */
export function pieceSegments(p: Placement): Seg[] {
  const pts = piecePolyline(p.kind, p.rot)
  const ox = p.x * CELL
  const oy = p.y * CELL
  const out: Seg[] = []
  for (let i = 0; i + 1 < pts.length; i += 1) {
    out.push({
      ax: ox + pts[i]![0]! * CELL,
      ay: oy + pts[i]![1]! * CELL,
      bx: ox + pts[i + 1]![0]! * CELL,
      by: oy + pts[i + 1]![1]! * CELL,
      kind: p.kind,
    })
  }
  return out
}

/**
 * 目标杯的杯壁线段（左右壁 + 杯底，逻辑像素）。
 * @param level - 关卡定义。
 */
export function cupSegments(level: LevelDef): Seg[] {
  const x0 = level.cupX * CELL
  const y0 = level.cupY * CELL
  const wall = (ux: number): Seg => ({ ax: x0 + ux * CELL, ay: y0 + 0.05 * CELL, bx: x0 + ux * CELL, by: y0 + CELL, kind: 'wall' })
  return [
    wall(0.12),
    wall(0.88),
    { ax: x0 + 0.12 * CELL, ay: y0 + CELL, bx: x0 + 0.88 * CELL, by: y0 + CELL, kind: 'wall' },
  ]
}

/**
 * 汇总全部碰撞线段（轨道件 + 杯壁）。
 * @param level - 关卡定义。
 * @param placements - 已放置轨道件。
 */
export function buildSegments(level: LevelDef, placements: readonly Placement[]): Seg[] {
  const out: Seg[] = cupSegments(level)
  for (const p of placements) out.push(...pieceSegments(p))
  return out
}

/**
 * 出珠口所在格（该格禁止放置）。
 * @param level - 关卡定义。
 */
export function spawnCell(level: LevelDef): { x: number; y: number } {
  return { x: Math.floor(level.spawnX / CELL), y: Math.floor(level.spawnY / CELL) }
}

/**
 * 某格是否为不可放置的封锁格（出珠口 / 目标杯 / 尖刺）。
 * @param level - 关卡定义。
 * @param cx - 列。
 * @param cy - 行。
 */
export function isBlockedCell(level: LevelDef, cx: number, cy: number): boolean {
  const sp = spawnCell(level)
  if (cx === sp.x && cy === sp.y) return true
  if (cx === level.cupX && cy === level.cupY) return true
  return level.spikes.some(s => s.x === cx && s.y === cy)
}

/**
 * 汇总库存件总数。
 * @param inventory - 库存表。
 */
export function totalPieces(inventory: Readonly<Record<PieceKind, number>>): number {
  let sum = 0
  for (const k of PIECE_KINDS) sum += Math.max(0, inventory[k] ?? 0)
  return sum
}

/** 建造盘面：已放件 + 库存账目 + 撤回栈（确定性，可离线单测）。 */
export interface BoardState {
  /** 当前关卡序号（0 起）。 */
  levelIndex: number
  /** 关卡定义（levelFor 的直接引用）。 */
  level: LevelDef
  /** 已放置轨道件。 */
  placements: Placement[]
  /** 剩余库存。 */
  inventory: Record<PieceKind, number>
  /** 撤回栈快照（placements + inventory 深拷贝）。 */
  history: { placements: Placement[]; inventory: Record<PieceKind, number> }[]
}

/** 放置校验失败原因。 */
export type PlaceReject = 'grid' | 'occupied' | 'blocked' | 'inventory'

/**
 * 建造盘面初始化（库存满额、棋盘为空）。
 * @param levelIndex - 关卡序号（越界钳制）。
 */
export function createBoard(levelIndex: number): BoardState {
  const idx = Math.min(Math.max(levelIndex, 0), LEVELS.length - 1)
  const level = LEVELS[idx]!
  return {
    levelIndex: idx,
    level,
    placements: [],
    inventory: { ...level.inventory },
    history: [],
  }
}

/**
 * 轨道件放置合法性：格在盘面内、不与已有件重叠、不在封锁格（出珠
 * 口 / 杯 / 尖刺）、且该类库存 > 0。
 * @param board - 建造盘面。
 * @param cx - 列。
 * @param cy - 行。
 * @param kind - 件种类。
 * @returns 合法返回 null；否则返回失败原因。
 */
export function placeReject(board: BoardState, cx: number, cy: number, kind: PieceKind): PlaceReject | null {
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return 'grid'
  if (isBlockedCell(board.level, cx, cy)) return 'blocked'
  if (board.placements.some(p => p.x === cx && p.y === cy)) return 'occupied'
  if ((board.inventory[kind] ?? 0) <= 0) return 'inventory'
  return null
}

function snapshot(board: BoardState): void {
  board.history.push({
    placements: board.placements.map(p => ({ ...p })),
    inventory: { ...board.inventory },
  })
}

/**
 * 放置一个轨道件（成功时记账并压入撤回栈）。
 * @param board - 建造盘面（就地修改）。
 * @param cx - 列。
 * @param cy - 行。
 * @param kind - 件种类。
 * @param rot - 旋转档位。
 * @returns 合法返回 null；否则返回失败原因（盘面不变）。
 */
export function placePiece(board: BoardState, cx: number, cy: number, kind: PieceKind, rot: number): PlaceReject | null {
  const reject = placeReject(board, cx, cy, kind)
  if (reject !== null) return reject
  snapshot(board)
  board.placements.push({ x: cx, y: cy, kind, rot })
  board.inventory[kind] = (board.inventory[kind] ?? 0) - 1
  return null
}

/**
 * 找到某格上的件下标。
 * @param board - 建造盘面。
 * @param cx - 列。
 * @param cy - 行。
 */
export function pieceAt(board: BoardState, cx: number, cy: number): number {
  return board.placements.findIndex(p => p.x === cx && p.y === cy)
}

/**
 * 把某格的件移回库存（全额返还，可撤回）。
 * @param board - 建造盘面（就地修改）。
 * @param cx - 列。
 * @param cy - 行。
 * @returns 命中并移除返回 true。
 */
export function removePieceAt(board: BoardState, cx: number, cy: number): boolean {
  const i = pieceAt(board, cx, cy)
  if (i < 0) return false
  snapshot(board)
  const removed = board.placements.splice(i, 1)[0]!
  board.inventory[removed.kind] = (board.inventory[removed.kind] ?? 0) + 1
  return true
}

/**
 * 旋转某格的件（档位 +1 后取模）。
 * @param board - 建造盘面（就地修改）。
 * @param cx - 列。
 * @param cy - 行。
 * @returns 命中并旋转返回 true。
 */
export function rotatePieceAt(board: BoardState, cx: number, cy: number): boolean {
  const i = pieceAt(board, cx, cy)
  if (i < 0) return false
  const p = board.placements[i]!
  snapshot(board)
  p.rot = (p.rot + 1) % PIECE_ORIENTATIONS[p.kind]
  return true
}

/**
 * 撤回上一步建造操作（放置 / 移除 / 旋转的逆操作）。
 * @param board - 建造盘面（就地修改）。
 * @returns 有可撤回步返回 true。
 */
export function undo(board: BoardState): boolean {
  const snap = board.history.pop()
  if (snap === undefined) return false
  board.placements = snap.placements
  board.inventory = snap.inventory
  return true
}

/** 释放结果：running 进行中；won 入杯；out 出界；stuck 停滞；shattered 碎于尖刺。 */
export type RunOutcome = 'running' | 'won' | 'out' | 'stuck' | 'shattered'

/** 一次释放的确定性物理世界。 */
export interface RunWorld {
  /** 滚珠位置（逻辑像素）。 */
  px: number
  py: number
  /** 滚珠速度（逻辑像素 / 秒）。 */
  vx: number
  vy: number
  /** 拖尾采样点（旧→新，最多 TRAIL_MAX 个）。 */
  trail: { x: number; y: number }[]
  /** 结果。 */
  outcome: RunOutcome
  /** 已模拟秒数。 */
  time: number
  /** 低速累计秒数（停滞判定）。 */
  stuckFor: number
  /** 碰撞线段（创建时固定）。 */
  segments: Seg[]
  /** 关卡定义引用。 */
  level: LevelDef
}

/** 拖尾最多采样点数。 */
export const TRAIL_MAX = 24

/**
 * 创建一次释放世界（滚珠在出珠口以 spawnVX 水平射出）。
 * @param level - 关卡定义。
 * @param placements - 玩家放置的轨道件。
 */
export function createRun(level: LevelDef, placements: readonly Placement[]): RunWorld {
  return {
    px: level.spawnX,
    py: level.spawnY,
    vx: level.spawnVX,
    vy: 0,
    trail: [],
    outcome: 'running',
    time: 0,
    stuckFor: 0,
    segments: buildSegments(level, placements),
    level,
  }
}

/**
 * 目标杯获胜区（逻辑像素矩形：杯口内、杯身中部）。
 * @param level - 关卡定义。
 */
export function cupWinZone(level: LevelDef): { x0: number; y0: number; x1: number; y1: number } {
  // 获胜区收紧在杯壁内侧与杯口之下：贴着杯口高度滚过（例如撞上左杯
  // 壁停下）不算入杯，必须真正落进杯内。
  const x0 = level.cupX * CELL + 0.28 * CELL
  const x1 = level.cupX * CELL + 0.72 * CELL
  const y0 = level.cupY * CELL + 0.68 * CELL
  const y1 = level.cupY * CELL + 0.95 * CELL
  return { x0, y0, x1, y1 }
}

/** 单个物理子步：重力 → 位移 → 逐段碰撞响应 → 尖刺 / 杯 / 边界 / 停滞判定。 */
function substep(w: RunWorld, h: number): void {
  if (w.outcome !== 'running') return
  w.vy += GRAVITY * h
  w.px += w.vx * h
  w.py += w.vy * h
  w.time += h

  for (const seg of w.segments) {
    const ex = seg.bx - seg.ax
    const ey = seg.by - seg.ay
    const len2 = ex * ex + ey * ey
    if (len2 < 1e-9) continue
    let t = ((w.px - seg.ax) * ex + (w.py - seg.ay) * ey) / len2
    t = Math.min(1, Math.max(0, t))
    const cx = seg.ax + ex * t
    const cy = seg.ay + ey * t
    const dx = w.px - cx
    const dy = w.py - cy
    const d2 = dx * dx + dy * dy
    if (d2 >= MARBLE_R * MARBLE_R || d2 < 1e-12) continue
    const d = Math.sqrt(d2)
    const nx = dx / d
    const ny = dy / d
    // 推出重叠并落在表面上。
    w.px = cx + nx * MARBLE_R
    w.py = cy + ny * MARBLE_R
    const vn = w.vx * nx + w.vy * ny
    if (vn < 0) {
      if (seg.kind === 'bumper') {
        // 弹板：法向按恢复系数反弹增能。
        w.vx -= (1 + BUMPER_REST) * vn * nx
        w.vy -= (1 + BUMPER_REST) * vn * ny
      } else {
        // 普通表面：消除法向速度（贴面滑动），保留切向。
        w.vx -= vn * nx
        w.vy -= vn * ny
        if (seg.kind === 'booster') {
          // 加速带：沿「向右」切向持续加速。
          const tl = Math.sqrt(len2)
          const tx = ex / tl
          const ty = ey / tl
          const dir = tx >= 0 ? 1 : -1
          w.vx += dir * tx * BOOST * h
          w.vy += dir * ty * BOOST * h
        }
        // 接触切向阻尼（滚动摩擦）。
        const keep = Math.max(0, 1 - FRICTION * h)
        w.vx *= keep
        w.vy *= keep
      }
    }
  }

  // 尖刺：命中圆（格内 0.5,0.75 处，半径 SPIKE_R）。
  for (const s of w.level.spikes) {
    const sx = s.x * CELL + 0.5 * CELL
    const sy = s.y * CELL + 0.75 * CELL
    const ddx = w.px - sx
    const ddy = w.py - sy
    const rr = MARBLE_R + SPIKE_R
    if (ddx * ddx + ddy * ddy < rr * rr) {
      w.outcome = 'shattered'
      return
    }
  }

  // 目标杯：珠心进入杯内获胜区即过关。
  const zone = cupWinZone(w.level)
  if (w.px >= zone.x0 && w.px <= zone.x1 && w.py >= zone.y0 && w.py <= zone.y1) {
    w.outcome = 'won'
    return
  }

  // 出界：飞出盘面四周（留 4 倍珠径余量）。
  const m = MARBLE_R * 4
  if (w.px < -m || w.px > COLS * CELL + m || w.py > ROWS * CELL + m) {
    w.outcome = 'out'
    return
  }

  // 停滞：低速累计超时（掉进死角或摩擦耗尽）。
  const speed2 = w.vx * w.vx + w.vy * w.vy
  if (speed2 < STUCK_SPEED * STUCK_SPEED) w.stuckFor += h
  else w.stuckFor = 0
  if (w.stuckFor >= STUCK_TIME) {
    w.outcome = 'stuck'
  }
}

/**
 * 推进物理若干秒（内部按固定 SUB_DT 子步，确定性）。
 * @param w - 释放世界（就地修改）。
 * @param dtSeconds - 推进秒数（自动拆子步；结果与调用切分方式无关）。
 */
export function stepRun(w: RunWorld, dtSeconds: number): void {
  // 定数子步：按整倍 SUB_DT 推进（余数丢弃，≤4ms），保证不同调用切分
  // 方式得到逐位一致的轨迹。
  const steps = Math.floor(Math.max(0, dtSeconds) / SUB_DT + 1e-9)
  for (let i = 0; i < steps && w.outcome === 'running' && w.time < MAX_RUN_SECONDS; i += 1) {
    substep(w, SUB_DT)
    if (i % 8 === 7) {
      w.trail.push({ x: w.px, y: w.py })
      if (w.trail.length > TRAIL_MAX) w.trail.shift()
    }
  }
}

/**
 * 一步模拟到出结果（测试 / 参考搭法验证用）。
 * @param level - 关卡定义。
 * @param placements - 轨道件布局。
 * @param maxSeconds - 模拟上限秒数（默认 MAX_RUN_SECONDS）。
 * @returns 结果世界（outcome / time / 末位置可查）。
 */
export function simulate(level: LevelDef, placements: readonly Placement[], maxSeconds = MAX_RUN_SECONDS): RunWorld {
  const w = createRun(level, placements)
  while (w.outcome === 'running' && w.time < maxSeconds) stepRun(w, 0.25)
  return w
}

/**
 * 过关得分：关底基础分 + 剩余库存件奖励。
 * @param levelIndex - 关卡序号（0 起）。
 * @param leftover - 剩余库存件总数。
 */
export function scoreFor(levelIndex: number, leftover: number): number {
  return (levelIndex + 1) * 100 + leftover * 15
}

// ---- 关卡模板（五关递进：出珠口到杯更远、库存更紧、后期加尖刺） ----

/** 一件直板（rot 0 平放 / 1 顺斜 \\ / 2 逆斜 /）。 */
const S = (x: number, y: number, rot = 0): Placement => ({ x, y, kind: 'straight', rot })
/** 一件加速带（rot 0 平放 / 1 顺斜 \\）。 */
const B = (x: number, y: number, rot = 0): Placement => ({ x, y, kind: 'booster', rot })

/**
 * 五关模板。每关 reference 是预置参考搭法（tests 重放验证必胜）；库存
 * 逐关收紧（L4/L5 与参考用量恰好相等——每块板都得用在刀刃上），L3 起
 * 加入尖刺障碍。seed 只驱动视觉噪声，不影响物理确定性。
 */
export const LEVELS: readonly LevelDef[] = [
  {
    name: '起步斜坡',
    seed: 1101,
    spawnX: 30, spawnY: 24, spawnVX: 90,
    cupX: 6, cupY: 6,
    spikes: [],
    inventory: { straight: 7, curveL: 0, curveR: 0, booster: 0, bumper: 0 },
    reference: [S(1, 1), S(2, 2, 1), S(3, 3, 1), S(4, 4, 1), S(5, 5, 1)],
  },
  {
    name: '长滑梯',
    seed: 1102,
    spawnX: 30, spawnY: 24, spawnVX: 90,
    cupX: 8, cupY: 8,
    spikes: [],
    inventory: { straight: 8, curveL: 1, curveR: 1, booster: 0, bumper: 0 },
    reference: [S(1, 1), S(2, 2, 1), S(3, 3, 1), S(4, 4, 1), S(5, 5, 1), S(6, 6, 1), S(7, 7, 1)],
  },
  {
    name: '尖刺缝隙',
    seed: 1103,
    spawnX: 30, spawnY: 24, spawnVX: 90,
    cupX: 9, cupY: 8,
    spikes: [{ x: 5, y: 8 }, { x: 6, y: 8 }, { x: 10, y: 8 }],
    inventory: { straight: 9, curveL: 0, curveR: 0, booster: 1, bumper: 0 },
    reference: [S(1, 1), S(2, 2, 1), S(3, 3, 1), S(4, 4, 1), S(5, 5), S(6, 5), S(7, 6, 1), S(8, 7, 1)],
  },
  {
    name: '加速跳台',
    seed: 1104,
    spawnX: 30, spawnY: 24, spawnVX: 90,
    cupX: 12, cupY: 10,
    spikes: [{ x: 7, y: 9 }, { x: 8, y: 9 }, { x: 13, y: 10 }],
    inventory: { straight: 9, curveL: 0, curveR: 0, booster: 2, bumper: 0 },
    reference: [S(1, 1), S(2, 2, 1), S(3, 3, 1), B(4, 4, 1), B(5, 5, 1), S(6, 6), S(7, 6), S(8, 6), S(9, 7, 1), S(10, 8, 1), S(11, 9, 1)],
  },
  {
    name: '极限投送',
    seed: 1105,
    spawnX: 30, spawnY: 24, spawnVX: 90,
    cupX: 15, cupY: 11,
    spikes: [{ x: 8, y: 9 }, { x: 9, y: 9 }, { x: 16, y: 11 }, { x: 10, y: 8 }],
    inventory: { straight: 12, curveL: 0, curveR: 0, booster: 2, bumper: 0 },
    reference: [S(1, 1), S(2, 2, 1), S(3, 3, 1), B(4, 4, 1), B(5, 5, 1), S(6, 6), S(7, 6), S(8, 6), S(9, 6), S(10, 6), S(11, 7, 1), S(12, 8, 1), S(13, 9, 1), S(14, 10, 1)],
  },
]

/**
 * 取关卡定义（序号越界钳制到首尾）。
 * @param index - 关卡序号（0 起）。
 */
export function levelFor(index: number): LevelDef {
  return LEVELS[Math.min(Math.max(index, 0), LEVELS.length - 1)]!
}
