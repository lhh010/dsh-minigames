/**
 * Neon Racing renderer: pseudo-3D road (per-scanline ground), sky with the
 * striped sun, roadside scenery, fog, rear-view cars, speed streaks,
 * particles, screen shake, HUD, and the start/pause/over overlays. All
 * drawing happens in the fixed logical space (LOGICAL_W x LOGICAL_H).
 */
import {
  CAR_H, CAR_W, LANES, MAX_SPEED, PD, ROAD_HW, RUMBLE_W, SPAWN_Z, VIEW_D, CAM_H,
  cameraX, centreAt, playerWorldX, type RacingState,
} from './logic.ts'
import { THEME, drawBackground, hudPair, drawOverlay, glow, noGlow } from '../theme.ts'

const HUD_H = 40
const MARGIN = 0
export const LOGICAL_W = 480
export const LOGICAL_H = 640
const HORIZON = Math.round(LOGICAL_H * 0.38)
const CX = LOGICAL_W / 2
/** Base focal length derived from the logical size (the reference used W/H). */
const BASE_F = Math.min(LOGICAL_H * 0.85, LOGICAL_W * 0.65)
const SCEN_SP = 9
const COMBO_SHOW_S = 3.2

export interface RacingView {
  state: RacingState
  paused: boolean
  /** Best score to show in the corner (panel-managed). */
  best: number
}

function projX(wx: number, d: number, camX: number, F: number): number {
  return CX + (wx - camX) * F / d
}

function projY(d: number, F: number): number {
  return HORIZON + CAM_H * F / d
}

/** Focal length stretched slightly at speed (sense of velocity). */
function focal(state: RacingState): number {
  return BASE_F * (1 + 0.08 * Math.min(1, state.speed / MAX_SPEED))
}

/** Screen position of the player car. */
export function playerScreen(state: RacingState): { x: number; y: number; s: number } {
  const F = focal(state)
  const pw = playerWorldX(state)
  return { x: projX(pw, PD, cameraX(state), F), y: projY(PD, F), s: F / PD }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y + h, rad)
  ctx.arcTo(x, y, x, y, rad)
  ctx.closePath()
}

function drawSky(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const camX = cameraX(state)
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 2)
  g.addColorStop(0, '#05010f')
  g.addColorStop(0.45, '#1d0837')
  g.addColorStop(0.8, '#5b1a5e')
  g.addColorStop(1, '#ff4f7b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, LOGICAL_W, HORIZON + 2)

  // Striped sun with parallax.
  const sunX = CX - camX * 35
  const sunY = HORIZON - LOGICAL_H * 0.16
  const r = LOGICAL_H * 0.15
  ctx.save()
  ctx.beginPath()
  ctx.arc(sunX, sunY, r, 0, Math.PI * 2)
  ctx.clip()
  const sg = ctx.createLinearGradient(0, sunY - r, 0, HORIZON)
  sg.addColorStop(0, '#fff27a')
  sg.addColorStop(0.5, '#ff9a3c')
  sg.addColorStop(1, '#ff2d75')
  ctx.fillStyle = sg
  ctx.fillRect(sunX - r, sunY - r, r * 2, r * 2)
  ctx.fillStyle = '#5a1a5c'
  for (let i = 0; i < 6; i += 1) {
    const y = sunY + r * 0.15 + i * r * 0.13 + i * i * r * 0.02
    const h = r * 0.02 + i * r * 0.012
    ctx.fillRect(sunX - r, y, r * 2, h)
  }
  ctx.restore()
}

function drawGround(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const F = focal(state)
  const camX = cameraX(state)
  const y0 = HORIZON + 1
  for (let y = y0; y < LOGICAL_H; y += 1) {
    const d = CAM_H * F / (y - HORIZON)
    const tz = state.worldZ + d
    const rc = centreAt(tz)
    const band = Math.floor(tz / 6) & 1
    const lx = CX + (rc - ROAD_HW - camX) * F / d
    const rx = CX + (rc + ROAD_HW - camX) * F / d
    const rrw = RUMBLE_W * F / d
    ctx.fillStyle = band ? '#0c4f2a' : '#0f5d32'
    ctx.fillRect(0, y, LOGICAL_W, 1)
    ctx.fillStyle = band ? '#e11d3a' : '#f5f5f5'
    ctx.fillRect(lx - rrw, y, rrw, 1)
    ctx.fillRect(rx, y, rrw, 1)
    ctx.fillStyle = band ? '#3b3e4b' : '#444856'
    ctx.fillRect(lx, y, rx - lx, 1)
    if ((tz % 8) < 4) {
      ctx.fillStyle = '#e8ecf5'
      const dw = Math.max(1, 0.14 * F / d)
      for (const bx of [-0.85, 0.85]) {
        const x = CX + (rc + bx - camX) * F / d
        ctx.fillRect(x - dw / 2, y, dw, 1)
      }
    }
  }
}

function drawFog(ctx: CanvasRenderingContext2D): void {
  const h = LOGICAL_H * 0.32
  const g = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + h)
  g.addColorStop(0, 'rgba(255,79,123,0.95)')
  g.addColorStop(0.5, 'rgba(255,79,123,0.25)')
  g.addColorStop(1, 'rgba(255,79,123,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, HORIZON, LOGICAL_W, h)
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: number): void {
  const h = (3.0 + (kind % 3) * 0.6) * s
  const w = 1.5 * s
  ctx.fillStyle = '#3b2412'
  ctx.fillRect(x - 0.08 * s, y - h * 0.32, 0.16 * s, h * 0.32)
  ctx.fillStyle = '#0a3d2a'
  ctx.beginPath()
  ctx.moveTo(x, y - h)
  ctx.lineTo(x - w * 0.5, y - h * 0.3)
  ctx.lineTo(x + w * 0.5, y - h * 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#137a4d'
  ctx.beginPath()
  ctx.moveTo(x, y - h * 0.8)
  ctx.lineTo(x - w * 0.38, y - h * 0.4)
  ctx.lineTo(x + w * 0.38, y - h * 0.4)
  ctx.closePath()
  ctx.fill()
}

function drawPole(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const h = 5 * s
  ctx.fillStyle = '#7d8599'
  ctx.fillRect(x - 0.06 * s, y - h, 0.12 * s, h)
  ctx.fillStyle = 'rgba(255,226,140,0.22)'
  ctx.beginPath()
  ctx.arc(x, y - h, 0.5 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffe38a'
  ctx.fillRect(x - 0.22 * s, y - h, 0.44 * s, 0.09 * s)
}

function drawScenery(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const F = focal(state)
  const camX = cameraX(state)
  const kMin = Math.floor(state.worldZ / SCEN_SP) + 1
  const kMax = Math.floor((state.worldZ + VIEW_D) / SCEN_SP)
  for (let k = kMax; k >= kMin; k -= 1) {
    const zW = k * SCEN_SP
    const d = zW - state.worldZ
    if (d < 1.2) continue
    const rc = centreAt(zW)
    const y = projY(d, F)
    const s = F / d
    for (const side of [-1, 1]) {
      const kind = (k * 73 + (side > 0 ? 41 : 7)) % 11
      if (kind === 4 || kind === 9) drawPole(ctx, projX(rc + side * (ROAD_HW + 1.4), d, camX, F), y, s)
      else if (kind <= 3 || kind === 7) drawTree(ctx, projX(rc + side * (ROAD_HW + 1.8), d, camX, F), y, s, kind)
    }
  }
}

/** One rear-view car (bottom centre at x, y). */
function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, isPlayer: boolean, roll: number, speedFrac: number, crashed: boolean,
): void {
  const hw = w / 2
  ctx.save()
  ctx.translate(x, y)
  if (roll) ctx.rotate(Math.max(-0.25, Math.min(0.25, roll)))
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.ellipse(0, h * 0.04, hw * 1.15, h * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  // Exhaust flame at speed.
  if (isPlayer && speedFrac > 0.6 && !crashed) {
    const L = h * (0.25 + speedFrac * 0.5 + Math.random() * 0.2)
    const g = ctx.createLinearGradient(0, 0, 0, L)
    g.addColorStop(0, 'rgba(255,245,180,0.95)')
    g.addColorStop(0.35, 'rgba(255,150,40,0.85)')
    g.addColorStop(1, 'rgba(255,40,0,0)')
    ctx.fillStyle = g
    for (const fx of [-0.25, 0.25]) {
      ctx.beginPath()
      ctx.moveTo(w * (fx - 0.08), -h * 0.05)
      ctx.lineTo(w * (fx + 0.08), -h * 0.05)
      ctx.lineTo(w * fx, L)
      ctx.closePath()
      ctx.fill()
    }
  }
  // Tyres.
  ctx.fillStyle = '#050507'
  ctx.fillRect(-hw * 0.98, -h * 0.2, w * 0.24, h * 0.2)
  ctx.fillRect(hw * 0.74, -h * 0.2, w * 0.24, h * 0.2)
  // Body.
  rr(ctx, -hw, -h * 0.66, w, h * 0.56, w * 0.12)
  ctx.fillStyle = color
  ctx.fill()
  const bg = ctx.createLinearGradient(-hw, 0, hw, 0)
  bg.addColorStop(0, 'rgba(0,0,0,0.45)')
  bg.addColorStop(0.25, 'rgba(0,0,0,0)')
  bg.addColorStop(0.75, 'rgba(0,0,0,0)')
  bg.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = bg
  ctx.fill()
  if (isPlayer) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(-w * 0.035, -h * 0.64, w * 0.07, h * 0.52)
  }
  // Bumper.
  ctx.fillStyle = '#12121a'
  ctx.fillRect(-hw * 0.9, -h * 0.22, w * 0.9, h * 0.12)
  // Cabin.
  ctx.fillStyle = '#0a0c16'
  ctx.beginPath()
  ctx.moveTo(-hw * 0.62, -h * 0.62)
  ctx.lineTo(hw * 0.62, -h * 0.62)
  ctx.lineTo(hw * 0.46, -h * 0.98)
  ctx.lineTo(-hw * 0.46, -h * 0.98)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(140,210,255,0.14)'
  ctx.beginPath()
  ctx.moveTo(-hw * 0.5, -h * 0.64)
  ctx.lineTo(-hw * 0.18, -h * 0.64)
  ctx.lineTo(-hw * 0.06, -h * 0.95)
  ctx.lineTo(-hw * 0.34, -h * 0.95)
  ctx.closePath()
  ctx.fill()
  // Rear wing.
  if (isPlayer) {
    ctx.fillStyle = '#0b0b10'
    ctx.fillRect(-hw * 0.95, -h * 0.72, w * 0.95, h * 0.04)
    ctx.fillRect(-hw * 0.7, -h * 0.72, w * 0.06, h * 0.1)
    ctx.fillRect(hw * 0.64, -h * 0.72, w * 0.06, h * 0.1)
  }
  // Tail lights.
  ctx.shadowColor = '#ff1a3c'
  ctx.shadowBlur = 12
  ctx.fillStyle = '#ff2446'
  ctx.fillRect(-hw * 0.88, -h * 0.52, w * 0.3, h * 0.1)
  ctx.fillRect(hw * 0.58, -h * 0.52, w * 0.3, h * 0.1)
  ctx.fillRect(-hw * 0.58, -h * 0.5, hw * 1.16, h * 0.04)
  ctx.shadowBlur = 0
  ctx.restore()
}

function drawEnemies(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const F = focal(state)
  const camX = cameraX(state)
  const speedFrac = Math.min(1, state.speed / MAX_SPEED)
  const far: typeof state.enemies = []
  const near: typeof state.enemies = []
  for (const e of state.enemies) if (e.z > 1.0) (e.z >= PD ? far : near).push(e)
  far.sort((a, b) => b.z - a.z)
  near.sort((a, b) => b.z - a.z)
  const drawList = (list: typeof state.enemies): void => {
    for (const e of list) {
      const d = e.z
      const x = projX(centreAt(state.worldZ + d) + e.lane, d, camX, F)
      const y = projY(d, F)
      const s = F / d
      drawCar(ctx, x, y, CAR_W * s, CAR_H * s, e.color, false, 0, speedFrac, state.crashed)
    }
  }
  drawList(far)
  // The player sits between the far and near traffic (near traffic is drawn
  // over the player, matching the reference's layering).
  const p = playerScreen(state)
  const ps = p.s
  if (!(state.crashed && state.crashTimer > 0.12)) {
    drawCar(ctx, p.x, p.y, CAR_W * ps, CAR_H * ps, '#22d3ee', true, -state.latVel * 0.012, speedFrac, state.crashed)
  }
  drawList(near)
}

function drawParticles(ctx: CanvasRenderingContext2D, state: RacingState): void {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
}

/** Speed lines radiating outward at high speed. */
const streaks: { a: number; r: number; k: number; len: number }[] = []
function drawStreaks(ctx: CanvasRenderingContext2D, state: RacingState): void {
  const frac = Math.min(1, state.speed / MAX_SPEED)
  if (frac < 0.3) return
  if (streaks.length === 0) {
    for (let i = 0; i < 60; i += 1) {
      streaks.push({ a: Math.random() * Math.PI * 2, r: 20 + Math.random() * 200, k: 0.6 + Math.random() * 0.9, len: 0.4 + Math.random() * 0.8 })
    }
  }
  const alpha = Math.min(1, (frac - 0.3) * 1.5)
  const cy = LOGICAL_H * 0.5
  ctx.lineCap = 'round'
  for (const s of streaks) {
    s.r += (80 + state.speed * 0.02) * s.k
    if (s.r > 420) s.r = 20 + Math.random() * 60
    const len = (20 + s.r * 0.12 * s.len) * (0.4 + frac * 0.6)
    const c = Math.cos(s.a)
    const sn = Math.sin(s.a)
    ctx.strokeStyle = `rgba(190,235,255,${(alpha * 0.5 * Math.min(1, s.r / 120)).toFixed(3)})`
    ctx.lineWidth = 1 + s.r / 400
    ctx.beginPath()
    ctx.moveTo(CX + c * s.r, cy + sn * s.r)
    ctx.lineTo(CX + c * (s.r + len), cy + sn * (s.r + len))
    ctx.stroke()
  }
}

/** Draw one frame. */
export function renderRacing(ctx: CanvasRenderingContext2D, view: RacingView): void {
  const state = view.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawSky(ctx, state)
  drawGround(ctx, state)
  drawScenery(ctx, state)
  drawFog(ctx)
  drawEnemies(ctx, state)
  drawParticles(ctx, state)
  drawStreaks(ctx, state)

  // Vignette.
  const vg = ctx.createRadialGradient(CX, LOGICAL_H / 2, Math.min(LOGICAL_W, LOGICAL_H) * 0.35, CX, LOGICAL_H / 2, Math.hypot(LOGICAL_W, LOGICAL_H) * 0.6)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.65)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  // HUD: score / distance / passes on the left, best + speed on the right.
  hudPair(ctx, MARGIN + 12, 22, '分数 ', String(Math.floor(state.score)), 'left', THEME.gold)
  hudPair(ctx, MARGIN + 12, HUD_H + 6, '距离 ', `${String(Math.floor(state.dist))} m · 超车 ${String(state.passCount)}`, 'left', THEME.text)
  hudPair(ctx, LOGICAL_W - 12, 22, '速度 ', `${String(Math.round(state.speed * 3.6))} km/h`, 'right', '#7fdfff')
  hudPair(ctx, LOGICAL_W - 12, HUD_H + 6, '最高 ', String(view.best), 'right', THEME.text)

  // Combo flash.
  if (state.combo > 1 && state.comboTimer > 0) {
    ctx.textAlign = 'center'
    ctx.font = '800 16px system-ui, sans-serif'
    ctx.fillStyle = '#5ff7ff'
    ctx.fillText(`COMBO ×${state.combo}`, CX, HORIZON - 8)
  }
  // Floating message (near-miss / crash).
  if (state.msgTimer > 0 && state.msg !== '') {
    ctx.textAlign = 'center'
    ctx.font = '900 20px system-ui, sans-serif'
    ctx.fillStyle = '#ffe066'
    ctx.globalAlpha = Math.min(1, state.msgTimer * 2.5)
    ctx.fillText(state.msg, CX, HORIZON - 30)
    ctx.globalAlpha = 1
  }

  // Overlays (end states keep precedence over the pause veil).
  if (state.result === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '撞车了！', `分数 ${String(Math.floor(state.score))} · 距离 ${String(Math.floor(state.dist))} m · Enter 再来一局`, THEME.bad)
  } else if (state.result === 'ready') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '霓虹疾驰', 'Enter 开始 · ← → 换道 · ↑ 加速', THEME.gold)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}

export { LANES, SPAWN_Z, CAM_H, glow, noGlow }
