/**
 * 「管道连连」渲染：金属质感管件（描边分层高光）、蓝色水流沿 BFS 填充
 * 序渐进灌入、源头泵/出口桶、毒水管红色警示条纹、悬停旋转箭头、顶部
 * 关卡/步数/分数 HUD 与底部水位计、过关/失败/暂停 overlay。纯绘制，
 * 无 DOM 无状态；布局常量与 index.ts 共享。
 */
import { THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair, createParticles, type ParticleSystem } from '../theme.ts'
import { connectionsOf, type PipelinkState, type Pos, LEVEL_COUNT } from './logic.ts'

/** 逻辑画布尺寸与网格布局常量。 */
export const CELL = 52
export const MAX_SIZE = 9
export const MARGIN = 16
export const HUD_H = 46
export const FOOT_H = 30
export const LOGICAL_W = MAX_SIZE * CELL + MARGIN * 2
export const LOGICAL_H = HUD_H + MAX_SIZE * CELL + MARGIN * 2 + FOOT_H

/** 管体三层金属色（外沿/管身/高光）。 */
const PIPE_DARK = '#2a2f45'
const PIPE_BODY = '#4c5578'
const PIPE_HI = 'rgba(226,232,255,0.28)'
const WATER = '#7dcfff'
const WATER_DEEP = '#2f6f9f'

export interface PipelinkViewOptions {
  paused: boolean
  /** 悬停格（画旋转箭头）。 */
  hover?: Pos | null
  /** 粒子系统（过关水花）。 */
  particles?: ParticleSystem
}

/** 主渲染入口：背景 → 盘面 → 水流 → HUD → 粒子 → overlay。 */
export function renderPipelink(
  ctx: CanvasRenderingContext2D, state: PipelinkState, opts: PipelinkViewOptions,
): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const boardPx = state.size * CELL
  const ox = (LOGICAL_W - boardPx) / 2
  const oy = HUD_H + (LOGICAL_H - HUD_H - FOOT_H - boardPx) / 2
  drawHud(ctx, state)
  drawBoard(ctx, state, ox, oy, opts)
  drawWaterMeter(ctx, state, oy + boardPx + 10)
  opts.particles?.tick(ctx, 16)
  if (opts.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续 · R 重开本关')
  } else if (state.status === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '步数用尽', '按 R 重开本关', THEME.bad)
  } else if (state.status === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '通水成功！', '第 ' + state.level + ' 关得分 ' + state.score, THEME.good)
  }
}

/** 顶栏：关卡、步数（超限变红）、分数。 */
function drawHud(ctx: CanvasRenderingContext2D, state: PipelinkState): void {
  hudPair(ctx, MARGIN, 26, '关卡', state.level + '/' + LEVEL_COUNT)
  hudPair(ctx, LOGICAL_W / 2, 26, '步数', state.moves + '/' + state.moveLimit, 'center',
    state.moves >= state.moveLimit ? THEME.bad : THEME.text)
  hudPair(ctx, LOGICAL_W - MARGIN, 26, '分数', String(state.score), 'right', THEME.gold)
}

/** 盘面：底板、格板、管件、角色件、水流、悬停箭头。 */
function drawBoard(
  ctx: CanvasRenderingContext2D, state: PipelinkState, ox: number, oy: number, opts: PipelinkViewOptions,
): void {
  const boardPx = state.size * CELL
  roundRectPath(ctx, ox - 8, oy - 8, boardPx + 16, boardPx + 16, 14)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  // 水流进度：第 i 格灌 min(1, progress-i)。
  const progress = state.flow === null ? 0 : state.flow.progress
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const cell = state.grid[r]![c]!
      const x = ox + c * CELL
      const y = oy + r * CELL
      const idx = fillIndex(state, r, c)
      const frac = idx < 0 ? 0 : Math.max(0, Math.min(1, progress - idx))
      drawCellBase(ctx, x, y, cell.poison)
      if (cell.role === 'source') drawPump(ctx, x, y, frac >= 1)
      else if (cell.role === 'drain') drawBucket(ctx, x, y, frac, state.status === 'won')
      else drawPipes(ctx, x, y, connectionsOf(cell), cell.poison, frac)
    }
  }
  const h = opts.hover
  if (h !== null && h !== undefined && state.status === 'playing') {
    const cell = state.grid[h.r]![h.c]!
    if (!cell.fixed) drawRotateArrow(ctx, ox + h.c * CELL, oy + h.r * CELL)
  }
}

/** 格子的水流填充序号（未进水为 -1）。 */
function fillIndex(state: PipelinkState, r: number, c: number): number {
  if (state.flow === null) return -1
  const order = state.flow.order
  for (let i = 0; i < order.length; i += 1) {
    if (order[i]!.r === r && order[i]!.c === c) return i
  }
  return -1
}

/** 单格底板：毒管红底 + 警示斜纹。 */
function drawCellBase(ctx: CanvasRenderingContext2D, x: number, y: number, poison: boolean): void {
  roundRectPath(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8)
  ctx.fillStyle = poison ? 'rgba(247,118,142,0.16)' : 'rgba(13,13,20,0.35)'
  ctx.fill()
  if (!poison) return
  ctx.save()
  roundRectPath(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8)
  ctx.clip()
  ctx.strokeStyle = 'rgba(247,118,142,0.35)'
  ctx.lineWidth = 3
  for (let i = -CELL; i < CELL; i += 10) {
    ctx.beginPath()
    ctx.moveTo(x + i, y + CELL)
    ctx.lineTo(x + i + CELL, y)
    ctx.stroke()
  }
  ctx.restore()
}

/** 画一个方向上的管体（中心 → 边缘），可选按 frac 截断为水流。 */
function drawArm(ctx: CanvasRenderingContext2D, cx: number, cy: number, d: number, frac: number): void {
  const half = CELL / 2
  let ex = cx
  let ey = cy
  if (d === 0) ey -= half
  else if (d === 1) ex += half
  else if (d === 2) ey += half
  else ex -= half
  const len = frac * half
  const tx = cx + (ex - cx) * (len / half)
  const ty = cy + (ey - cy) * (len / half)
  const arm = (color: string, width: number): void => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(tx, ty)
    ctx.stroke()
  }
  arm(PIPE_DARK, 16)
  arm(PIPE_BODY, 10)
  arm(PIPE_HI, 3)
}

/** 普通管件：金属三层管 + 蓝色水流渐进覆盖。 */
function drawPipes(
  ctx: CanvasRenderingContext2D, x: number, y: number, dirs: number[], poison: boolean, frac: number,
): void {
  ctx.lineCap = 'butt'
  for (const d of dirs) drawArm(ctx, x + CELL / 2, y + CELL / 2, d, 1)
  if (frac > 0) {
    ctx.lineCap = 'round'
    glow(ctx, WATER, 8)
    for (const d of dirs) {
      ctx.strokeStyle = WATER_DEEP
      ctx.lineWidth = 9
      waterSeg(ctx, x, y, d, frac)
      ctx.strokeStyle = WATER
      ctx.lineWidth = 5
      waterSeg(ctx, x, y, d, frac)
    }
    noGlow(ctx)
    ctx.lineCap = 'butt'
  }
  if (poison) {
    ctx.fillStyle = THEME.bad
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('毒', x + CELL / 2, y + CELL - 7)
  }
}

/** 一段水流（中心向 d 方向延伸 frac 比例）。 */
function waterSeg(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, frac: number): void {
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const half = CELL / 2
  let ex = cx
  let ey = cy
  if (d === 0) ey -= half
  else if (d === 1) ex += half
  else if (d === 2) ey += half
  else ex -= half
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + (ex - cx) * frac, cy + (ey - cy) * frac)
  ctx.stroke()
}

/** 源头泵：金色圆环 + 中心泵叶，进水后发光。 */
function drawPump(ctx: CanvasRenderingContext2D, x: number, y: number, wet: boolean): void {
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const arms = connectionsOf({ kind: 'source', rot: sourceRotOf(x, y), role: 'source', poison: false, fixed: true, solutionRot: 0 })
  ctx.lineCap = 'butt'
  for (const d of arms) drawArm(ctx, cx, cy, d, 1)
  if (wet) glow(ctx, WATER, 10)
  ctx.beginPath()
  ctx.arc(cx, cy, 13, 0, Math.PI * 2)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fillStyle = wet ? WATER : THEME.gold
  ctx.fill()
  noGlow(ctx)
}

/** 泵开口方向由所在列推断（左上源朝右下，右上源朝左下）。 */
function sourceRotOf(x: number, y: number): number {
  void y
  return x > CELL ? 1 : 0
}

/** 出口桶：桶身 + 水位随 frac 上涨，通关发光。 */
function drawBucket(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, won: boolean): void {
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  ctx.lineCap = 'butt'
  for (const d of [0, 3] as const) drawArm(ctx, cx, cy, d, 1)
  if (won) glow(ctx, WATER, 14)
  roundRectPath(ctx, x + 12, y + 14, CELL - 24, CELL - 26, 5)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = accent(3)
  ctx.lineWidth = 3
  ctx.stroke()
  if (frac > 0) {
    const bh = (CELL - 30) * Math.min(1, frac)
    ctx.fillStyle = WATER
    ctx.fillRect(x + 15, y + 14 + (CELL - 26) - 3 - bh, CELL - 30, bh)
  }
  noGlow(ctx)
}

/** 悬停格右上角的旋转提示箭头。 */
function drawRotateArrow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const cx = x + CELL - 12
  const cy = y + 12
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(cx, cy, 7, -0.6, Math.PI * 1.3)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + 7, cy - 4)
  ctx.lineTo(cx + 3, cy - 9)
  ctx.lineTo(cx + 9, cy - 9)
  ctx.closePath()
  ctx.fillStyle = accent(0)
  ctx.fill()
}

/** 底部水位计：filled/total 格 + 比例条。 */
function drawWaterMeter(ctx: CanvasRenderingContext2D, state: PipelinkState, y: number): void {
  const total = state.flow === null ? 0 : state.flow.order.length
  const filled = state.flow === null ? 0 : Math.min(Math.floor(state.flow.progress), total)
  hudPair(ctx, MARGIN, y + 10, '水位', (total === 0 ? 0 : filled) + '/' + (total === 0 ? '--' : total))
  const barX = 150
  const barW = LOGICAL_W - MARGIN - barX
  roundRectPath(ctx, barX, y, barW, 10, 5)
  ctx.fillStyle = 'rgba(13,13,20,0.5)'
  ctx.fill()
  if (total > 0 && filled > 0) {
    glow(ctx, WATER, 6)
    roundRectPath(ctx, barX + 1.5, y + 1.5, Math.max(3, (barW - 3) * (filled / total)), 7, 3.5)
    ctx.fillStyle = WATER
    ctx.fill()
    noGlow(ctx)
  }
}

/** 共享粒子系统工厂（re-export 便于 index 使用同一实现）。 */
export { createParticles }
