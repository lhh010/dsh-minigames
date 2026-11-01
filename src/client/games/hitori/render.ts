/**
 * 记独 canvas 渲染器：n×n 数字盘、玩家涂黑格、光标环、重复白格红色数字
 * 提示与过关/暂停遮罩。无状态 —— 状态由调用方持有；使用共享视觉件
 * (../theme.ts)。
 */
import type { HitoriPuzzle } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const GAP = 6

/** 格边长随盘面增大而缩小，保证整盘落在画布内。 */
export function cellSize(size: number): number {
  return size <= 5 ? 54 : size <= 6 ? 48 : size <= 7 ? 42 : 40
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
 * 某行或某列的白格中是否还有与本值相同的白格（重复提示用）。
 */
function hasDuplicate(puzzle: HitoriPuzzle, blacks: ReadonlySet<number>, r: number, c: number): boolean {
  const v = puzzle.grid[r]![c]!
  for (let c2 = 0; c2 < puzzle.size; c2 += 1) {
    if (c2 !== c && !blacks.has(r * puzzle.size + c2) && puzzle.grid[r]![c2] === v) return true
  }
  for (let r2 = 0; r2 < puzzle.size; r2 += 1) {
    if (r2 !== r && !blacks.has(r2 * puzzle.size + c) && puzzle.grid[r2]![c] === v) return true
  }
  return false
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡盘面。
 * @param blacks - 玩家已涂黑格集合。
 * @param cursor - 光标格下标，-1 隐藏光标环。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCells - 提示覆盖：应涂黑格的金色描边，空数组为无提示。
 */
export function renderHitori(
  ctx: CanvasRenderingContext2D, puzzle: HitoriPuzzle, blacks: ReadonlySet<number>,
  cursor: number, paused: boolean, winText: string | null, hintCells: readonly number[] = [],
): void {
  const size = puzzle.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP / 2, 21, '已涂 ', String(blacks.size))
  hudPair(ctx, w - GAP / 2, 21, '规则', '白不重复', 'right')

  const hintSet = new Set(hintCells)
  ctx.font = '700 ' + Math.floor(cell * 0.42) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    const isBlack = blacks.has(cellIdx)
    if (isBlack) {
      ctx.fillStyle = '#26263a'
      roundRectPath(ctx, x, y, cell, cell, 8)
      ctx.fill()
      ctx.strokeStyle = cursor === cellIdx ? THEME.text : THEME.panelEdge
      ctx.lineWidth = cursor === cellIdx ? 2.5 : 1
      if (cursor === cellIdx) glow(ctx, THEME.text, 8)
      ctx.stroke()
      noGlow(ctx)
    } else {
      ctx.fillStyle = THEME.panel
      roundRectPath(ctx, x, y, cell, cell, 8)
      ctx.fill()
      ctx.strokeStyle = cursor === cellIdx ? THEME.text : THEME.panelEdge
      ctx.lineWidth = cursor === cellIdx ? 2.5 : 1
      if (cursor === cellIdx) glow(ctx, THEME.text, 8)
      ctx.stroke()
      noGlow(ctx)
      ctx.fillStyle = hasDuplicate(puzzle, blacks, r, c) ? THEME.bad : THEME.text
      ctx.fillText(String(puzzle.grid[r]![c]!), x + cell / 2, y + cell / 2 + 1)
    }
    if (hintSet.has(cellIdx)) {
      glow(ctx, THEME.gold, 10)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2.5
      roundRectPath(ctx, x + 3, y + 3, cell - 6, cell - 6, 6)
      ctx.stroke()
      noGlow(ctx)
    }
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
