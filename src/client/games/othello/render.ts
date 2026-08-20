/**
 * Othello canvas renderer: a green 8x8 board, black/white discs, legal-move
 * hints for the player, a disc-count HUD, and a game-over overlay.
 */
import type { OthelloState } from './logic.ts'
import { SIZE } from './logic.ts'

export const CELL = 44
export const HUD_H = 30
export const BOARD_W = SIZE * CELL
export const BOARD_H = SIZE * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const GREEN_A = '#2e7d4f'
const GREEN_B = '#2a7449'
const LINE = '#1e5c38'
const BLACK = '#1b1b22'
const BLACK_HI = '#3a3a44'
const WHITE = '#e8e8ec'
const WHITE_HI = '#f7f7fa'
const TEXT = '#d8d8e0'

/** Draw one frame. */
export function renderOthello(ctx: CanvasRenderingContext2D, state: OthelloState): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Board.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      ctx.fillStyle = (r + c) % 2 === 0 ? GREEN_A : GREEN_B
      ctx.fillRect(c * CELL, HUD_H + r * CELL, CELL, CELL)
    }
  }
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.strokeRect(0, HUD_H, BOARD_W, BOARD_H)

  // Discs.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const cell = state.board[r]![c]!
      const x = c * CELL + CELL / 2
      const y = HUD_H + r * CELL + CELL / 2
      if (cell === 1 || cell === 2) {
        const isBlack = cell === 1
        ctx.fillStyle = isBlack ? BLACK : WHITE
        ctx.beginPath()
        ctx.arc(x, y, CELL * 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = isBlack ? BLACK_HI : WHITE_HI
        ctx.beginPath()
        ctx.arc(x - 3, y - 3, CELL * 0.24, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Legal-move hints for the player.
  if (!state.over && state.turn === 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.board[r]![c] === 0 && canFlipFrom(state, r, c)) {
          ctx.beginPath()
          ctx.arc(c * CELL + CELL / 2, HUD_H + r * CELL + CELL / 2, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }

  // HUD: disc counts + turn.
  ctx.fillStyle = '#15151b'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  // Hollow ○ = the black side (player), filled ● = the white side (AI).
  ctx.fillStyle = '#d8d8e0'
  ctx.fillText(`○ ${countDiscs(state, 1)}`, 12, 20)
  ctx.fillStyle = '#e8e8ec'
  ctx.fillText(`● ${countDiscs(state, 2)}`, 52, 20)
  if (!state.over) {
    ctx.fillStyle = TEXT
    ctx.textAlign = 'right'
    ctx.fillText(state.turn === 1 ? '你的回合' : 'AI 思考中…', LOGICAL_W - 10, 20)
  }

  if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.7)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    const title = state.winner === 1 ? '你 赢 了 ！' : state.winner === 2 ? 'AI 赢 了' : '平 局'
    ctx.fillText(title, BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`○ ${countDiscs(state, 1)} : ${countDiscs(state, 2)} ● · 按 R 重新开始`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 20)
  }
}

function countDiscs(state: OthelloState, player: 1 | 2): number {
  let n = 0
  for (const row of state.board) for (const cell of row) if (cell === player) n += 1
  return n
}

/** Cheap legality check for hint dots (mirrors flipsAt without allocation churn). */
function canFlipFrom(state: OthelloState, r: number, c: number): boolean {
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      let nr = r + dr
      let nc = c + dc
      let seen = false
      while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && state.board[nr]![nc] === 2) {
        seen = true
        nr += dr
        nc += dc
      }
      if (seen && nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && state.board[nr]![nc] === 1) return true
    }
  }
  return false
}
