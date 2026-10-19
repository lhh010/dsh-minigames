/**
 * 跳一跳 canvas renderer: platforms receding in perspective, the player cube
 * with a ground shadow that shrinks with height, a charge bar, a game-over
 * overlay, and a particle burst on each landing score. Uses the shared
 * visual kit (../theme.ts).
 */
import type { HopState } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const VIEW_W = 360
export const VIEW_H = 300
export const GROUND_Y = 250

// Render-side event observation: burst when the score increases.
const particles = createParticles()
let prevScore = -1
let prevFrameMs = 0

/** Draw one frame. */
export function renderHop(ctx: CanvasRenderingContext2D, state: HopState): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  ctx.clearRect(0, 0, VIEW_W, VIEW_H)
  drawBackground(ctx, VIEW_W, VIEW_H)

  // World -> screen: the current platform is near the left, ahead platforms
  // to the right, with a mild vertical drop for depth.
  const baseX = state.platforms[state.index]!.x
  const toScreenX = (wx: number): number => 40 + (wx - baseX) * 0.75
  const platformY = GROUND_Y + 10

  // Platforms (current + next two); color by absolute index (stable).
  for (let i = state.index; i < state.index + 3; i += 1) {
    const p = state.platforms[i]!
    const x = toScreenX(p.x)
    const w = p.w * 0.75
    const lift = (i - state.index) * 14
    const color = accent(i)
    glow(ctx, color, 8)
    ctx.fillStyle = color
    roundRectPath(ctx, x, platformY - lift, w, 16, 5)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = THEME.bgBottom
    ctx.fillRect(x + 2, platformY - lift + 13, w - 4, 3)
  }

  // Player cube. height = airborne altitude in world units (> 0 in the air);
  // during the fall-off animation y grows positive, pushing the cube down.
  const px = toScreenX(state.playerX)
  const height = -state.y
  const py = platformY - 28 - height * 0.8

  // Ground shadow: stays on the platform line, shrinks and fades with height;
  // gone entirely once the player is falling off the platform.
  if (!state.falling) {
    const shadowScale = Math.max(0.35, 1 - height / 80)
    ctx.fillStyle = `rgba(0, 0, 0, ${(0.45 * shadowScale).toFixed(3)})`
    ctx.beginPath()
    ctx.ellipse(px, platformY + 6, 20 * shadowScale, 5.5 * shadowScale, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Cube: tilts forward while airborne; tumbles over while falling off.
  ctx.save()
  ctx.translate(px, py + 14)
  if (state.falling) {
    ctx.rotate(Math.min(Math.PI * 2, state.y / 25))
  } else if (state.jumping) {
    ctx.rotate(Math.min(0.65, height / 60) * 0.9)
  }
  glow(ctx, THEME.gold, 10)
  ctx.fillStyle = THEME.gold
  roundRectPath(ctx, -14, -14, 28, 28, 6)
  ctx.fill()
  noGlow(ctx)
  // Top highlight + bottom lip give the flat cube a bit of depth.
  ctx.fillStyle = '#f6df8a'
  ctx.fillRect(-13, -13, 26, 5)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(-13, 8, 26, 5)
  ctx.restore()

  // Charge bar.
  if (state.jumping || state.over) {
    // hidden mid-air
  } else {
    ctx.fillStyle = THEME.panelEdge
    roundRectPath(ctx, 20, 20, 120, 10, 5)
    ctx.fill()
    if (state.power > 0.01) {
      glow(ctx, accent(0), 6)
      ctx.fillStyle = accent(0)
      roundRectPath(ctx, 20, 20, Math.max(6, 120 * state.power), 10, 5)
      ctx.fill()
      noGlow(ctx)
    }
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('按住蓄力，松开起跳', 20, 46)
  }

  // Score.
  hudPair(ctx, VIEW_W - 14, 24, '得分 ', String(state.score), 'right', THEME.gold)

  // Landing burst (observed render-side; logic untouched).
  if (prevScore >= 0 && state.score > prevScore) {
    particles.burst(px, py, THEME.gold, 14, 140)
  }
  prevScore = state.score
  particles.tick(ctx, dtMs)

  // Game-over overlay: shown only after the fall-off animation completes.
  if (state.over && !state.falling) {
    drawOverlay(ctx, VIEW_W, VIEW_H, '掉下去了', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  }
}
