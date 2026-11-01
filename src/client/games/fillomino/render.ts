/**
 * 装填方块 canvas 渲染器：n×n 数字盘、空格白底、已填格按数字着淡色、
 * clue 锁定格加粗提亮、光标描边、异值相邻边描线（勾勒同数连通组轮廓）、
 * HUD 与过关/暂停遮罩。无状态 —— 状态由调用方持有；使用共享视觉件
 * (../theme.ts)。
 */
import type { FilloPuzzle } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const GAP = 6

/** 格边长随盘面增大而缩小，保证整盘落在画布内。 */
export function cellSize(size: number): number {
  return size <= 6 ? 48 : size <= 7 ? 44 : size <= 8 ? 40 : size <= 9 ? 36 : 32
}

export function boardW(size: number): number {
  const cell = cellSize(size)
  return size * cell + (size - 1) * GAP
}

export function logicalW(size: number): number {
  return boardW(size) + GAP
}

export function logicalH(size: number): number {
  return HUD_H + GAP + boardW(size) + GAP + 16
}

/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export function cellOrigin(size: number, r: number, c: number): { x: number; y: number } {
  const cell = cellSize(size)
  return { x: GAP / 2 + c * (cell + GAP), y: HUD_H + GAP / 2 + r * (cell + GAP) }
}

/** 逻辑坐标点命中的格，格 外返回 null。 */
export function cellAt(size: number, x: number, y: number): { r: number; c: number } | null {
  const cell = cellSize(size)
  const origin = cellOrigin(size, 0, 0)
  const c = Math.floor((x - origin.x) / (cell + GAP))
  const r = Math.floor((y - origin.y) / (cell + GAP))
  if (r < 0 || r >= size || c < 0 || c >= size) return null
  const inX = x - origin.x - c * (cell + GAP)
  const inY = y - origin.y - r * (cell + GAP)
  if (inX > cell || inY > cell) return null
  return { r, c }
}

/** 格 中心在逻辑坐标中的位置（粒子爆发用）。 */
export function cellCenter(size: number, r: number, c: number): { x: number; y: number } {
  const { x, y } = cellOrigin(size, r, c)
  const cell = cellSize(size)
  return { x: x + cell / 2, y: y + cell / 2 }
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡盘面。
 * @param grid - 玩家填数（0 为空，clue 格已置锁定值）。
 * @param cursor - 光标格下标，-1 隐藏光标环。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标（金色描边），-1 为无提示。
 */
export function renderFillo(
  ctx: CanvasRenderingContext2D, puzzle: FilloPuzzle, grid: readonly number[],
  cursor: number, paused: boolean, winText: string | null, hintCell = -1,
): void {
  const size = puzzle.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  let filled = 0
  for (let i = 0; i < size * size; i += 1) if ((grid[i] ?? 0) !== 0) filled += 1
  hudPair(ctx, GAP / 2, 21, '已填 ', filled + '/' + size * size)
  hudPair(ctx, w - GAP / 2, 21, '规则', '同数连通=数值', 'right')

  ctx.font = '700 ' + Math.floor(cell * 0.42) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    const v = grid[cellIdx] ?? 0
    const clue = puzzle.clues.get(cellIdx)
    if (v === 0) {
      // 空格：白底。
      ctx.fillStyle = '#e8e8f0'
    } else if (clue !== undefined) {
      // clue 锁定格：数字淡底的稍亮版本（叠加半透明白）。
      ctx.fillStyle = accent(v % 8)
      roundRectPath(ctx, x, y, cell, cell, 8)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
    } else {
      ctx.fillStyle = accent(v % 8)
      ctx.globalAlpha = 0.55
      roundRectPath(ctx, x, y, cell, cell, 8)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = 'transparent'
    }
    if (v === 0 || clue !== undefined) {
      roundRectPath(ctx, x, y, cell, cell, 8)
      ctx.fill()
    }
    ctx.strokeStyle = cursor === cellIdx ? THEME.text : THEME.panelEdge
    ctx.lineWidth = cursor === cellIdx ? 2.5 : 1
    if (cursor === cellIdx) glow(ctx, THEME.text, 8)
    ctx.stroke()
    noGlow(ctx)
    if (v !== 0) {
      ctx.font = (clue !== undefined ? '800 ' : '700 ') + Math.floor(cell * 0.42) + 'px system-ui, sans-serif'
      ctx.fillStyle = clue !== undefined ? '#0d0d16' : '#14141f'
      ctx.fillText(String(v), x + cell / 2, y + cell / 2 + 1)
    }
    if (hintCell === cellIdx) {
      glow(ctx, THEME.gold, 10)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2.5
      roundRectPath(ctx, x + 3, y + 3, cell - 6, cell - 6, 6)
      ctx.stroke()
      noGlow(ctx)
    }
  }

  // 同数连通组轮廓：只在值不同的相邻格共享边上画同色描边。
  ctx.lineWidth = 2
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const v = grid[cellIdx] ?? 0
    if (v === 0) continue
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    ctx.strokeStyle = accent(v % 8)
    const right = c + 1 < size ? grid[cellIdx + 1] ?? 0 : -1
    const down = r + 1 < size ? grid[cellIdx + size] ?? 0 : -1
    if (right !== v) {
      ctx.beginPath()
      ctx.moveTo(x + cell, y + 1)
      ctx.lineTo(x + cell, y + cell - 1)
      ctx.stroke()
    }
    if (down !== v) {
      ctx.beginPath()
      ctx.moveTo(x + 1, y + cell)
      ctx.lineTo(x + cell - 1, y + cell)
      ctx.stroke()
    }
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
