/**
 * Dino runner canvas renderer: chrome-dinosaur-style shapes drawn with rects
 * only (no assets). Palette is tuned for the DSH dark shell.
 */
import type { DinoState, Obstacle } from './engine.ts'
import { GROUND_Y, VIEW_W } from './engine.ts'

const DINO_BODY = '#e6e6ee'
const DINO_LEG = '#b9b9c4'
const CACTUS = '#6fbf73'
const BIRD = '#b9b9c4'
const GROUND = '#8a8a96'
const TEXT = '#d8d8e0'

/** Draw one frame of the run. */
export function renderDino(ctx: CanvasRenderingContext2D, state: DinoState): void {
  ctx.clearRect(0, 0, VIEW_W, GROUND_Y + 20)
  drawGround(ctx, state)
  for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.t)
  drawDino(ctx, state)
  if (state.over) drawGameOver(ctx, state)
}

function drawGround(ctx: CanvasRenderingContext2D, state: DinoState): void {
  ctx.fillStyle = GROUND
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
  // Scrolling dashes convey speed.
  const gap = 34
  const offset = (state.t * state.speed) % gap
  ctx.fillStyle = '#5c5c68'
  for (let x = -offset; x < VIEW_W; x += gap) ctx.fillRect(x, GROUND_Y + 8, 14, 2)
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, t: number): void {
  if (obstacle.kind === 'cactus') {
    ctx.fillStyle = CACTUS
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
    // Small arms for the classic look.
    const arm = Math.max(4, obstacle.w * 0.3)
    ctx.fillRect(obstacle.x - arm, obstacle.y + obstacle.h * 0.25, arm, 3)
    ctx.fillRect(obstacle.x + obstacle.w, obstacle.y + obstacle.h * 0.45, arm, 3)
  } else {
    ctx.fillStyle = BIRD
    ctx.fillRect(obstacle.x, obstacle.y + 8, obstacle.w, obstacle.h - 8)
    // Wing flaps with the run clock.
    const flap = Math.sin(t * 24) > 0 ? -8 : 4
    ctx.fillRect(obstacle.x + 10, obstacle.y + 4 + flap, 16, 10)
    ctx.fillStyle = '#2c2c34'
    ctx.fillRect(obstacle.x + obstacle.w - 6, obstacle.y + 12, 5, 4)
  }
}

function drawDino(ctx: CanvasRenderingContext2D, state: DinoState): void {
  const dino = state.dino
  if (dino.ducking) {
    // Ducking: horizontal body.
    ctx.fillStyle = DINO_BODY
    ctx.fillRect(dino.x, GROUND_Y - 24, 46, 22)
    ctx.fillRect(dino.x + 38, GROUND_Y - 30, 8, 8)
    ctx.fillStyle = '#2c2c34'
    ctx.fillRect(dino.x + 42, GROUND_Y - 28, 2, 2)
  } else {
    // Body + head + eye.
    ctx.fillStyle = DINO_BODY
    ctx.fillRect(dino.x, dino.y, 30, 44)
    ctx.fillRect(dino.x + 24, dino.y + 4, 20, 26)
    ctx.fillStyle = '#2c2c34'
    ctx.fillRect(dino.x + 38, dino.y + 12, 3, 3)
    // Legs alternate on a fixed cycle while on the ground.
    const phase = dino.onGround ? Math.floor(state.t * 12) % 2 : 0
    ctx.fillStyle = DINO_LEG
    ctx.fillRect(dino.x + 6, GROUND_Y - 8, 8, phase === 0 ? 8 : 4)
    ctx.fillRect(dino.x + 20, GROUND_Y - 8, 8, phase === 0 ? 4 : 8)
  }
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: DinoState): void {
  ctx.fillStyle = TEXT
  ctx.font = 'bold 20px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('GAME OVER', VIEW_W / 2, GROUND_Y - 90)
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(`得分 ${Math.floor(state.score)} · 按空格或点击重新开始`, VIEW_W / 2, GROUND_Y - 66)
}
