/**
 * Zuma renderer: the S-curve track ribbon, the sink hole, the chain balls
 * (tail-first so the head paints on top), the flying shot with an aim
 * guide, the shooter with the next-ball preview, HUD, and overlays. All
 * drawing happens in the fixed logical space (LOGICAL_W x LOGICAL_H).
 */
import {
  BALL_R, LOGICAL_H, LOGICAL_W, PALETTE, SHOOTER, SINK_R, TRACK_LENGTH,
  trackAt, type ZumaState,
} from './logic.ts'
import { THEME, drawBackground, glow, hudPair, drawOverlay, noGlow } from '../theme.ts'

export interface ZumaView {
  state: ZumaState
  paused: boolean
}

function ballPos(s: number): { x: number; y: number } {
  const p = trackAt(Math.min(Math.max(s, 0), TRACK_LENGTH))
  return { x: p.x, y: p.y }
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, colorIdx: number, r: number): void {
  const color = PALETTE[colorIdx] ?? THEME.text
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.beginPath()
  ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2)
  ctx.fill()
  glow(ctx, color, 8)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // Gloss highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.32, 0, Math.PI * 2)
  ctx.fill()
}

function drawTrack(ctx: CanvasRenderingContext2D): void {
  const step = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [width, color] of [[BALL_R * 2 + 14, THEME.panelEdge], [BALL_R * 2 + 6, THEME.panel]] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (let s = 0; s <= TRACK_LENGTH; s += step) {
      const p = trackAt(s)
      if (s === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    const end = trackAt(TRACK_LENGTH)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
  }
}

function drawSink(ctx: CanvasRenderingContext2D): void {
  const p = trackAt(TRACK_LENGTH)
  glow(ctx, THEME.bad, 16)
  ctx.fillStyle = '#05050a'
  ctx.beginPath()
  ctx.arc(p.x, p.y, SINK_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.bad
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(p.x, p.y, SINK_R + 2, 0, Math.PI * 2)
  ctx.stroke()
}

function drawSpawn(ctx: CanvasRenderingContext2D): void {
  const p = trackAt(0)
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('出珠口', p.x, p.y - 26)
}

function drawShooter(ctx: CanvasRenderingContext2D, state: ZumaState): void {
  const { x, y } = SHOOTER
  // Aim guide.
  ctx.save()
  ctx.strokeStyle = 'rgba(226,226,238,0.28)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 7])
  ctx.beginPath()
  ctx.moveTo(x + Math.cos(state.angle) * 22, y + Math.sin(state.angle) * 22)
  ctx.lineTo(x + Math.cos(state.angle) * 130, y + Math.sin(state.angle) * 130)
  ctx.stroke()
  ctx.restore()
  // Mount.
  glow(ctx, THEME.gold, 12)
  ctx.fillStyle = THEME.panelEdge
  ctx.beginPath()
  ctx.arc(x, y, BALL_R + 10, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, BALL_R + 10, 0, Math.PI * 2)
  ctx.stroke()
  drawBall(ctx, x, y, state.current, BALL_R)
  // Next-ball preview.
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('下一个', x + 44, y + 22)
  drawBall(ctx, x + 44, y + 6, state.next, BALL_R * 0.7)
}

/** Draw one frame. */
export function renderZuma(ctx: CanvasRenderingContext2D, view: ZumaView): void {
  const state = view.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawTrack(ctx)
  drawSink(ctx)
  drawSpawn(ctx)

  // Chain balls, tail-first so the head paints on top.
  for (let i = state.balls.length - 1; i >= 0; i -= 1) {
    const b = state.balls[i]!
    const p = ballPos(b.s)
    drawBall(ctx, p.x, p.y, b.color, BALL_R)
  }

  if (state.shot !== null) drawBall(ctx, state.shot.x, state.shot.y, state.shot.color, BALL_R)
  drawShooter(ctx, state)

  // HUD.
  hudPair(ctx, 12, 22, '分数 ', String(Math.floor(state.score)), 'left', THEME.gold)
  hudPair(ctx, 12, 42, '关卡 ', String(state.level), 'left', THEME.text)
  hudPair(ctx, LOGICAL_W - 12, 22, '剩余 ', String(state.balls.length + state.remaining), 'right', '#7fdfff')

  // Floating message.
  if (state.msgTimer > 0 && state.msg !== '') {
    ctx.textAlign = 'center'
    ctx.font = '900 20px system-ui, sans-serif'
    ctx.fillStyle = '#ffe066'
    ctx.globalAlpha = Math.min(1, state.msgTimer * 2)
    ctx.fillText(state.msg, LOGICAL_W / 2, 70)
    ctx.globalAlpha = 1
  }

  if (state.result === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `分数 ${String(Math.floor(state.score))} · Enter 再来一局`, THEME.bad)
  } else if (state.result === 'ready') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '祖玛', 'Enter 开始 · ← → 瞄准 · 空格发射', THEME.gold)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}

export { LOGICAL_W, LOGICAL_H, glow, noGlow }
