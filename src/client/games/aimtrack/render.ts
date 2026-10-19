/**
 * FPS aim-tracking canvas renderer on the shared theme kit: a themed sky/
 * ground range with a perspective grid, a glowing target and hit markers,
 * the fixed centre crosshair (gold while locked), a gun viewmodel with
 * muzzle flash, a hudPair HUD, hit particle bursts (observed from the hit
 * counter), and shared-style overlays for ready/paused/round-end states.
 */
import type { FpsTrackState } from './logic.ts'
import {
  bulletPosition, effectivePitch, effectiveYaw, isLocked, targetScreenX, targetScreenY,
  CAM_H, CAM_X, CAM_Y, LOGICAL_H, LOGICAL_W,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawOverlay, glow, hudPair, noGlow,
} from '../theme.ts'

const SKY_TOP = '#10142a'
const SKY_BOTTOM = '#1c2b45'
const GROUND = '#141a10'
const GROUND_GRID = 'rgba(122,162,247,0.10)'
const TARGET = accent(4)
const TARGET_EDGE = accent(6)
const CROSSHAIR = THEME.good
const LOCKED = THEME.gold
const FOCAL = LOGICAL_W / 2 // focal length for perspective projection

/** UI phase drawn by the renderer (mirrors the instance). */
export type UiPhase = 'ready' | 'playing' | 'paused' | 'over'

// Render-side hit burst, observed from the hit counter.
const particles = createParticles()
let prevHits = -1
let lastFrame = 0

/** Project a world point at height h into screen coords (effective view). */
function project(state: FpsTrackState, wx: number, wy: number, h: number): { x: number; y: number; depth: number } | null {
  const yaw = effectiveYaw(state)
  const dx = wx - CAM_X
  const dy = wy - CAM_Y
  const depth = dx * Math.cos(yaw) + dy * Math.sin(yaw)
  const lateral = dx * -Math.sin(yaw) + dy * Math.cos(yaw)
  if (depth < 20) return null
  const scale = FOCAL / depth
  return {
    x: LOGICAL_W / 2 + lateral * scale,
    y: LOGICAL_H / 2 + Math.tan(effectivePitch(state)) * FOCAL + (CAM_H - h) / depth * FOCAL,
    depth,
  }
}

/** Draw one frame; `t` is a running seconds counter for the target pulse. */
export function renderAimTrack(ctx: CanvasRenderingContext2D, state: FpsTrackState, t: number, phase: UiPhase): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  // Horizon: sky above, ground below, shifting with pitch (incl. recoil).
  const horizon = LOGICAL_H / 2 + Math.tan(effectivePitch(state)) * FOCAL * 0.6
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon))
  sky.addColorStop(0, SKY_TOP)
  sky.addColorStop(1, SKY_BOTTOM)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, LOGICAL_W, Math.max(0, horizon))
  ctx.fillStyle = GROUND
  ctx.fillRect(0, Math.max(0, horizon), LOGICAL_W, LOGICAL_H - Math.max(0, horizon))

  // Perspective ground grid (world grid lines projected into the view).
  ctx.strokeStyle = GROUND_GRID
  ctx.lineWidth = 1
  const gridStep = 160
  for (let gx = CAM_X - 960; gx <= CAM_X + 960; gx += gridStep) {
    const p1 = project(state, gx, CAM_Y - 800, 0)
    const p2 = project(state, gx, CAM_Y + 800, 0)
    if (p1 !== null && p2 !== null) {
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
    }
  }
  for (let gy = CAM_Y - 800; gy <= CAM_Y + 800; gy += gridStep) {
    const p1 = project(state, CAM_X - 960, gy, 0)
    const p2 = project(state, CAM_X + 960, gy, 0)
    if (p1 !== null && p2 !== null) {
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
    }
  }

  // Target, projected in 3D (lateral + height).
  if (phase === 'playing') {
    const tp = project(state, state.targetX, state.targetY, state.targetH)
    const sx = targetScreenX(state)
    const sy = targetScreenY(state)
    if (tp !== null && sx !== null && sy !== null) {
      const locked = isLocked(state)
      const size = Math.max(6, Math.min(18, 2600 / tp.depth))
      const pulse = 1 + Math.sin(t * 6) * 0.06
      glow(ctx, TARGET, 14)
      ctx.fillStyle = TARGET
      ctx.beginPath()
      ctx.arc(sx, sy, size * pulse, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
      ctx.strokeStyle = TARGET_EDGE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx, sy, size * pulse, 0, Math.PI * 2)
      ctx.stroke()
      if (locked) {
        ctx.strokeStyle = 'rgba(224,175,104,0.6)'
        ctx.beginPath()
        ctx.arc(sx, sy, size * 1.7, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  // Fixed centre crosshair.
  const locked = isLocked(state)
  ctx.strokeStyle = locked ? LOCKED : CROSSHAIR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(LOGICAL_W / 2, LOGICAL_H / 2, 9, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(LOGICAL_W / 2 - 14, LOGICAL_H / 2)
  ctx.lineTo(LOGICAL_W / 2 - 5, LOGICAL_H / 2)
  ctx.moveTo(LOGICAL_W / 2 + 5, LOGICAL_H / 2)
  ctx.lineTo(LOGICAL_W / 2 + 14, LOGICAL_H / 2)
  ctx.moveTo(LOGICAL_W / 2, LOGICAL_H / 2 - 14)
  ctx.lineTo(LOGICAL_W / 2, LOGICAL_H / 2 - 5)
  ctx.moveTo(LOGICAL_W / 2, LOGICAL_H / 2 + 5)
  ctx.lineTo(LOGICAL_W / 2, LOGICAL_H / 2 + 14)
  ctx.stroke()
  if (locked) {
    ctx.fillStyle = 'rgba(224,175,104,0.22)'
    ctx.beginPath()
    ctx.arc(LOGICAL_W / 2, LOGICAL_H / 2, 12, 0, Math.PI * 2)
    ctx.fill()
  }

  // Bullet in flight: a glowing tracer from the gun toward its end point.
  if (phase === 'playing') {
    const pos = bulletPosition(state)
    if (pos !== null) {
      const p = project(state, pos.x, pos.y, pos.h)
      if (p !== null) {
        glow(ctx, THEME.gold, 8)
        ctx.strokeStyle = 'rgba(224,175,104,0.85)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(LOGICAL_W - 90, LOGICAL_H + 10) // from the gun corner
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        noGlow(ctx)
        ctx.fillStyle = '#fff3b0'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // Impact spark on the target after a hit bullet lands.
    if (state.hitFlashT > 0) {
      const hx = targetScreenX(state)
      const hy = targetScreenY(state)
      if (hx !== null && hy !== null) {
        ctx.strokeStyle = 'rgba(224,175,104,0.9)'
        ctx.lineWidth = 2
        const s = 5 + (1 - state.hitFlashT / 0.15) * 6
        for (let i = 0; i < 4; i += 1) {
          const a = (i / 4) * Math.PI + t * 4
          ctx.beginPath()
          ctx.moveTo(hx + Math.cos(a) * s, hy + Math.sin(a) * s)
          ctx.lineTo(hx + Math.cos(a) * (s + 6), hy + Math.sin(a) * (s + 6))
          ctx.stroke()
        }
      }
    }
  }

  // First-person gun viewmodel (bottom-right), with recoil dip and muzzle flash.
  if (phase !== 'ready') drawGun(ctx, state)

  // Hit burst, observed from the hit counter (logic untouched).
  if (prevHits >= 0 && state.hits > prevHits) {
    const hx = targetScreenX(state)
    const hy = targetScreenY(state)
    particles.burst(hx ?? LOGICAL_W / 2, hy ?? LOGICAL_H / 2, THEME.gold, 14, 150)
  }
  prevHits = state.hits
  particles.tick(ctx, dt)

  // HUD.
  if (phase !== 'ready') {
    hudPair(ctx, 10, 18, '⏱ ', `${Math.max(0, Math.ceil(state.remaining))}s`, 'left', THEME.gold)
    hudPair(ctx, LOGICAL_W - 10, 18, `得分 ${Math.floor(state.score)} · `, `命中率 ${shotRatePct(state).toFixed(0)}%`, 'right')
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillStyle = THEME.textMuted
    ctx.textAlign = 'left'
    ctx.fillText('左键 射击 · P 暂停 · Esc 释放鼠标 · R 重开', 10, LOGICAL_H - 6)
  }

  if (phase === 'ready') {
    overlay(ctx,
      '点击进入跟枪',
      '点击锁定鼠标（光标隐藏），移动鼠标转动视角',
      '准星固定在屏幕中央 · 左键射击 · P 暂停',
    )
  } else if (phase === 'paused') {
    overlay(ctx, '已暂停', '按 P 或点击继续 · R 重开')
  } else if (phase === 'over') {
    overlay(ctx,
      '时间到！',
      `得分 ${Math.floor(state.score)} · 命中率 ${shotRatePct(state).toFixed(0)}%`,
      '点击重新开始 · R 重开',
    )
  }
}

/** A simple first-person rifle held in the bottom-right corner. */
function drawGun(ctx: CanvasRenderingContext2D, state: FpsTrackState): void {
  const kick = Math.min(1, state.recoilPitch / 0.2) // recoil dips the gun
  ctx.save()
  ctx.translate(LOGICAL_W - 12, LOGICAL_H - 4 + kick * 12)
  ctx.rotate(-0.52 - kick * 0.05)
  const metal = '#3a3e45'
  const metalHi = '#555a62'
  const metalLo = '#22252a'
  const wood = '#4a3527'
  // Receiver.
  ctx.fillStyle = metal
  ctx.fillRect(-150, -14, 122, 16)
  ctx.fillStyle = metalHi
  ctx.fillRect(-150, -14, 122, 5)
  // Barrel + front sight.
  ctx.fillStyle = metalLo
  ctx.fillRect(-186, -8, 40, 7)
  ctx.fillStyle = metalHi
  ctx.fillRect(-186, -8, 40, 2.5)
  ctx.fillStyle = metal
  ctx.fillRect(-192, -13, 7, 16)
  // Handguard.
  ctx.fillStyle = '#2f333a'
  ctx.fillRect(-150, 2, 92, 12)
  // Grip.
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.moveTo(-98, 2)
  ctx.lineTo(-86, 30)
  ctx.lineTo(-72, 30)
  ctx.lineTo(-76, 2)
  ctx.closePath()
  ctx.fill()
  // Magazine.
  ctx.fillStyle = metalLo
  ctx.beginPath()
  ctx.moveTo(-60, 2)
  ctx.lineTo(-52, 28)
  ctx.lineTo(-38, 28)
  ctx.lineTo(-42, 2)
  ctx.closePath()
  ctx.fill()
  // Optic.
  ctx.fillStyle = metalLo
  ctx.fillRect(-122, -26, 36, 12)
  ctx.fillStyle = '#101216'
  ctx.fillRect(-117, -23, 26, 5)
  ctx.restore()

  // Muzzle flash right after a shot.
  if (state.flashT > 0) {
    const angle = -0.52
    const mx = LOGICAL_W - 12 + Math.cos(angle) * -198
    const my = LOGICAL_H - 4 + Math.sin(angle) * -198
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(Math.PI / 4)
    glow(ctx, THEME.gold, 12)
    ctx.fillStyle = 'rgba(255,216,61,0.95)'
    ctx.beginPath()
    ctx.moveTo(0, -11)
    ctx.lineTo(7, 0)
    ctx.lineTo(0, 11)
    ctx.lineTo(-7, 0)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath()
    ctx.moveTo(0, -5)
    ctx.lineTo(4, 0)
    ctx.lineTo(0, 5)
    ctx.lineTo(-4, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

/** Shared-style overlay veil with a spaced title and up to two body lines. */
function overlay(ctx: CanvasRenderingContext2D, title: string, line1: string, line2?: string): void {
  drawOverlay(ctx, LOGICAL_W, LOGICAL_H, title, line1, THEME.gold)
  if (line2 !== undefined) {
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(line2, LOGICAL_W / 2, LOGICAL_H / 2 + 42)
  }
}

function shotRatePct(state: FpsTrackState): number {
  return state.shots <= 0 ? 0 : (state.hits / state.shots) * 100
}
