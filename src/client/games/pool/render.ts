/**
 * Mini Pool renderer: the felt table with rails and pockets, numbered balls,
 * the cue-stick aim guide and power bar, HUD, and the shared overlays. All
 * drawing happens in the fixed logical space (LOGICAL_W x LOGICAL_H); the
 * playfield maps 1:1 onto the table rect inside a rail margin.
 */
import {
  BALL_R, POCKET_R, TABLE_H, TABLE_W, computeAimGuide, shotsAllowed,
  type Ball, type PoolState,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 680
export const LOGICAL_H = 400
const RAIL = 22
/** World→logical pixel scale (world units are ~2.6 logical px each). */
const SCALE = (LOGICAL_W - RAIL * 2 - 24) / TABLE_W
const TABLE_X = (LOGICAL_W - TABLE_W * SCALE) / 2
const TABLE_Y = (LOGICAL_H - TABLE_H * SCALE) / 2

const BALL_COLORS: Record<number, string> = {
  1: '#f7768e', 2: '#e0af68', 3: '#e06c75', 4: '#7dcfff', 5: '#bb9af7',
  6: '#9ece6a', 7: '#c94f6d', 8: '#33334a', 9: '#ff9e64',
}

export interface PoolView {
  state: PoolState
  paused: boolean
  /** Drag-in-progress aim (angle + power) overriding state fields when set. */
  aim: { angle: number; power: number } | null
  best: number
}

/** Convert world (table) coordinates to logical canvas coordinates. */
export function worldToLogical(x: number, y: number): { x: number; y: number } {
  return { x: TABLE_X + x * SCALE, y: TABLE_Y + y * SCALE }
}

/** Convert logical canvas coordinates back to world coordinates. */
export function logicalToWorld(x: number, y: number): { x: number; y: number } {
  return { x: (x - TABLE_X) / SCALE, y: (y - TABLE_Y) / SCALE }
}

function drawTable(ctx: CanvasRenderingContext2D): void {
  const w = TABLE_W * SCALE
  const h = TABLE_H * SCALE
  // Wooden outer rail.
  roundRectPath(ctx, TABLE_X - RAIL, TABLE_Y - RAIL, w + RAIL * 2, h + RAIL * 2, 14)
  ctx.fillStyle = '#2a1f14'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  // Felt with a soft center light.
  const felt = ctx.createRadialGradient(TABLE_X + w / 2, TABLE_Y + h / 2, h * 0.2, TABLE_X + w / 2, TABLE_Y + h / 2, w * 0.7)
  felt.addColorStop(0, '#1f4d3d')
  felt.addColorStop(1, '#12332a')
  roundRectPath(ctx, TABLE_X, TABLE_Y, w, h, 4)
  ctx.fillStyle = felt
  ctx.fill()
  // Cushion inner edge.
  ctx.strokeStyle = 'rgba(226,226,238,0.10)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function drawPockets(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#05050a'
  for (let i = 0; i <= TABLE_W; i += TABLE_W / 2) {
    for (let j = 0; j <= TABLE_H; j += TABLE_H) {
      const p = worldToLogical(i, j)
      glow(ctx, '#000', 8)
      ctx.beginPath()
      ctx.arc(p.x, p.y, POCKET_R * SCALE, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    }
  }
}

function drawBall(ctx: CanvasRenderingContext2D, ball: Ball): void {
  const p = worldToLogical(ball.x, ball.y)
  const r = BALL_R * SCALE
  const color = ball.id === 0 ? '#f4f4f5' : BALL_COLORS[ball.id] ?? accent(ball.id)
  glow(ctx, color, 7)
  const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.25, color)
  g.addColorStop(1, ball.id === 0 ? '#c9c9d4' : '#111122')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  if (ball.id !== 0) {
    ctx.fillStyle = '#f4f4f5'
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 0.52, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#181825'
    ctx.font = `bold ${Math.round(r * 0.78)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(ball.id), p.x, p.y + 0.5)
  }
}

function drawAim(ctx: CanvasRenderingContext2D, state: PoolState, aim: { angle: number; power: number } | null): void {
  const angle = aim?.angle ?? state.aimAngle
  const power = aim?.power ?? 0
  const guide = computeAimGuide(state.balls, angle)
  if (guide.path.length >= 2) {
    ctx.strokeStyle = 'rgba(226,226,238,0.55)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    const first = worldToLogical(guide.path[0]!.x, guide.path[0]!.y)
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < guide.path.length; i += 1) {
      const p = worldToLogical(guide.path[i]!.x, guide.path[i]!.y)
      ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    const impact = worldToLogical(guide.impact.x, guide.impact.y)
    ctx.fillStyle = 'rgba(226,226,238,0.8)'
    ctx.beginPath()
    ctx.arc(impact.x, impact.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  // Cue stick pulled back ∝ power, pointing opposite the aim.
  const cue = state.balls.find(b => b.id === 0 && !b.potted)
  if (cue !== undefined) {
    const c = worldToLogical(cue.x, cue.y)
    const pull = 26 + power * 60
    ctx.strokeStyle = '#d9c58a'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(c.x - Math.cos(angle) * (BALL_R * SCALE + 4), c.y - Math.sin(angle) * (BALL_R * SCALE + 4))
    ctx.lineTo(c.x - Math.cos(angle) * (BALL_R * SCALE + pull), c.y - Math.sin(angle) * (BALL_R * SCALE + pull))
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
}

function drawPowerBar(ctx: CanvasRenderingContext2D, power: number): void {
  const w = 160
  const x = (LOGICAL_W - w) / 2
  const y = LOGICAL_H - 16
  roundRectPath(ctx, x, y - 8, w, 10, 5)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  roundRectPath(ctx, x + 1.5, y - 6.5, Math.max(0, (w - 3) * power), 7, 3.5)
  ctx.fillStyle = power > 0.8 ? THEME.bad : power > 0.5 ? THEME.gold : THEME.good
  ctx.fill()
}

/** Render one frame of the pool game (pure drawing; no state mutation). */
export function renderPool(ctx: CanvasRenderingContext2D, view: PoolView): void {
  const { state, paused, aim, best } = view
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawTable(ctx)
  drawPockets(ctx)
  if (state.result === 'aiming' || state.result === 'paused' && state.pausedFrom === 'aiming') {
    drawAim(ctx, state, aim)
  }
  for (const b of state.balls) {
    if (!b.potted) drawBall(ctx, b)
  }
  // HUD.
  const remaining = Math.max(0, shotsAllowed(state.level) - state.shotsUsed)
  hudPair(ctx, 16, 24, '关卡', String(state.level))
  hudPair(ctx, 16, 44, '得分', String(Math.floor(state.score)))
  hudPair(ctx, LOGICAL_W - 16, 24, '剩余杆数', String(remaining), 'right', remaining <= 2 ? THEME.bad : THEME.text)
  hudPair(ctx, LOGICAL_W - 16, 44, '最佳', String(best), 'right', THEME.gold)
  if (state.result === 'aiming' && aim !== null && aim.power > 0) drawPowerBar(ctx, aim.power)
  if (state.msgTimer > 0 && state.msg !== '') {
    ctx.textAlign = 'center'
    ctx.font = '600 15px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(state.msg, LOGICAL_W / 2, 28)
  }
  if (paused) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续')
  else if (state.result === 'levelWon') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '清台成功', state.msg, THEME.good)
  else if (state.result === 'gameOver') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', '按 R 重试本关', THEME.bad)
  else if (state.result === 'ready') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '迷你台球', '拖拽白球方向击球，或 ← → 瞄准 + 长按空格蓄力')
}
