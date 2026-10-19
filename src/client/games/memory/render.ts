/**
 * Memory-match canvas renderer: a grid of face-down cards with emoji symbols,
 * face-up cards highlighted, matched pairs removed, a moves HUD, and a
 * particle burst when a pair matches. Uses the shared visual kit
 * (../theme.ts).
 */
import type { MemoryState } from './logic.ts'
import { COLS, ROWS } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const CELL = 48
export const HUD_H = 32
export const BOARD_W = COLS * CELL
export const BOARD_H = ROWS * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

/** Symbol for each card id (0..PAIRS-1). */
const SYMBOLS = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍉', '🥝', '🍑']

// Render-side event observation: burst at cells that just became matched.
const particles = createParticles()
let prevCards: (number | null)[] = []
let prevFrameMs = 0

function cellCenter(i: number): { x: number; y: number } {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  return { x: c * CELL + CELL / 2, y: HUD_H + r * CELL + CELL / 2 }
}

/** Draw one frame. */
export function renderMemory(ctx: CanvasRenderingContext2D, state: MemoryState): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  hudPair(ctx, 10, 21, '步数 ', String(state.moves))
  hudPair(ctx, LOGICAL_W - 10, 21, '配对 ', `${state.matched}/${ROWS * COLS / 2}`, 'right', THEME.good)

  for (let i = 0; i < state.cards.length; i += 1) {
    const x = (i % COLS) * CELL
    const y = HUD_H + Math.floor(i / COLS) * CELL
    const symbol: number | null = state.cards[i] ?? null
    if (symbol === null) continue // matched, removed
    const faceUp = state.flipped.includes(i)
    if (faceUp) {
      glow(ctx, accent(symbol), 10)
      ctx.fillStyle = THEME.panel
      roundRectPath(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8)
      ctx.fill()
      noGlow(ctx)
      ctx.strokeStyle = accent(symbol)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.font = '26px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(SYMBOLS[symbol] ?? '?', x + CELL / 2, y + CELL / 2)
    } else {
      // Backs are uniform; a per-cell accent rim adds life without leaking
      // any card information.
      const rim = accent(i)
      ctx.fillStyle = THEME.panel
      roundRectPath(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8)
      ctx.fill()
      ctx.strokeStyle = rim
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      roundRectPath(ctx, x + 6, y + 6, CELL - 12, 5, 3)
      ctx.fill()
    }
  }
  ctx.textBaseline = 'alphabetic'

  // Match burst at newly removed cells (observed render-side; logic untouched).
  if (prevCards.length === state.cards.length) {
    for (let i = 0; i < state.cards.length; i += 1) {
      if (state.cards[i] === null && prevCards[i] !== null && prevCards[i] !== undefined) {
        const { x, y } = cellCenter(i)
        particles.burst(x, y, THEME.good, 12, 120)
      }
    }
  }
  prevCards = [...state.cards]
  particles.tick(ctx, dtMs)

  if (state.finished) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(ctx, BOARD_W, BOARD_H, '全部配对！', `${state.moves} 步完成 · 按 R 重新开始`, THEME.gold)
    ctx.restore()
  }
}
