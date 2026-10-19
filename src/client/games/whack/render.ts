/**
 * Whack-a-mole canvas renderer on the shared theme kit: gradient backdrop,
 * a rounded grass panel with themed holes, glowing moles, a hudPair HUD,
 * hit particle bursts (observed from score + mole-set diffs), and a themed
 * round-over overlay.
 */
import type { WhackState } from './logic.ts'
import { HOLES } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

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

// Render-side hit bursts: score upticks with a mole that vanished = whacked.
const particles = createParticles()
let prevScore = -1
let prevMoles: number[] = []
let lastFrame = 0

/** Draw one frame. */
export function renderWhack(ctx: CanvasRenderingContext2D, state: WhackState): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Grass panel with a subtle checker tint.
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 2, HUD_H + 2, LOGICAL_W - 4, BOARD_H - 4, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.save()
  roundRectPath(ctx, 2, HUD_H + 2, LOGICAL_W - 4, BOARD_H - 4, 10)
  ctx.clip()
  ctx.fillStyle = GRASS
  ctx.fillRect(0, HUD_H, LOGICAL_W, BOARD_H)
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
  ctx.restore()

  // Hit burst: a mole that disappeared while the score rose.
  if (prevScore >= 0 && state.score > prevScore) {
    const gone = prevMoles.filter(hole => !state.moles.includes(hole))
    for (const hole of gone.slice(0, 3)) {
      particles.burst(((hole % COLS) + 0.5) * CELL, HUD_H + (Math.floor(hole / COLS) + 0.5) * CELL, accent(7), 14, 140)
    }
  }
  prevScore = state.score
  prevMoles = [...state.moles]
  particles.tick(ctx, dt)

  // HUD: time + score.
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  hudPair(ctx, 10, 20, '⏱ ', `${Math.max(0, Math.ceil(state.remaining))}s`, 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W - 10, 20, '得分 ', String(state.score), 'right', THEME.text)

  if (state.over) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(ctx, BOARD_W, BOARD_H, '时间到！', `得分 ${state.score} · 按 R 重新开始`, THEME.gold)
    ctx.restore()
  }
}

/** A mole peeking out of its hole: body, belly, ears, eyes. */
function drawMole(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  glow(ctx, accent(7), 10)
  // Ears.
  ctx.fillStyle = MOLE
  ctx.beginPath()
  ctx.ellipse(cx - 14, cy - 16, 7, 9, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx + 14, cy - 16, 7, 9, 0.5, 0, Math.PI * 2)
  ctx.fill()
  // Body.
  ctx.beginPath()
  ctx.ellipse(cx, cy - 2, 22, 24, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // Belly.
  ctx.fillStyle = MOLE_LIGHT
  ctx.beginPath()
  ctx.ellipse(cx, cy + 2, 13, 15, 0, 0, Math.PI * 2)
  ctx.fill()
  // Eyes.
  ctx.fillStyle = THEME.bgBottom
  ctx.beginPath()
  ctx.arc(cx - 8, cy - 8, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + 8, cy - 8, 3.2, 0, Math.PI * 2)
  ctx.fill()
  // Nose.
  ctx.fillStyle = THEME.bad
  ctx.beginPath()
  ctx.arc(cx, cy - 2, 4, 0, Math.PI * 2)
  ctx.fill()
}
