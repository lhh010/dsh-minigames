/**
 * Whack-a-mole canvas renderer: a grassy 5x5 hole grid, moles that pop up
 * with a peek animation, a time/score HUD, and a round-over overlay.
 */
import type { WhackState } from './logic.ts'
import { HOLES } from './logic.ts'

export const CELL = 64
export const COLS = 5
export const ROWS = 5
export const HUD_H = 30
export const BOARD_W = COLS * CELL
export const BOARD_H = ROWS * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const GRASS = '#2f6b3a'
const GRASS_LIGHT = '#3a7a45'
const HOLE = '#3a2a1a'
const HOLE_EDGE = '#241708'
const MOLE = '#8a5a2b'
const MOLE_LIGHT = '#c98d4e'
const TEXT = '#d8d8e0'

/** Draw one frame. */
export function renderWhack(ctx: CanvasRenderingContext2D, state: WhackState): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Background grass with a subtle checker tint.
  ctx.fillStyle = GRASS
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.fillStyle = GRASS_LIGHT
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if ((r + c) % 2 === 0) ctx.fillRect(c * CELL, HUD_H + r * CELL, CELL, CELL)
    }
  }

  // Holes + moles.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const x = c * CELL
      const y = HUD_H + r * CELL
      // Hole.
      ctx.fillStyle = HOLE_EDGE
      ctx.beginPath()
      ctx.ellipse(x + CELL / 2, y + CELL / 2 + 8, CELL * 0.38, CELL * 0.26, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = HOLE
      ctx.beginPath()
      ctx.ellipse(x + CELL / 2, y + CELL / 2 + 7, CELL * 0.32, CELL * 0.2, 0, 0, Math.PI * 2)
      ctx.fill()
      // Moles in this hole.
      const index = r * COLS + c
      if (state.moles.includes(index)) {
        drawMole(ctx, x + CELL / 2, y + CELL / 2)
      }
    }
  }

  // HUD: time + score.
  ctx.fillStyle = '#15151b'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`⏱ ${Math.max(0, Math.ceil(state.remaining))}s`, 10, 20)
  ctx.textAlign = 'right'
  ctx.fillText(`得分 ${state.score}`, LOGICAL_W - 10, 20)

  if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.65)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 22px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('时 间 到 ！', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 18)
  }
}

/** A mole peeking out of its hole: body, belly, ears, eyes. */
function drawMole(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  // Ears.
  ctx.fillStyle = MOLE
  ctx.beginPath()
  ctx.ellipse(cx - 14, cy - 16, 7, 9, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx + 14, cy - 16, 7, 9, 0.5, 0, Math.PI * 2)
  ctx.fill()
  // Body.
  ctx.fillStyle = MOLE
  ctx.beginPath()
  ctx.ellipse(cx, cy - 2, 22, 24, 0, 0, Math.PI * 2)
  ctx.fill()
  // Belly.
  ctx.fillStyle = MOLE_LIGHT
  ctx.beginPath()
  ctx.ellipse(cx, cy + 2, 13, 15, 0, 0, Math.PI * 2)
  ctx.fill()
  // Eyes.
  ctx.fillStyle = '#15151b'
  ctx.beginPath()
  ctx.arc(cx - 8, cy - 8, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + 8, cy - 8, 3.2, 0, Math.PI * 2)
  ctx.fill()
  // Nose.
  ctx.fillStyle = '#d96a6a'
  ctx.beginPath()
  ctx.arc(cx, cy - 2, 4, 0, Math.PI * 2)
  ctx.fill()
}
