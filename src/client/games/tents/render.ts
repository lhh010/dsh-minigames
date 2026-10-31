/**
 * 露营帐篷 canvas renderer: an n×n field of trees/tents with row and column
 * tent-count clues along the edges, a cursor ring, and win/pause overlays.
 * Stateless — all state is caller-owned; uses the shared visual kit
 * (../theme.ts).
 */
import type { TentsPuzzle } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const GAP = 6
/** Cell edge shrinks with board size so the whole field fits the canvas. */
export function cellSize(size: number): number {
  return size <= 6 ? 52 : size <= 8 ? 44 : 38
}
/** Clue strip width (row/col tent counts) on the left and top edges. */
export const CLUE_W = 26
export function boardW(size: number): number {
  const cell = cellSize(size)
  return size * cell + (size - 1) * GAP
}
export function logicalW(size: number): number {
  return boardW(size) + GAP + CLUE_W
}
export function logicalH(size: number): number {
  return HUD_H + CLUE_W + GAP + boardW(size) + GAP + 16
}

export interface Cursor { r: number; c: number }

/** Top-left corner of cell (r, c) in logical space. */
export function cellOrigin(size: number, r: number, c: number): { x: number; y: number } {
  const cell = cellSize(size)
  return { x: GAP / 2 + CLUE_W + c * (cell + GAP), y: HUD_H + GAP / 2 + CLUE_W + r * (cell + GAP) }
}

/** Which cell a logical-space point lands on, or null. */
export function cellAt(size: number, x: number, y: number): number {
  const cell = cellSize(size)
  const origin = cellOrigin(size, 0, 0)
  const c = Math.floor((x - origin.x) / (cell + GAP))
  const r = Math.floor((y - origin.y) / (cell + GAP))
  if (r < 0 || r >= size || c < 0 || c >= size) return -1
  const inX = x - origin.x - c * (cell + GAP)
  const inY = y - origin.y - r * (cell + GAP)
  if (inX > cell || inY > cell) return -1
  return r * size + c
}

/** Center of a cell in logical space (particle bursts). */
export function cellCenter(size: number, cellIdx: number): { x: number; y: number } {
  const { x, y } = cellOrigin(size, Math.floor(cellIdx / size), cellIdx % size)
  const cell = cellSize(size)
  return { x: x + cell / 2, y: y + cell / 2 }
}

/** Draw one stylized tree centered in a cell. */
function drawTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number): void {
  const h = cell * 0.8
  ctx.fillStyle = '#5b3d20'
  ctx.fillRect(cx - cell * 0.06, cy + h * 0.2, cell * 0.12, h * 0.25)
  ctx.fillStyle = '#2f9e44'
  ctx.beginPath()
  ctx.moveTo(cx, cy - h / 2)
  ctx.lineTo(cx + h * 0.3, cy + h * 0.28)
  ctx.lineTo(cx - h * 0.3, cy + h * 0.28)
  ctx.closePath()
  ctx.fill()
}

/** Draw one stylized tent centered in a cell. */
function drawTent(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number): void {
  const h = cell * 0.66
  glow(ctx, THEME.gold, 8)
  ctx.fillStyle = THEME.gold
  ctx.beginPath()
  ctx.moveTo(cx, cy - h / 2)
  ctx.lineTo(cx + h * 0.42, cy + h * 0.4)
  ctx.lineTo(cx - h * 0.42, cy + h * 0.4)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
}

/**
 * Draw one frame.
 * @param tents - placed tent cells.
 * @param cursor - keyboard-focused cell, or -1 to hide the focus ring.
 * @param errors - cells the win check flags (row/col overflow), drawn red.
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export function renderTents(
  ctx: CanvasRenderingContext2D, puzzle: TentsPuzzle, tents: readonly number[],
  cursor: number, errors: readonly number[], paused: boolean, winText: string | null,
): void {
  const size = puzzle.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP / 2, 21, '已搭 ', `${tents.length}/${puzzle.trees.length}`)
  hudPair(ctx, w - GAP / 2, 21, '帐篷', '🟧', 'right')

  const treeSet = new Set(puzzle.trees)
  const tentSet = new Set(tents)
  const errorSet = new Set(errors)

  // Column clues along the top edge.
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let c = 0; c < size; c += 1) {
    const { x, y } = cellOrigin(size, 0, c)
    const count = tents.filter(t => t % size === c).length
    ctx.fillStyle = count === puzzle.colCounts[c] ? THEME.good : (count > puzzle.colCounts[c]! ? THEME.bad : THEME.text)
    ctx.fillText(String(puzzle.colCounts[c]), x + cell / 2, y - GAP / 2 - 8)
  }
  // Row clues along the left edge.
  ctx.textAlign = 'right'
  for (let r = 0; r < size; r += 1) {
    const { x, y } = cellOrigin(size, r, 0)
    const count = tents.filter(t => Math.floor(t / size) === r).length
    ctx.fillStyle = count === puzzle.rowCounts[r] ? THEME.good : (count > puzzle.rowCounts[r]! ? THEME.bad : THEME.text)
    ctx.fillText(String(puzzle.rowCounts[r]), x - GAP / 2 - 4, y + cell / 2)
  }

  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    ctx.fillStyle = (r + c) % 2 === 0 ? THEME.panel : accent(1)
    roundRectPath(ctx, x, y, cell, cell, 8)
    ctx.fill()
    ctx.strokeStyle = errorSet.has(cellIdx) ? THEME.bad : THEME.panelEdge
    ctx.lineWidth = cursor === cellIdx ? 2.5 : 1
    if (cursor === cellIdx) glow(ctx, THEME.text, 8)
    ctx.stroke()
    noGlow(ctx)
    if (treeSet.has(cellIdx)) drawTree(ctx, x + cell / 2, y + cell / 2, cell)
    else if (tentSet.has(cellIdx)) drawTent(ctx, x + cell / 2, y + cell / 2, cell)
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
