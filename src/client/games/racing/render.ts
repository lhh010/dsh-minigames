/**
 * Pseudo-3D racing canvas renderer: a perspective road stretching to a
 * horizon, obstacles that scale up as they approach, a car sprite at the
 * bottom, roadside scenery, and a speed/score HUD. Palette shifts with score
 * (day → sunset → night → day ...) for variety.
 */
import type { RacingState, Obstacle } from './logic.ts'

export const VIEW_W = 480
export const VIEW_H = 320
const HORIZON = Math.floor(VIEW_H * 0.38)
const ROAD_W_BOTTOM = VIEW_W * 0.85
const ROAD_W_HORIZON = VIEW_W * 0.06
const CENTER_X = VIEW_W / 2

const SKY_DAY: readonly [string, string] = ['#5fa8e8', '#bfe0f5']
const SKY_SUNSET: readonly [string, string] = ['#e85a3a', '#f5c84c']
const SKY_NIGHT: readonly [string, string] = ['#0e0e1a', '#2a2a44']

const ROAD_COLORS = ['#4a4a52', '#3e3e46']
const GRASS_COLORS = ['#3d6b30', '#356028']
const LANE_COLOR = '#f0f0f0'

const OBSTACLE_COLORS: Record<string, string> = {
  cone: '#e8772e',
  rock: '#6a6a72',
  barrel: '#d4442e',
  car: '#4c8ae8',
  barrier: '#e8c84c',
}

/** Perspective scale for a z-depth: 1 (near) → ~0 (far). */
function perspectiveScale(z: number): number {
  return 1 / (1 + z * 0.04)
}

/** Screen Y for a z-depth. */
function screenY(z: number): number {
  const s = perspectiveScale(z)
  return HORIZON + (VIEW_H - HORIZON) * s
}

/** Screen X for a world-x offset at a given z-depth. */
function screenX(worldX: number, z: number): number {
  const s = perspectiveScale(z)
  const roadW = ROAD_W_HORIZON + (ROAD_W_BOTTOM - ROAD_W_HORIZON) * s
  return CENTER_X + worldX * roadW * 0.5
}

/** Sky palette based on score (3-phase cycle). */
function skyPalette(score: number): readonly [string, string] {
  const phase = Math.floor(score / 500) % 3
  if (phase === 0) return SKY_DAY
  if (phase === 1) return SKY_SUNSET
  return SKY_NIGHT
}

/** Draw the sky gradient. */
function drawSky(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const [top, bottom] = skyPalette(state.score)
  const grad = ctx.createLinearGradient(0, 0, 0, HORIZON + 20)
  grad.addColorStop(0, top)
  grad.addColorStop(1, bottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, VIEW_W, HORIZON + 20)
  // Sun / moon.
  const phase = Math.floor(state.score / 500) % 3
  if (phase === 2) {
    ctx.fillStyle = '#e8e8f0'
    ctx.beginPath()
    ctx.arc(VIEW_W * 0.72, HORIZON * 0.4, 16, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = phase === 1 ? '#fff0b8' : '#fff8d8'
    ctx.beginPath()
    ctx.arc(VIEW_W * 0.72, HORIZON * 0.35, 20, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Draw the road, grass, and lane markings. */
function drawRoad(ctx: CanvasRenderingContext2D, state: RacingState): void {
  // Grass.
  const phase = Math.floor(state.score / 500) % 3
  const gc0 = phase === 2 ? '#1a2418' : GRASS_COLORS[0]!
  ctx.fillStyle = gc0
  ctx.fillRect(0, HORIZON, VIEW_W, VIEW_H - HORIZON)

  // Road as a perspective trapezoid — drawn in bands for depth stripes.
  const bands = 24
  const scrollOffset = (state.distance * 0.6) % (100 / bands)
  for (let i = bands - 1; i >= 0; i -= 1) {
    const zNear = (i / bands) * 100 + scrollOffset
    const zFar = ((i + 1) / bands) * 100 + scrollOffset
    const yNear = screenY(zNear)
    const yFar = screenY(zFar)
    if (yNear < HORIZON || yFar > VIEW_H) continue
    const wNear = ROAD_W_HORIZON + (ROAD_W_BOTTOM - ROAD_W_HORIZON) * perspectiveScale(zNear)
    const wFar = ROAD_W_HORIZON + (ROAD_W_BOTTOM - ROAD_W_HORIZON) * perspectiveScale(zFar)
    ctx.fillStyle = i % 2 === 0 ? ROAD_COLORS[0]! : ROAD_COLORS[1]!
    ctx.beginPath()
    ctx.moveTo(CENTER_X - wNear / 2, yNear)
    ctx.lineTo(CENTER_X + wNear / 2, yNear)
    ctx.lineTo(CENTER_X + wFar / 2, yFar)
    ctx.lineTo(CENTER_X - wFar / 2, yFar)
    ctx.closePath()
    ctx.fill()
  }

  // Lane markings (center dashed line + edge lines).
  const dashScroll = (state.distance * 0.6) % 8
  ctx.strokeStyle = LANE_COLOR
  ctx.lineWidth = 2
  for (let i = 0; i < 16; i += 1) {
    const z1 = i * 8 - dashScroll
    const z2 = z1 + 4
    if (z1 < 0 || z2 > 90) continue
    const sy1 = screenY(z1)
    const sy2 = screenY(z2)
    const w1 = ROAD_W_HORIZON + (ROAD_W_BOTTOM - ROAD_W_HORIZON) * perspectiveScale(z1)
    const w2 = ROAD_W_HORIZON + (ROAD_W_BOTTOM - ROAD_W_HORIZON) * perspectiveScale(z2)
    const lw1 = Math.max(1, 3 * perspectiveScale(z1))
    const lw2 = Math.max(1, 3 * perspectiveScale(z2))
    // Center dashes.
    ctx.beginPath()
    ctx.lineWidth = lw1
    ctx.moveTo(CENTER_X, sy1)
    ctx.lineTo(CENTER_X, sy2)
    ctx.stroke()
    // Edge lines.
    ctx.beginPath()
    ctx.lineWidth = lw1
    ctx.moveTo(CENTER_X - w1 / 2, sy1)
    ctx.lineTo(CENTER_X - w2 / 2, sy2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(CENTER_X + w1 / 2, sy1)
    ctx.lineTo(CENTER_X + w2 / 2, sy2)
    ctx.stroke()
  }
}

/** Draw an obstacle at its z-depth with perspective scaling. */
function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle): void {
  if (obs.z < -2 || obs.z > 95) return
  const s = perspectiveScale(obs.z)
  const sx = screenX(obs.lane, obs.z)
  const sy = screenY(obs.z)
  const size = 30 * s
  const color = OBSTACLE_COLORS[obs.type]!

  ctx.fillStyle = color
  switch (obs.type) {
    case 'cone':
      ctx.beginPath()
      ctx.moveTo(sx, sy - size * 1.2)
      ctx.lineTo(sx - size * 0.5, sy)
      ctx.lineTo(sx + size * 0.5, sy)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(sx - size * 0.4, sy - size * 0.7, size * 0.8, size * 0.2)
      break
    case 'rock':
      ctx.beginPath()
      ctx.ellipse(sx, sy - size * 0.4, size * 0.7, size * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'barrel':
      ctx.fillRect(sx - size * 0.4, sy - size * 1.1, size * 0.8, size * 1.1)
      ctx.fillStyle = '#ffdd44'
      ctx.fillRect(sx - size * 0.4, sy - size * 0.7, size * 0.8, size * 0.15)
      break
    case 'car':
      // Simple car shape.
      ctx.fillRect(sx - size * 0.5, sy - size * 1.4, size, size * 1.4)
      ctx.fillStyle = '#1a1a24'
      ctx.fillRect(sx - size * 0.35, sy - size * 1.1, size * 0.7, size * 0.4)
      ctx.fillStyle = '#ff3333'
      ctx.fillRect(sx - size * 0.4, sy - size * 0.2, size * 0.2, size * 0.15)
      ctx.fillRect(sx + size * 0.2, sy - size * 0.2, size * 0.2, size * 0.15)
      break
    case 'barrier':
      // Wide yellow-black barrier.
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(sx - size * 1.3, sy - size * 0.7, size * 2.6, size * 0.7)
      ctx.fillStyle = color
      for (let i = 0; i < 5; i += 1) {
        if (i % 2 === 0) ctx.fillRect(sx - size * 1.3 + i * size * 0.52, sy - size * 0.7, size * 0.26, size * 0.7)
      }
      break
    default:
      break
  }
}

/** Draw the player's car at the bottom center. */
function drawCar(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const cx = CENTER_X + state.carX * ROAD_W_BOTTOM * 0.3
  const cy = VIEW_H - 50
  const tilt = state.carX * 3
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(tilt * 0.02)

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 28, 32, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // Wheels.
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(-30, -18, 8, 16)
  ctx.fillRect(22, -18, 8, 16)
  ctx.fillRect(-30, 10, 8, 16)
  ctx.fillRect(22, 10, 8, 16)

  // Body.
  ctx.fillStyle = '#e23b2e'
  ctx.beginPath()
  ctx.roundRect(-26, -22, 52, 44, 6)
  ctx.fill()

  // Windshield.
  ctx.fillStyle = '#2a3a5a'
  ctx.beginPath()
  ctx.roundRect(-18, -14, 36, 18, 4)
  ctx.fill()

  // Headlights.
  ctx.fillStyle = '#fff6d8'
  ctx.fillRect(-22, -22, 8, 4)
  ctx.fillRect(14, -22, 8, 4)

  // Taillights.
  ctx.fillStyle = '#ff2a1a'
  ctx.fillRect(-22, 18, 8, 4)
  ctx.fillRect(14, 18, 8, 4)

  ctx.restore()
}

/** Draw the HUD (speed, score). */
function drawHud(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const kmh = Math.round(Math.abs(state.speed) * 3.6)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, 0, VIEW_W, 28)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 14px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${kmh} km/h`, 10, 19)
  ctx.textAlign = 'right'
  ctx.fillText(`得分 ${state.score}`, VIEW_W - 10, 19)
}

/** Draw one frame. */
export function renderRacing(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 8 : 0
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 6 : 0

  ctx.save()
  ctx.translate(shakeX, shakeY)

  drawSky(ctx, state)
  drawRoad(ctx, state)

  // Obstacles sorted far-to-near for correct overlap.
  const sorted = [...state.obstacles].sort((a, b) => b.z - a.z)
  for (const obs of sorted) drawObstacle(ctx, obs)

  drawCar(ctx, state)
  drawHud(ctx, state)

  // Collision flash.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(state.flash * 0.5).toFixed(2)})`
    ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40)
  }

  ctx.restore()
}
