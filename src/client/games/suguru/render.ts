/**
 * 数块 canvas 渲染器：连续格子盘（无格缝），区域按 accent 轮换淡色
 * 底，区域之间画粗边界线；数字格（给定格加粗提亮）、光标描边、冲突
 * 红字、提示格金色闪显应填值、HUD（关卡/已填/规则/多解徽章）与过关/
 * 暂停遮罩。无状态 —— 状态由调用方持有；使用共享视觉件 (../theme.ts)。
 */
import type { SuguruPuzzle } from './logic.ts'
import { findConflicts } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const PAD = 12

/** 格边长随盘面增大而缩小。 */
export function cellSize(size: number): number {
  return size <= 5 ? 56 : size <= 6 ? 52 : size <= 7 ? 47 : size <= 8 ? 42 : 38
}

export function boardW(size: number): number {
  return size * cellSize(size)
}

export function logicalW(size: number): number {
  return boardW(size) + PAD * 2
}

export function logicalH(size: number): number {
  return HUD_H + PAD + boardW(size) + PAD + 16
}

/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export function cellOrigin(size: number, r: number, c: number): { x: number; y: number } {
  const cell = cellSize(size)
  return { x: PAD + c * cell, y: HUD_H + PAD + r * cell }
}

/** 逻辑坐标点命中的格，格外返回 null。 */
export function cellAt(size: number, x: number, y: number): { r: number; c: number } | null {
  const cell = cellSize(size)
  const c = Math.floor((x - PAD) / cell)
  const r = Math.floor((y - HUD_H - PAD) / cell)
  if (r < 0 || r >= size || c < 0 || c >= size) return null
  if (x - PAD - c * cell > cell || y - HUD_H - PAD - r * cell > cell) return null
  return { r, c }
}

/** 格中心（粒子爆发用）。 */
export function cellCenter(size: number, r: number, c: number): { x: number; y: number } {
  const { x, y } = cellOrigin(size, r, c)
  const cell = cellSize(size)
  return { x: x + cell / 2, y: y + cell / 2 }
}

/** 区域间边界线宽。 */
const REGION_EDGE = 3
/** 同区域格间细线宽。 */
const CELL_EDGE = 1

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡。
 * @param grid - 玩家填数（0 为空，给定格已置锁定值）。
 * @param level - 展示关卡号（1 基）。
 * @param cursor - 光标格下标，-1 隐藏。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标（金色描边 + 闪显应填值），-1 为无。
 */
export function renderSuguru(
  ctx: CanvasRenderingContext2D, puzzle: SuguruPuzzle, grid: readonly number[], level: number,
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
  hudPair(ctx, PAD, 21, '关卡 ', String(level))
  hudPair(ctx, PAD + 92, 21, '已填 ', filled + '/' + size * size)
  hudPair(ctx, w - PAD, 21, '规则', '区域不重 · 邻格不同', 'right')
  if (!puzzle.unique) {
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = THEME.gold
    ctx.fillText('多解', w - PAD - 132, 21)
  }

  const conflicts = new Set(findConflicts(puzzle, grid))
  const boardX = PAD
  const boardY = HUD_H + PAD

  // 区域淡色底 + 数字。
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    const v = grid[cellIdx] ?? 0
    const given = puzzle.givens.has(cellIdx)
    ctx.fillStyle = accent(puzzle.region[cellIdx]! % 8)
    ctx.globalAlpha = given ? 0.55 : 0.3
    ctx.fillRect(x, y, cell, cell)
    ctx.globalAlpha = 1
    if (given) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(x, y, cell, cell)
    }
    if (v !== 0) {
      ctx.font = (given ? '800 ' : '700 ') + Math.floor(cell * 0.46) + 'px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = conflicts.has(cellIdx) ? THEME.bad : '#12121c'
      ctx.fillText(String(v), x + cell / 2, y + cell / 2 + 1)
    }
  }

  // 边界线：同区域格间细线，跨区域粗亮线，外圈整框。
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    const id = puzzle.region[cellIdx]!
    const rightId = c + 1 < size ? puzzle.region[cellIdx + 1]! : -1
    const downId = r + 1 < size ? puzzle.region[cellIdx + size]! : -1
    ctx.lineWidth = CELL_EDGE
    ctx.strokeStyle = 'rgba(226,226,238,0.14)'
    ctx.beginPath()
    ctx.moveTo(x, y + cell)
    ctx.lineTo(x + cell, y + cell)
    ctx.moveTo(x + cell, y)
    ctx.lineTo(x + cell, y + cell)
    ctx.stroke()
    ctx.lineWidth = REGION_EDGE
    ctx.strokeStyle = 'rgba(226,226,238,0.75)'
    ctx.beginPath()
    if (rightId !== id) {
      ctx.moveTo(x + cell - REGION_EDGE / 2, y)
      ctx.lineTo(x + cell - REGION_EDGE / 2, y + cell)
    }
    if (downId !== id) {
      ctx.moveTo(x, y + cell - REGION_EDGE / 2)
      ctx.lineTo(x + cell, y + cell - REGION_EDGE / 2)
    }
    ctx.stroke()
  }
  ctx.lineWidth = REGION_EDGE
  ctx.strokeStyle = 'rgba(226,226,238,0.85)'
  roundRectPath(ctx, boardX + REGION_EDGE / 2, boardY + REGION_EDGE / 2,
    boardW(size) - REGION_EDGE, boardW(size) - REGION_EDGE, 6)
  ctx.stroke()

  // 光标。
  if (cursor >= 0) {
    const r = Math.floor(cursor / size)
    const c = cursor % size
    const { x, y } = cellOrigin(size, r, c)
    glow(ctx, THEME.text, 10)
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 2.5
    roundRectPath(ctx, x + 2, y + 2, cell - 4, cell - 4, 6)
    ctx.stroke()
    noGlow(ctx)
  }

  // 提示：金色内框 + 闪显应填值（空格也显示）。
  if (hintCell >= 0) {
    const r = Math.floor(hintCell / size)
    const c = hintCell % size
    const { x, y } = cellOrigin(size, r, c)
    glow(ctx, THEME.gold, 10)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2.5
    roundRectPath(ctx, x + 4, y + 4, cell - 8, cell - 8, 6)
    ctx.stroke()
    noGlow(ctx)
    ctx.font = '800 ' + Math.floor(cell * 0.46) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = THEME.gold
    ctx.fillText(String(puzzle.solution[hintCell]!), x + cell / 2, y + cell / 2 + 1)
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
