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
  birdDark: string
  beak: string
  ground: string
  groundDash: string
  cloud: string
  text: string
  eye: string
  fog: string
  rain: string
}

const DAY: Palette = {
  bg: '#f4f1e9',
  dino: '#2e2e35', // near-black pixel silhouette, like the classic dino
  dinoShade: '#8a8a96',
  cactus: '#5aa864',
  cactusDark: '#3d7a46',
  bird: '#8f8f9c',
  birdDark: '#5f5f6c',
  beak: '#e08a30',
  ground: '#6f6f7a',
  groundDash: '#c2bdb1',
  cloud: '#d9d5c9',
  text: '#4a4a55',
  eye: '#ffffff',
  fog: '#c8d2da',
  rain: '#6f86a0',
}

const NIGHT: Palette = {
  bg: '#13131a',
  dino: '#ececf2',
  dinoShade: '#b9b9c6',
  cactus: '#67b26f',
  cactusDark: '#45834d',
  bird: '#c6c6d2',
  birdDark: '#8f8fa0',
  beak: '#e8a04c',
  ground: '#8f8f9c',
  groundDash: '#5c5c68',
  cloud: '#2e2e38',
  text: '#d8d8e0',
  eye: '#ffffff',
  fog: '#8b96b5',
  rain: '#9fb8d8',
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
  if (state.raining) {
    drawFog(ctx, state, p)
    drawRain(ctx, state, p)
  }
  // Score, classic top-right (distance-based now).
  ctx.fillStyle = p.text
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(String(Math.floor(state.score)).padStart(5, '0'), VIEW_W - 12, 22)
  if (state.over) drawGameOver(ctx, state, p)
  // Lightning: the whole screen flashes white for an instant, over everything.
  if (state.lightning > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, state.lightning).toFixed(3)})`
    ctx.fillRect(0, 0, VIEW_W, GROUND_Y + 20)
  }
}

/** Drifting fog: a translucent wash plus soft blobs that obscure the view. */
function drawFog(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  ctx.globalAlpha = 0.2
  ctx.fillStyle = p.fog
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y + 20)
  ctx.globalAlpha = 1
  for (let i = 0; i < 6; i += 1) {
    const drift = (state.t * 26 + i * 173) % (VIEW_W + 340)
    const x = drift - 170
    const y = 34 + ((i * 41) % 120)
    ctx.globalAlpha = 0.17
    ctx.fillStyle = p.fog
    ctx.beginPath()
    ctx.ellipse(x, y, 84 + (i % 3) * 18, 30 + (i % 2) * 12, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** Drifting slanted rain streaks. */
function drawRain(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  ctx.strokeStyle = p.rain
  ctx.lineWidth = 1.5
  const height = GROUND_Y + 20
  for (let i = 0; i < 26; i += 1) {
    const fall = (state.t * 780 + i * 43) % (height + 60)
    const y = fall - 30
    const x = ((i * 61) % VIEW_W) - 20 + (i % 4) * 6
    ctx.globalAlpha = 0.4
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 11, y + 26)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
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
    drawBird(ctx, obstacle, t, p)
  }
}

/** A rounded two-tone cactus with an arm on each side. */
function drawCactus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
): void {
  const r = w * 0.42
  // Left arm: horizontal spur + upright elbow.
  const arm = Math.max(6, w * 0.38)
  const leftY = y + h * 0.24
  const rightY = y + h * 0.48
  ctx.fillStyle = p.cactus
  ctx.beginPath()
  ctx.roundRect(x - arm - 4, leftY, arm + 4, 4.5, 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x - arm, leftY - 7, 4.5, 7, 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x + w, rightY, arm + 4, 4.5, 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x + w, rightY - 7, 4.5, 7, 2)
  ctx.fill()
  // Trunk: rounded top, slightly tapered sides.
  ctx.fillStyle = p.cactus
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, [r, r, 3, 3])
  ctx.fill()
  // Shaded right edge + vertical ribs.
  ctx.fillStyle = p.cactusDark
  ctx.beginPath()
  ctx.roundRect(x + w - 5, y + 2, 5, h - 4, 2)
  ctx.fill()
  ctx.globalAlpha = 0.25
  ctx.fillStyle = p.cactusDark
  ctx.fillRect(x + w * 0.3, y + 6, 2.5, h - 10)
  ctx.fillRect(x + w * 0.62, y + 6, 2.5, h - 10)
  ctx.globalAlpha = 1
  // Highlight on the rounded top.
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.3, y + 3, w * 0.18, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** A plump bird with a flapping wing, eye, beak and tail. */
function drawBird(ctx: CanvasRenderingContext2D, o: Obstacle, t: number, p: Palette): void {
  const x = o.x
  const y = o.y
  // Tail on the trailing (right) side.
  ctx.fillStyle = p.bird
  ctx.beginPath()
  ctx.moveTo(x + 36, y + 13)
  ctx.lineTo(x + 46, y + 9)
  ctx.lineTo(x + 38, y + 19)
  ctx.closePath()
  ctx.fill()
  // Body: plump ellipse.
  ctx.beginPath()
  ctx.ellipse(x + 24, y + 16, 15, 10.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // Head merged at the front (left, it flies leftwards).
  ctx.beginPath()
  ctx.arc(x + 11, y + 8.5, 6.5, 0, Math.PI * 2)
  ctx.fill()
  // Beak.
  ctx.fillStyle = p.beak
  ctx.beginPath()
  ctx.moveTo(x + 3, y + 7)
  ctx.lineTo(x - 3, y + 10)
  ctx.lineTo(x + 5, y + 11)
  ctx.closePath()
  ctx.fill()
  // Eye with pupil.
  ctx.fillStyle = p.eye === '#ffffff' ? '#202028' : '#ffffff'
  ctx.beginPath()
  ctx.arc(x + 10, y + 7, 1.8, 0, Math.PI * 2)
  ctx.fill()
  // Flapping wing.
  const flap = Math.sin(t * 22) * 5
  ctx.fillStyle = p.birdDark
  ctx.beginPath()
  ctx.ellipse(x + 24, y + 10.5 + flap * 0.6, 9, 5, -0.35, 0, Math.PI * 2)
  ctx.fill()
  // Chest highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.beginPath()
  ctx.ellipse(x + 28, y + 15, 7, 4.5, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** The dino sprite as a pixel matrix (17 rows x 18 cols): 1 = body, 0 = empty.
 * The lone 0 inside the head (row 2, col 11) is the white eye. The legs are
 * the last four rows, drawn dynamically for the run cycle. */
const DINO_MATRIX: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  [1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
]

const DINO_COLS = 18
const DINO_STATIC_ROWS = 13
const EYE_R = 2
const EYE_C = 11

/** Draw the static sprite rows, scaled to fill the 46x50 hitbox. */
function drawDinoBody(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, p: Palette): void {
  const cellW = 46 / DINO_COLS
  const cellH = height / 17
  ctx.fillStyle = p.dino
  for (let r = 0; r < DINO_STATIC_ROWS; r += 1) {
    const row = DINO_MATRIX[r]!
    for (let c = 0; c < DINO_COLS; c += 1) {
      if (!row[c]) continue
      const x0 = x + Math.round(c * cellW)
      const x1 = x + Math.round((c + 1) * cellW)
      const y0 = y + Math.round(r * cellH)
      const y1 = y + Math.round((r + 1) * cellH)
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
  }
  // The white eye at the lone 0 in the head.
  ctx.fillStyle = p.eye
  const ex = x + Math.round(EYE_C * cellW)
  const ey = y + Math.round(EYE_R * cellH)
  ctx.fillRect(ex, ey, Math.ceil(cellW * 1.3), Math.ceil(cellH * 1.3))
}

/** Standing pose: matrix body + two running legs (tucked mid-air). */
function drawDino(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  const dino = state.dino
  const x = dino.x
  if (dino.ducking) {
    drawDinoDucking(ctx, x, GROUND_Y, p)
    return
  }
  const y = dino.y
  const phase = dino.onGround ? Math.floor(state.t * 13) % 2 : 0
  const legL = dino.onGround ? (phase === 0 ? 12 : 9) : 5
  const legR = dino.onGround ? (phase === 0 ? 9 : 12) : 5
  drawDinoBody(ctx, x, y, 50, p)
  const legTop = y + Math.round(DINO_STATIC_ROWS * (50 / 17))
  ctx.fillStyle = p.dino
  // Two legs run alternately; they tuck in while jumping.
  ctx.fillRect(x + 10, legTop, 8, legL)
  ctx.fillRect(x + 21, legTop, 8, legR)
  // Feet.
  ctx.fillRect(x + 9, legTop + legL - 3, 10, 3)
  ctx.fillRect(x + 20, legTop + legR - 3, 10, 3)
}

/** Ducking: the same sprite flattened into the low hitbox. */
function drawDinoDucking(ctx: CanvasRenderingContext2D, x: number, ground: number, p: Palette): void {
  drawDinoBody(ctx, x, ground - 26, 26, p)
  // Feet hugging the ground.
  ctx.fillStyle = p.dino
  ctx.fillRect(x + 10, ground - 6, 8, 5)
  ctx.fillRect(x + 21, ground - 6, 8, 5)
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: DinoState, p: Palette): void {
  ctx.fillStyle = p.text
  ctx.font = 'bold 20px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('GAME OVER', VIEW_W / 2, GROUND_Y - 92)
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(`得分 ${Math.floor(state.score)} · 按空格或点击重新开始`, VIEW_W / 2, GROUND_Y - 68)
}
