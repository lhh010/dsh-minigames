/**
 * Chess renderer: checkered 8x8 board, unicode pieces, selection + legal-move
 * highlights, last-move markers, check ring, promotion picker, HUD and
 * overlays. Uses the shared visual kit (../theme.ts).
 */
import { colorOf, fileOf, onBoard, rankOf, type Move, type Piece, type Position } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const MARGIN = 20
const HUD_H = 40
const CELL = 52
export const LOGICAL_W = MARGIN * 2 + CELL * 8
export const LOGICAL_H = HUD_H + MARGIN * 2 + CELL * 8

const GLYPH: Record<Piece, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

export interface ChessView {
  pos: Position
  /** Selected square (0x88) or -1. */
  selected: number
  /** Destination squares of the selected piece's legal moves. */
  targets: ReadonlySet<number>
  lastMove: Move | null
  /** King square currently in check, or -1. */
  checkSquare: number
  levelLabel: string
  /** Overlay title, or null while playing. */
  statusText: string | null
  statusSub: string
  statusColor: string
  paused: boolean
  /** Pending promotion: piece traveled from→to, picker shown until chosen. */
  promotion: { from: number; to: number; white: boolean } | null
  thinking: boolean
}

export function squareX(s: number): number {
  return MARGIN + fileOf(s) * CELL
}

export function squareY(s: number): number {
  return HUD_H + MARGIN + (7 - rankOf(s)) * CELL
}

/** 0x88 square under the pointer, or -1. */
export function squareAt(x: number, y: number): number {
  if (x < MARGIN || x >= MARGIN + CELL * 8 || y < HUD_H + MARGIN || y >= HUD_H + MARGIN + CELL * 8) return -1
  const f = Math.floor((x - MARGIN) / CELL)
  const r = 7 - Math.floor((y - HUD_H - MARGIN) / CELL)
  return r * 16 + f
}

const PROMO_PIECES = ['q', 'r', 'b', 'n'] as const
export type PromoPick = (typeof PROMO_PIECES)[number]

/** Promotion-picker button under the pointer, or null (picker at the top rank). */
export function promotionAt(x: number, y: number): PromoPick | null {
  const w = 56
  const h = 56
  const x0 = (LOGICAL_W - w * 4) / 2
  const y0 = LOGICAL_H / 2 - h / 2
  if (y < y0 || y >= y0 + h) return null
  const i = Math.floor((x - x0) / w)
  if (i < 0 || i >= 4) return null
  return PROMO_PIECES[i]!
}

function drawPromotionPicker(ctx: CanvasRenderingContext2D, white: boolean): void {
  const w = 56
  const h = 56
  const x0 = (LOGICAL_W - w * 4) / 2
  const y0 = LOGICAL_H / 2 - h / 2
  ctx.fillStyle = 'rgba(13,13,20,0.6)'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  for (let i = 0; i < 4; i += 1) {
    const x = x0 + i * w
    roundRectPath(ctx, x + 4, y0 + 4, w - 8, h - 8, 8)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    const glyph = GLYPH[(white ? PROMO_PIECES[i]!.toUpperCase() : PROMO_PIECES[i]!) as Piece]
    ctx.font = '38px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = THEME.text
    ctx.fillText(glyph, x + w / 2, y0 + h / 2 + 2)
  }
  ctx.textBaseline = 'alphabetic'
}

export function renderChess(ctx: CanvasRenderingContext2D, view: ChessView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Squares.
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      const x = MARGIN + f * CELL
      const y = HUD_H + MARGIN + (7 - r) * CELL
      ctx.fillStyle = (r + f) % 2 === 0 ? '#2b2b3a' : '#1b1b26'
      ctx.fillRect(x, y, CELL, CELL)
    }
  }

  // Last-move markers.
  if (view.lastMove !== null) {
    ctx.fillStyle = 'rgba(224,175,104,0.22)'
    ctx.fillRect(squareX(view.lastMove.from), squareY(view.lastMove.from), CELL, CELL)
    ctx.fillRect(squareX(view.lastMove.to), squareY(view.lastMove.to), CELL, CELL)
  }

  // Selection + targets.
  if (view.selected >= 0) {
    ctx.fillStyle = 'rgba(122,162,247,0.28)'
    ctx.fillRect(squareX(view.selected), squareY(view.selected), CELL, CELL)
  }
  for (const t of view.targets) {
    const cx = squareX(t) + CELL / 2
    const cy = squareY(t) + CELL / 2
    if (view.pos.board[t] !== '') {
      ctx.strokeStyle = 'rgba(159,206,106,0.9)'
      ctx.lineWidth = 4
      ctx.strokeRect(squareX(t) + 2, squareY(t) + 2, CELL - 4, CELL - 4)
    } else {
      ctx.beginPath()
      ctx.arc(cx, cy, 8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(159,206,106,0.75)'
      ctx.fill()
    }
  }

  // Check ring.
  if (view.checkSquare >= 0) {
    glow(ctx, THEME.bad, 14)
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(squareX(view.checkSquare) + CELL / 2, squareY(view.checkSquare) + CELL / 2, CELL * 0.44, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
  }

  // Pieces.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let s = 0; s < 128; s += 1) {
    if (!onBoard(s)) continue
    const p = view.pos.board[s] as Piece | ''
    if (p === '') continue
    const cx = squareX(s) + CELL / 2
    const cy = squareY(s) + CELL / 2 + 2
    ctx.font = '38px "Segoe UI Symbol", system-ui, sans-serif'
    if (colorOf(p) === 'w') {
      ctx.fillStyle = '#f2f2f8'
      glow(ctx, 'rgba(242,242,248,0.5)', 6)
      ctx.fillText(GLYPH[p], cx, cy)
      noGlow(ctx)
    } else {
      ctx.fillStyle = '#14141c'
      glow(ctx, 'rgba(242,242,248,0.28)', 4)
      ctx.fillText(GLYPH[p], cx, cy)
      noGlow(ctx)
    }
  }
  ctx.textBaseline = 'alphabetic'

  // Coordinates.
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  for (let f = 0; f < 8; f += 1) {
    ctx.textAlign = 'center'
    ctx.fillText(String.fromCharCode(97 + f), MARGIN + f * CELL + CELL / 2, HUD_H + MARGIN + CELL * 8 + 13)
  }
  for (let r = 0; r < 8; r += 1) {
    ctx.textAlign = 'left'
    ctx.fillText(String(r + 1), MARGIN - 13, HUD_H + MARGIN + (7 - r) * CELL + CELL / 2 + 4)
  }

  hudPair(ctx, LOGICAL_W - MARGIN, 22, `${view.levelLabel} `, view.thinking ? '思考中…' : '你执白棋', 'right', THEME.gold)

  if (view.promotion !== null) drawPromotionPicker(ctx, view.promotion.white)
  else if (view.statusText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, view.statusText, view.statusSub, view.statusColor)
  }
  if (view.paused) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
}
