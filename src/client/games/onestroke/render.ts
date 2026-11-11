/**
 * 一笔画 canvas 渲染：共享主题包 + 纸面网格底、节点圆点（内标剩余度）、
 * 未画边深色 / 已画边亮色描边、笔尖沿最新一条边插值滑动的画线动画、
 * 提示模式下的奇点标记、边数进度 HUD 与过关 / 失败 / 暂停 overlay。
 *
 * 画线动画状态保存在模块内（同 hashi 的粒子池模式）：每条新出现的已画
 * 边记录起始时间，200ms 内从 0 画到 1；动画未结束前 animationActive()
 * 返回 true，调用方据此持续标脏逐帧重绘。
 */
import type { OneStrokeGraph, Point, StrokeState } from './logic.ts'
import { degrees, edgeKey, oddNodes } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 540
const HUD_H = 34
const PAD = 20
const BOARD = LOGICAL_W - PAD * 2
const BOARD_Y = HUD_H + PAD
const BOARD_H = LOGICAL_H - BOARD_Y - PAD

const INK = accent(0)
const EDGE_IDLE = 'rgba(226,226,238,0.30)'
const ODD_MARK = THEME.gold

/** 单条边的画线动画时长 ms。 */
const DRAW_MS = 200
const NODE_R = 11

/** 渲染视图：把图的外包矩形等比映射进棋盘区域。 */
export interface GraphView {
  /** 节点 → 画布中心坐标。 */
  centers: { x: number, y: number }[]
  /** 命中半径。 */
  radius: number
}

/**
 * 计算一张图在画布上的节点坐标视图。
 * @param graph - 要布局的图。
 */
export function viewOf(graph: OneStrokeGraph): GraphView {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of graph.nodes) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const inset = 26
  const scale = Math.min((BOARD - inset * 2) / spanX, (BOARD_H - inset * 2) / spanY)
  const offX = PAD + (BOARD - spanX * scale) / 2
  const offY = BOARD_Y + (BOARD_H - spanY * scale) / 2
  return {
    centers: graph.nodes.map(p => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale })),
    radius: Math.max(NODE_R + 6, scale * 0.34),
  }
}

/**
 * 命中测试：逻辑坐标下的节点下标，无命中返回 null。
 * @param graph - 图。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 */
export function nodeAt(graph: OneStrokeGraph, x: number, y: number): number | null {
  const view = viewOf(graph)
  for (let i = 0; i < view.centers.length; i += 1) {
    const c = view.centers[i]!
    if (Math.hypot(x - c.x, y - c.y) <= view.radius) return i
  }
  return null
}

// 模块内动画与粒子状态（渲染副作用，不进对局逻辑）。
const drawStart = new Map<string, number>()
const particles = createParticles()
let lastFrame = 0
let prevWin = false

/** 是否仍有边在画线动画中（调用方据此逐帧标脏）。 */
export function animationActive(): boolean {
  const now = performance.now()
  for (const start of drawStart.values()) if (now - start < DRAW_MS) return true
  return false
}

/** 沿边按进度取笔尖位置。 */
function lerp(a: Point, b: Point, t: number): { x: number, y: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * 绘制一帧。
 * @param ctx - 已应用逻辑坐标变换的 2d 上下文。
 * @param state - 当前对局状态。
 * @param level - 关卡号（1 起）。
 * @param hint - 是否显示提示（奇点标记 + 剩余度图例）。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param failText - 失败/死点提示文案；null 表示进行中。
 * @param winText - 过关文案；null 表示未过关。
 */
export function renderOneStroke(
  ctx: CanvasRenderingContext2D,
  state: StrokeState,
  level: number,
  hint: boolean,
  paused: boolean,
  failText: string | null,
  winText: string | null,
): void {
  const { graph } = state
  const view = viewOf(graph)
  const dt = Math.min(50, lastFrame === 0 ? 16 : performance.now() - lastFrame)
  lastFrame = performance.now()
  const now = performance.now()

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 纸面面板。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, PAD + 2, BOARD_Y + 2, BOARD - 4, BOARD_H - 4, 12)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // 纸面网格底。
  ctx.strokeStyle = 'rgba(226,226,238,0.06)'
  ctx.lineWidth = 1
  for (let gx = PAD + 24; gx < PAD + BOARD; gx += 24) {
    ctx.beginPath(); ctx.moveTo(gx, BOARD_Y); ctx.lineTo(gx, BOARD_Y + BOARD_H); ctx.stroke()
  }
  for (let gy = BOARD_Y + 24; gy < BOARD_Y + BOARD_H; gy += 24) {
    ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(PAD + BOARD, gy); ctx.stroke()
  }

  // 未画边（深）与已画边（亮色描边动画：新边从起端画向终端）。
  let pen: { x: number, y: number } | null = null
  let newestKey: string | null = null
  let newestStart = -1
  for (const e of graph.edges) {
    const key = edgeKey(e.a, e.b)
    const ca = view.centers[e.a]!
    const cb = view.centers[e.b]!
    if (!state.drawn.has(key)) {
      ctx.strokeStyle = EDGE_IDLE
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(ca.x, ca.y); ctx.lineTo(cb.x, cb.y); ctx.stroke()
      continue
    }
    if (!drawStart.has(key)) drawStart.set(key, now)
    const start = drawStart.get(key)!
    const t = Math.min(1, (now - start) / DRAW_MS)
    const to = lerp(ca, cb, t)
    glow(ctx, INK, 8)
    ctx.strokeStyle = INK
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(ca.x, ca.y); ctx.lineTo(to.x, to.y); ctx.stroke()
    noGlow(ctx)
    if (t < 1) pen = to
    if (start > newestStart) { newestStart = start; newestKey = key }
  }
  // 已结束动画的最近一条边：笔尖停在终端节点上。
  if (pen === null && newestKey !== null && state.at !== null) {
    pen = view.centers[state.at]!
  }

  // 提示模式：奇点标记（原图度数为奇的节点画金色外环——欧拉的判据教育）。
  if (hint) {
    ctx.strokeStyle = ODD_MARK
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    for (const i of oddNodes(graph)) {
      const c = view.centers[i]!
      ctx.beginPath(); ctx.arc(c.x, c.y, NODE_R + 5, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // 节点：圆点 + 剩余度；起笔点描金、当前笔尖高亮。
  const at = state.at
  const start0 = state.path.length > 0 ? state.path[0]! : null
  for (let i = 0; i < view.centers.length; i += 1) {
    const c = view.centers[i]!
    const isAt = i === at
    ctx.beginPath()
    ctx.arc(c.x, c.y, NODE_R, 0, Math.PI * 2)
    ctx.fillStyle = isAt ? INK : THEME.panel
    ctx.fill()
    ctx.strokeStyle = i === start0 ? ODD_MARK : isAt ? THEME.text : THEME.panelEdge
    ctx.lineWidth = i === start0 ? 2.5 : 1.5
    ctx.stroke()
    if (isAt) { glow(ctx, INK, 12); ctx.stroke(); noGlow(ctx) }
    // 剩余度数字（起笔后显示；hint 模式下常显）。
    if (state.at !== null || hint) {
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isAt ? THEME.text : THEME.textMuted
      ctx.fillText(String(degrees(graph)[i]), c.x, c.y + 0.5)
      ctx.textBaseline = 'alphabetic'
    }
  }

  // 笔尖光标：动画中的插值点，带墨水光晕。
  if (pen !== null && winText === null) {
    glow(ctx, THEME.text, 14)
    ctx.fillStyle = THEME.text
    ctx.beginPath(); ctx.arc(pen.x, pen.y, 4.5, 0, Math.PI * 2); ctx.fill()
    noGlow(ctx)
  }

  // HUD：关卡、已画/总边数、奇点数、提示状态。
  hudPair(ctx, PAD, 22, '关卡', level + '/5')
  hudPair(ctx, LOGICAL_W - PAD, 22, '已画', state.drawn.size + '/' + graph.edges.length, 'right')
  const oddCount = oddNodes(graph).length
  hudPair(ctx, PAD, LOGICAL_H - 10, '奇点', String(oddCount), 'left', oddCount <= 2 ? THEME.good : THEME.bad)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = hint ? ODD_MARK : THEME.textMuted
  const hintText = hint ? '提示：金环=奇点 · 数字=剩余度' : 'H：提示 · R：重开 · P：暂停'
  ctx.fillText(hintText, LOGICAL_W - PAD, LOGICAL_H - 10)

  particles.tick(ctx, dt)

  // 过关粒子（一次性爆发）。
  if (winText !== null && !prevWin) {
    for (let i = 0; i < graph.nodes.length; i += 1) {
      particles.burst(view.centers[i]!.x, view.centers[i]!.y, accent(i), 4, 150)
    }
  }
  prevWin = winText !== null

  if (winText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '一笔画完', winText, THEME.gold)
  } else if (failText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '无法继续', failText, THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.textMuted)
  }
}
