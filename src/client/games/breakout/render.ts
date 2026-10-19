/**
 * Breakout canvas renderer: the brick wall, the paddle, the ball, and the
 * HUD, styled with the shared theme kit. Brick colors come from the brick's
 * own color field (stable when other bricks are destroyed), and the ball is
 * drawn in its current color. Score gains fire particle bursts at the ball.
 */
import type { BreakoutState } from './logic.ts'
import { VIEW_W, VIEW_H, PADDLE_Y, PADDLE_W, BALL_R, BRICK_W, BRICK_H } from './logic.ts'
import {
  THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, createParticles,
} from '../theme.ts'

export const LOGICAL_W = VIEW_W
export const LOGICAL_H = VIEW_H

// Render-owned particle system + frame clock (single game instance per canvas).
const particles = createParticles()
let prevScore = -1
let prevNow = 0

/** Draw one frame. */
export function renderBreakout(ctx: CanvasRenderingContext2D, state: BreakoutState): void {
  const now = performance.now()
  const dt = Math.min(50, Math.max(0, now - prevNow))
  prevNow = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Bricks: rounded, softly glowing; each brick keeps its row accent.
  state.bricks.forEach((brick) => {
    const color = accent(brick.color)
    ctx.fillStyle = color
    glow(ctx, color, 6)
    roundRectPath(ctx, brick.x, brick.y, BRICK_W, BRICK_H, 4)
    ctx.fill()
    noGlow(ctx)
  })

  // Paddle.
  ctx.fillStyle = THEME.accents[0]!
  glow(ctx, THEME.accents[0]!, 12)
  roundRectPath(ctx, state.paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, 10, 5)
  ctx.fill()
  noGlow(ctx)

  // Ball: neutral white until it destroys a brick, then the brick's color.
  const ballColor = state.ball.color >= 0 ? accent(state.ball.color) : THEME.text
  ctx.fillStyle = ballColor
  glow(ctx, ballColor, 14)
  ctx.beginPath()
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)

  // Score gain → burst at the ball.
  if (state.score !== prevScore) {
    if (prevScore >= 0 && state.score > prevScore) {
      particles.burst(state.ball.x, state.ball.y, ballColor, 12, 150)
    }
    prevScore = state.score
  }
  particles.tick(ctx, dt)

  // HUD.
  hudPair(ctx, 10, 18, '关卡', String(state.level), 'left')
  hudPair(ctx, LOGICAL_W - 10, 18, '得分', `${state.score} · 生命 ${'♥'.repeat(Math.max(0, state.lives))}`, 'right')
  // Rule hint.
  ctx.textAlign = 'left'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('小球会变成所消除方块的颜色 · 同色得分 ×3', 10, LOGICAL_H - 8)

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  }
}
