/**
 * Gomoku canvas renderer: the 15x15 board with grid lines and stones, a turn
 * HUD, and a win overlay. Palette tuned for the DSH dark shell.
 */
import type { GomokuState } from './logic.ts'
import { SIZE } from './logic.ts'

export const CELL = 24
export const HUD_H = 32
export const BOARD_W = SIZE * CELL
export const BOARD_H = SIZE * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const BG = '#c8a86a'
const LINE = '#8a6a3a'
const TEXT = '#d8d8e0'
const BLACK = '#1a1a1a'
const WHITE = '#f0f0f0'

/** Draw one frame. */
export function renderGomoku(ctx: CanvasRenderingContext2D, state: GomokuState): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  ctx.fillStyle = '#1b1b22'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  if (state.over) {
    ctx.fillText(state.winner === 1 ? '你赢了！' : state.winner === 2 ? 'AI 赢了' : '平局', 10, 21)
  } else {
    ctx.fillText(state.turn === 1 ? '你的回合 ●' : 'AI 思考中 ○', 10, 21)
  }

  // Wooden board.
  ctx.fillStyle = BG
  ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  for (let i = 0; i < SIZE; i += 1) {
    const x = i * CELL + CELL / 2
    const y = HUD_H + i * CELL + CELL / 2
    ctx.beginPath(); ctx.moveTo(CELL / 2, HUD_H + i * CELL + CELL / 2); ctx.lineTo(BOARD_W - CELL / 2, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(i * CELL + CELL / 2, HUD_H + CELL / 2); ctx.lineTo(x, LOGICAL_H - CELL / 2); ctx.stroke()
  }

  // Stones.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const stone = state.board[r]![c]
      if (stone === 0) continue
      const x = c * CELL + CELL / 2
      const y = HUD_H + r * CELL + CELL / 2
      ctx.fillStyle = stone === 1 ? BLACK : WHITE
      ctx.beginPath()
      ctx.arc(x, y, CELL * 0.42, 0, Math.PI * 2)
      ctx.fill()
      if (stone === 2) {
        ctx.strokeStyle = '#b0b0b0'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }

  if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.55)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(state.winner === 1 ? '你 赢 了 ！' : state.winner === 2 ? 'AI 赢 了' : '平 局', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText('按 R 重新开始', BOARD_W / 2, HUD_H + BOARD_H / 2 + 20)
  }
}
