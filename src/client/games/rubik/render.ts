/**
 * 魔方 3D 渲染：手写视角旋转矩阵（yaw/pitch）+ 弱透视投影，把 54 张贴纸
 * （logic.ts 的 cubie 坐标 + 面法向量几何真值）投到 canvas；画家算法按
 * cubie 中心视深排序，逐 cubie 画黑色塑料底 + 圆角贴纸。交互几何全部是
 * 无 DOM 纯函数：viewMatrix/projectPoint（投影）、stickerLayout/pickSticker
 * （命中）、dragToMove（屏幕拖拽向量 → 层走法），便于确定性测试。
 */
import { FACES, layerIndices, parseMoveId, stickerGeometry, type Cube, type Move, type Vec } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽（px）。 */
export const LOGICAL_W = 440
/** 逻辑画布高（px）。 */
export const LOGICAL_H = 500
/** 顶部 HUD 高（px）。 */
export const HUD_H = 34

/** 观察视角（弧度）：yaw 绕 y 轴，pitch 绕 x 轴（正值 = 自上向下俯视）。 */
export interface ViewAngles {
  yaw: number
  pitch: number
}

/** 完整投影参数：视角 + 屏幕参考点、正交比例、弱透视系数（0 = 正交）。 */
export interface RenderView extends ViewAngles {
  cx: number
  cy: number
  scale: number
  persp: number
}

/** 初始等轴测式视角：同时可见 U（上）、F（左前）、R（右前）三个面。 */
export const DEFAULT_VIEW: ViewAngles = { yaw: -Math.PI / 4, pitch: 0.52 }
/** 立方体中心在逻辑画布上的位置与投影像素比例、弱透视强度。 */
export const CUBE_CENTER_X = LOGICAL_W / 2
export const CUBE_CENTER_Y = HUD_H + (LOGICAL_H - HUD_H) / 2 + 8
export const CUBE_SCALE = 92
export const PERSP = 0.05

/** 视角重置按钮（index.ts 命中检测用；双击画布同效）。 */
export const VIEW_BTN = { x: LOGICAL_W - 86, y: LOGICAL_H - 32, w: 72, h: 22 }

/**
 * 由视角角构造投影参数。
 * @param a - 视角角。
 */
export function makeView(a: ViewAngles): RenderView {
  return { yaw: a.yaw, pitch: a.pitch, cx: CUBE_CENTER_X, cy: CUBE_CENTER_Y, scale: CUBE_SCALE, persp: PERSP }
}

/**
 * 视角旋转矩阵 M = Rx(pitch)·Ry(yaw)，3×3 行主序（v' = M·v）。
 * 世界系：x 向右、y 向上、z 朝观察者；变换后 z' 即视深（大 = 近）。
 * @param yaw - 绕 y 轴角（弧度）。
 * @param pitch - 绕 x 轴角（弧度）。
 * @returns 长度 9 的只读数组。
 */
export function viewMatrix(yaw: number, pitch: number): readonly number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  return [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy]
}

/**
 * 矩阵作用于向量。
 * @param m - viewMatrix 产出的 3×3 行主序矩阵。
 * @returns 变换后的三维坐标。
 */
export function mat3Apply(m: readonly number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z,
    m[3]! * x + m[4]! * y + m[5]! * z,
    m[6]! * x + m[7]! * y + m[8]! * z,
  ]
}

/** 投影点：屏幕坐标 + 视深（大 = 近，供画家排序）。 */
export interface ProjectedPoint {
  x: number
  y: number
  depth: number
}

/**
 * 世界点 → 弱透视屏幕投影：近处（z' 大）略放大。
 * @param view - 投影参数（含矩阵外的圆心 / 比例 / 透视系数）。
 */
export function projectPoint(m: readonly number[], px: number, py: number, pz: number, view: RenderView): ProjectedPoint {
  const t = mat3Apply(m, px, py, pz)
  const f = 1 / (1 - view.persp * t[2]!)
  return { x: view.cx + t[0]! * view.scale * f, y: view.cy - t[1]! * view.scale * f, depth: t[2]! }
}

/** 六面贴纸配色（下标 = 颜色号 = 面号）：白黄橙红绿蓝。 */
export const FACE_COLORS: readonly string[] = [
  '#e8e8f0', // U 白
  '#e0af68', // D 黄
  '#ff9e64', // L 橙
  '#f7768e', // R 红
  '#9ece6a', // F 绿
  '#7aa2f7', // B 蓝
]

/** 54 张贴纸的几何真值（logic.ts 提供）。 */
const GEOMETRY = stickerGeometry()

/** 数值叉积。 */
function cross3(a: Vec, b: Vec): [number, number, number] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
}

/** 数值点积。 */
function dot3(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
}

/** 与法向量垂直的第一个坐标轴（按 x/y/z 顺序取，保证确定性）。 */
function tangent1(n: Vec): Vec {
  if (n[0]! === 0) return [1, 0, 0]
  if (n[1]! === 0) return [0, 1, 0]
  return [0, 0, 1]
}

/** Rodrigues 旋转：v 绕单位轴 axis 转 angle 弧度（axis 为坐标轴 ±1）。 */
function rotateAbout(v: readonly number[], axis: Vec, angle: number): [number, number, number] {
  const c = Math.cos(angle), s = Math.sin(angle)
  const d = dot3(axis, v)
  const cr = cross3(axis, v as Vec)
  return [
    v[0]! * c + cr[0]! * s + axis[0]! * d * (1 - c),
    v[1]! * c + cr[1]! * s + axis[1]! * d * (1 - c),
    v[2]! * c + cr[2]! * s + axis[2]! * d * (1 - c),
  ]
}

/** 拧动动画的渲染侧快照：走法 + 原始相位 0..1（渲染时三次缓动）。 */
export interface TwistAnim {
  moveId: string
  turns: number
  phase: number
}

/** 拧动缓动：easeOutCubic。 */
export function easeTwist(phase: number): number {
  return 1 - Math.pow(1 - phase, 3)
}

/** 一张贴纸的完整投影：贴纸四边形 + 塑料底四边形 + 排序深度。 */
interface SceneSticker {
  index: number
  sticker: ReadonlyArray<ProjectedPoint>
  plastic: ReadonlyArray<ProjectedPoint>
  /** cubie 中心视深（大 = 近）。 */
  depth: number
  visible: boolean
}

/**
 * 构建整幕场景：54 张贴纸投影（含拧动动画的临时旋转），按 cubie 中心
 * 视深升序（远 → 近）排序。
 * @param view - 投影参数。
 * @param anim - 拧动动画（null = 静止态）。
 */
export function buildScene(view: RenderView, anim: TwistAnim | null): readonly SceneSticker[] {
  const m = viewMatrix(view.yaw, view.pitch)
  let moving: ReadonlySet<number> | null = null
  let axis: Vec | null = null
  let angle = 0
  if (anim !== null) {
    moving = new Set<number>(layerIndices(anim.moveId))
    const { face } = parseMoveId(anim.moveId)
    axis = face === 'U' ? [0, 1, 0] : face === 'D' ? [0, -1, 0]
      : face === 'L' ? [-1, 0, 0] : face === 'R' ? [1, 0, 0]
      : face === 'F' ? [0, 0, 1] : [0, 0, -1]
    angle = -anim.turns * (Math.PI / 2) * easeTwist(Math.min(1, Math.max(0, anim.phase)))
  }
  const out: SceneSticker[] = []
  const IN = 0.5 - 0.07
  const OUT = 0.5 + 0.02
  for (let i = 0; i < 54; i += 1) {
    const g = GEOMETRY[i]!
    let pos: readonly number[] = g.pos
    let n: readonly number[] = g.normal
    if (moving !== null && axis !== null && moving.has(i)) {
      pos = rotateAbout(pos, axis, angle)
      n = rotateAbout(n, axis, angle)
    }
    const nView = mat3Apply(m, n[0]!, n[1]!, n[2]!)
    const centerView = mat3Apply(m, pos[0]!, pos[1]!, pos[2]!)
    const t1 = tangent1(g.normal)
    const t2 = cross3(g.normal, t1)
    const quad = (half: number): ProjectedPoint[] => {
      const pts: ProjectedPoint[] = []
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const wx = pos[0]! + n[0]! * 0.5 + (t1[0]! * a + t2[0]! * b) * half
        const wy = pos[1]! + n[1]! * 0.5 + (t1[1]! * a + t2[1]! * b) * half
        const wz = pos[2]! + n[2]! * 0.5 + (t1[2]! * a + t2[2]! * b) * half
        pts.push(projectPoint(m, wx, wy, wz, view))
      }
      return pts
    }
    out.push({
      index: i,
      sticker: quad(IN),
      plastic: quad(OUT),
      depth: centerView[2]!,
      visible: nView[2]! > 0.03,
    })
  }
  out.sort((a, b) => a.depth - b.depth)
  return out
}

/** 测试用的贴纸投影：四顶点 + 视深 + 可见性（远 → 近排序）。 */
export interface StickerQuad {
  index: number
  pts: ReadonlyArray<{ x: number; y: number }>
  depth: number
  visible: boolean
}

/**
 * 贴纸投影布局（与渲染同几何）：命中测试与测试断言共用。
 * @param view - 投影参数。
 * @param anim - 拧动动画或 null。
 */
export function stickerLayout(view: RenderView, anim: TwistAnim | null = null): readonly StickerQuad[] {
  return buildScene(view, anim).map((s) => ({ index: s.index, pts: s.sticker, depth: s.depth, visible: s.visible }))
}

/** 射线法点在多边形内判定。 */
function inPoly(px: number, py: number, pts: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i]!
    const b = pts[j]!
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * 贴纸命中检测：从近到远取第一个包含点的可见贴纸。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param view - 投影参数。
 * @returns 贴纸下标（0..53），未命中返回 null。
 */
export function pickSticker(x: number, y: number, view: RenderView): number | null {
  const scene = buildScene(view, null)
  for (let k = scene.length - 1; k >= 0; k -= 1) {
    const s = scene[k]!
    if (!s.visible) continue
    if (inPoly(x, y, s.sticker) || inPoly(x, y, s.plastic)) return s.index
  }
  return null
}

/** 走法面法向查表。 */
function faceNormalOf(face: string): Vec {
  if (face === 'U') return [0, 1, 0]
  if (face === 'D') return [0, -1, 0]
  if (face === 'L') return [-1, 0, 0]
  if (face === 'R') return [1, 0, 0]
  if (face === 'F') return [0, 0, 1]
  return [0, 0, -1]
}

/**
 * 屏幕拖拽向量 → 层走法（确定性纯函数）：
 * 把拖拽向量分解到贴纸面的两个切向轴的屏幕投影，取分量大的轴为位移
 * 方向 d；旋转轴 a = 法向 × d，层 = 贴纸在该轴上的坐标层，方向由几何
 * 推导（绕 a 数学正转 90° 使贴纸沿 d 移动）。
 * @param stickerIndex - 按下的贴纸下标（pickSticker 产出）。
 * @param dx - 屏幕拖拽 x（逻辑坐标，右为正）。
 * @param dy - 屏幕拖拽 y（逻辑坐标，下为正）。
 * @param view - 按下时的投影参数。
 * @returns 等价走法；零向量返回 null。
 */
export function dragToMove(stickerIndex: number, dx: number, dy: number, view: RenderView): Move | null {
  const g = GEOMETRY[stickerIndex]
  if (g === undefined || (dx === 0 && dy === 0)) return null
  const m = viewMatrix(view.yaw, view.pitch)
  const n = g.normal
  const t1 = tangent1(n)
  const t2 = cross3(n, t1)
  const screenOf = (axis: Vec): { x: number; y: number } => {
    const t = mat3Apply(m, axis[0]!, axis[1]!, axis[2]!)
    return { x: t[0]!, y: -t[1]! }
  }
  const e1 = screenOf(t1)
  const e2 = screenOf(t2)
  const s1 = dx * e1.x + dy * e1.y
  const s2 = dx * e2.x + dy * e2.y
  const use1 = Math.abs(s1) >= Math.abs(s2)
  const along = use1 ? t1 : t2
  const sign = (use1 ? s1 : s2) >= 0 ? 1 : -1
  const d: Vec = [along[0]! * sign, along[1]! * sign, along[2]! * sign]
  const a = cross3(n, d)
  // 与轴同向的面优先（规范走法 id，如 -y 轴记 D 层而非 U 层）。
  let face = ''
  let k = 0
  for (const f of FACES) {
    const nf = faceNormalOf(f)
    if (dot3(nf, a) === 1) { face = f; k = 1; break }
    if (dot3(nf, a) === -1) { face = f; k = -1 }
  }
  if (face === '') return null
  const nf = faceNormalOf(face)
  const layer = 1 - dot3(g.pos, nf)
  // 一步 = 绕面法向 -90°（数学方向）；要绕 a 正转 +90° ⇒ turns = -k。
  return { id: face + layer, turns: -k }
}

/** 渲染所需的一帧状态快照。 */
export interface RenderState {
  cube: Cube
  level: number
  scrambleLen: number
  moves: number
  hintsLeft: number
  elapsedMs: number
  paused: boolean
  /** 过关副标题；null 表示进行中。 */
  winText: string | null
  /** 按下待拧的贴纸（白色描边高亮），null 无。 */
  hover: number | null
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return mm + ':' + ss
}

/** 视空间光照方向（归一化）。 */
const LIGHT: readonly number[] = ((): readonly number[] => {
  const v = [0.35, 0.7, 0.62]
  const len = Math.hypot(v[0]!, v[1]!, v[2]!)
  return [v[0]! / len, v[1]! / len, v[2]! / len]
})()

/** 颜色明暗调整：k ∈ (0, 1+] 线性缩放 rgb。 */
function shadeColor(hex: string, k: number): string {
  const r = Math.round(Math.min(255, Number.parseInt(hex.slice(1, 3), 16) * k))
  const g = Math.round(Math.min(255, Number.parseInt(hex.slice(3, 5), 16) * k))
  const b = Math.round(Math.min(255, Number.parseInt(hex.slice(5, 7), 16) * k))
  return 'rgb(' + r + ',' + g + ',' + b + ')'
}

function polyPath(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<{ x: number; y: number }>): void {
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y)
  ctx.closePath()
}

/** 圆角四边形：四角按屏幕像素 r 二次曲线收紧（魔方贴纸质感）。 */
function roundQuadPath(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<{ x: number; y: number }>, r: number): void {
  ctx.beginPath()
  const n = pts.length
  const start = pts[0]!
  const first = pts[1]!
  const v0x = start.x - first.x, v0y = start.y - first.y
  const l0 = Math.hypot(v0x, v0y)
  const r0 = Math.min(r, l0 * 0.45)
  ctx.moveTo(start.x - (v0x / l0) * r0, start.y - (v0y / l0) * r0)
  for (let i = 0; i < n; i += 1) {
    const cur = pts[i]!
    const prev = pts[(i + n - 1) % n]!
    const next = pts[(i + 1) % n]!
    const vx = next.x - cur.x, vy = next.y - cur.y
    const len = Math.hypot(vx, vy)
    const rr = Math.min(r, len * 0.45)
    ctx.quadraticCurveTo(cur.x, cur.y, cur.x + (vx / len) * rr, cur.y + (vy / len) * rr)
  }
  ctx.closePath()
}

/**
 * 绘制一帧 3D 魔方：背景 + HUD + 画家序立方体 + 过关/暂停 overlay。
 * @param st - 状态快照。
 * @param angles - 当前视角。
 * @param anim - 拧动动画或 null。
 */
export function renderRubik(
  ctx: CanvasRenderingContext2D, w: number, h: number, st: RenderState, angles: ViewAngles, anim: TwistAnim | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  const hudY = 22
  hudPair(ctx, 16, hudY, '关卡 ', String(st.level))
  hudPair(ctx, 86, hudY, '打乱参考 ', String(st.scrambleLen))
  hudPair(ctx, 176, hudY, '提示余 ', String(st.hintsLeft), 'left', st.hintsLeft > 0 ? THEME.text : THEME.bad)
  hudPair(ctx, w - 16, hudY, '时间 ', fmtTime(st.elapsedMs), 'right')
  hudPair(ctx, w - 96, hudY, '步数 ', String(st.moves), 'right', THEME.gold)

  const scene = buildScene(makeView(angles), anim)
  const m = viewMatrix(angles.yaw, angles.pitch)
  for (const s of scene) {
    if (!s.visible) continue
    // 黑色塑料底：cubie 可见面外扩一圈，贴纸间形成缝隙。
    ctx.fillStyle = '#15151c'
    polyPath(ctx, s.plastic)
    ctx.fill()
    // 贴纸：按视空间法向做弱光照着色。
    const g = GEOMETRY[s.index]!
    const nv = mat3Apply(m, g.normal[0]!, g.normal[1]!, g.normal[2]!)
    const bright = 0.66 + 0.34 * Math.max(0, dot3(nv, LIGHT))
    const color = shadeColor(FACE_COLORS[st.cube[s.index]!]!, bright)
    if (st.hover === s.index) glow(ctx, color, 16)
    ctx.fillStyle = color
    roundQuadPath(ctx, s.sticker, 7)
    ctx.fill()
    noGlow(ctx)
    if (st.hover === s.index) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // 视角重置按钮。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, VIEW_BTN.x, VIEW_BTN.y, VIEW_BTN.w, VIEW_BTN.h, 6)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('重置视角', VIEW_BTN.x + VIEW_BTN.w / 2, VIEW_BTN.y + 15)

  if (st.winText !== null) {
    drawOverlay(ctx, w, h, '过关', st.winText, THEME.good)
  } else if (st.paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续 · 拖拽旋转视角', THEME.text)
  }
}
