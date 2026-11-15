/**
 * 骰子行军画布渲染：暗色网格棋盘（墙块 / 地砖 / 数字门 / 碎地板 / 起
 * 终点）、等轴测 3D 骰子（真实三面点数 + 翻滚时的 3D 旋转插值与跳起
 * 弧线）、步数 HUD 与过关 / 暂停 overlay。全部使用共享视觉套件
 * （../theme.ts）；翻滚旋转与 logic.ts 的朝向变换一一对应。
 */
import {
  KIND_CRACK,
  KIND_DOOR,
  KIND_FLOOR,
  KIND_GOAL,
  KIND_START,
  KIND_WALL,
  type Board,
  type Dir,
  type Orientation,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const CELL = 38
export const HUD_H = 46
/** 固定逻辑画布按最大关卡棋盘取尺寸；小关卡居中。 */
export const MAX_COLS = 17
export const MAX_ROWS = 15
export const LOGICAL_W = MAX_COLS * CELL
export const LOGICAL_H = HUD_H + MAX_ROWS * CELL

const DOOR_MATCH = THEME.good
const DOOR_MISS = THEME.bad
const GOAL_COLOR = THEME.gold
const START_COLOR = accent(0)
const WALL_FILL = '#232333'
const WALL_EDGE = 'rgba(122,162,247,0.22)'
/** 等轴测投影常量。 */
const ISO_COS = Math.cos(Math.PI / 6)
/** 3D 单位向量。 */
type V3 = [number, number, number]

/** 一帧要画的全部动态信息。 */
export interface DiceMazeView {
  /** 1 基关卡号（HUD）。 */
  level: number
  /** 当前步数。 */
  steps: number
  /** 骰子当前格（翻滚落定后的逻辑格）。 */
  x: number
  y: number
  /** 落定后的朝向。 */
  orient: Orientation
  /** 进行中的翻滚动画（null = 静止）。 */
  anim: {
    dir: Dir
    fromX: number
    fromY: number
    toX: number
    toY: number
    fromOrient: Orientation
    /** 0..1 进度。 */
    t: number
  } | null
  /** 碎地板破坏标记。 */
  broken: Uint8Array
  /** 过关文案（null = 进行中）。 */
  winText: string | null
  /** 暂停 overlay。 */
  paused: boolean
}

/** 棋盘左上角像素（按关卡尺寸居中）。 */
export function gridOffset(board: Board): { ox: number; oy: number } {
  return {
    ox: ((MAX_COLS - board.w) / 2) * CELL,
    oy: HUD_H + ((MAX_ROWS - board.h) / 2) * CELL,
  }
}

/** 格子中心像素。 */
function cellCenter(board: Board, x: number, y: number): { px: number; py: number } {
  const { ox, oy } = gridOffset(board)
  return { px: ox + x * CELL + CELL / 2, py: oy + y * CELL + CELL / 2 }
}

/** 绕 X 轴旋转（弧度）。 */
function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
}

/** 绕 Z 轴旋转（弧度）。 */
function rotZ(v: V3, a: number): V3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
}

/** 各点数的九宫点阵（-1/0/1 坐标）。 */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
}

/** 一张骰面：点数 + 外法向 + 面内两个正交轴。 */
interface FaceSpec {
  v: number
  n: V3
  u: V3
  w: V3
  fill: string
}

/** 由朝向三元组构造六面（对面 = 7 - 本面）。 */
function cubeFaces(o: Orientation): FaceSpec[] {
  return [
    { v: o.top, n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, 1], fill: '#efedf7' },
    { v: 7 - o.top, n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1], fill: '#8f88a8' },
    { v: o.north, n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0], fill: '#b6aed0' },
    { v: 7 - o.north, n: [0, 0, -1], u: [1, 0, 0], w: [0, 1, 0], fill: '#9c94ba' },
    { v: o.east, n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1], fill: '#c9c3de' },
    { v: 7 - o.east, n: [-1, 0, 0], u: [0, 1, 0], w: [0, 0, 1], fill: '#a79fc4' },
  ]
}

/**
 * 翻滚方向 → 绕轴与角度（与 logic.roll 精确互逆：东/西绕 Z，北/南绕
 * X，符号使顶面倒向行进方向）。
 */
function rollRotation(dir: Dir, t: number): { axis: 'x' | 'z'; rad: number } {
  const quarter = (Math.PI / 2) * t
  if (dir === 'right') return { axis: 'z', rad: -quarter }
  if (dir === 'left') return { axis: 'z', rad: quarter }
  if (dir === 'up') return { axis: 'x', rad: quarter }
  return { axis: 'x', rad: -quarter }
}

function rotate(v: V3, rot: { axis: 'x' | 'z'; rad: number } | null): V3 {
  if (rot === null) return v
  return rot.axis === 'x' ? rotX(v, rot.rad) : rotZ(v, rot.rad)
}

/**
 * 画等轴测骰子：真实 3D 立方体投影，可见面按深度排序，面上点数按点
 * 阵投影；rot 为翻滚的部分旋转（null = 落定姿态）。
 * @param ctx 画布上下文。
 * @param cx 立方体中心 x（像素）。
 * @param cy 立方体中心 y（像素）。
 * @param orient 基准朝向（rot 为 null 时的最终朝向，动画中为翻滚前朝向）。
 * @param rot 翻滚部分旋转；完成角度时几何上恰等于翻滚后朝向。
 */
export function drawDice(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  orient: Orientation,
  rot: { axis: 'x' | 'z'; rad: number } | null,
): void {
  const s = CELL * 0.44
  const project = (v: V3): [number, number] => [
    cx + (v[0] - v[2]) * ISO_COS * s,
    cy + ((v[0] + v[2]) * 0.5 - v[1]) * s,
  ]
  const faces = cubeFaces(orient)
  const drawn: { depth: number; face: FaceSpec }[] = []
  for (const face of faces) {
    const n = rotate(face.n, rot)
    // 视线方向 (1,1,1)：法向点向观察者的面可见。
    if (n[0] + n[1] + n[2] <= 0.04) continue
    drawn.push({ depth: n[0] + n[1] + n[2], face })
  }
  drawn.sort((a, b) => a.depth - b.depth)
  for (const { face } of drawn) {
    const n = rotate(face.n, rot)
    const u = rotate(face.u, rot)
    const w = rotate(face.w, rot)
    const corner = (su: number, sw: number): V3 => [
      (n[0] + u[0] * su + w[0] * sw) * 1,
      (n[1] + u[1] * su + w[1] * sw) * 1,
      (n[2] + u[2] * su + w[2] * sw) * 1,
    ]
    const pts = [corner(1, 1), corner(1, -1), corner(-1, -1), corner(-1, 1)].map(project)
    ctx.beginPath()
    ctx.moveTo(pts[0]![0], pts[0]![1])
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]![0], pts[i]![1])
    ctx.closePath()
    ctx.fillStyle = face.fill
    ctx.fill()
    ctx.strokeStyle = 'rgba(18,18,30,0.55)'
    ctx.lineWidth = 1
    ctx.stroke()
    // 点数：法向略微抬升避免 z 冲突，面内九宫投影为小圆。
    ctx.fillStyle = '#26263a'
    for (const [ou, ow] of PIPS[face.v]!) {
      const pip: V3 = [
        n[0] * 1.02 + u[0] * ou * 0.5 + w[0] * ow * 0.5,
        n[1] * 1.02 + u[1] * ou * 0.5 + w[1] * ow * 0.5,
        n[2] * 1.02 + u[2] * ou * 0.5 + w[2] * ow * 0.5,
      ]
      const p = project(pip)
      ctx.beginPath()
      ctx.arc(p[0], p[1], s * 0.14, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** 碎地板裂纹（确定性折线，避免每帧抖动）。 */
function crackLines(x: number, y: number): number[][] {
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  return [
    [cx - CELL * 0.3, cy - CELL * 0.24, cx + 2, cy + 3],
    [cx + 2, cy + 3, cx + CELL * 0.3, cy + CELL * 0.18],
    [cx + 2, cy + 3, cx - CELL * 0.1, cy + CELL * 0.34],
    [cx - CELL * 0.05, cy - CELL * 0.36, cx + CELL * 0.22, cy - CELL * 0.1],
  ]
}

// 胜利粒子池与过关沿检测（与 maze 同模式：仅在胜负翻转的那一帧爆一次）。
const particles = createParticles()
let prevWin = false

/** 粒子是否还在运动（index 据此决定逐帧重绘窗口）。 */
export function dicemazeParticlesActive(): boolean {
  return particles.size() > 0
}

/** 画一帧完整场景。 */
export function renderDicemaze(ctx: CanvasRenderingContext2D, board: Board, view: DiceMazeView, dtMs: number): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const { ox, oy } = gridOffset(board)

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  hudPair(ctx, 12, 19, '关卡 ', String(view.level) + '/5')
  hudPair(ctx, 96, 19, '步数 ', String(view.steps))
  hudPair(ctx, 168, 19, '终点 ', '顶面 ' + String(board.goalNum))
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('方向键/WASD 翻滚 · 数字门需顶面匹配 · U 撤回 · R 重开 · P 暂停', 12, 38)

  for (let y = 0; y < board.h; y += 1) {
    for (let x = 0; x < board.w; x += 1) {
      const idx = y * board.w + x
      const kind = board.kind[idx]!
      const px = ox + x * CELL
      const py = oy + y * CELL
      if (kind === KIND_WALL) {
        ctx.fillStyle = WALL_FILL
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = WALL_EDGE
        ctx.fillRect(px, py, CELL, 2)
        ctx.fillRect(px, py, 2, CELL)
        continue
      }
      // 地面基底。
      ctx.fillStyle = 'rgba(255,255,255,0.035)'
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
      if (kind === KIND_FLOOR) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(px + CELL / 2 - 1, py + CELL / 2 - 1, 2, 2)
      } else if (kind === KIND_START) {
        ctx.strokeStyle = START_COLOR
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.arc(px + CELL / 2, py + CELL / 2, CELL * 0.3, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = THEME.textMuted
        ctx.font = '600 10px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('起点', px + CELL / 2, py + CELL / 2 - CELL * 0.42)
      } else if (kind === KIND_DOOR) {
        const match = view.orient.top === board.num[idx]
        const color = match ? DOOR_MATCH : DOOR_MISS
        roundRectPath(ctx, px + 4, py + 4, CELL - 8, CELL - 8, 6)
        ctx.fillStyle = match ? 'rgba(158,206,106,0.14)' : 'rgba(122,98,247,0.08)'
        ctx.fill()
        if (match) glow(ctx, DOOR_MATCH, 8)
        ctx.strokeStyle = color
        ctx.lineWidth = match ? 2 : 1
        ctx.stroke()
        noGlow(ctx)
        ctx.fillStyle = color
        ctx.globalAlpha = match ? 1 : 0.7
        ctx.font = 'bold 19px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(board.num[idx]), px + CELL / 2, py + CELL / 2 + 7)
        ctx.globalAlpha = 1
      } else if (kind === KIND_CRACK) {
        if (view.broken[idx] === 1) {
          ctx.fillStyle = 'rgba(8,8,14,0.85)'
          ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4)
          ctx.strokeStyle = 'rgba(247,118,142,0.35)'
          ctx.lineWidth = 1
          ctx.strokeRect(px + 2.5, py + 2.5, CELL - 5, CELL - 5)
        } else {
          ctx.strokeStyle = 'rgba(226,226,238,0.4)'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          for (const seg of crackLines(px, py)) {
            ctx.moveTo(seg[0]!, seg[1]!)
            ctx.lineTo(seg[2]!, seg[3]!)
          }
          ctx.stroke()
        }
      } else if (kind === KIND_GOAL) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 260)
        const c = { px: px + CELL / 2, py: py + CELL / 2 }
        ctx.strokeStyle = GOAL_COLOR
        ctx.lineWidth = 2
        glow(ctx, GOAL_COLOR, 6 + pulse * 8)
        ctx.beginPath()
        ctx.arc(c.px, c.py, CELL * 0.36, 0, Math.PI * 2)
        ctx.stroke()
        noGlow(ctx)
        ctx.fillStyle = GOAL_COLOR
        ctx.font = 'bold 17px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(board.goalNum), c.px, c.py + 6)
      }
    }
  }

  // 骰子：静止画在当前格；翻滚中从起点格插值到目标格，带跳起弧线与
  // 部分 3D 旋转（见 rollRotation）。
  const diceAt = view.anim === null
    ? cellCenter(board, view.x, view.y)
    : (() => {
        const a = view.anim
        const from = cellCenter(board, a.fromX, a.fromY)
        const to = cellCenter(board, a.toX, a.toY)
        const ease = a.t * a.t * (3 - 2 * a.t)
        return {
          px: from.px + (to.px - from.px) * ease,
          py: from.py + (to.py - from.py) * ease - Math.sin(Math.PI * a.t) * CELL * 0.22,
        }
      })()
  // 地面投影阴影。
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(diceAt.px, diceAt.py + CELL * 0.3, CELL * 0.3, CELL * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  const rot = view.anim === null ? null : rollRotation(view.anim.dir, view.anim.t)
  const baseOrient = view.anim === null ? view.orient : view.anim.fromOrient
  drawDice(ctx, diceAt.px, diceAt.py - CELL * 0.05, baseOrient, rot)

  // 过关粒子：翻转沿触发一次，随后按 dt 推进。
  if (view.winText === null) prevWin = false
  if (view.winText !== null && !prevWin) {
    const g = cellCenter(board, board.goal.x, board.goal.y)
    particles.burst(g.px, g.py, THEME.gold, 26, 180)
  }
  prevWin = view.winText !== null
  particles.tick(ctx, dtMs)

  if (view.winText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关', view.winText, THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}

