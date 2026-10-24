/**
 * Slitherlink renderer: clue numbers in cells, edge segments with line/cross
 * states, the hover highlight, HUD, and the win overlay. Edges are drawn as
 * segments between lattice dots. Uses the shared visual kit (../theme.ts).
 */
import { cellEdges, checkClues, edgeCount, hEdgeIndex, vEdgeIndex, type Clue, type EdgeState } from './logic.ts'
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
  /** Every clue cell exactly satisfied (drives the "close the loop" hint). */
  cluesAllSatisfied: boolean
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

/** Edge index under the pointer, or -1.
 *
 * Nearest-edge matching: convert the pointer to lattice-float coordinates,
 * then pick the closest edge element (horizontal or vertical) within
 * HIT_CELLS of a cell; ties break toward the closer axis. This is robust
 * against small coordinate drift (CSS border, subpixel scaling) that a
 * fixed-band test can miss near the outer rows. */
export function edgeAt(w: number, h: number, x: number, y: number): number {
  if (y < HUD_H) return -1
  const fx = (x - MARGIN) / CELL
  const fy = (y - HUD_H - MARGIN) / CELL
  // Outside the lattice rectangle (with the same tolerance): nothing.
  if (fx < -HIT_CELLS || fx > w + HIT_CELLS || fy < -HIT_CELLS || fy > h + HIT_CELLS) return -1
  // Candidate horizontal edge: dot row round(fy), column floor(fx).
  const hRow = Math.round(fy)
  const hCol = Math.floor(fx)
  // Candidate vertical edge: dot column round(fx), row floor(fy).
  const vCol = Math.round(fx)
  const vRow = Math.floor(fy)
  const distH = hRow >= 0 && hRow <= h && hCol >= 0 && hCol < w ? Math.abs(fy - hRow) : Infinity
  const distV = vCol >= 0 && vCol <= w && vRow >= 0 && vRow < h ? Math.abs(fx - vCol) : Infinity
  // Prefer the closer candidate; a strict tie prefers horizontal.
  if (distH <= distV) {
    if (distH <= HIT_CELLS) return hEdgeIndex(w, h, hCol, hRow)
  } else if (distV <= HIT_CELLS) {
    return vEdgeIndex(w, h, vCol, vRow)
  }
  return -1
}

/** Hit tolerance in cell units (0.30 of a cell ≈ 14 px at CELL 46). */
const HIT_CELLS = 0.30

/** Endpoints of an edge index. */
function edgeEnds(w: number, h: number, i: number): [number, number, number, number] {
  const hCount = w * (h + 1)
  if (i < hCount) {
    const row = Math.floor(i / w)
    const col = i % w
    return [dotX(col), dotY(row), dotX(col + 1), dotY(row)]
  }
  const j = i - hCount
  const row = Math.floor(j / (w + 1))
  const col = j % (w + 1)
  return [dotX(col), dotY(row), dotX(col), dotY(row + 1)]
}

/** The two dot indices an edge index connects (render-side twin of logic's edgeDots). */
function edgeDotsOf(w: number, h: number, i: number): [number, number] {
  const hCount = w * (h + 1)
  if (i < hCount) {
    const row = Math.floor(i / w)
    const col = i % w
    const a = row * (w + 1) + col
    return [a, a + 1]
  }
  const j = i - hCount
  const row = Math.floor(j / (w + 1))
  const col = j % (w + 1)
  const a = row * (w + 1) + col
  return [a, a + (w + 1)]
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

  // Open-endpoint markers: dots with line-degree ≠ 2 pulse gold. This is the
  // "not a single closed loop yet" tell — even when every clue is green.
  const dotDegree = new Map<number, number>()
  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i] !== 1) continue
    for (const d of edgeDotsOf(w, h, i)) dotDegree.set(d, (dotDegree.get(d) ?? 0) + 1)
  }
  for (const [dot, deg] of dotDegree) {
    if (deg === 2) continue
    const col = dot % (w + 1)
    const row = Math.floor(dot / (w + 1))
    ctx.beginPath()
    ctx.arc(dotX(col), dotY(row), 5, 0, Math.PI * 2)
    ctx.fillStyle = deg === 1 ? THEME.gold : THEME.bad
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1
  }
  // Non-solved hint in the HUD when all clues are green but the loop is open.
  if (!view.solved && view.cluesAllSatisfied && dotDegree.size > 0) {
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText('线索已全部满足——还需闭合成一个环', logicalW(w) / 2, logicalH(h) - 8)
  }

  hudPair(ctx, logicalW(w) - MARGIN, 22, `${view.levelLabel} `, `${view.unique ? '唯一解' : '多解'} · ${view.elapsed}`, 'right', THEME.gold)

  if (view.solved) {
    drawOverlay(ctx, logicalW(w), logicalH(h), '解开！', '即将进入下一关 · R 重开本关', THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, logicalW(w), logicalH(h), '已暂停', '面板继续', THEME.text)
  }
}
