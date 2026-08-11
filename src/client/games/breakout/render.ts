/**
 * Breakout canvas renderer: the brick wall, the paddle, the ball, and the
 * HUD. Brick colors come from the brick's own color field (stable when other
 * bricks are destroyed), and the ball is drawn in its current color.
 */
import type { BreakoutState } from './logic.ts'
import { VIEW_W, VIEW_H, PADDLE_Y, PADDLE_W, BALL_R, BRICK_W, BRICK_H, BRICK_COLORS } from './logic.ts'

export const LOGICAL_W = VIEW_W
export const LOGICAL_H = VIEW_H

const BG = '#15151b'
const PADDLE = '#5a7ab0'
const BALL_NEUTRAL = '#f0f0f0'
const TEXT = '#d8d8e0'

/** Draw one frame. */
export function renderBreakout(ctx: CanvasRenderingContext2D, state: BreakoutState): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Bricks: each brick carries its own color, so removing a brick never
  // shifts the colors of the ones that remain.
  state.bricks.forEach((brick) => {
    ctx.fillStyle = BRICK_COLORS[brick.color % BRICK_COLORS.length]!
    ctx.fillRect(brick.x, brick.y, BRICK_W, BRICK_H)
  })

  // Paddle.
  ctx.fillStyle = PADDLE
  ctx.beginPath()
  ctx.roundRect(state.paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, 10, 4)
  ctx.fill()

  // Ball: neutral white until it destroys a brick, then the brick's color.
  ctx.fillStyle = state.ball.color >= 0 ? BRICK_COLORS[state.ball.color % BRICK_COLORS.length]! : BALL_NEUTRAL
  ctx.beginPath()
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()

  // HUD.
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`第 ${state.level} 关`, 10, 18)
  ctx.textAlign = 'right'
  ctx.fillText(`得分 ${state.score} · 生命 ${'♥'.repeat(Math.max(0, state.lives))}`, LOGICAL_W - 10, 18)
  // Rule hint.
  ctx.textAlign = 'left'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = 'rgba(216,216,224,0.55)'
  ctx.fillText('小球会变成所消除方块的颜色 · 同色得分 ×3', 10, LOGICAL_H - 8)

  if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.65)'
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
    ctx.fillStyle = TEXT
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('游 戏 结 束', LOGICAL_W / 2, LOGICAL_H / 2 - 10)
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, LOGICAL_W / 2, LOGICAL_H / 2 + 18)
  }
}
