/**
 * Mini Bowling renderer: the top-down lane (wood boards, gutters, foul line,
 * aim arrows, pin deck), pins with red necks, the marbled ball, the aim
 * arrow, power meter and spin indicator, the frame/score HUD, and the shared
 * overlays. All drawing happens in the fixed logical space; the lane's world
 * coordinates (LANE_W × LANE_H) map 1:1 through a uniform scale.
 */
import {
  BALL_RADIUS, DECK_TOP, FOUL_Y, HOOK_Y, LANE_H, LANE_W, PIN_R,
  levelThreshold, currentScore, type BowlingState, type Pin,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 340
export const LOGICAL_H = 700
const HUD_H = 74
const MARGIN = 14
const SCALE = Math.min((LOGICAL_W - MARGIN * 2) / LANE_W, (LOGICAL_H - HUD_H - MARGIN * 2) / LANE_H)
const LANE_X = (LOGICAL_W - LANE_W * SCALE) / 2
const LANE_Y = HUD_H + (LOGICAL_H - HUD_H - MARGIN - LANE_H * SCALE) / 2

export interface BowlingView {
  state: BowlingState
  paused: boolean
  best: number
}

const wx = (x: number): number => LANE_X + x * SCALE
const wy = (y: number): number => LANE_Y + y * SCALE

/** Inverse of the lane mapping: canvas-logical point → lane coordinates. */
export function laneFromLogical(x: number, y: number): { x: number; y: number } {
  return { x: (x - LANE_X) / SCALE, y: (y - LANE_Y) / SCALE }
}

function drawLane(ctx: CanvasRenderingContext2D): void {
  const x = wx(0)
  const y = wy(0)
  const w = LANE_W * SCALE
  const h = LANE_H * SCALE
  // Outer frame.
  roundRectPath(ctx, x - 8, y - 8, w + 16, h + 16, 10)
  ctx.fillStyle = '#2a1f14'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  // Gutters: dark channels flanking the playable lane.
  ctx.fillStyle = '#0b0b12'
  ctx.fillRect(x - 7, y, 7, h)
  ctx.fillRect(x + w, y, 7, h)
  // Wooden lane with board seams and a lengthwise sheen.
  const wood = ctx.createLinearGradient(x, y, x + w, y)
  wood.addColorStop(0, '#8a6a3f')
  wood.addColorStop(0.5, '#c89a5a')
  wood.addColorStop(1, '#8a6a3f')
  ctx.fillStyle = wood
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = 'rgba(60,36,14,0.35)'
  ctx.lineWidth = 0.7
  for (let i = 1; i < 10; i += 1) {
    const bx = x + (w * i) / 10
    ctx.beginPath()
    ctx.moveTo(bx, y)
    ctx.lineTo(bx, y + h)
    ctx.stroke()
  }
  const sheen = ctx.createLinearGradient(x, y, x, y + h)
  sheen.addColorStop(0, 'rgba(255,255,255,0.14)')
  sheen.addColorStop(0.4, 'rgba(255,255,255,0)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.22)')
  ctx.fillStyle = sheen
  ctx.fillRect(x, y, w, h)
  // Hook zone tint (back third) and pin-deck plate.
  ctx.fillStyle = 'rgba(122,162,247,0.06)'
  ctx.fillRect(x, wy(HOOK_Y), w, wy(0) - wy(HOOK_Y))
  ctx.fillStyle = 'rgba(13,13,20,0.30)'
  ctx.fillRect(x, y, w, wy(DECK_TOP) - y)
  // Range arrows + foul line.
  ctx.fillStyle = 'rgba(60,36,14,0.8)'
  for (let i = -2; i <= 2; i += 1) {
    const ax = wx(LANE_W / 2 + i * 30)
    const ay = wy(FOUL_Y - 120 + Math.abs(i) * 26)
    ctx.beginPath()
    ctx.moveTo(ax, ay - 9)
    ctx.lineTo(ax - 4, ay)
    ctx.lineTo(ax + 4, ay)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = '#f7768e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, wy(FOUL_Y))
  ctx.lineTo(x + w, wy(FOUL_Y))
  ctx.stroke()
}

function drawPin(ctx: CanvasRenderingContext2D, pin: Pin): void {
  if (pin.swept) return
  const px = wx(pin.x)
  const py = wy(pin.y)
  const r = PIN_R * SCALE
  glow(ctx, pin.knocked ? THEME.bad : '#f4f4f5', 6)
  const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.15, px, py, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.6, pin.knocked ? '#d9a9b4' : '#e8e8f0')
  g.addColorStop(1, '#8a8a9a')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(px, py, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = '#f7768e'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(px, py, r * 0.55, 0, Math.PI * 2)
  ctx.stroke()
}

function drawBall(ctx: CanvasRenderingContext2D, state: BowlingState): void {
  const ball = state.ball
  if (!ball.live) return
  const bx = wx(ball.x)
  const by = wy(ball.y)
  const r = BALL_RADIUS * SCALE
  glow(ctx, '#7dcfff', 8)
  const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.35, r * 0.1, bx, by, r)
  g.addColorStop(0, '#5f7ea8')
  g.addColorStop(0.55, '#27354d')
  g.addColorStop(1, '#101826')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(bx, by, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#0a0f18'
  for (const [ox, oy] of [[-0.3, -0.3], [0.28, -0.34], [-0.02, 0.16]] as const) {
    ctx.beginPath()
    ctx.arc(bx + ox * r, by + oy * r, r * 0.11, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Aim arrow + dotted guide while aiming/charging. */
function drawAim(ctx: CanvasRenderingContext2D, state: BowlingState): void {
  if (state.phase !== 'aiming') return
  const bx = wx(LANE_W / 2)
  const by = wy(state.ball.y)
  const a = state.aimAngle
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  ctx.save()
  ctx.setLineDash([4, 6])
  ctx.strokeStyle = 'rgba(226,226,238,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(bx + dx * BALL_RADIUS * SCALE * 1.4, by + dy * BALL_RADIUS * SCALE * 1.4)
  ctx.lineTo(bx + dx * 90, by + dy * 90)
  ctx.stroke()
  ctx.restore()
  const hx = bx + dx * 100
  const hy = by + dy * 100
  ctx.fillStyle = accent(0)
  glow(ctx, accent(0), 8)
  ctx.beginPath()
  ctx.moveTo(hx + dx * 12, hy + dy * 12)
  ctx.lineTo(hx - dy * 6, hy + dx * 6)
  ctx.lineTo(hx + dy * 6, hy - dx * 6)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // Precise aim readout right under the ball: signed degrees to 0.1°.
  const deg = (a * 180) / Math.PI
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText(`${deg >= 0 ? '+' : ''}${deg.toFixed(1)}°`, bx, by + BALL_RADIUS * SCALE + 16)
}

function drawMeters(ctx: CanvasRenderingContext2D, state: BowlingState): void {
  // Power meter: vertical bar right of the lane.
  const mx = wx(LANE_W) + 14
  const top = wy(FOUL_Y - 160)
  const h = 150
  roundRectPath(ctx, mx - 5, top - 6, 14, h + 12, 6)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  const p = state.power
  const grad = ctx.createLinearGradient(mx, top + h, mx, top)
  grad.addColorStop(0, THEME.good)
  grad.addColorStop(0.6, THEME.gold)
  grad.addColorStop(1, THEME.bad)
  ctx.fillStyle = grad
  ctx.fillRect(mx - 3, top + h * (1 - p), 10, h * p)
  // Spin indicator: arrow left of the lane, length ∝ |spin|.
  const sx = wx(0) - 16
  const sy = top + h / 2
  const spin = state.spin
  ctx.fillStyle = spin === 0 ? THEME.textMuted : accent(1)
  const len = 6 + Math.abs(spin) * 16
  const dir = spin >= 0 ? 1 : -1
  ctx.beginPath()
  ctx.moveTo(sx + dir * len, sy)
  ctx.lineTo(sx - dir * 6, sy - 6)
  ctx.lineTo(sx - dir * 6, sy + 6)
  ctx.closePath()
  ctx.fill()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('旋', sx, sy + 22)
}

function drawHud(ctx: CanvasRenderingContext2D, state: BowlingState, best: number): void {
  const shown = currentScore(state)
  hudPair(ctx, MARGIN, 22, `等级 ${state.level}`, `${shown} / ${levelThreshold(state.level)}`)
  hudPair(ctx, LOGICAL_W - MARGIN, 22, `最佳`, `${best}`, 'right')
  // Frame strip: five boxes with the rolls of each frame so far.
  const bw = 46
  const gap = 6
  const total = bw * 5 + gap * 4
  const x0 = (LOGICAL_W - total) / 2
  const y0 = 34
  ctx.font = '600 11px system-ui, sans-serif'
  for (let f = 0; f < 5; f += 1) {
    const x = x0 + f * (bw + gap)
    roundRectPath(ctx, x, y0, bw, 30, 5)
    ctx.fillStyle = f === state.frame ? 'rgba(122,162,247,0.14)' : THEME.panel
    ctx.fill()
    ctx.strokeStyle = f === state.frame ? accent(0) : THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(`${f + 1}`, x + bw / 2, y0 + 12)
    ctx.fillStyle = THEME.text
    const marks = frameMarks(state, f)
    ctx.fillText(marks, x + bw / 2, y0 + 25)
  }
  if (state.msgTimer > 0 && state.msg !== '') {
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText(state.msg, LOGICAL_W / 2, LOGICAL_H - 10)
  }
}

/** Roll marks for one HUD frame box ('X', '8 /', '3 4', ''). */
function frameMarks(state: BowlingState, f: number): string {
  // Split the flat rolls back into frames with the same rules as scoreGame.
  const frames: number[][] = []
  let i = 0
  for (let k = 0; k < 5 && i < state.rolls.length; k += 1) {
    if (k === 4) {
      const take = state.rolls.length - i
      frames.push(state.rolls.slice(i, i + Math.min(3, take)))
      i += 3
    } else if (state.rolls[i] === 10) {
      frames.push([10])
      i += 1
    } else {
      frames.push(state.rolls.slice(i, i + 2))
      i += 2
    }
  }
  const fr = frames[f]
  if (fr === undefined || fr.length === 0) return ''
  if (fr.length === 1) return fr[0] === 10 ? 'X' : `${fr[0]}`
  if (fr.length === 2) {
    if (fr[0] === 10) return `X ${fr[1] === 10 ? 'X' : fr[1]}`
    return fr[0]! + fr[1]! === 10 ? `${fr[0]} /` : `${fr[0]} ${fr[1]}`
  }
  const third = fr[2] === 10 ? 'X' : `${fr[2]}`
  return `${fr[0] === 10 ? 'X' : fr[0]}${fr[1] === 10 || fr[0]! + fr[1]! === 10 ? (fr[1] === 10 ? 'X' : '/') : fr[1]}${third}`
}

/** Draw the whole scene (call once per rendered frame). */
export function renderBowling(ctx: CanvasRenderingContext2D, view: BowlingView): void {
  const { state, paused, best } = view
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawHud(ctx, state, best)
  drawLane(ctx)
  for (const pin of state.pins) drawPin(ctx, pin)
  drawBall(ctx, state)
  drawAim(ctx, state)
  drawMeters(ctx, state)
  if (paused) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续')
  else if (state.phase === 'levelWon') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', `${state.msg} · 空格下一关`, THEME.good)
  else if (state.phase === 'gameOver') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `${state.msg} · 空格重试`, THEME.bad)
}
