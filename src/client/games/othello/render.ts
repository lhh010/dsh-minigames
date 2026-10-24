/**
 * Othello canvas renderer: a dark checkered board from the shared palette,
 * glowing discs, legal-move hints for the player, a disc-count HUD, and a
 * game-over overlay. Capture bursts are render-side observations only.
 */
import type { OthelloState } from './logic.ts'
import { SIZE } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const CELL = 44
export const HUD_H = 30
export const BOARD_W = SIZE * CELL
export const BOARD_H = SIZE * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

// Render-side effect state: particles, the frame clock, and the previous
// board snapshot used to spot the player's fresh disc for the capture burst.
const particles = createParticles()
let prevFrameMs = 0
let prevBoard: number[][] = []

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

/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export function renderOthello(ctx: CanvasRenderingContext2D, state: OthelloState, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Capture burst at the player's fresh black disc (observed via board diff).
  if (prevBoard.length === SIZE) {
    outer: for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.board[r]![c] === 1 && prevBoard[r]![c] === 0) {
          particles.burst(c * CELL + CELL / 2, HUD_H + r * CELL + CELL / 2, accent(0), 14, 120)
          break outer
        }
      }
    }
  }
  prevBoard = state.board.map(row => [...row])

  // Board: checkered rounded tiles on the shared background.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      roundRectPath(ctx, c * CELL + 1, HUD_H + r * CELL + 1, CELL - 2, CELL - 2, 8)
      ctx.fillStyle = (r + c) % 2 === 0 ? THEME.panel : '#23232f'
      ctx.fill()
    }
  }
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.strokeRect(1, HUD_H + 1, BOARD_W - 2, BOARD_H - 2)

  // Discs: black (player) with a blue rim glow, white (AI) with a warm one.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const cell = state.board[r]![c]!
      const x = c * CELL + CELL / 2
      const y = HUD_H + r * CELL + CELL / 2
      if (cell === 1 || cell === 2) {
        const isBlack = cell === 1
        glow(ctx, isBlack ? accent(0) : accent(3), 8)
        ctx.fillStyle = isBlack ? '#14141c' : THEME.text
        ctx.beginPath()
        ctx.arc(x, y, CELL * 0.4, 0, Math.PI * 2)
        ctx.fill()
        noGlow(ctx)
        ctx.fillStyle = isBlack ? '#33333f' : '#ffffff'
        ctx.beginPath()
        ctx.arc(x - 3, y - 3, CELL * 0.24, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Legal-move hints for the player.
  if (!state.over && state.turn === 1) {
    const hint = accent(2)
    glow(ctx, hint, 6)
    ctx.fillStyle = hint
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.board[r]![c] === 0 && canFlipFrom(state, r, c)) {
          ctx.beginPath()
          ctx.arc(c * CELL + CELL / 2, HUD_H + r * CELL + CELL / 2, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    noGlow(ctx)
  }

  // HUD: disc counts + turn. Hollow ○ = black (player), filled ● = white (AI).
  hudPair(ctx, 12, 20, '○', `${countDiscs(state, 1)}`)
  hudPair(ctx, 64, 20, '●', `${countDiscs(state, 2)}`)
  if (!state.over) {
    hudPair(ctx, LOGICAL_W - 10, 20, '', state.turn === 1 ? '你的回合' : 'AI 思考中…', 'right', state.turn === 1 ? THEME.text : THEME.textMuted)
  }

  particles.tick(ctx, dtMs)

  if (state.over) {
    const title = state.winner === 1 ? '你赢了！' : state.winner === 2 ? 'AI 赢了' : '平局'
    const color = state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.text
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, title, `○ ${countDiscs(state, 1)} : ${countDiscs(state, 2)} ● · 按 R 重新开始`, color)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
