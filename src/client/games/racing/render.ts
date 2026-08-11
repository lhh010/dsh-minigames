/**
 * Pseudo-3D racing canvas renderer. A single perspective projection maps world
 * coordinates (lateral x ∈ [-1,1], depth z ≥ 0) to screen pixels; the road
 * trapezoid, lane markings, roadside objects, obstacles, and the player car
 * all use the same projection so everything aligns. The road is a full
 * trapezoid whose top edge meets the horizon; scrolling rumble stripes are
 * clipped inside it. Palette shifts with score (day → sunset → night).
 */
import type { Obstacle, RacingState } from './logic.ts'
import { LANES, VIEW_W, VIEW_H } from './logic.ts'

export { VIEW_W }
export { VIEW_H }

const CENTER_X = VIEW_W / 2
const HORIZON_Y = Math.floor(VIEW_H * 0.38)
/** Road half-width at the bottom of the canvas (screen px). */
const ROAD_BOTTOM_HALF = VIEW_W * 0.42
/** Road half-width at the horizon (screen px) — the vanishing strip. */
const ROAD_TOP_HALF = VIEW_W * 0.01
const PERSPECTIVE = 0.045

interface Palette {
  skyTop: string; skyBottom: string; sun: string; isNight: boolean
  grass: string; grassDark: string
  road: string; roadDark: string; roadEdge: string; laneMark: string
}

const DAY: Palette = {
  skyTop: '#4a90d8', skyBottom: '#c8e0f0', sun: '#fff4c2', isNight: false,
  grass: '#4a8c3a', grassDark: '#3a7030',
  road: '#424248', roadDark: '#36363e', roadEdge: '#e0e0e0', laneMark: '#f0f0f0',
}
const SUNSET: Palette = {
  skyTop: '#3a2858', skyBottom: '#e89858', sun: '#ffd860', isNight: false,
  grass: '#6a6438', grassDark: '#504828',
  road: '#3e3a44', roadDark: '#33303a', roadEdge: '#d8c8a0', laneMark: '#f0e0c0',
}
const NIGHT: Palette = {
  skyTop: '#080814', skyBottom: '#1e1e30', sun: '#e8e8f0', isNight: true,
  grass: '#1a2418', grassDark: '#141e12',
  road: '#23232e', roadDark: '#1d1d28', roadEdge: '#5a5a68', laneMark: '#a0a0a8',
}

function paletteFor(score: number): Palette {
  const phase = Math.floor(score / 600) % 3
  if (phase === 1) return SUNSET
  if (phase === 2) return NIGHT
  return DAY
}

/** Perspective scale at z (1 = at the camera, → 0 at the horizon). */
function scaleAtZ(z: number): number {
  return 1 / (1 + z * PERSPECTIVE)
}

/** Road half-width in screen px at depth z. */
function roadHalfAtZ(z: number): number {
  return ROAD_TOP_HALF + (ROAD_BOTTOM_HALF - ROAD_TOP_HALF) * scaleAtZ(z)
}

/** Project world (x ∈ [-1,1], z ≥ 0) to screen (px, py, scale). */
function project(x: number, z: number): { px: number; py: number; s: number } {
  const s = scaleAtZ(z)
  const py = HORIZON_Y + (VIEW_H - HORIZON_Y) * s
  const px = CENTER_X + x * roadHalfAtZ(z)
  return { px, py, s }
}

/** The road trapezoid path (top edge on the horizon, bottom at the canvas foot). */
function traceRoad(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.moveTo(CENTER_X - ROAD_TOP_HALF, HORIZON_Y)
  ctx.lineTo(CENTER_X + ROAD_TOP_HALF, HORIZON_Y)
  ctx.lineTo(CENTER_X + ROAD_BOTTOM_HALF, VIEW_H)
  ctx.lineTo(CENTER_X - ROAD_BOTTOM_HALF, VIEW_H)
  ctx.closePath()
}

/** The z-offset that scrolls the road texture at the same rate the world moves. */
function worldScroll(distance: number, period: number): number {
  return (distance * 0.1) % period
}

/** Draw one frame. */
export function renderRacing(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const p = paletteFor(state.score)
  ctx.clearRect(0, 0, VIEW_W, VIEW_H)

  const shakeAmp = state.shake * 6
  const ox = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0
  const oy = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0

  ctx.save()
  ctx.translate(ox, oy)

  drawSky(ctx, state, p)
  drawGround(ctx, p)
  drawRoad(ctx, state, p)
  drawRoadside(ctx, state, p)
  drawObstacles(ctx, state)
  drawPlayerCar(ctx, state)
  drawHud(ctx, state)

  ctx.restore()

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(state.flash * 0.5).toFixed(3)})`
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }
}

function drawSky(ctx: CanvasRenderingContext2D, state: RacingState, p: Palette): void {
  const grad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 10)
  grad.addColorStop(0, p.skyTop)
  grad.addColorStop(1, p.skyBottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, VIEW_W, HORIZON_Y + 10)

  ctx.fillStyle = p.sun
  const sx = VIEW_W * 0.72
  const sy = HORIZON_Y * 0.4
  const sr = p.isNight ? 11 : 20
  ctx.beginPath()
  ctx.arc(sx, sy, sr, 0, Math.PI * 2)
  ctx.fill()
  if (!p.isNight) {
    ctx.fillStyle = `${p.sun}45`
    ctx.beginPath()
    ctx.arc(sx, sy, sr + 12, 0, Math.PI * 2)
    ctx.fill()
  }

  // Distant hills silhouette above the horizon.
  ctx.fillStyle = p.isNight ? '#101020' : `${p.grassDark}cc`
  ctx.beginPath()
  ctx.moveTo(0, HORIZON_Y)
  for (let i = 0; i <= 12; i += 1) {
    const hx = (i / 12) * VIEW_W
    const hy = HORIZON_Y - 8 - Math.sin(i * 1.3) * 12 - Math.sin(i * 0.7 + 2) * 6
    ctx.lineTo(hx, hy)
  }
  ctx.lineTo(VIEW_W, HORIZON_Y)
  ctx.closePath()
  ctx.fill()
}

function drawGround(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.fillStyle = p.grass
  ctx.fillRect(0, HORIZON_Y, VIEW_W, VIEW_H - HORIZON_Y)
}

/**
 * The road: a solid trapezoid reaching the horizon, then scrolling rumble
 * stripes clipped inside it (so the far edge never oscillates against the
 * grass), then the edge lines.
 */
function drawRoad(ctx: CanvasRenderingContext2D, state: RacingState, p: Palette): void {
  // Base road.
  ctx.fillStyle = p.road
  traceRoad(ctx)
  ctx.fill()

  // Scrolling rumble stripes, clipped to the road.
  const bandCount = 26
  const bandLen = 100 / bandCount
  const scroll = worldScroll(state.distance, bandLen)
  ctx.save()
  traceRoad(ctx)
  ctx.clip()
  for (let i = 0; i < bandCount; i += 1) {
    const z1 = i * bandLen - scroll
    const z2 = z1 + bandLen
    if (z2 < 0) continue
    const y1 = HORIZON_Y + (VIEW_H - HORIZON_Y) * scaleAtZ(Math.max(0, z1))
    const y2 = HORIZON_Y + (VIEW_H - HORIZON_Y) * scaleAtZ(z2)
    ctx.fillStyle = i % 2 === 0 ? p.road : p.roadDark
    ctx.fillRect(0, y1, VIEW_W, Math.max(1, y2 - y1))
  }
  ctx.restore()

  // Lane dividers: scrolling dashes between the lanes, reaching near the
  // horizon so the markings run the full visible length of the road. The
  // pattern advances TOWARD the camera (z decreases with distance); iterating
  // one extra index keeps the far end filled, so the stream is seamless.
  const dashCount = 50
  const dashZMax = 350
  const dashPeriod = dashZMax / dashCount
  const phase = worldScroll(state.distance, dashPeriod) // grows with distance
  const dividers = [
    (LANES[0]! + LANES[1]!) / 2,
    (LANES[1]! + LANES[2]!) / 2,
  ]
  for (const dx of dividers) {
    for (let i = 0; i <= dashCount; i += 1) {
      const z1 = i * dashPeriod - phase
      const z2 = z1 + 3
      if (z1 < 0 || z2 > dashZMax) continue
      const a = project(dx, z1)
      const b = project(dx, z2)
      const w = Math.max(1, 4 * a.s)
      ctx.fillStyle = p.laneMark
      ctx.beginPath()
      ctx.moveTo(a.px - w, a.py)
      ctx.lineTo(a.px + w, a.py)
      ctx.lineTo(b.px + w * 0.6, b.py)
      ctx.lineTo(b.px - w * 0.6, b.py)
      ctx.closePath()
      ctx.fill()
    }
  }

  // Solid edge lines along both road borders.
  ctx.strokeStyle = p.roadEdge
  ctx.lineWidth = 2
  for (const side of [-1, 1] as const) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X + side * ROAD_TOP_HALF, HORIZON_Y)
    ctx.lineTo(CENTER_X + side * ROAD_BOTTOM_HALF, VIEW_H)
    ctx.stroke()
  }
}

/** Roadside trees and lamp posts at regular intervals. */
function drawRoadside(ctx: CanvasRenderingContext2D, state: RacingState, p: Palette): void {
  const spacing = 8
  const offset = worldScroll(state.distance, spacing * 2)
  for (let i = 0; i < 16; i += 1) {
    const z = (i + 1) * spacing - offset
    if (z < 1 || z > 90) continue
    for (const side of [-1, 1] as const) {
      const proj = project(side * 1.3, z)
      const size = 42 * proj.s
      if (size < 2) continue
      const isTree = (i + (side > 0 ? 1 : 0)) % 2 === 0
      if (isTree) {
        ctx.fillStyle = '#5a3e26'
        ctx.fillRect(proj.px - size * 0.04, proj.py - size * 0.2, size * 0.08, size * 0.2)
        ctx.fillStyle = p.grassDark
        ctx.beginPath()
        ctx.arc(proj.px, proj.py - size * 0.32, size * 0.18, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = '#3a3a42'
        ctx.fillRect(proj.px - size * 0.015, proj.py - size * 0.35, size * 0.03, size * 0.35)
        ctx.fillStyle = p.isNight ? '#ffd860' : '#6a6a72'
        ctx.beginPath()
        ctx.arc(proj.px, proj.py - size * 0.36, size * 0.04, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

/** All obstacles sorted far-to-near. */
function drawObstacles(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const sorted = [...state.obstacles].sort((a, b) => b.z - a.z)
  for (const obs of sorted) {
    if (obs.z < -2) continue
    const z = Math.max(0.5, obs.z)
    // lane is an index (-1/0/1); the road x is the lane centre from LANES.
    const laneX = LANES[obs.lane + 1]!
    const proj = project(laneX, z)
    if (proj.s < 0.03) continue
    drawObstacleShape(ctx, obs, proj.px, proj.py, proj.s, z)
  }
}

/** Obstacle shape by type, at projected (px, py) with scale s. */
function drawObstacleShape(
  ctx: CanvasRenderingContext2D, obs: Obstacle, cx: number, by: number, s: number, z: number,
): void {
  switch (obs.type) {
    case 'cone': {
      const h = 28 * s, w = 16 * s
      ctx.fillStyle = '#e87020'
      ctx.beginPath(); ctx.moveTo(cx, by - h); ctx.lineTo(cx - w / 2, by); ctx.lineTo(cx + w / 2, by); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - w * 0.35, by - h * 0.55, w * 0.7, h * 0.12)
      break
    }
    case 'rock': {
      const r = 14 * s
      ctx.fillStyle = '#7a7a82'
      ctx.beginPath(); ctx.ellipse(cx, by - r * 0.6, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'barrel': {
      const h = 32 * s, w = 18 * s
      ctx.fillStyle = '#c8302c'; ctx.fillRect(cx - w / 2, by - h, w, h)
      ctx.fillStyle = '#ffd840'; ctx.fillRect(cx - w / 2, by - h * 0.72, w, h * 0.1); ctx.fillRect(cx - w / 2, by - h * 0.38, w, h * 0.1)
      break
    }
    case 'car': {
      drawCarSprite(ctx, cx, by, s, '#3060d0', '#a8c8f0')
      break
    }
    case 'barrier': {
      // Wide barrier spanning two adjacent lanes.
      const h = 22 * s
      const laneA = LANES[obs.lane + 1]!
      const neighbour = obs.lane <= 0 ? obs.lane + 1 : obs.lane - 1
      const laneB = LANES[neighbour + 1]!
      const a = project(laneA, z)
      const b = project(laneB, z)
      const left = Math.min(a.px, b.px) - 6 * s
      const right = Math.max(a.px, b.px) + 6 * s
      const w = right - left
      ctx.fillStyle = '#c8302c'; ctx.fillRect(left, by - h, w, h)
      ctx.fillStyle = '#f0f0f0'
      for (let i = 0; i < 4; i += 1) {
        if (i % 2 === 1) ctx.fillRect(left + (w / 4) * i, by - h, w / 4, h)
      }
      break
    }
    default: break
  }
}

/** Reusable car sprite (body, cabin, wheels, headlights). */
function drawCarSprite(
  ctx: CanvasRenderingContext2D, cx: number, by: number, s: number, body: string, glass: string,
): void {
  const w = 44 * s, h = 28 * s
  ctx.fillStyle = '#181820'
  ctx.fillRect(cx - w * 0.48, by - h * 0.22, w * 0.14, h * 0.22)
  ctx.fillRect(cx + w * 0.34, by - h * 0.22, w * 0.14, h * 0.22)
  ctx.fillStyle = body
  ctx.beginPath(); ctx.roundRect(cx - w * 0.48, by - h, w, h * 0.8, 3 * s); ctx.fill()
  ctx.fillStyle = glass
  ctx.beginPath(); ctx.roundRect(cx - w * 0.28, by - h * 1.1, w * 0.56, h * 0.38, 2 * s); ctx.fill()
  ctx.fillStyle = '#fff4c2'
  ctx.fillRect(cx - w * 0.42, by - h * 0.92, w * 0.1, h * 0.16)
  ctx.fillRect(cx + w * 0.32, by - h * 0.92, w * 0.1, h * 0.16)
}

/** Player car at the bottom, offset by carX using the same road projection. */
function drawPlayerCar(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const cx = Math.max(26, Math.min(VIEW_W - 26, CENTER_X + state.carX * ROAD_BOTTOM_HALF))
  const by = VIEW_H - 12
  ctx.save()
  ctx.translate(cx, by)
  ctx.rotate(state.carX * 0.03)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath(); ctx.ellipse(0, 24, 30, 5, 0, 0, Math.PI * 2); ctx.fill()
  drawCarSprite(ctx, 0, 0, 1.5, '#e23b2e', '#cfe0ff')
  ctx.restore()
}

/** HUD: speed + score. */
function drawHud(ctx: CanvasRenderingContext2D, state: RacingState): void {
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(0, 0, VIEW_W, 24)
  ctx.fillStyle = '#f5f5f5'
  ctx.font = '12px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${Math.round(Math.abs(state.speed) * 3.6)} km/h`, 8, 16)
  ctx.textAlign = 'right'
  ctx.fillText(`${state.score}`, VIEW_W - 8, 16)
}
