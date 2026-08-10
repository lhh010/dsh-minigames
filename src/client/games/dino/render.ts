/**
 * Dino runner canvas renderer: chrome-dinosaur-style shapes drawn with rects
 * only (no assets), with a day/night theme that flips every THEME_INTERVAL
 * points (light day palette vs inverted night palette).
 */
import type { DinoState, Obstacle } from './engine.ts'
import { GROUND_Y, VIEW_W } from './engine.ts'

interface Palette {
  bg: string
  dino: string
  dinoShade: string
  cactus: string
  cactusDark: string
  bird: string
  beak: string
  ground: string
  groundDash: string
  cloud: string
  text: string
  eye: string
}

const DAY: Palette = {
  bg: '#f4f1e9',
  dino: '#4a4a55',
  dinoShade: '#8a8a96',
  cactus: '#5aa864',
  cactusDark: '#3d7a46',
  bird: '#8f8f9c',
  beak: '#e08a30',
  ground: '#6f6f7a',
  groundDash: '#c2bdb1',
  cloud: '#d9d5c9',
  text: '#4a4a55',
  eye: '#ffffff',
}

const NIGHT: Palette = {
  bg: '#13131a',
  dino: '#ececf2',
  dinoShade: '#b9b9c6',
  cactus: '#67b26f',
  cactusDark: '#45834d',
  bird: '#c6c6d2',
  beak: '#e8a04c',
  ground: '#8f8f9c',
  groundDash: '#5c5c68',
  cloud: '#2e2e38',
  text: '#d8d8e0',
  eye: '#ffffff',
}

/** Draw one frame of the run. */
export function renderDino(ctx: CanvasRenderingContext2D, state: DinoState): void {
  const p = state.night ? NIGHT : DAY
  ctx.clearRect(0, 0, VIEW_W, GROUND_Y + 20)
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y + 20)
  drawClouds(ctx, state, p)
  drawGround(ctx, state, p)
  for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.t, p)
  drawDino(ctx, state, p)
  // Score, classic top-right (distance-based now).
  ctx.fillStyle = p.text
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(String(Math.floor(state.score)).padStart(5, '0'), VIEW_W - 12, 22)
  if (state.over) drawGameOver(ctx, state, p)
}

/** Slow-drifting background clouds for depth. */
function drawClouds(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  ctx.fillStyle = p.cloud
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

function drawGround(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  ctx.fillStyle = p.ground
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
  const gap = 34
  const offset = (state.t * state.speed) % gap
  ctx.fillStyle = p.groundDash
  for (let x = -offset; x < VIEW_W; x += gap) ctx.fillRect(x, GROUND_Y + 7, 14, 2)
  for (let x = -offset - gap / 2; x < VIEW_W; x += gap) {
    ctx.globalAlpha = 0.4
    ctx.fillRect(x, GROUND_Y + 13, 10, 2)
    ctx.globalAlpha = 1
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, t: number, p: Palette): void {
  if (obstacle.kind === 'cactus' || obstacle.kind === 'cactus-double') {
    if (obstacle.kind === 'cactus-double') {
      // Two trunks with a small gap inside one hitbox.
      const trunk = Math.max(14, Math.floor((obstacle.w - 6) / 2))
      const gap = obstacle.w - trunk * 2
      drawCactus(ctx, obstacle.x, obstacle.y, trunk, obstacle.h, p)
      drawCactus(ctx, obstacle.x + trunk + gap, obstacle.y, trunk, obstacle.h, p)
      return
    }
    drawCactus(ctx, obstacle.x, obstacle.y, obstacle.w, obstacle.h, p)
  } else {
    // Bird: body, wing, beak, eye.
    ctx.fillStyle = p.bird
    ctx.fillRect(obstacle.x, obstacle.y + 8, obstacle.w, obstacle.h - 8)
    ctx.fillRect(obstacle.x + 6, obstacle.y + 6, 20, 8)
    const flap = Math.sin(t * 22) > 0 ? -7 : 3
    ctx.fillRect(obstacle.x + 10, obstacle.y + 4 + flap, 18, 9)
    ctx.fillStyle = p.beak
    ctx.fillRect(obstacle.x + obstacle.w - 8, obstacle.y + 12, 8, 5)
    ctx.fillStyle = p.eye === '#ffffff' ? '#202028' : '#ffffff'
    ctx.fillRect(obstacle.x + obstacle.w - 14, obstacle.y + 11, 4, 4)
  }
}

/** One cactus trunk: two-tone body, arms, outline. */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
): void {
  ctx.fillStyle = p.cactus
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = p.cactusDark
  ctx.fillRect(x + w - 5, y, 5, h)
  const arm = Math.max(5, w * 0.34)
  const leftY = y + h * 0.22
  const rightY = y + h * 0.45
  ctx.fillStyle = p.cactus
  ctx.fillRect(x - arm, leftY, arm, 3)
  ctx.fillRect(x - 3, leftY - 5, 3, 5)
  ctx.fillRect(x + w, rightY, arm, 3)
  ctx.fillRect(x + w, rightY - 5, 3, 5)
  ctx.strokeStyle = p.cactusDark
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

function drawDino(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  const dino = state.dino
  const x = dino.x
  if (dino.ducking) {
    // Low, horizontal silhouette.
    ctx.fillStyle = p.dino
    ctx.fillRect(x + 2, GROUND_Y - 18, 40, 16)
    ctx.fillRect(x + 36, GROUND_Y - 24, 10, 9)
    ctx.fillStyle = p.eye
    ctx.fillRect(x + 43, GROUND_Y - 21, 2, 2)
    ctx.fillStyle = p.dinoShade
    ctx.fillRect(x + 6, GROUND_Y - 3, 8, 3)
    ctx.fillRect(x + 18, GROUND_Y - 3, 8, 3)
    ctx.fillRect(x + 30, GROUND_Y - 3, 8, 3)
    return
  }
  const y = dino.y
  const phase = dino.onGround ? Math.floor(state.t * 13) % 2 : 0
  // Tail, torso, head, snout.
  ctx.fillStyle = p.dino
  ctx.fillRect(x + 2, y + 16, 5, 14)
  ctx.fillRect(x + 6, y + 16, 22, 30)
  ctx.fillRect(x + 22, y + 8, 20, 24)
  ctx.fillRect(x + 36, y + 18, 10, 9)
  // Arm.
  ctx.fillRect(x + 12, y + 34, 6, 10)
  // Eye: white with a dark pupil.
  ctx.fillStyle = p.eye
  ctx.fillRect(x + 33, y + 13, 5, 5)
  ctx.fillStyle = p.eye === '#ffffff' ? '#202028' : '#ffffff'
  ctx.fillRect(x + 35, y + 14, 2, 3)
  // Legs hang from the body (y + 42 = body bottom), so they lift with the jump
  // and alternate on a fixed cycle while on the ground.
  ctx.fillStyle = p.dinoShade
  ctx.fillRect(x + 8, y + 42, 8, phase === 0 ? 8 : 5)
  ctx.fillRect(x + 21, y + 42, 8, phase === 0 ? 5 : 8)
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  ctx.fillStyle = p.text
  ctx.font = 'bold 20px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('GAME OVER', VIEW_W / 2, GROUND_Y - 92)
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(`得分 ${Math.floor(state.score)} · 按空格或点击重新开始`, VIEW_W / 2, GROUND_Y - 68)
}
