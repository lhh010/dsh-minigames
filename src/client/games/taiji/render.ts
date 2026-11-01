/**
 * 太极 canvas 渲染器：黑白圆点 tile（黑子深底、白子亮底），白圈预置格
 * 加白环标记，冲突行列/相邻同色格红描边，金色提示环，HUD 与过关/暂停
 * 遮罩。无状态 —— 状态由调用方持有；使用共享视觉件 (../theme.ts)。
 */
import { BLACK, WHITE, EMPTY, type CellValue, findConflicts, type TaijiPuzzle } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const GAP = 6

/** 格边长随盘面增大而缩小，保证整盘落在画布内。 */
export function cellSize(size: number): number {
  return size <= 4 ? 56 : size <= 6 ? 44 : 34
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
 * 画一枚太极圆点 tile：黑子深色圆带暗环，白子亮色圆带暗描边。
 */
const drawDot = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, v: CellValue): void => {
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  if (v === BLACK) {
    ctx.fillStyle = '#15151f'
    ctx.fill()
    ctx.strokeStyle = 'rgba(122,162,247,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
  } else {
    ctx.fillStyle = '#eaeaf2'
    ctx.fill()
    ctx.strokeStyle = 'rgba(13,13,20,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡盘面。
 * @param grid - 玩家盘面（0 空 / 1 黑 / 2 白，给定格已置锁定值）。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标（金色描边），-1 为无提示。
 */
export function renderTaiji(
  ctx: CanvasRenderingContext2D, puzzle: TaijiPuzzle, grid: readonly CellValue[],
  paused: boolean, winText: string | null, hintCell = -1,
): void {
  const size = puzzle.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  let placed = 0
  for (let i = 0; i < size * size; i += 1) if ((grid[i] ?? EMPTY) !== EMPTY) placed += 1
  hudPair(ctx, GAP / 2, 21, '已放 ', placed + '/' + size * size)
  hudPair(ctx, w - GAP / 2, 21, '规则', '行列各半·相邻异色', 'right')

  const conflicts = winText === null && !paused ? findConflicts(size, grid) : null
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    const v = grid[cellIdx] ?? EMPTY
    const clue = puzzle.clues.get(cellIdx)
    const conflict = conflicts !== null && conflicts.cells.has(cellIdx)

    roundRectPath(ctx, x, y, cell, cell, 10)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = conflict ? THEME.bad : THEME.panelEdge
    ctx.lineWidth = conflict ? 2 : 1
    if (conflict) glow(ctx, THEME.bad, 6)
    ctx.stroke()
    noGlow(ctx)

    if (v === EMPTY) {
      // 空格：暗淡虚圈占位，白圈给定格仍加白环提示必须放置。
      ctx.beginPath()
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(226,226,238,0.18)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else {
      drawDot(ctx, x + cell / 2, y + cell / 2, cell * 0.36, v)
    }
    if (clue !== undefined) {
      // 白圈预置标记：给定格外圈白环。
      ctx.beginPath()
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.44, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(234,234,242,0.9)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    if (hintCell === cellIdx) {
      glow(ctx, THEME.gold, 10)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2.5
      roundRectPath(ctx, x + 3, y + 3, cell - 6, cell - 6, 7)
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
