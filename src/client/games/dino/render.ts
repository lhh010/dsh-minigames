/**
 * Dino runner canvas renderer: chrome-dinosaur-style shapes drawn with rects
 * only (no assets). Palette is tuned for the DSH dark shell; the dino is a
 * cleaner two-tone silhouette with an animated eye, arm, tail, and legs.
 */
import type { DinoState, Obstacle } from './engine.ts'
import { GROUND_Y, VIEW_W } from './engine.ts'

const DINO = '#ececf2'
const DINO_SHADE = '#b9b9c6'
const CACTUS = '#67b26f'
const CACTUS_DARK = '#45834d'
const BIRD = '#c6c6d2'
const BEAK = '#e8a04c'
const GROUND = '#8f8f9c'
const GROUND_DASH = '#5c5c68'
const CLOUD = '#2e2e38'
const TEXT = '#d8d8e0'

/** Draw one frame of the run. */
export function renderDino(ctx: CanvasRenderingContext2D, state: DinoState): void {
  ctx.clearRect(0, 0, VIEW_W, GROUND_Y + 20)
  drawClouds(ctx, state)
  drawGround(ctx, state)
  for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.t)
  drawDino(ctx, state)
  // Score, classic top-right.
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(String(Math.floor(state.score)).padStart(5, '0'), VIEW_W - 12, 22)
  if (state.over) drawGameOver(ctx, state)
}

/** Slow-drifting background clouds for depth. */
function drawClouds(ctx: CanvasRenderingContext2D, state: DinoState): void {
  ctx.fillStyle = CLOUD
  for (let i = 0; i < 3; i += 1) {
    const drift = (state.t * 12 + i * 140) % (VIEW_W + 220)
    const x = drift - 110
    const y = 26 + ((i * 37) % 40)
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.arc(x + 12, y - 4, 7, 0, Math.PI * 2)
    ctx.arc(x + 24, y, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawGround(ctx: CanvasRenderingContext2D, state: DinoState): void {
  ctx.fillStyle = GROUND
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
  const gap = 34
  const offset = (state.t * state.speed) % gap
  ctx.fillStyle = GROUND_DASH
  for (let x = -offset; x < VIEW_W; x += gap) ctx.fillRect(x, GROUND_Y + 7, 14, 2)
  for (let x = -offset - gap / 2; x < VIEW_W; x += gap) {
    ctx.globalAlpha = 0.4
    ctx.fillRect(x, GROUND_Y + 13, 10, 2)
    ctx.globalAlpha = 1
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, t: number): void {
  if (obstacle.kind === 'cactus') {
    // Two-tone trunk with a highlight edge.
    ctx.fillStyle = CACTUS
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
    ctx.fillStyle = CACTUS_DARK
    ctx.fillRect(obstacle.x + obstacle.w - 5, obstacle.y, 5, obstacle.h)
    // Arms.
    const arm = Math.max(5, obstacle.w * 0.34)
    const leftY = obstacle.y + obstacle.h * 0.22
    const rightY = obstacle.y + obstacle.h * 0.45
    ctx.fillStyle = CACTUS
    ctx.fillRect(obstacle.x - arm, leftY, arm, 3)
    ctx.fillRect(obstacle.x - 3, leftY - 5, 3, 5)
    ctx.fillRect(obstacle.x + obstacle.w, rightY, arm, 3)
    ctx.fillRect(obstacle.x + obstacle.w, rightY - 5, 3, 5)
    // 1px outline for readability on dark.
    ctx.strokeStyle = CACTUS_DARK
    ctx.lineWidth = 1
    ctx.strokeRect(obstacle.x + 0.5, obstacle.y + 0.5, obstacle.w - 1, obstacle.h - 1)
  } else {
    // Bird: body, wing, beak, eye.
    ctx.fillStyle = BIRD
    ctx.fillRect(obstacle.x, obstacle.y + 8, obstacle.w, obstacle.h - 8)
    ctx.fillRect(obstacle.x + 6, obstacle.y + 6, 20, 8)
    const flap = Math.sin(t * 22) > 0 ? -7 : 3
    ctx.fillRect(obstacle.x + 10, obstacle.y + 4 + flap, 18, 9)
    ctx.fillStyle = BEAK
    ctx.fillRect(obstacle.x + obstacle.w - 8, obstacle.y + 12, 8, 5)
    ctx.fillStyle = '#24242c'
    ctx.fillRect(obstacle.x + obstacle.w - 14, obstacle.y + 11, 4, 4)
  }
}

function drawDino(ctx: CanvasRenderingContext2D, state: DinoState): void {
  const dino = state.dino
  const x = dino.x
  if (dino.ducking) {
    // Low, horizontal silhouette.
    ctx.fillStyle = DINO
    ctx.fillRect(x + 2, GROUND_Y - 18, 40, 16)
    ctx.fillRect(x + 36, GROUND_Y - 24, 10, 9)
    ctx.fillStyle = '#202028'
    ctx.fillRect(x + 43, GROUND_Y - 21, 2, 2)
    ctx.fillStyle = DINO_SHADE
    ctx.fillRect(x + 6, GROUND_Y - 3, 8, 3)
    ctx.fillRect(x + 18, GROUND_Y - 3, 8, 3)
    ctx.fillRect(x + 30, GROUND_Y - 3, 8, 3)
    return
  }
  const y = dino.y
  const phase = dino.onGround ? Math.floor(state.t * 13) % 2 : 0
  // Tail, torso, head, snout.
  ctx.fillStyle = DINO
  ctx.fillRect(x + 2, y + 16, 5, 14)
  ctx.fillRect(x + 6, y + 16, 22, 30)
  ctx.fillRect(x + 22, y + 8, 20, 24)
  ctx.fillRect(x + 36, y + 18, 10, 9)
  // Arm.
  ctx.fillRect(x + 12, y + 34, 6, 10)
  // Eye: white with a dark pupil.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x + 33, y + 13, 5, 5)
  ctx.fillStyle = '#202028'
  ctx.fillRect(x + 35, y + 14, 2, 3)
  // Legs alternate on a fixed cycle while on the ground.
  ctx.fillStyle = DINO_SHADE
  ctx.fillRect(x + 8, GROUND_Y - 8, 8, phase === 0 ? 8 : 5)
  ctx.fillRect(x + 21, GROUND_Y - 8, 8, phase === 0 ? 5 : 8)
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: DinoState): void {
  ctx.fillStyle = TEXT
  ctx.font = 'bold 20px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('GAME OVER', VIEW_W / 2, GROUND_Y - 92)
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(`得分 ${Math.floor(state.score)} · 按空格或点击重新开始`, VIEW_W / 2, GROUND_Y - 68)
}
