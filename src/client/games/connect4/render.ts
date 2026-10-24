/**
 * Connect Four renderer: board frame, glowing discs, column hover, the
 * last-move ring, the winning-line pulse, and the HUD/overlays. Uses the
 * shared visual kit (../theme.ts).
 */
import { COLS, ROWS, RED, toColRow, type Board } from './logic.ts'
import { THEME, drawBackground, glow, noGlow, roundRectPath, hudPair, drawOverlay } from '../theme.ts'

const MARGIN = 20
const HUD_H = 40
const CELL = 52
export const LOGICAL_W = MARGIN * 2 + CELL * COLS
export const LOGICAL_H = HUD_H + MARGIN * 2 + CELL * ROWS

export interface Connect4View {
  board: Board
  /** Column under the pointer, or -1. */
  hoverCol: number
  lastMove: number
  levelLabel: string
  record: { w: number; d: number; l: number }
  result: 'playing' | 'red' | 'yellow' | 'draw'
  winCells: readonly number[] | null
}

export function cellX(col: number): number {
  return MARGIN + col * CELL
}

export function cellY(row: number): number {
  return HUD_H + MARGIN + (ROWS - 1 - row) * CELL
}

/** Column under the pointer, or -1. */
export function colAt(x: number, y: number): number {
  if (y < HUD_H) return -1
  const c = Math.floor((x - MARGIN) / CELL)
  return c >= 0 && c < COLS ? c : -1
}

export function renderConnect4(ctx: CanvasRenderingContext2D, view: Connect4View): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Column hover highlight.
  if (view.hoverCol >= 0 && view.result === 'playing') {
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(cellX(view.hoverCol), HUD_H, CELL, MARGIN * 2 + CELL * ROWS)
  }

  // Holes.
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const cx = cellX(c) + CELL / 2
      const cy = cellY(r) + CELL / 2
      ctx.beginPath()
      ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = '#0c0c12'
      ctx.fill()
      ctx.strokeStyle = '#26262e'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // Discs.
  for (let i = 0; i < view.board.length; i += 1) {
    const v = view.board[i]!
    if (v === 0) continue
    const { col, row } = toColRow(i)
    const cx = cellX(col) + CELL / 2
    const cy = cellY(row) + CELL / 2
    if (v === RED) glow(ctx, '#ff5a6e', 10)
    else glow(ctx, '#ffd24a', 10)
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 0.38, 0, Math.PI * 2)
    ctx.fillStyle = v === RED ? '#ff5a6e' : '#ffd24a'
    ctx.fill()
    noGlow(ctx)
    if (i === view.lastMove) {
      ctx.beginPath()
      ctx.arc(cx, cy, CELL * 0.44, 0, Math.PI * 2)
      ctx.strokeStyle = THEME.text
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // Winning line pulse.
  if (view.winCells !== null && view.winCells.length === 4) {
    const pts = view.winCells.map(i => {
      const p = toColRow(i)
      return [cellX(p.col) + CELL / 2, cellY(p.row) + CELL / 2] as [number, number]
    })
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(pts[0]![0], pts[0]![1])
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1])
    ctx.stroke()
  }

  hudPair(ctx, LOGICAL_W - MARGIN, 22, `${view.levelLabel} `, `战绩 ${view.record.w}胜 ${view.record.d}平 ${view.record.l}负`, 'right', THEME.gold)

  if (view.result === 'red') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '你赢了！', '即将进入下一关 · R 重开', THEME.good)
  else if (view.result === 'yellow') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '你输了', '同一关再来 · R 重开', THEME.bad)
  else if (view.result === 'draw') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '平局', 'R 重开', THEME.text)
}
