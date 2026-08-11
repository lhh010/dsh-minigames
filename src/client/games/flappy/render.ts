/**
 * Flappy canvas renderer: sky gradient, scrolling pipes, a yellow bird with a
 * flapping wing, a score HUD, and a game-over overlay.
 */
import type { FlappyState } from './logic.ts'
import { VIEW_W, VIEW_H, BIRD_X, BIRD_R, PIPE_W, GAP_H } from './logic.ts'

export const HUD_H = 30
export const LOGICAL_W = VIEW_W
export const LOGICAL_H = HUD_H + VIEW_H

const SKY_TOP = '#3a8fd4'
const SKY_BOTTOM = '#a8d8f0'
const PIPE = '#4c9e4f'
const PIPE_EDGE = '#3a7a3d'
const BIRD = '#f2c94c'
const BIRD_BELLY = '#f6e3a0'
const TEXT = '#ffffff'

/** Draw one frame. */
export function renderFlappy(ctx: CanvasRenderingContext2D, state: FlappyState, wingT: number): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Sky.
  const sky = ctx.createLinearGradient(0, HUD_H, 0, LOGICAL_H)
  sky.addColorStop(0, SKY_TOP)
  sky.addColorStop(1, SKY_BOTTOM)
  ctx.fillStyle = sky
  ctx.fillRect(0, HUD_H, VIEW_W, VIEW_H)

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
  ctx.fillStyle = BIRD
  ctx.beginPath()
  ctx.ellipse(0, 0, BIRD_R + 2, BIRD_R, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = BIRD_BELLY
  ctx.beginPath()
  ctx.ellipse(-3, 4, 8, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  // Wing.
  ctx.fillStyle = '#d9a93c'
  ctx.beginPath()
  ctx.ellipse(-2, -2, 7, 5, wobble, 0, Math.PI * 2)
  ctx.fill()
  // Eye + beak.
  ctx.fillStyle = '#15151b'
  ctx.beginPath()
  ctx.arc(6, -5, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e45756'
  ctx.beginPath()
  ctx.moveTo(12, -1)
  ctx.lineTo(22, 1)
  ctx.lineTo(12, 5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // HUD.
  ctx.fillStyle = 'rgba(21,21,27,0.55)'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = 'bold 15px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`得分 ${state.score}`, VIEW_W / 2, 21)

  if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.6)'
    ctx.fillRect(0, HUD_H, VIEW_W, VIEW_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('撞 到 了', VIEW_W / 2, HUD_H + VIEW_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, VIEW_W / 2, HUD_H + VIEW_H / 2 + 20)
  }
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  if (h <= 0) return
  ctx.fillStyle = PIPE
  ctx.fillRect(x, HUD_H + y, PIPE_W, h)
  ctx.fillStyle = PIPE_EDGE
  ctx.fillRect(x - 3, HUD_H + y, PIPE_W + 6, 6)
  ctx.fillRect(x - 3, HUD_H + y + h - 6, PIPE_W + 6, 6)
}
