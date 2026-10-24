/**
 * Mini Go renderer: dark board with accent grid lines and star points,
 * glowing stones, last-move marker, capture counts, and the end-game overlay
 * with the area score. Uses the shared visual kit (../theme.ts).
 */
import { BLACK, WHITE, areaScore, type GoBoard } from './logic.ts'
import { THEME, drawBackground, glow, noGlow, hudPair, drawOverlay, roundRectPath } from '../theme.ts'

export const SIZE = 9
const MARGIN = 26
const HUD_H = 40
const CELL = 34
export const LOGICAL_W = MARGIN * 2 + CELL * (SIZE - 1)
export const LOGICAL_H = HUD_H + MARGIN * 2 + CELL * (SIZE - 1)

export interface MiniGoView {
  board: GoBoard
  /** Last played point index, or -1. */
  lastMove: number
  levelLabel: string
  captures: { black: number; white: number }
  moves: number
  hover: number
  over: boolean
  winner: 0 | 1 | 2
  blackArea: number
  whiteArea: number
}

const STAR_POINTS = [2, 4, 6]

export function pointX(c: number): number {
  return MARGIN + c * CELL
}

export function pointY(r: number): number {
  return HUD_H + MARGIN + r * CELL
}

/** Board index under the pointer, or -1. */
export function pointAt(x: number, y: number): number {
  const c = Math.round((x - MARGIN) / CELL)
  const r = Math.round((y - HUD_H - MARGIN) / CELL)
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1
  return r * SIZE + c
}

export function renderMiniGo(ctx: CanvasRenderingContext2D, view: MiniGoView): void {
  const { board } = view
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Grid lines.
  ctx.strokeStyle = THEME.textMuted
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < SIZE; i += 1) {
    ctx.moveTo(pointX(0), pointY(i))
    ctx.lineTo(pointX(SIZE - 1), pointY(i))
    ctx.moveTo(pointX(i), pointY(0))
    ctx.lineTo(pointX(i), pointY(SIZE - 1))
  }
  ctx.stroke()

  // Star points.
  ctx.fillStyle = THEME.textMuted
  for (const r of STAR_POINTS) {
    for (const c of STAR_POINTS) {
      ctx.beginPath()
      ctx.arc(pointX(c), pointY(r), 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Hover crosshair.
  if (view.hover >= 0 && !view.over && board.cells[view.hover] === 0) {
    const hr = Math.floor(view.hover / SIZE)
    const hc = view.hover % SIZE
    ctx.strokeStyle = THEME.good
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(pointX(hc) - 12, pointY(hr))
    ctx.lineTo(pointX(hc) + 12, pointY(hr))
    ctx.moveTo(pointX(hc), pointY(hr) - 12)
    ctx.lineTo(pointX(hc), pointY(hr) + 12)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Stones.
  for (let i = 0; i < board.cells.length; i += 1) {
    const v = board.cells[i]!
    if (v === 0) continue
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    const cx = pointX(c)
    const cy = pointY(r)
    const radius = CELL * 0.44
    if (v === BLACK) glow(ctx, '#0a0a12', 8)
    else glow(ctx, '#f2f2fa', 8)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fillStyle = v === BLACK ? '#101018' : '#f4f4fa'
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = v === BLACK ? '#3a3a4e' : '#c8c8d8'
    ctx.lineWidth = 1
    ctx.stroke()
    if (i === view.lastMove) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  hudPair(ctx, LOGICAL_W - MARGIN, 22, `${view.levelLabel} `, `提子 黑${view.captures.black} 白${view.captures.white} · ${view.moves} 手`, 'right', THEME.gold)

  if (view.over) {
    const winnerText = view.winner === BLACK ? '你赢了' : '你输了'
    const detail = `${winnerText} · 黑 ${view.blackArea} : ${view.whiteArea.toFixed(1)} 白（含贴目）· R 重开`
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '终局', detail, view.winner === BLACK ? THEME.good : THEME.bad)
  }
}

/** Rounded-rect helper re-exported for tests that verify geometry helpers. */
export { roundRectPath }
/** Re-exported so the glue can score without importing logic twice. */
export { areaScore }
