/**
 * 多米诺分解 canvas 渲染器：(n+1)×(n+2) 数字盘，白底大数字格；已配对
 * 的两格之间画一条粗连接线（每对取 accent(i) 一种颜色）并给两格淡色底；
 * cursor 格描边；hoverPair 虚线预览；HUD 显示配对进度；过关/暂停遮罩。
 * 无状态 —— 全部状态由调用方持有；使用共享视觉套件（../theme.ts）。
 */
import type { DominoPuzzle } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 顶部 HUD 高度（逻辑像素）。 */
export const HUD_H = 32
/** 格子间距。 */
export const GAP = 6

/** 格子边长随阶数缩小，保证整盘可见。 */
export function cellSize(order: number): number {
  return order <= 4 ? 52 : order <= 6 ? 44 : 38
}

/** 盘面行数（order + 1）。 */
export function rows(order: number): number {
  return order + 1
}

/** 盘面列数（order + 2）。 */
export function cols(order: number): number {
  return order + 2
}

/** 盘面像素宽度。 */
export function boardW(order: number): number {
  return cols(order) * cellSize(order) + (cols(order) - 1) * GAP
}

/** 逻辑画布宽。 */
export function logicalW(order: number): number {
  return boardW(order) + GAP
}

/** 逻辑画布高。 */
export function logicalH(order: number): number {
  return HUD_H + GAP + rows(order) * cellSize(order) + (rows(order) - 1) * GAP + GAP + 14
}

/** 格子 (r, c) 左上角的逻辑坐标。 */
export function cellOrigin(order: number, r: number, c: number): { x: number; y: number } {
  const cell = cellSize(order)
  return { x: GAP / 2 + c * (cell + GAP), y: HUD_H + GAP / 2 + r * (cell + GAP) }
}

/** 逻辑坐标点落在哪个格子，盘外返回 null。 */
export function cellAt(order: number, x: number, y: number): { r: number; c: number } | null {
  const cell = cellSize(order)
  const origin = cellOrigin(order, 0, 0)
  const c = Math.floor((x - origin.x) / (cell + GAP))
  const r = Math.floor((y - origin.y) / (cell + GAP))
  if (r < 0 || r >= rows(order) || c < 0 || c >= cols(order)) return null
  const inX = x - origin.x - c * (cell + GAP)
  const inY = y - origin.y - r * (cell + GAP)
  if (inX > cell || inY > cell) return null
  return { r, c }
}

/** 格子中心的逻辑坐标（粒子爆发等）。 */
export function cellCenter(order: number, r: number, c: number): { x: number; y: number } {
  const { x, y } = cellOrigin(order, r, c)
  const cell = cellSize(order)
  return { x: x + cell / 2, y: y + cell / 2 }
}

/**
 * 画两格（扁平索引对）之间的连接线：横向画水平线，纵向画垂直线。
 * @param ctx 画布上下文。
 * @param order 盘面阶数。
 * @param a 起始格扁平索引。
 * @param b 结束格扁平索引。
 * @param color 线条颜色。
 * @param width 线宽。
 */
function drawLink(
  ctx: CanvasRenderingContext2D, order: number, a: number, b: number, color: string, width: number,
): void {
  const ca = cellCenter(order, Math.floor(a / cols(order)), a % cols(order))
  const cb = cellCenter(order, Math.floor(b / cols(order)), b % cols(order))
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ca.x, ca.y)
  ctx.lineTo(cb.x, cb.y)
  ctx.stroke()
}

/**
 * 画一帧。
 * @param puzzle 当前谜题。
 * @param pairs 玩家已配对的扁平索引对。
 * @param hoverPair 悬停预览对（第一格已选中、第二格被悬停），无则 null。
 * @param cursor 键盘焦点格，无则 null。
 * @param paused 是否显示暂停遮罩。
 * @param winText 过关副标题文字，进行中为 null。
 */
export function renderDominosa(
  ctx: CanvasRenderingContext2D, puzzle: DominoPuzzle,
  pairs: readonly (readonly [number, number])[],
  hoverPair: readonly [number, number] | null,
  cursor: { r: number; c: number } | null,
  paused: boolean, winText: string | null,
): void {
  const order = puzzle.order
  const w = logicalW(order)
  const h = logicalH(order)
  const cell = cellSize(order)
  const total = (order + 1) * (order + 2) / 2
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP / 2, 21, '已配 ', pairs.length + '/' + total)
  hudPair(ctx, w - GAP / 2, 21, '阶数', String(order), 'right')

  // 已配对格子的淡色底与索引映射。
  const tint = new Map<number, number>()
  pairs.forEach((pair, i) => {
    tint.set(pair[0], i)
    tint.set(pair[1], i)
  })

  ctx.font = '700 ' + Math.floor(cell * 0.46) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let r = 0; r < rows(order); r += 1) {
    for (let c = 0; c < cols(order); c += 1) {
      const { x, y } = cellOrigin(order, r, c)
      const idx = r * cols(order) + c
      const pairIdx = tint.get(idx)
      ctx.fillStyle = pairIdx === undefined ? '#f4f4f8' : accent(pairIdx) + '55'
      roundRectPath(ctx, x, y, cell, cell, 8)
      ctx.fill()
      ctx.strokeStyle = cursor !== null && cursor.r === r && cursor.c === c ? THEME.text : THEME.panelEdge
      ctx.lineWidth = cursor !== null && cursor.r === r && cursor.c === c ? 2.5 : 1
      if (cursor !== null && cursor.r === r && cursor.c === c) glow(ctx, THEME.text, 8)
      ctx.stroke()
      noGlow(ctx)
      ctx.fillStyle = pairIdx === undefined ? '#22222c' : accent(pairIdx)
      ctx.fillText(String(puzzle.grid[r]![c]!), x + cell / 2, y + cell / 2 + 1)
    }
  }

  // 每对一条粗连接线（颜色即淡色底来源）。
  pairs.forEach((pair, i) => {
    drawLink(ctx, order, pair[0], pair[1], accent(i), cell * 0.16)
  })

  // 悬停预览：虚线连接。
  if (hoverPair !== null) {
    ctx.setLineDash([6, 5])
    drawLink(ctx, order, hoverPair[0], hoverPair[1], THEME.text, 3)
    ctx.setLineDash([])
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
