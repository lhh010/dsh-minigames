/**
 * 管道连线 renderer: colored dot pairs, thick rounded path pipes with a
 * bright drag head, the hover cell, HUD, and the win/pause overlays. Uses
 * the shared visual kit (../theme.ts).
 */
import type { CellPaths, FlowPuzzle } from './logic.ts'
import { THEME, drawBackground, glow, noGlow, hudPair, drawOverlay } from '../theme.ts'

const HUD_H = 40
const CELL = 46
const MARGIN = 22

/** What the renderer needs for one frame. */
export interface FlowView {
  puzzle: FlowPuzzle
  paths: CellPaths
  /** Color being dragged, or -1. */
  activeColor: number
  /** Cell under the pointer, or -1. */
  hoverCell: number
  levelLabel: string
  elapsed: string
  /** Connected-pair count over total pairs, e.g. "2/4". */
  connected: string
  solved: boolean
  paused: boolean
}

export function logicalW(size: number): number {
  return MARGIN * 2 + CELL * size
}

export function logicalH(size: number): number {
  return HUD_H + MARGIN * 2 + CELL * size
}

/** Center pixel of a cell index. */
export function cellCenter(size: number, cell: number): { x: number, y: number } {
  const r = Math.floor(cell / size)
  const c = cell % size
  return { x: MARGIN + c * CELL + CELL / 2, y: HUD_H + MARGIN + r * CELL + CELL / 2 }
}

/** Cell index under the pointer, or -1 (generous half-cell tolerance). */
export function cellAt(size: number, x: number, y: number): number {
  const c = Math.floor((x - MARGIN) / CELL)
  const r = Math.floor((y - HUD_H - MARGIN) / CELL)
  if (c < 0 || c >= size || r < 0 || r >= size) return -1
  return r * size + c
}

/** One color's pipe: rounded joints, slight glow, active head highlighted. */
function drawPipe(
  ctx: CanvasRenderingContext2D, size: number, cells: readonly number[], color: string,
  active: boolean, headCell: number,
): void {
  if (cells.length === 1) {
    // Single dot: draw below via dots pass; nothing to stroke.
    return
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.globalAlpha = active ? 0.95 : 0.72
  ctx.lineWidth = CELL * 0.34
  glow(ctx, color, active ? 12 : 6)
  ctx.beginPath()
  const first = cellCenter(size, cells[0]!)
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < cells.length; i += 1) {
    const p = cellCenter(size, cells[i]!)
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  noGlow(ctx)
  ctx.globalAlpha = 1
  if (active) {
    const head = cellCenter(size, headCell)
    ctx.beginPath()
    ctx.arc(head.x, head.y, CELL * 0.16, 0, Math.PI * 2)
    ctx.fillStyle = THEME.text
    ctx.fill()
  }
}

export function renderFlow(ctx: CanvasRenderingContext2D, view: FlowView): void {
  const { puzzle, paths } = view
  const size = puzzle.size
  const w = logicalW(size)
  const h = logicalH(size)
  drawBackground(ctx, w, h)

  // Cell grid.
  ctx.strokeStyle = 'rgba(226,226,238,0.08)'
  ctx.lineWidth = 1
  for (let i = 0; i <= size; i += 1) {
    ctx.beginPath()
    ctx.moveTo(MARGIN, HUD_H + MARGIN + i * CELL)
    ctx.lineTo(w - MARGIN, HUD_H + MARGIN + i * CELL)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(MARGIN + i * CELL, HUD_H + MARGIN)
    ctx.lineTo(MARGIN + i * CELL, h - MARGIN)
    ctx.stroke()
  }

  // Hover highlight.
  if (view.hoverCell >= 0 && !view.solved) {
    const p = cellCenter(size, view.hoverCell)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL)
  }

  // Pipes under dots, active color last so it reads on top.
  const order = paths
    .map((_, c) => c)
    .filter(c => c !== view.activeColor)
  if (view.activeColor >= 0) order.push(view.activeColor)
  for (const c of order) {
    const path = paths[c] ?? null
    if (path === null) continue
    drawPipe(ctx, size, path, THEME.accents[c % THEME.accents.length]!, c === view.activeColor, path[path.length - 1]!)
  }

  // Dots: filled circles at both ends of every pair.
  for (let c = 0; c < puzzle.dots.length; c += 1) {
    const color = THEME.accents[c % THEME.accents.length]!
    for (const dot of puzzle.dots[c]!) {
      const p = cellCenter(size, dot)
      glow(ctx, color, 10)
      ctx.beginPath()
      ctx.arc(p.x, p.y, CELL * 0.26, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      noGlow(ctx)
    }
  }

  hudPair(ctx, MARGIN, 22, `${view.levelLabel} `, `${view.connected} 已连 · ${view.elapsed}`, 'left', THEME.gold)
  hudPair(ctx, w - MARGIN, 22, '解 ', view.puzzle.unique ? '唯一' : '多', 'right', view.puzzle.unique ? THEME.good : THEME.textMuted)

  if (view.solved) {
    drawOverlay(ctx, w, h, '连通！', '即将进入下一关 · R 重开本关', THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, w, h, '已暂停', '面板继续', THEME.text)
  }
}
