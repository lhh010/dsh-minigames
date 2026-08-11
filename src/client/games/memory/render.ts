/**
 * Memory-match canvas renderer: a grid of face-down cards with emoji symbols,
 * face-up cards highlighted, matched pairs removed, and a moves HUD.
 */
import type { MemoryState } from './logic.ts'
import { COLS, ROWS } from './logic.ts'

export const CELL = 48
export const HUD_H = 32
export const BOARD_W = COLS * CELL
export const BOARD_H = ROWS * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const BACK = '#3a4a6a'
const BACK_LIGHT = '#5a7ab0'
const CARD_UP = '#26262e'
const TEXT = '#d8d8e0'
const MATCH_GLOW = '#5abf6b'

/** Symbol for each card id (0..PAIRS-1). */
const SYMBOLS = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍉', '🥝', '🍑']

/** Draw one frame. */
export function renderMemory(ctx: CanvasRenderingContext2D, state: MemoryState): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  ctx.fillStyle = '#15151b'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`步数 ${state.moves}`, 10, 21)
  ctx.textAlign = 'right'
  ctx.fillText(`配对 ${state.matched}/${8}`, LOGICAL_W - 10, 21)

  for (let i = 0; i < state.cards.length; i += 1) {
    const r = Math.floor(i / COLS)
    const c = i % COLS
    const x = c * CELL
    const y = HUD_H + r * CELL
    const symbol: number | null = state.cards[i] ?? null
    if (symbol === null) continue // matched, removed
    const faceUp = state.flipped.includes(i)
    if (faceUp) {
      ctx.fillStyle = CARD_UP
      ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4)
      ctx.font = '26px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(SYMBOLS[symbol] ?? '?', x + CELL / 2, y + CELL / 2)
      ctx.strokeStyle = MATCH_GLOW
      ctx.lineWidth = 2
      ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5)
    } else {
      ctx.fillStyle = BACK
      ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4)
      ctx.fillStyle = BACK_LIGHT
      ctx.fillRect(x + 2, y + 2, CELL - 4, 3)
    }
  }
  ctx.textBaseline = 'alphabetic'

  if (state.finished) {
    ctx.fillStyle = 'rgba(21,21,27,0.6)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('全 部 配 对 ！', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`${state.moves} 步完成 · 按 R 重新开始`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 20)
  }
}
