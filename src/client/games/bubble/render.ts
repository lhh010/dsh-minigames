/**
 * 泡泡龙 canvas renderer: the walled hex playfield with a ceiling, the
 * danger line, glowing bubbles, the rotating shooter with its loaded and
 * next bubble, a dotted aim guide, and overlays for pause / game over /
 * level clear. The renderer stays stateless and draws caller-owned logic
 * state using the shared visual kit (../theme.ts); geometry constants come
 * from logic.ts so tests and rendering share one truth.
 */
import {
  CEIL_Y, GRID_ROWS, LOSE_ROW, PLAY_W, PLAY_X, R, SHOOTER_X, SHOOTER_Y,
  LOGICAL_W, LOGICAL_H, cellX, cellY, colsIn, type BubbleState,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

export { LOGICAL_W, LOGICAL_H }
export const HUD_H = CEIL_Y

const LOSE_LINE_Y = cellY(LOSE_ROW) - R
const NEXT_X = SHOOTER_X + 62
const NEXT_Y = SHOOTER_Y - 14

/** Draw one bubble (grid, flying, or preview) at a logical position. */
function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, color: number): void {
  const fill = accent(color)
  glow(ctx, fill, 12)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(16,16,26,0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(x - R * 0.32, y - R * 0.34, R * 0.28, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draw one frame.
 * @param paused - show the 已暂停 overlay.
 */
export function renderBubble(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: BubbleState, paused: boolean,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, PLAY_X, 21, '关卡 ', String(state.level))
  hudPair(ctx, w - PLAY_X, 21, '分 数 ', String(state.score), 'right', THEME.gold)

  // Playfield: recessed panel, walls, ceiling, danger line.
  ctx.fillStyle = 'rgba(255,255,255,0.028)'
  ctx.fillRect(PLAY_X, CEIL_Y, PLAY_W, LOSE_LINE_Y - CEIL_Y)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PLAY_X, LOSE_LINE_Y); ctx.lineTo(PLAY_X, CEIL_Y)
  ctx.lineTo(PLAY_X + PLAY_W, CEIL_Y); ctx.lineTo(PLAY_X + PLAY_W, LOSE_LINE_Y)
  ctx.stroke()
  ctx.strokeStyle = THEME.bad
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(PLAY_X + 2, LOSE_LINE_Y); ctx.lineTo(PLAY_X + PLAY_W - 2, LOSE_LINE_Y)
  ctx.stroke()
  ctx.setLineDash([])

  // Occupied cells (up to the lose row; deeper rows only exist pre-lose).
  for (let r = 0; r < Math.min(GRID_ROWS, LOSE_ROW); r += 1) {
    for (let c = 0; c < colsIn(r); c += 1) {
      const color = state.grid[r]![c]
      if (color != null) drawBubble(ctx, cellX(r, c), cellY(r), color)
    }
  }

  // Aim guide: a dotted ray from the shooter along the aim direction.
  const dx = Math.cos(state.aim)
  const dy = -Math.sin(state.aim)
  const guideColor = accent(state.current)
  ctx.strokeStyle = guideColor
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 2
  ctx.setLineDash([4, 9])
  ctx.beginPath()
  ctx.moveTo(SHOOTER_X + dx * (R + 6), SHOOTER_Y + dy * (R + 6))
  ctx.lineTo(SHOOTER_X + dx * (R + 104), SHOOTER_Y + dy * (R + 104))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // Shooter: barrel, loaded bubble, base ring.
  ctx.strokeStyle = THEME.text
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(SHOOTER_X + dx * (R + 2), SHOOTER_Y + dy * (R + 2))
  ctx.lineTo(SHOOTER_X + dx * (R + 14), SHOOTER_Y + dy * (R + 14))
  ctx.stroke()
  drawBubble(ctx, SHOOTER_X, SHOOTER_Y, state.current)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(SHOOTER_X, SHOOTER_Y, R + 5, 0, Math.PI * 2)
  ctx.stroke()

  // Next preview.
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('下一个', NEXT_X, NEXT_Y + R + 14)
  drawBubble(ctx, NEXT_X, NEXT_Y, state.next)

  const f = state.flying
  if (f !== null) drawBubble(ctx, f.x, f.y, f.color)

  if (state.result === 'over') {
    drawOverlay(ctx, w, h, '游戏结束', `得分 ${state.score} · 按 R 重开本关`, THEME.bad)
  } else if (state.result === 'won') {
    drawOverlay(ctx, w, h, '过关', `即将进入第 ${state.level + 1} 关…`, THEME.good)
  } else if (paused || state.result === 'paused') {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
