/**
 * 弹球台 renderer: pure canvas drawing of the pinball state — walls, launch
 * lane, glowing bumpers, slingshot triangles, drop targets, capsule flippers,
 * the ball, plunger charge bar, HUD, and pause/game-over overlays. No state
 * beyond what logic.ts owns; every function here is a pure paint.
 */
import {
  BALL_R, FLIPPER_R, TABLE_H, TABLE_W, ballInLaunchZone, flipperTip,
  levelThreshold, type PinballState,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = TABLE_W
export const LOGICAL_H = TABLE_H

export interface RenderOptions {
  state: PinballState
  paused: boolean
  best: number
}

/** One static wall segment drawn as a rounded neon strut. */
function drawWalls(ctx: CanvasRenderingContext2D, state: PinballState): void {
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const w of state.walls) {
    ctx.moveTo(w.ax, w.ay)
    ctx.lineTo(w.bx, w.by)
  }
  ctx.stroke()
}

/** Bumpers: glowing discs that flash while on cooldown (recently hit). */
function drawBumpers(ctx: CanvasRenderingContext2D, state: PinballState): void {
  for (let i = 0; i < state.bumpers.length; i += 1) {
    const b = state.bumpers[i]!
    const color = accent(i + 2)
    const hot = b.cd > 0
    ctx.fillStyle = hot ? color : THEME.panel
    glow(ctx, color, hot ? 18 : 9)
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = hot ? THEME.text : color
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('150', b.x, b.y + 4)
  }
}

/** Slingshots: filled triangles with a bright active face. */
function drawSlings(ctx: CanvasRenderingContext2D, state: PinballState): void {
  for (let i = 0; i < state.slings.length; i += 1) {
    const s = state.slings[i]!
    const color = accent(i + 5)
    const hot = s.cd > 0
    // Third vertex behind the face to form the classic kicker triangle.
    const mx = (s.ax + s.bx) / 2
    const my = (s.ay + s.by) / 2
    const back = i === 0 ? { x: mx - 16, y: my + 8 } : { x: mx + 16, y: my + 8 }
    ctx.fillStyle = hot ? color : THEME.panel
    glow(ctx, color, hot ? 16 : 7)
    ctx.beginPath()
    ctx.moveTo(s.ax, s.ay)
    ctx.lineTo(s.bx, s.by)
    ctx.lineTo(back.x, back.y)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(s.ax, s.ay)
    ctx.lineTo(s.bx, s.by)
    ctx.stroke()
  }
}

/** Drop targets: bright plates that dim and sink when down. */
function drawTargets(ctx: CanvasRenderingContext2D, state: PinballState): void {
  for (const t of state.targets) {
    const cx = (t.x1 + t.x2) / 2
    const w = t.x2 - t.x1
    const h = t.down ? 4 : 9
    const y = t.y1 - h
    ctx.fillStyle = t.down ? THEME.panelEdge : THEME.gold
    glow(ctx, THEME.gold, t.down ? 0 : 8)
    roundRectPath(ctx, cx - w / 2, y, w, h, 2)
    ctx.fill()
    noGlow(ctx)
  }
}

/** Flippers: thick capsule strokes pivoting around their base. */
function drawFlippers(ctx: CanvasRenderingContext2D, state: PinballState): void {
  for (const f of [state.flippers.left, state.flippers.right]) {
    const tip = flipperTip(f)
    const dead = state.tiltTimer > 0
    const color = dead ? THEME.bad : THEME.accents[0]!
    ctx.strokeStyle = THEME.panel
    ctx.lineWidth = FLIPPER_R * 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(f.px, f.py)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = FLIPPER_R * 2 - 4
    glow(ctx, color, f.held && !dead ? 12 : 4)
    ctx.beginPath()
    ctx.moveTo(f.px, f.py)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
    noGlow(ctx)
  }
}

/** Plunger: charge bar in the lane plus a compressed-spring look. */
function drawPlunger(ctx: CanvasRenderingContext2D, state: PinballState): void {
  if (state.plunger <= 0) return
  const x = 412
  const y0 = 645
  const hgt = 60 * state.plunger
  ctx.fillStyle = accent(3)
  glow(ctx, accent(3), 8)
  roundRectPath(ctx, x - 3, y0 - hgt, 6, hgt, 3)
  ctx.fill()
  noGlow(ctx)
}

/** HUD strip at the top: score, balls, level + threshold, best. */
function drawHud(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const s = o.state
  hudPair(ctx, 12, 22, '分数', String(Math.floor(s.score)))
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(`🎯 × ${s.ballsLeft}`, TABLE_W / 2, 22)
  ctx.textAlign = 'right'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(`第 ${s.level} 关 · ${levelThreshold(s.level)} 分升级 · 最佳 ${o.best}`, TABLE_W - 12, 22)
}

/** The whole frame: background, table, actors, HUD, message, overlays. */
export function renderPinball(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const s = o.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawWalls(ctx, s)
  drawBumpers(ctx, s)
  drawSlings(ctx, s)
  drawTargets(ctx, s)
  drawFlippers(ctx, s)
  drawPlunger(ctx, s)

  // Ball: white glowing sphere; hidden while waiting for a launch redraw.
  const inLane = ballInLaunchZone(s.ball)
  glow(ctx, '#ffffff', 12)
  ctx.fillStyle = '#f8f8ff'
  ctx.beginPath()
  ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  if (inLane && s.plungerHeld) {
    // Aim hint: the lane flashes softly while charging.
    ctx.fillStyle = 'rgba(122,162,247,0.10)'
    ctx.fillRect(378, 260, 30, 385)
  }

  drawHud(ctx, o)

  if (s.tiltTimer > 0) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 14)
    ctx.fillText('TILT', TABLE_W / 2, 120)
    noGlow(ctx)
  }

  if (s.msgTimer > 0 && s.msg !== '') {
    ctx.textAlign = 'center'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.globalAlpha = Math.min(1, s.msgTimer)
    ctx.fillText(s.msg, TABLE_W / 2, 96)
    ctx.globalAlpha = 1
  }

  if (s.result === 'gameOver') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `${Math.floor(s.score)} 分 · 按 R 重开`, THEME.bad)
  } else if (o.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 或空格继续')
  }
}
