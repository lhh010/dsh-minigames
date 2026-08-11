/**
 * 跳一跳 canvas renderer: platforms receding in perspective, the player cube
 * with a ground shadow that shrinks with height, a charge bar, and a
 * game-over overlay.
 */
import type { HopState } from './logic.ts'

export const VIEW_W = 360
export const VIEW_H = 300
export const GROUND_Y = 250

const BG = '#1b1b22'
const PLATFORM = '#5a7ab0'
const PLATFORM_EDGE = '#3a4a6a'
const PLAYER = '#e8c84c'
const PLAYER_LIGHT = '#f6df8a'
const TEXT = '#d8d8e0'

/** Draw one frame. */
export function renderHop(ctx: CanvasRenderingContext2D, state: HopState): void {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  // World -> screen: the current platform is near the left, ahead platforms
  // to the right, with a mild vertical drop for depth.
  const baseX = state.platforms[state.index]!.x
  const toScreenX = (wx: number): number => 40 + (wx - baseX) * 0.75
  const platformY = GROUND_Y + 10

  // Platforms (current + next two).
  for (let i = state.index; i < state.index + 3; i += 1) {
    const p = state.platforms[i]!
    const x = toScreenX(p.x)
    const w = p.w * 0.75
    const lift = (i - state.index) * 14
    ctx.fillStyle = PLATFORM
    ctx.fillRect(x, platformY - lift, w, 16)
    ctx.fillStyle = PLATFORM_EDGE
    ctx.fillRect(x, platformY - lift + 13, w, 3)
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
  ctx.fillStyle = PLAYER
  ctx.fillRect(-14, -14, 28, 28)
  // Top highlight + bottom lip give the flat cube a bit of depth.
  ctx.fillStyle = PLAYER_LIGHT
  ctx.fillRect(-14, -14, 28, 5)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(-14, 9, 28, 5)
  ctx.restore()

  // Charge bar.
  if (state.jumping || state.over) {
    // hidden mid-air
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(20, 20, 120, 10)
    ctx.fillStyle = '#e8c84c'
    ctx.fillRect(20, 20, 120 * state.power, 10)
    ctx.fillStyle = TEXT
    ctx.font = '11px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.fillText('按住蓄力，松开起跳', 20, 46)
  }

  // Score.
  ctx.fillStyle = TEXT
  ctx.font = 'bold 16px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`得分 ${state.score}`, VIEW_W - 14, 24)

  // Game-over overlay: shown only after the fall-off animation completes.
  if (state.over && !state.falling) {
    ctx.fillStyle = 'rgba(21,21,27,0.6)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.fillStyle = TEXT
    ctx.font = 'bold 22px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('掉 下 去 了', VIEW_W / 2, VIEW_H / 2 - 10)
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, VIEW_W / 2, VIEW_H / 2 + 16)
  }
}
