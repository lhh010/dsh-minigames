/**
 * Pong canvas renderer on the shared theme kit: gradient arena with a dashed
 * center line, glowing paddles (player accent(0), AI accent(4)), a glowing
 * ball with a white core, 我方/对方/回合 HUD, serve countdown hint, particle
 * burst on every goal, and the win/lose overlay.
 */
import type { PongState } from './logic.ts'
import { W, H, HUD_H, PADDLE_W, PADDLE_H, PLAYER_Y, AI_Y, BALL_R } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const PONG_W = W
export const PONG_H = H

const PLAYER_COLOR = accent(0)
const AI_COLOR = accent(4)
const BALL_COLOR = accent(2)

// Render-owned particle system + frame clock (single game instance per canvas).
const particles = createParticles()
let prevNow = 0
let prevPlayerScore = 0
let prevAiScore = 0

/** Draw one frame. */
export function renderPong(ctx: CanvasRenderingContext2D, state: PongState): void {
  const now = performance.now()
  const dt = Math.min(50, Math.max(0, now - prevNow))
  prevNow = now

  drawBackground(ctx, W, H)

  // Center line divides the two halves.
  ctx.save()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.setLineDash([10, 12])
  ctx.beginPath()
  ctx.moveTo(0, H / 2)
  ctx.lineTo(W, H / 2)
  ctx.stroke()
  ctx.restore()

  drawPaddle(ctx, state.aiX, AI_Y, AI_COLOR)
  drawPaddle(ctx, state.playerX, PLAYER_Y, PLAYER_COLOR)
  drawBall(ctx, state)

  // Goal → one burst at the goal line the ball crossed.
  if (state.playerScore !== prevPlayerScore) {
    particles.burst(state.ball.x, HUD_H, THEME.good, 18, 180)
  }
  if (state.aiScore !== prevAiScore) {
    particles.burst(state.ball.x, H, THEME.bad, 18, 180)
  }
  prevPlayerScore = state.playerScore
  prevAiScore = state.aiScore
  particles.tick(ctx, dt)

  // HUD strip.
  ctx.fillStyle = 'rgba(13,13,20,0.45)'
  ctx.fillRect(0, 0, W, HUD_H)
  hudPair(ctx, 10, 20, '我方', String(state.playerScore), 'left', THEME.good)
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(':', W / 2, 20)
  hudPair(ctx, W / 2 + 14, 20, '对方', String(state.aiScore), 'left', THEME.bad)
  hudPair(ctx, W - 10, 20, '回合', String(state.rally), 'right', THEME.gold)

  if (state.over === 'player') {
    drawOverlay(ctx, W, H, `你赢了 ${state.playerScore}:${state.aiScore}`, '点击或按空格重新开始', THEME.good)
  } else if (state.over === 'ai') {
    drawOverlay(ctx, W, H, `你输了 ${state.playerScore}:${state.aiScore}`, '点击或按空格重新开始', THEME.bad)
  } else if (state.serveCd > 0) {
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('准备发球…', W / 2, H / 2 - 18)
  }
}

function drawPaddle(ctx: CanvasRenderingContext2D, cx: number, y: number, color: string): void {
  glow(ctx, color, 14)
  ctx.fillStyle = color
  roundRectPath(ctx, cx - PADDLE_W / 2, y, PADDLE_W, PADDLE_H, 6)
  ctx.fill()
  noGlow(ctx)
}

function drawBall(ctx: CanvasRenderingContext2D, state: PongState): void {
  glow(ctx, BALL_COLOR, 16)
  ctx.fillStyle = BALL_COLOR
  ctx.beginPath()
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(state.ball.x, state.ball.y, BALL_R * 0.45, 0, Math.PI * 2)
  ctx.fill()
}
