/**
 * 弹球台 Pinball2 渲染层：霓虹弹球台。金属光泽 bumpers（命中闪光）、
 * 斜弹 slingshot、可击落 drop targets、磁力洞漩涡、带高光与拖尾的钢
 * 球、液压杆动画的挡板、右侧力度条、分数 / 球数 / 台面 / TILT 余量
 * HUD 与 Game Over 遮罩。纯绘制：只读 logic 状态，不修改。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'
import {
  BALL_R, FLIPPER_R, MAGNET_RADIUS, NUDGE_LIMIT, TABLE_H, TABLE_W, ballInLaunchZone,
  flipperTip, laneReady, type Flipper, type Pinball2State,
} from './logic.ts'

/** 逻辑画布尺寸（转发自 logic）。 */
export const LOGICAL_W = TABLE_W
export const LOGICAL_H = TABLE_H

/** 绘制选项。 */
export interface RenderPinball2Options {
  state: Pinball2State
  /** 面板隐藏时的静态暂停帧标记。 */
  paused: boolean
  /** 历史最佳分（HUD 显示）。 */
  best: number
}

/** 画一面墙：霓虹描边线段。 */
function drawWalls(ctx: CanvasRenderingContext2D, state: Pinball2State): void {
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  glow(ctx, accent(0), 6)
  ctx.beginPath()
  for (const w of state.walls) {
    ctx.moveTo(w.ax, w.ay)
    ctx.lineTo(w.bx, w.by)
  }
  ctx.stroke()
  noGlow(ctx)
}

/** 画一个 bumper：金属光泽圆盘，命中冷却期间高亮闪光。 */
function drawBumper(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cd: number): void {
  const hot = cd > 0
  const base = hot ? '#ffe9c2' : '#c9d4e8'
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r)
  g.addColorStop(0, hot ? '#ffffff' : '#eef4ff')
  g.addColorStop(0.45, base)
  g.addColorStop(1, hot ? accent(7) : '#4a5570')
  glow(ctx, hot ? THEME.gold : accent(5), hot ? 18 : 8)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = hot ? THEME.gold : accent(5)
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = hot ? THEME.text : THEME.textMuted
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('150', x, y + 4)
}

/** 画 slingshot：斜霓虹条，冷却时闪红。 */
function drawSling(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cd: number): void {
  const color = cd > 0 ? THEME.bad : accent(4)
  glow(ctx, color, cd > 0 ? 16 : 8)
  ctx.strokeStyle = color
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
  noGlow(ctx)
}

/** 画 drop target 板：立起为发光短板，击落为暗槽线。 */
function drawTarget(
  ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, down: boolean,
): void {
  if (down) {
    ctx.strokeStyle = 'rgba(122,162,247,0.25)'
    ctx.lineWidth = 3
  } else {
    glow(ctx, THEME.good, 8)
    ctx.strokeStyle = THEME.good
    ctx.lineWidth = 6
  }
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y1)
  ctx.stroke()
  noGlow(ctx)
}

/** 画磁力洞：旋转虚线漩涡 + 呼吸核心。 */
function drawMagnet(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, cd: number): void {
  const breath = 0.5 + 0.5 * Math.sin(t * 3)
  glow(ctx, accent(1), 12)
  ctx.strokeStyle = accent(1)
  ctx.lineWidth = 1.5
  for (let ring = 1; ring <= 3; ring += 1) {
    const r = (MAGNET_RADIUS / 3) * ring
    ctx.setLineDash([9, 12])
    ctx.lineDashOffset = -t * 40 * (ring % 2 === 0 ? 1 : -1)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.globalAlpha = 0.55 - ring * 0.12
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  const core = ctx.createRadialGradient(x, y, 1, x, y, 14)
  core.addColorStop(0, cd > 0 ? '#ffffff' : accent(1))
  core.addColorStop(1, 'rgba(187,154,247,0.1)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(x, y, 13 + breath * 2, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/** 画一颗钢球：拖尾渐隐 + 径向高光。 */
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, trail: { x: number; y: number }[]): void {
  for (let i = trail.length - 1; i >= 1; i -= 1) {
    const p = trail[i]!
    const prev = trail[i - 1]!
    const alpha = 0.3 * (1 - i / trail.length)
    ctx.strokeStyle = 'rgba(158,206,106,' + alpha.toFixed(3) + ')'
    ctx.lineWidth = BALL_R * (1 - i / (trail.length + 2))
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  const g = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, BALL_R)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.35, '#c8d0dd')
  g.addColorStop(1, '#5a6273')
  glow(ctx, '#aab6cc', 7)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(x - 3, y - 4, 2, 0, Math.PI * 2)
  ctx.fill()
}

/** 画一侧挡板：霓虹胶囊 + 液压杆（随张角伸缩的活塞）。 */
function drawFlipper(ctx: CanvasRenderingContext2D, f: Flipper): void {
  const tip = flipperTip(f)
  // 液压杆：锚点在挡板后方外侧，随抬起角伸缩的亮色活塞杆。
  const anchorX = f.side === 'left' ? f.px - 34 : f.px + 34
  const anchorY = f.py + 26
  const midX = (f.px + tip.x) / 2
  const midY = (f.py + tip.y) / 2
  ctx.strokeStyle = 'rgba(158,206,106,0.7)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(anchorX, anchorY)
  ctx.lineTo(midX, midY)
  ctx.stroke()
  ctx.fillStyle = accent(2)
  ctx.beginPath()
  ctx.arc(anchorX, anchorY, 4, 0, Math.PI * 2)
  ctx.fill()
  // 胶囊挡板本体。
  const activeGlow = Math.abs(f.omega) > 1
  const color = activeGlow ? THEME.good : accent(0)
  glow(ctx, color, activeGlow ? 14 : 8)
  ctx.strokeStyle = color
  ctx.lineWidth = FLIPPER_R * 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(f.px, f.py)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = THEME.panel
  ctx.beginPath()
  ctx.arc(f.px, f.py, 3.5, 0, Math.PI * 2)
  ctx.fill()
}

/** 画发射道：待发球提示 + 力度条。 */
function drawPlunger(ctx: CanvasRenderingContext2D, state: Pinball2State): void {
  // 力度条贴右墙。
  const bx = 430.5
  const bh = 130
  const by = 648 - bh
  roundRectPath(ctx, bx - 3.5, by, 7, bh, 3)
  ctx.fillStyle = 'rgba(122,162,247,0.12)'
  ctx.fill()
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (state.plunger > 0) {
    const fh = bh * state.plunger
    const color = state.plunger > 0.85 ? THEME.bad : state.plunger > 0.6 ? THEME.gold : THEME.good
    glow(ctx, color, 8)
    roundRectPath(ctx, bx - 2.5, by + bh - fh, 5, fh, 2)
    ctx.fillStyle = color
    ctx.fill()
    noGlow(ctx)
  }
  if (laneReady(state)) {
    const pulse = 0.4 + 0.3 * Math.sin(state.time * 4)
    ctx.globalAlpha = pulse
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('空格发射', 400, 668)
    ctx.globalAlpha = 1
  }
}

/** 画顶部 HUD：分数 / 最佳 / 球数 / 台面 / 连击 / TILT 余量。 */
function drawHud(ctx: CanvasRenderingContext2D, o: RenderPinball2Options): void {
  const s = o.state
  hudPair(ctx, 20, 30, '分数', String(Math.floor(s.score)))
  hudPair(ctx, TABLE_W - 20, 30, '最佳', String(o.best), 'right', THEME.gold)
  const inPlay = s.ballsLeft - s.balls.length
  hudPair(ctx, 20, 50, '待发', String(inPlay) + ' · 在场 ' + String(s.balls.length), 'left', accent(2))
  hudPair(ctx, TABLE_W - 20, 50, '台面', String(s.table) + '/3', 'right', accent(1))
  if (s.combo >= 5) {
    hudPair(ctx, TABLE_W / 2, 30, '连击', 'x' + String(Math.min(5, 1 + Math.floor(s.combo / 5))), 'center', THEME.bad)
  }
  // TILT 余量：3 个小圆点，用掉变红。
  for (let i = 0; i < NUDGE_LIMIT; i += 1) {
    ctx.beginPath()
    ctx.arc(TABLE_W / 2 + (i - 1) * 14, 48, 4, 0, Math.PI * 2)
    ctx.fillStyle = i < s.nudgesUsed ? THEME.bad : 'rgba(226,226,238,0.3)'
    ctx.fill()
  }
}

/**
 * 整帧绘制：背景 → 台面元素 → 球 → 发射道 → HUD → 消息 / 遮罩。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设好）。
 * @param o - 状态与显示选项。
 */
export function renderPinball2(ctx: CanvasRenderingContext2D, o: RenderPinball2Options): void {
  const s = o.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawWalls(ctx, s)
  if (s.magnet !== null) drawMagnet(ctx, s.magnet.x, s.magnet.y, s.time, s.magnet.cd)
  for (const b of s.bumpers) drawBumper(ctx, b.x, b.y, b.r, b.cd)
  for (const t of s.targets) drawTarget(ctx, t.x1, t.y1, t.x2, t.y2, t.down)
  for (const g of s.slings) drawSling(ctx, g.ax, g.ay, g.bx, g.by, g.cd)
  drawFlipper(ctx, s.flippers.left)
  drawFlipper(ctx, s.flippers.right)
  drawPlunger(ctx, s)
  for (const b of s.balls) {
    drawBall(ctx, b.x, b.y, b.trail)
    // 发射道内的球加一个圈提示尚未上桌。
    if (ballInLaunchZone(b)) {
      ctx.strokeStyle = 'rgba(158,206,106,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(b.x, b.y, BALL_R + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  drawHud(ctx, o)
  if (s.msgTimer > 0 && s.result === 'playing') {
    ctx.textAlign = 'center'
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.globalAlpha = Math.min(1, s.msgTimer)
    ctx.fillText(s.msg, TABLE_W / 2, 96)
    ctx.globalAlpha = 1
  }
  if (s.result === 'gameOver') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', '得分 ' + String(Math.floor(s.score)) + ' · 按 R 重开', THEME.bad)
  } else if (s.result === 'paused' || o.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', accent(1))
  }
}
