/**
 * 四角填方 canvas renderer: an n×n field with area-number clues, committed
 * rectangles as translucent accent blocks, the in-progress drag rectangle,
 * and win/pause overlays. Stateless — state is caller-owned; uses the shared
 * visual kit (../theme.ts).
 */
import type { Rect, ShikakuPuzzle } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const GAP = 6
/** Cell edge shrinks with board size so the whole field fits the canvas. */
export function cellSize(size: number): number {
  return size <= 6 ? 52 : size <= 8 ? 44 : 38
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

/** Top-left corner of cell (r, c) in logical space. */
export function cellOrigin(size: number, r: number, c: number): { x: number; y: number } {
  const cell = cellSize(size)
  return { x: GAP / 2 + c * (cell + GAP), y: HUD_H + GAP / 2 + r * (cell + GAP) }
}

/** Which cell a logical-space point lands on, or null. */
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

/** Pixel rect (x, y, w, h) of a cell-range rect, gaps included. */
export function rectPixels(size: number, rect: Rect): { x: number; y: number; w: number; h: number } {
  const a = cellOrigin(size, rect[0], rect[1])
  const b = cellOrigin(size, rect[2], rect[3])
  const cell = cellSize(size)
  return { x: a.x, y: a.y, w: b.x + cell - a.x, h: b.y + cell - a.y }
}

/**
 * Draw one frame.
 * @param rects - committed rectangles.
 * @param drag - in-progress rect (anchor cell → current cell), or null.
 * @param dragOk - whether the drag rect satisfies its clue (green vs red).
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export function renderShikaku(
  ctx: CanvasRenderingContext2D, puzzle: ShikakuPuzzle, rects: readonly Rect[],
  drag: Rect | null, dragOk: boolean, paused: boolean, winText: string | null,
): void {
  const size = puzzle.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP / 2, 21, '已放 ', rects.length + '/' + puzzle.clues.length)
  hudPair(ctx, w - GAP / 2, 21, '拖拽', '🖱', 'right')

  // Committed rectangles as translucent blocks.
  rects.forEach((rect, i) => {
    const p = rectPixels(size, rect)
    const color = accent(i)
    glow(ctx, color, 6)
    ctx.fillStyle = color + '33'
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 8)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  })

  // Cells + clue numbers.
  ctx.font = '700 ' + Math.floor(cell * 0.4) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const clueMap = new Map(puzzle.clues.map(cl => [cl.cell, cl.area]))
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const { x, y } = cellOrigin(size, r, c)
      ctx.strokeStyle = THEME.panelEdge
      ctx.lineWidth = 1
      roundRectPath(ctx, x, y, cell, cell, 6)
      ctx.stroke()
      const area = clueMap.get(r * size + c)
      if (area !== undefined) {
        ctx.fillStyle = THEME.text
        ctx.fillText(String(area), x + cell / 2, y + cell / 2 + 1)
      }
    }
  }

  // Drag preview on top.
  if (drag !== null) {
    const p = rectPixels(size, drag)
    const color = dragOk ? THEME.good : THEME.bad
    ctx.fillStyle = color + '26'
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 8)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
