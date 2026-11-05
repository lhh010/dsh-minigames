/**
 * 圆周挑战 canvas 渲染器：同心数字圆环（活动环高亮描边），径向列分
 * 隔线与列连线，环外圈显示每列当前和 vs 目标值（达标列绿色），底部
 * 步数条，HUD 与过关/超步/暂停遮罩。无状态 —— 状态由调用方持有；
 * 使用共享视觉件 (../theme.ts)。
 */
import { columnSums, type CirclePuzzle } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

/** 逻辑画布固定尺寸（各关卡共用，无需随关卡 refit）。 */
export const CANVAS_W = 540
export const CANVAS_H = 512
export const HUD_H = 32
const BAR_H = 26
const HOLE_R = 26
const LABEL_PAD = 26

/** 圆盘圆心（逻辑坐标）。 */
export function wheelCenter(): { x: number; y: number } {
  return { x: CANVAS_W / 2, y: (HUD_H + CANVAS_H - BAR_H) / 2 }
}

/** 最外环外半径（为列和标签留边）。 */
function outerRadius(): number {
  const c = wheelCenter()
  return Math.min(c.y - HUD_H, CANVAS_W / 2) - LABEL_PAD
}

/** 环 r（0 基，0 为最内环）的 [内半径, 外半径]。 */
export function ringRadii(rings: number, r: number): { inner: number; outer: number } {
  const outer = outerRadius()
  const th = (outer - HOLE_R) / rings
  return { inner: HOLE_R + r * th, outer: HOLE_R + (r + 1) * th }
}

/** 列 i 的起始角（弧度，-PI/2 起自正上方，顺时针）。 */
function colAngle(sectors: number, i: number): number {
  return -Math.PI / 2 + (i * Math.PI * 2) / sectors
}

/** 逻辑坐标点命中的环与列（中心孔与盘外返回 null）。 */
export function pointToRing(puzzle: CirclePuzzle, x: number, y: number): { ring: number; col: number } | null {
  const c = wheelCenter()
  const dx = x - c.x
  const dy = y - c.y
  const d = Math.hypot(dx, dy)
  const { inner } = ringRadii(puzzle.rings, 0)
  const outer = outerRadius()
  if (d < inner || d > outer) return null
  const ring = Math.min(puzzle.rings - 1, Math.floor((d - inner) / ((outer - inner) / puzzle.rings)))
  let a = Math.atan2(dy, dx) + Math.PI / 2
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const col = Math.floor((a / (Math.PI * 2)) * puzzle.sectors) % puzzle.sectors
  return { ring, col }
}

/** 列中心角方向上距圆心 d 处的点（标签/粒子定位）。 */
export function radialPoint(sectors: number, col: number, d: number): { x: number; y: number } {
  const c = wheelCenter()
  const a = colAngle(sectors, col) + Math.PI / sectors
  return { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }
}

/** 画一个环的一个扇区（环形段 + 居中数字）。 */
const drawSector = (
  ctx: CanvasRenderingContext2D, a0: number, a1: number,
  inner: number, outer: number, fill: string, edge: string,
): void => {
  ctx.beginPath()
  ctx.arc(0, 0, outer, a0, a1)
  ctx.arc(0, 0, inner, a1, a0, true)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 1
  ctx.stroke()
}

/** 渲染一帧所需的可视状态。 */
export interface CircleView {
  /** 活动环下标（0 基）。 */
  activeRing: number
  /** 1 基关卡号。 */
  level: number
  /** 已用步数。 */
  steps: number
  /** 步数上限。 */
  maxSteps: number
  /** 暂停遮罩。 */
  paused: boolean
  /** 结束遮罩副标题，游玩中为 null。 */
  endText: string | null
  /** 结束遮罩标题。 */
  endTitle: string
  /** 提示列下标，-1 为无。 */
  hintColumn: number
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡。
 * @param offsets - 各环偏移。
 * @param view - 可视状态（活动环/步数/遮罩/提示）。
 */
export function renderCircleMath(
  ctx: CanvasRenderingContext2D, puzzle: CirclePuzzle, offsets: readonly number[], view: CircleView,
): void {
  const w = CANVAS_W
  const h = CANVAS_H
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)
  const sums = columnSums(puzzle, offsets)
  hudPair(ctx, 8, 21, '关卡', view.level + '/5 · 目标和 ' + puzzle.target)
  hudPair(ctx, w - 8, 21, '步数', view.steps + '/' + view.maxSteps, 'right',
    view.steps > view.maxSteps * 0.8 ? THEME.bad : THEME.text)

  const c = wheelCenter()
  const outer = outerRadius()
  const hinting = view.hintColumn >= 0

  // 提示列：金色楔形高亮（从中心孔到标签外）。
  if (hinting) {
    const a0 = colAngle(puzzle.sectors, view.hintColumn)
    const a1 = colAngle(puzzle.sectors, view.hintColumn + 1)
    glow(ctx, THEME.gold, 14)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, outer + 20, a0, a1)
    ctx.closePath()
    ctx.fillStyle = 'rgba(224,175,104,0.20)'
    ctx.fill()
    noGlow(ctx)
  }

  ctx.save()
  ctx.translate(c.x, c.y)
  // 各环扇区。
  for (let r = 0; r < puzzle.rings; r += 1) {
    const { inner, outer: ro } = ringRadii(puzzle.rings, r)
    const active = r === view.activeRing
    const ringColor = accent(r)
    for (let col = 0; col < puzzle.sectors; col += 1) {
      const j = ((col - (offsets[r] ?? 0)) % puzzle.sectors + puzzle.sectors) % puzzle.sectors
      const value = puzzle.numbers[r]![j]!
      const a0 = colAngle(puzzle.sectors, col)
      const a1 = colAngle(puzzle.sectors, col + 1)
      drawSector(ctx, a0, a1, inner, ro,
        active ? 'rgba(122,162,247,0.16)' : THEME.panel, active ? ringColor : THEME.panelEdge)
      // 数字置于扇区角平分线的中点。
      const mid = (a0 + a1) / 2
      const dist = (inner + ro) / 2
      const nx = Math.cos(mid) * dist
      const ny = Math.sin(mid) * dist
      ctx.font = '600 ' + Math.min(20, Math.max(12, Math.round(ro - inner - 6))) + 'px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = active ? THEME.text : THEME.textMuted
      ctx.fillText(String(value), nx, ny)
    }
    // 活动环外描边。
    if (active) {
      glow(ctx, ringColor, 10)
      ctx.beginPath()
      ctx.arc(0, 0, ro - 1, 0, Math.PI * 2)
      ctx.strokeStyle = ringColor
      ctx.lineWidth = 2
      ctx.stroke()
      noGlow(ctx)
    }
  }
  // 径向列分隔线。
  ctx.beginPath()
  for (let i = 0; i < puzzle.sectors; i += 1) {
    const a = colAngle(puzzle.sectors, i)
    ctx.moveTo(Math.cos(a) * HOLE_R, Math.sin(a) * HOLE_R)
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer)
  }
  ctx.strokeStyle = 'rgba(52,52,74,0.9)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 中心孔。
  ctx.beginPath()
  ctx.arc(0, 0, HOLE_R, 0, Math.PI * 2)
  ctx.fillStyle = THEME.bgBottom
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  // 列和标签。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let col = 0; col < puzzle.sectors; col += 1) {
    const mid = colAngle(puzzle.sectors, col) + Math.PI / puzzle.sectors
    const p = { x: Math.cos(mid) * (outer + 14), y: Math.sin(mid) * (outer + 14) }
    const ok = sums[col] === puzzle.target
    const isHint = hinting && col === view.hintColumn
    ctx.fillStyle = isHint ? THEME.gold : ok ? THEME.good : THEME.textMuted
    ctx.fillText(String(sums[col]), p.x, p.y)
  }
  ctx.restore()

  // 底部步数条。
  const barW = w - 32
  const barY = h - BAR_H + 6
  ctx.fillStyle = THEME.panel
  ctx.fillRect(16, barY, barW, 8)
  const ratio = Math.min(1, view.steps / view.maxSteps)
  ctx.fillStyle = ratio > 0.8 ? THEME.bad : THEME.gold
  ctx.fillRect(16, barY, barW * ratio, 8)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(16, barY, barW, 8)

  if (view.endText !== null) {
    drawOverlay(ctx, w, h, view.endTitle, view.endText, view.endTitle === '过关' ? THEME.good : THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
