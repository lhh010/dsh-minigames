/**
 * Slitherlink renderer: clue numbers in cells, edge segments with line/cross
 * states, the hover highlight, HUD, and the win overlay. Edges are drawn as
 * segments between lattice dots. Uses the shared visual kit (../theme.ts).
 */
import { cellEdges, edgeCount, hEdgeIndex, vEdgeIndex, type Clue, type EdgeState } from './logic.ts'
import { THEME, drawBackground, glow, noGlow, hudPair, drawOverlay } from '../theme.ts'

const HUD_H = 40
const CELL = 46
const MARGIN = 22

export interface SlitherlinkView {
  w: number
  h: number
  clues: Clue[]
  edges: EdgeState[]
  /** Edge index under the pointer, or -1. */
  hover: number
  levelLabel: string
  unique: boolean
  elapsed: string
  solved: boolean
  paused: boolean
}

export function logicalW(w: number): number {
  return MARGIN * 2 + CELL * w
}

export function logicalH(h: number): number {
  return HUD_H + MARGIN * 2 + CELL * h
}

/** Pixel position of lattice dot (col, row). */
export function dotX(col: number): number {
  return MARGIN + col * CELL
}

export function dotY(row: number): number {
  return HUD_H + MARGIN + row * CELL
}

/** Edge index under the pointer, or -1. */
export function edgeAt(w: number, h: number, x: number, y: number): number {
  if (y < HUD_H) return -1
  const fx = (x - MARGIN) / CELL
  const fy = (y - HUD_H - MARGIN) / CELL
  // Reject outside the lattice rectangle in FLOAT space: rounding first would
  // admit points just past the last row/column into the boundary bands.
  if (fx < -0.25 || fx > w + 0.25 || fy < -0.25 || fy > h + 0.25) return -1
  const col = Math.floor(fx)
  const row = Math.floor(fy)
  const dx = fx - col
  const dy = fy - row
  const nearH = Math.abs(dy) < 0.25
  const nearV = Math.abs(dx) < 0.25
  // Horizontal edges live between dot rows (0..h); vertical edges between dot
  // columns (0..w).
  if (nearH && !nearV && row >= 0 && row <= h && col >= 0 && col < w) return hEdgeIndex(w, h, col, row)
  if (nearV && !nearH && col >= 0 && col <= w && row >= 0 && row < h) return vEdgeIndex(w, h, col, row)
  return -1
}

/** Endpoints of an edge index. */
function edgeEnds(w: number, h: number, i: number): [number, number, number, number] {
  const hCount = (w + 1) * h
  if (i < hCount) {
    const row = Math.floor(i / (w + 1))
    const col = i % (w + 1)
    return [dotX(col), dotY(row), dotX(col + 1), dotY(row)]
  }
  const j = i - hCount
  const row = Math.floor(j / w)
  const col = j % w
  return [dotX(col), dotY(row), dotX(col), dotY(row + 1)]
}

export function renderSlitherlink(ctx: CanvasRenderingContext2D, view: SlitherlinkView): void {
  const { w, h, clues, edges } = view
  drawBackground(ctx, logicalW(w), logicalH(h))

  // Lattice dots.
  ctx.fillStyle = THEME.textMuted
  for (let r = 0; r <= h; r += 1) {
    for (let c = 0; c <= w; c += 1) {
      ctx.beginPath()
      ctx.arc(dotX(c), dotY(r), 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Clues.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '700 15px system-ui, sans-serif'
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      const clue = clues[r * w + c]!
      if (clue < 0) continue
      const es = cellEdges(w, h, c, r)
      const n = es.filter(i => edges[i] === 1).length
      ctx.fillStyle = n === clue ? THEME.good : THEME.text
      ctx.fillText(String(clue), dotX(c) + CELL / 2, dotY(r) + CELL / 2)
    }
  }

  // Edges.
  for (let i = 0; i < edgeCount(w, h); i += 1) {
    const v = edges[i]!
    if (v === 0) {
      if (i === view.hover) {
        const [x1, y1, x2, y2] = edgeEnds(w, h, i)
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      continue
    }
    const [x1, y1, x2, y2] = edgeEnds(w, h, i)
    if (v === 1) {
      glow(ctx, THEME.good, 8)
      ctx.strokeStyle = THEME.good
      ctx.lineWidth = 3.5
    } else {
      ctx.strokeStyle = THEME.bad
      ctx.lineWidth = 1.6
    }
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    noGlow(ctx)
    if (v === 2) {
      // Cross mark.
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      const horizontal = y1 === y2
      ctx.beginPath()
      if (horizontal) {
        ctx.moveTo(mx - 4, my - 4)
        ctx.lineTo(mx + 4, my + 4)
        ctx.moveTo(mx + 4, my - 4)
        ctx.lineTo(mx - 4, my + 4)
      } else {
        ctx.moveTo(mx - 4, my - 4)
        ctx.lineTo(mx + 4, my + 4)
        ctx.moveTo(mx - 4, my + 4)
        ctx.lineTo(mx + 4, my - 4)
      }
      ctx.stroke()
    }
  }

  hudPair(ctx, logicalW(w) - MARGIN, 22, `${view.levelLabel} `, `${view.unique ? '唯一解' : '多解'} · ${view.elapsed}`, 'right', THEME.gold)

  if (view.solved) {
    drawOverlay(ctx, logicalW(w), logicalH(h), '解开！', '即将进入下一关 · R 重开本关', THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, logicalW(w), logicalH(h), '已暂停', '面板继续', THEME.text)
  }
}
