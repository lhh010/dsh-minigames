/**
 * Flappy canvas renderer: themed background, scrolling pipes, a gold bird
 * with a flapping wing, a score HUD, and the shared game-over overlay. Score
 * gains fire particle bursts at the bird.
 */
import type { FlappyState } from './logic.ts'
import { VIEW_W, VIEW_H, BIRD_X, BIRD_R, PIPE_W, GAP_H } from './logic.ts'
import {
  THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, createParticles,
} from '../theme.ts'

export const HUD_H = 30
export const LOGICAL_W = VIEW_W
export const LOGICAL_H = HUD_H + VIEW_H

// All pipes share one stable type accent (green).
const PIPE_ACCENT = accent(2)

// Render-owned particle system + frame clock (single game instance per canvas).
const particles = createParticles()
let prevScore = -1
let prevNow = 0

/**
 * Draw one frame.
 * @param wingT - running seconds counter driving the wing flap.
 * @param paused - show the pause overlay.
 */
export function renderFlappy(ctx: CanvasRenderingContext2D, state: FlappyState, wingT: number, paused: boolean): void {
  const now = performance.now()
  const dt = Math.min(50, Math.max(0, now - prevNow))
  prevNow = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Pipes.
  for (const pipe of state.pipes) {
    drawPipe(ctx, pipe.x, 0, pipe.gapY - GAP_H / 2)
    drawPipe(ctx, pipe.x, pipe.gapY + GAP_H / 2, VIEW_H - (pipe.gapY + GAP_H / 2))
  }

  // Bird.
  const wobble = Math.sin(wingT * 18) * 0.35
  ctx.save()
  ctx.translate(BIRD_X, HUD_H + state.y)
  ctx.rotate(Math.max(-0.5, Math.min(0.9, state.vy / 620)))
  glow(ctx, THEME.gold, 14)
  ctx.fillStyle = THEME.gold
  ctx.beginPath()
  ctx.ellipse(0, 0, BIRD_R + 2, BIRD_R, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#f6e3a0'
  ctx.beginPath()
  ctx.ellipse(-3, 4, 8, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  // Wing.
  ctx.fillStyle = accent(7)
  ctx.beginPath()
  ctx.ellipse(-2, -2, 7, 5, wobble, 0, Math.PI * 2)
  ctx.fill()
  // Eye + beak.
  ctx.fillStyle = THEME.bgBottom
  ctx.beginPath()
  ctx.arc(6, -5, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = THEME.bad
  ctx.beginPath()
  ctx.moveTo(12, -1)
  ctx.lineTo(22, 1)
  ctx.lineTo(12, 5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Score gain → burst at the bird.
  if (state.score !== prevScore) {
    if (prevScore >= 0 && state.score > prevScore) {
      particles.burst(BIRD_X, HUD_H + state.y, THEME.gold, 10, 140)
    }
    prevScore = state.score
  }
  particles.tick(ctx, dt)

  // HUD.
  ctx.fillStyle = 'rgba(13,13,20,0.45)'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  hudPair(ctx, 10, 20, '得分', String(state.score), 'left')

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '撞到了', `得分 ${state.score} · 按 R 重新开始`, THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  if (h <= 0) return
  ctx.fillStyle = PIPE_ACCENT
  glow(ctx, PIPE_ACCENT, 8)
  roundRectPath(ctx, x, HUD_H + y, PIPE_W, h, 6)
  ctx.fill()
  noGlow(ctx)
  // Lip caps slightly wider than the shaft.
  ctx.fillStyle = THEME.panelEdge
  roundRectPath(ctx, x - 3, HUD_H + y, PIPE_W + 6, 6, 3)
  ctx.fill()
  roundRectPath(ctx, x - 3, HUD_H + y + h - 6, PIPE_W + 6, 6, 3)
  ctx.fill()
}
