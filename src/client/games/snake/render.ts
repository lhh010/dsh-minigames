/**
 * Snake canvas renderer: the shared gradient background with a faint grid,
 * rounded glowing snake segments (head brightest), glowing food, a score HUD,
 * and a game-over overlay. Eat bursts are render-side observations only.
 */
import type { SnakeState } from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const CELL = 26
export const HUD_H = 30
export const BOARD_W = 16 * CELL
export const BOARD_H = 12 * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

// Render-side effect state: particles, the frame clock, and the previous
// score used to detect eats.
const particles = createParticles()
let prevScore = 0
let prevFrameMs = 0

/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export function renderSnake(ctx: CanvasRenderingContext2D, state: SnakeState, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  hudPair(ctx, 10, 20, '得分', `${state.score}`)

  // Board grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let c = 1; c < 16; c += 1) {
    ctx.beginPath(); ctx.moveTo(c * CELL + 0.5, HUD_H); ctx.lineTo(c * CELL + 0.5, LOGICAL_H); ctx.stroke()
  }
  for (let r = 1; r < 12; r += 1) {
    ctx.beginPath(); ctx.moveTo(0, HUD_H + r * CELL + 0.5); ctx.lineTo(BOARD_W, HUD_H + r * CELL + 0.5); ctx.stroke()
  }

  // Eat burst at the head (observed score change; logic untouched).
  const head = state.snake[0]!
  if (state.score > prevScore) {
    particles.burst(head.c * CELL + CELL / 2, HUD_H + head.r * CELL + CELL / 2, THEME.good, 14, 130)
  }
  prevScore = state.score

  // Food.
  glow(ctx, THEME.bad, 10)
  ctx.fillStyle = THEME.bad
  ctx.beginPath()
  ctx.arc(state.food.c * CELL + CELL / 2, HUD_H + state.food.r * CELL + CELL / 2, CELL * 0.3, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)

  // Snake: rounded segments, head glowing and brightest, body fading back.
  state.snake.forEach((p, i) => {
    const x = p.c * CELL
    const y = HUD_H + p.r * CELL
    if (i === 0) {
      glow(ctx, THEME.good, 10)
      ctx.fillStyle = THEME.good
    } else {
      noGlow(ctx)
      ctx.fillStyle = THEME.good
      ctx.globalAlpha = Math.max(0.35, 0.85 - i * 0.02)
    }
    roundRectPath(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 7)
    ctx.fill()
  })
  ctx.globalAlpha = 1
  noGlow(ctx)

  particles.tick(ctx, dtMs)

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
