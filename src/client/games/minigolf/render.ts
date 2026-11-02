/**
 * 迷你高尔夫渲染器：俯视果岭、旗杆洞口、墙壁、斜坡箭头、沙坑颗粒、
 * 拖杆瞄准线与力度条、球滚动淡痕、入洞星级浮字与 HUD。全部绘制发生在
 * 固定逻辑坐标系（LOGICAL_W × LOGICAL_H）内；场地世界坐标按 SCALE 等
 * 比映射。渲染是纯绘制，不修改游戏状态。
 */
import {
  BALL_R, FIELD_H, FIELD_W, HOLE_R, type GolfLevelDef, type MiniGolfState, getLevel,
} from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽度。 */
export const LOGICAL_W = 680
/** 逻辑画布高度。 */
export const LOGICAL_H = 440
/** 果岭上方 HUD 预留高度。 */
const TOP = 54
/** 果岭下方力度条预留高度。 */
const BOTTOM = 50
/** 果岭左右留白。 */
const SIDE = 30
/** 世界单位 → 逻辑像素比例。 */
export const SCALE = Math.min((LOGICAL_W - SIDE * 2) / FIELD_W, (LOGICAL_H - TOP - BOTTOM) / FIELD_H)
const FIELD_X = (LOGICAL_W - FIELD_W * SCALE) / 2
const FIELD_Y = TOP + (LOGICAL_H - TOP - BOTTOM - FIELD_H * SCALE) / 2

/** 渲染视图参数：游戏状态 + 输入层附加信息。 */
export interface MiniGolfView {
  state: MiniGolfState
  /** 面板暂停标志（绘制暂停遮罩用）。 */
  paused: boolean
  /** 拖杆进行中的瞄准（角度 + 力度），覆盖键盘瞄准值。 */
  aim: { angle: number; power: number } | null
  /** 入洞星级浮字（星级 + 剩余显示秒数），null 表示无。 */
  star: { count: number; t: number } | null
}

/** 世界坐标 → 逻辑画布坐标。 */
export function worldToLogical(x: number, y: number): { x: number; y: number } {
  return { x: FIELD_X + x * SCALE, y: FIELD_Y + y * SCALE }
}

/** 逻辑画布坐标 → 世界坐标。 */
export function logicalToWorld(x: number, y: number): { x: number; y: number } {
  return { x: (x - FIELD_X) / SCALE, y: (y - FIELD_Y) / SCALE }
}

/** 果岭底座与草地（带中心光照的俯视渐变）。 */
function drawGreen(ctx: CanvasRenderingContext2D): void {
  const x = FIELD_X - 8
  const y = FIELD_Y - 8
  const w = FIELD_W * SCALE + 16
  const h = FIELD_H * SCALE + 16
  roundRectPath(ctx, x, y, w, h, 12)
  ctx.fillStyle = '#1b3b2a'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  const g = ctx.createRadialGradient(
    FIELD_X + FIELD_W * SCALE / 2, FIELD_Y + FIELD_H * SCALE / 2, FIELD_H * SCALE * 0.2,
    FIELD_X + FIELD_W * SCALE / 2, FIELD_Y + FIELD_H * SCALE / 2, FIELD_W * SCALE * 0.72,
  )
  g.addColorStop(0, '#2f7d4f')
  g.addColorStop(1, '#1d5236')
  roundRectPath(ctx, FIELD_X, FIELD_Y, FIELD_W * SCALE, FIELD_H * SCALE, 6)
  ctx.fillStyle = g
  ctx.fill()
  // 草地条纹（俯视割草纹）。
  ctx.fillStyle = 'rgba(255,255,255,0.030)'
  for (let i = 0; i < FIELD_W; i += 20) {
    ctx.fillRect(FIELD_X + i * SCALE, FIELD_Y, 10 * SCALE, FIELD_H * SCALE)
  }
}

/** 沙坑：暖色底 + 确定性颗粒点阵（无随机数，帧间稳定）。 */
function drawSands(ctx: CanvasRenderingContext2D, def: GolfLevelDef): void {
  for (const s of def.sands) {
    roundRectPath(ctx, FIELD_X + s.x * SCALE, FIELD_Y + s.y * SCALE, s.w * SCALE, s.h * SCALE, 4)
    ctx.fillStyle = '#c9b471'
    ctx.fill()
    ctx.strokeStyle = 'rgba(13,13,20,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = 'rgba(120,100,50,0.55)'
    for (let gy = s.y + 3; gy < s.y + s.h - 1; gy += 5) {
      for (let gx = s.x + 3; gx < s.x + s.w - 1; gx += 5) {
        // 由坐标散列出的固定偏移，让颗粒点看起来自然但完全确定。
        const ox = ((gx * 7 + gy * 13) % 5) * 0.6
        const oy = ((gx * 11 + gy * 5) % 5) * 0.6
        const p = worldToLogical(gx + ox, gy + oy)
        ctx.fillRect(p.x, p.y, 1.2, 1.2)
      }
    }
  }
}

/** 斜坡区域：半透明底色 + 指向加速度方向的箭头阵。 */
function drawSlopes(ctx: CanvasRenderingContext2D, def: GolfLevelDef): void {
  for (const s of def.slopes) {
    roundRectPath(ctx, FIELD_X + s.x * SCALE, FIELD_Y + s.y * SCALE, s.w * SCALE, s.h * SCALE, 4)
    ctx.fillStyle = 'rgba(122,162,247,0.10)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(122,162,247,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
    const ang = Math.atan2(s.ay, s.ax)
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    ctx.strokeStyle = 'rgba(125,207,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    for (let gy = s.y + 10; gy < s.y + s.h - 4; gy += 14) {
      for (let gx = s.x + 10; gx < s.x + s.w - 4; gx += 14) {
        const c = worldToLogical(gx, gy)
        // 一支小箭头：短杆 + 两条斜线构成的箭头头部。
        ctx.beginPath()
        ctx.moveTo(c.x - ux * 5, c.y - uy * 5)
        ctx.lineTo(c.x + ux * 5, c.y + uy * 5)
        ctx.moveTo(c.x + ux * 5 - (ux * 3 - uy * 3), c.y + uy * 5 - (uy * 3 + ux * 3))
        ctx.lineTo(c.x + ux * 5, c.y + uy * 5)
        ctx.lineTo(c.x + ux * 5 - (ux * 3 + uy * 3), c.y + uy * 5 - (uy * 3 - ux * 3))
        ctx.stroke()
      }
    }
    ctx.lineCap = 'butt'
  }
}

/** 墙壁：木质深色圆角矩形。 */
function drawWalls(ctx: CanvasRenderingContext2D, def: GolfLevelDef): void {
  for (const w of def.walls) {
    roundRectPath(ctx, FIELD_X + w.x * SCALE, FIELD_Y + w.y * SCALE, w.w * SCALE, w.h * SCALE, 2)
    ctx.fillStyle = '#4a3a26'
    ctx.fill()
    ctx.strokeStyle = '#241a10'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(FIELD_X + w.x * SCALE, FIELD_Y + w.y * SCALE, w.w * SCALE, 2)
  }
}

/** 洞口与旗杆：黑洞 + 高光圈 + 直立旗杆和三角旗。 */
function drawHole(ctx: CanvasRenderingContext2D, state: MiniGolfState): void {
  const h = worldToLogical(state.hole.x, state.hole.y)
  const r = HOLE_R * SCALE
  ctx.beginPath()
  ctx.arc(h.x, h.y, r + 2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(13,13,20,0.5)'
  ctx.fill()
  glow(ctx, '#000', 8)
  ctx.beginPath()
  ctx.arc(h.x, h.y, r, 0, Math.PI * 2)
  ctx.fillStyle = '#08080e'
  ctx.fill()
  noGlow(ctx)
  ctx.beginPath()
  ctx.arc(h.x, h.y, r, Math.PI * 0.15, Math.PI * 0.85)
  ctx.strokeStyle = 'rgba(226,226,238,0.28)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 旗杆（入洞后收旗）。
  if (state.phase !== 'levelDone' && state.phase !== 'allDone') {
    ctx.strokeStyle = '#e2e2ee'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(h.x, h.y - r * 0.4)
    ctx.lineTo(h.x, h.y - 34)
    ctx.stroke()
    ctx.fillStyle = THEME.bad
    ctx.beginPath()
    ctx.moveTo(h.x + 1, h.y - 34)
    ctx.lineTo(h.x + 16, h.y - 28)
    ctx.lineTo(h.x + 1, h.y - 22)
    ctx.closePath()
    ctx.fill()
  }
}

/** 球滚动淡痕：轨迹点逐渐加亮的圆点串。 */
function drawTrail(ctx: CanvasRenderingContext2D, state: MiniGolfState): void {
  const n = state.trail.length
  for (let i = 0; i < n; i += 1) {
    const p = state.trail[i]!
    const q = worldToLogical(p.x, p.y)
    const a = (i / n) * 0.30
    ctx.fillStyle = 'rgba(226,226,238,' + a.toFixed(3) + ')'
    ctx.beginPath()
    ctx.arc(q.x, q.y, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 球：白球 + 高光 + 发球点标记。 */
function drawBall(ctx: CanvasRenderingContext2D, state: MiniGolfState): void {
  if (state.phase === 'levelDone' || state.phase === 'allDone') return
  const b = worldToLogical(state.ball.x, state.ball.y)
  const r = BALL_R * SCALE
  glow(ctx, '#ffffff', 6)
  const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.35, r * 0.1, b.x, b.y, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.6, '#e8e8f0')
  g.addColorStop(1, '#b9b9c8')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/** 拖杆瞄准线：虚线方向线 + 长度随力度增长 + 箭头。 */
function drawAim(ctx: CanvasRenderingContext2D, state: MiniGolfState, aim: { angle: number; power: number } | null): void {
  const angle = aim?.angle ?? 0
  const power = aim?.power ?? 0
  const b = worldToLogical(state.ball.x, state.ball.y)
  const len = 26 + power * 110
  const ex = b.x + Math.cos(angle) * len
  const ey = b.y + Math.sin(angle) * len
  ctx.strokeStyle = 'rgba(226,226,238,0.65)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.setLineDash([])
  // 箭头头部。
  ctx.fillStyle = 'rgba(226,226,238,0.8)'
  ctx.beginPath()
  ctx.moveTo(ex + Math.cos(angle) * 8, ey + Math.sin(angle) * 8)
  ctx.lineTo(ex + Math.cos(angle + 2.6) * 7, ey + Math.sin(angle + 2.6) * 7)
  ctx.lineTo(ex + Math.cos(angle - 2.6) * 7, ey + Math.sin(angle - 2.6) * 7)
  ctx.closePath()
  ctx.fill()
}

/** 底部力度条（拖杆或键盘蓄力时显示）。 */
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

/** 入洞星级浮字：从洞口缓缓上升并淡出的 ★ 串。 */
function drawStarPop(ctx: CanvasRenderingContext2D, state: MiniGolfState, star: { count: number; t: number }): void {
  const h = worldToLogical(state.hole.x, state.hole.y)
  const rise = (1 - star.t / 1.6) * 30
  ctx.globalAlpha = Math.min(1, star.t / 0.8)
  ctx.textAlign = 'center'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillStyle = THEME.gold
  glow(ctx, THEME.gold, 10)
  ctx.fillText('★'.repeat(star.count), h.x, h.y - 20 - rise)
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/** 渲染一帧迷你高尔夫（纯绘制，不修改状态）。 */
export function renderGolf(ctx: CanvasRenderingContext2D, view: MiniGolfView): void {
  const { state, paused, aim, star } = view
  const def = getLevel(state.level)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawGreen(ctx)
  drawSands(ctx, def)
  drawSlopes(ctx, def)
  drawWalls(ctx, def)
  drawHole(ctx, state)
  drawTrail(ctx, state)
  const aiming = state.phase === 'aiming' || (state.phase === 'paused' && state.pausedFrom === 'aiming')
  if (aiming) drawAim(ctx, state, aim)
  drawBall(ctx, state)
  // HUD：关 / 杆 / 标准杆 / 累计星。
  hudPair(ctx, 16, 26, '关卡', String(def.level))
  hudPair(ctx, 16, 46, '杆数', String(state.strokes))
  hudPair(ctx, LOGICAL_W - 16, 26, '标准杆', 'Par ' + def.par, 'right')
  hudPair(ctx, LOGICAL_W - 16, 46, '星星', String(state.totalStars), 'right', THEME.gold)
  if (aiming && aim !== null && aim.power > 0) drawPowerBar(ctx, aim.power)
  if (state.msgTimer > 0 && state.msg !== '') {
    ctx.textAlign = 'center'
    ctx.font = '600 15px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(state.msg, LOGICAL_W / 2, 30)
  }
  if (paused) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续')
  else if (state.phase === 'levelDone') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '入洞', state.msg + ' · 空格进入下一关', THEME.good)
  if (star !== null && star.t > 0) drawStarPop(ctx, state, star)
}
