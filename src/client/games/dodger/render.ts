/**
 * Dodger canvas renderer on the shared theme kit: gradient arena, glowing
 * player dot (accent(0), grace-period flicker), bullets as glowing motion
 * streaks colored by speed tier (homing bullets as accent(2) comets),
 * telegraphed lasers on h/v/diagonal axes clipped to the field, a
 * 时间/得分/擦弹 HUD, particle burst on death, and the bad-red themed
 * game-over overlay.
 */
import type { Bullet, DodgerState, Laser } from './logic.ts'
import {
  W, H, HUD_H, PLAYER_R, BULLET_R, LASER_FADE_MS, LASER_BEAM_W,
  laserDir, lineClip,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
} from '../theme.ts'

export const DODGER_W = W
export const DODGER_H = H

const PLAYER_COLOR = accent(0)
const LASER_WARN_COLOR = accent(1)
const LASER_FIRE_COLOR = accent(4)
const HOMING_COLOR = accent(2)
/** Bullet color by speed tier: slow amber → mid orange → fast red. */
function bulletColor(speed: number): string {
  if (speed < 130) return accent(3)
  if (speed < 175) return accent(6)
  return accent(4)
}

// Render-owned particle system + frame clock (single game instance per canvas).
const particles = createParticles()
let prevNow = 0
let prevOver = false

/** Draw one frame. */
export function renderDodger(ctx: CanvasRenderingContext2D, state: DodgerState): void {
  const now = performance.now()
  const dt = Math.min(50, Math.max(0, now - prevNow))
  prevNow = now

  drawBackground(ctx, W, H)

  // Bullets as glowing streaks along their velocity.
  for (const b of state.bullets) drawStreak(ctx, b)

  // Lasers: telegraph warning line, fire beam, fading residue.
  for (const l of state.lasers) drawLaser(ctx, l, state.t)

  // Player dot: flicker while the grace window runs.
  const flicker = state.grace > 0 && Math.floor(state.grace / 120) % 2 === 0
  if (!flicker) {
    glow(ctx, PLAYER_COLOR, 16)
    ctx.fillStyle = PLAYER_COLOR
    ctx.beginPath()
    ctx.arc(state.x, state.y, PLAYER_R, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = '#c8d6ff'
    ctx.beginPath()
    ctx.arc(state.x, state.y, PLAYER_R * 0.45, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Grace ring so the invulnerable window reads clearly.
    ctx.strokeStyle = THEME.textMuted
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(state.x, state.y, PLAYER_R + 4, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Death → one burst at the player.
  if (state.over && !prevOver) particles.burst(state.x, state.y, THEME.bad, 22, 200)
  prevOver = state.over
  particles.tick(ctx, dt)

  // HUD strip.
  ctx.fillStyle = 'rgba(13,13,20,0.45)'
  ctx.fillRect(0, 0, W, HUD_H)
  hudPair(ctx, 10, 20, '时间', `${(state.t / 1000).toFixed(1)}s`, 'left')
  hudPair(ctx, W / 2, 20, '得分', String(state.score), 'left')
  hudPair(ctx, W - 10, 20, '擦弹', String(state.grazes), 'right', THEME.gold)

  if (state.over) {
    drawOverlay(
      ctx, W, H, '被 击 中',
      `坚持 ${(state.t / 1000).toFixed(1)} 秒 · 得分 ${state.score} · 按 R 重新开始`,
      THEME.bad,
    )
  }
}

function drawStreak(ctx: CanvasRenderingContext2D, b: Bullet): void {
  if (b.homing) {
    drawComet(ctx, b)
    return
  }
  const speed = Math.hypot(b.vx, b.vy)
  const color = bulletColor(speed)
  // Tail length grows with speed; direction is the unit velocity.
  const tail = Math.min(26, 8 + speed * 0.08)
  const ux = b.vx / speed
  const uy = b.vy / speed
  const grad = ctx.createLinearGradient(b.x, b.y, b.x - ux * tail, b.y - uy * tail)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'transparent')
  glow(ctx, color, 10)
  ctx.strokeStyle = grad
  ctx.lineWidth = BULLET_R * 1.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - ux * tail, b.y - uy * tail)
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2)
  ctx.fill()
}

/** Homing bullet: glowing accent(2) head with a short trail along its velocity. */
function drawComet(ctx: CanvasRenderingContext2D, b: Bullet): void {
  const speed = Math.hypot(b.vx, b.vy) || 1
  const ux = b.vx / speed
  const uy = b.vy / speed
  const tail = 16
  const grad = ctx.createLinearGradient(b.x, b.y, b.x - ux * tail, b.y - uy * tail)
  grad.addColorStop(0, HOMING_COLOR)
  grad.addColorStop(1, 'transparent')
  glow(ctx, HOMING_COLOR, 14)
  ctx.strokeStyle = grad
  ctx.lineWidth = BULLET_R * 1.1
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - ux * tail, b.y - uy * tail)
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = HOMING_COLOR
  ctx.beginPath()
  ctx.arc(b.x, b.y, BULLET_R * 0.9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(b.x, b.y, BULLET_R * 0.4, 0, Math.PI * 2)
  ctx.fill()
}

/** Beam span endpoints across the field for a laser's axis (diagonals are
 * parametrically clipped to the field rect; degenerate fallback = anchor). */
function beamEnds(l: Laser): { x0: number; y0: number; x1: number; y1: number } {
  if (l.axis === 'h') return { x0: 0, y0: l.pos, x1: W, y1: l.pos }
  if (l.axis === 'v') return { x0: l.pos, y0: HUD_H, x1: l.pos, y1: H }
  const { dx, dy } = laserDir(l.axis)
  const seg = lineClip(l.ax ?? 0, l.ay ?? 0, dx, dy, 0, HUD_H, W, H)
  if (seg) return seg
  const x = l.ax ?? 0
  const y = l.ay ?? 0
  return { x0: x, y0: y, x1: x, y1: y }
}

function drawLaser(ctx: CanvasRenderingContext2D, l: Laser, t: number): void {
  const { x0, y0, x1, y1 } = beamEnds(l)
  if (l.phase === 'telegraph') {
    // Thin dashed warning line, pulsing alpha; harmless.
    const alpha = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t / 90))
    ctx.save()
    ctx.globalAlpha = alpha
    glow(ctx, LASER_WARN_COLOR, 6)
    ctx.strokeStyle = LASER_WARN_COLOR
    ctx.lineWidth = 1.5
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (l.phase === 'fire') {
    // Thick beam: width eases in over the first 120ms of the phase.
    const k = Math.min(1, l.phaseT / 120)
    const width = LASER_BEAM_W * (0.55 + 0.45 * k)
    // Perpendicular unit vector across the beam (works for every axis).
    const { dx, dy } = laserDir(l.axis)
    const gx = -dy
    const gy = dx
    const grad = ctx.createLinearGradient(
      x0 - gx * width / 2, y0 - gy * width / 2, x0 + gx * width / 2, y0 + gy * width / 2,
    )
    grad.addColorStop(0, 'rgba(255,255,255,0.1)')
    grad.addColorStop(0.5, LASER_FIRE_COLOR)
    grad.addColorStop(1, 'rgba(255,255,255,0.1)')
    glow(ctx, LASER_FIRE_COLOR, 22)
    ctx.strokeStyle = grad
    ctx.lineWidth = width
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    noGlow(ctx)
    // Hot white core.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = width * 0.3
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    return
  }
  // Fade: harmless residue losing alpha over LASER_FADE_MS.
  const alpha = Math.max(0, 1 - l.phaseT / LASER_FADE_MS)
  ctx.save()
  ctx.globalAlpha = alpha * 0.6
  glow(ctx, LASER_FIRE_COLOR, 12)
  ctx.strokeStyle = LASER_FIRE_COLOR
  ctx.lineWidth = LASER_BEAM_W * 0.5
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.restore()
}
