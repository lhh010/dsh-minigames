/**
 * 高山滑雪渲染层：暮色雪道竖向渐变与缓坡阴影线、身后双道雪痕、随横向
 * 速度倾斜的滑雪者（围巾飘带）、树木/岩石障碍、旗门双杆与缺口微光、
 * 高速时的速度线、旗门/撞击粒子与飘字、HUD（分数/距离/速度/生命）、
 * 暂停与结束遮罩。
 */
import {
  W,
  H,
  PLAYER_Y,
  PLAYER_R,
  GAP_HALF,
  START_LIVES,
  FLOAT_MS,
  displaySpeed,
  displayDistance,
  type SkiState,
  type SkiSegment,
} from './logic.ts'
import { THEME, accent, createParticles, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 雪道渐变上端色（暮色雪原）。 */
const SNOW_TOP = '#5a6d94'
/** 雪道渐变下端色。 */
const SNOW_BOTTOM = '#3c4a6c'
/** 缓坡阴影线色。 */
const SLOPE_LINE = 'rgba(226,236,255,0.07)'
/** 雪痕色。 */
const TRAIL_COLOR = 'rgba(240,246,255,0.5)'
/** 雪面高光（滑雪者附近的柔和亮斑）。 */
const SNOW_LIGHT = 'rgba(235,242,255,0.10)'
/** 树冠色与树干色。 */
const TREE_DARK = '#243528'
const TREE_LIT = '#38513c'
const TRUNK = '#4a3a2c'
/** 岩石色。 */
const ROCK = '#6a7080'
const ROCK_EDGE = '#4a5062'
/** 旗门杆色（已过门变绿）。 */
const POLE_AHEAD = THEME.accents[0]!
const POLE_DONE = THEME.good
/** 滑雪者服色与围巾色。 */
const SUIT = '#e8e8f0'
const SCARF = THEME.bad

/**
 * 画雪道背景：竖向渐变、横向缓坡阴影线（随距离滚动，制造下滑感）与
 * 滑雪者附近的柔和亮斑。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSlope(ctx: CanvasRenderingContext2D, state: SkiState): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, H)
  gradient.addColorStop(0, SNOW_TOP)
  gradient.addColorStop(1, SNOW_BOTTOM)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)
  // 缓坡阴影线：世界 y 每 80px 一条，随卷动上移。
  ctx.strokeStyle = SLOPE_LINE
  ctx.lineWidth = 6
  const spacing = 80
  const offset = ((state.distance % spacing) + spacing) % spacing
  for (let y = PLAYER_Y + offset; y < H + spacing; y += spacing) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y - 10)
    ctx.stroke()
  }
  // 滑雪者附近的亮斑。
  ctx.fillStyle = SNOW_LIGHT
  ctx.beginPath()
  ctx.ellipse(state.playerX, PLAYER_Y, 120, 70, 0, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画身后雪痕：历史采样点连成两条平行细线（板刃轨迹）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTrail(ctx: CanvasRenderingContext2D, state: SkiState): void {
  if (state.trail.length < 2) return
  ctx.strokeStyle = TRAIL_COLOR
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (const side of [-3.5, 3.5]) {
    ctx.beginPath()
    let started = false
    for (const p of state.trail) {
      const y = PLAYER_Y - (state.distance - p.worldY)
      if (y < -20) continue
      const x = p.x + side
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }
}

/**
 * 画一棵树：树干 + 两层树冠三角（微发光轮廓）。
 * @param ctx - 画布上下文。
 * @param x - 屏幕坐标 x。
 * @param y - 屏幕坐标 y。
 */
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = TRUNK
  ctx.fillRect(x - 2.5, y - 2, 5, 8)
  glow(ctx, TREE_LIT, 5)
  ctx.fillStyle = TREE_DARK
  ctx.beginPath()
  ctx.moveTo(x, y - 30)
  ctx.lineTo(x + 12, y - 6)
  ctx.lineTo(x - 12, y - 6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = TREE_LIT
  ctx.beginPath()
  ctx.moveTo(x, y - 24)
  ctx.lineTo(x + 9, y - 4)
  ctx.lineTo(x - 9, y - 4)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画一块岩石：两块叠起的圆石。
 * @param ctx - 画布上下文。
 * @param x - 屏幕坐标 x。
 * @param y - 屏幕坐标 y。
 */
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = ROCK
  ctx.strokeStyle = ROCK_EDGE
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x - 5, y - 5, 7, 5, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

/**
 * 画旗门：左右双杆（杆顶小旗），缺口地面一条微光带；已结算的门用绿色。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param seg - 旗门所在段。
 */
function drawGate(ctx: CanvasRenderingContext2D, state: SkiState, seg: SkiSegment): void {
  const y = PLAYER_Y + (seg.gateY - state.distance)
  const color = seg.gateDone ? POLE_DONE : POLE_AHEAD
  // 缺口微光带。
  glow(ctx, color, 8)
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 2
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(seg.gapX - GAP_HALF, y)
  ctx.lineTo(seg.gapX + GAP_HALF, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  // 双杆。
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  for (const side of [-GAP_HALF, GAP_HALF]) {
    const px = seg.gapX + side
    ctx.beginPath()
    ctx.moveTo(px, y + 4)
    ctx.lineTo(px, y - 26)
    ctx.stroke()
    // 杆顶小旗。
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(px, y - 26)
    ctx.lineTo(px + (side < 0 ? -10 : 10), y - 21)
    ctx.lineTo(px, y - 16)
    ctx.closePath()
    ctx.fill()
  }
  noGlow(ctx)
}

/**
 * 画一段地形的全部可见实体（先障碍后旗门，旗门压在障碍之上）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTerrain(ctx: CanvasRenderingContext2D, state: SkiState): void {
  const segs = [...state.segments.values()].sort((a, b) => a.index - b.index)
  for (const seg of segs) {
    for (const obs of seg.obstacles) {
      const y = PLAYER_Y + (obs.worldY - state.distance)
      if (y < -40 || y > H + 40) continue
      if (obs.kind === 'tree') drawTree(ctx, obs.x, y)
      else drawRock(ctx, obs.x, y)
    }
  }
  for (const seg of segs) {
    const y = PLAYER_Y + (seg.gateY - state.distance)
    if (y < -40 || y > H + 40) continue
    drawGate(ctx, state, seg)
  }
}

/**
 * 画滑雪者：整体随横向速度倾斜（转弯姿态），身体、双板、围巾；无敌期
 * 闪烁（透明度方波）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSkier(ctx: CanvasRenderingContext2D, state: SkiState): void {
  if (state.phase === 'over') return
  // 无敌闪烁：每 110ms 切一次透明度。
  if (state.invulnMs > 0 && Math.floor(state.invulnMs / 110) % 2 === 0) ctx.globalAlpha = 0.35
  const tilt = Math.max(-0.45, Math.min(0.45, state.vx / MAX_VX_REF))
  ctx.save()
  ctx.translate(state.playerX, PLAYER_Y)
  ctx.rotate(tilt)
  // 双板。
  ctx.strokeStyle = accent(5)
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-7, 6)
  ctx.lineTo(-9, 16)
  ctx.moveTo(7, 6)
  ctx.lineTo(9, 16)
  ctx.stroke()
  // 身体。
  glow(ctx, SUIT, 8)
  ctx.fillStyle = SUIT
  ctx.beginPath()
  ctx.ellipse(0, 0, PLAYER_R, 13, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 头盔与围巾。
  ctx.fillStyle = accent(0)
  ctx.beginPath()
  ctx.arc(0, -12, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = SCARF
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, -6)
  ctx.quadraticCurveTo(-state.vx * 0.06 - 6, -2, -state.vx * 0.1 - 10, 4)
  ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = 1
}

/** 横向速度参考值（倾斜角换算用，与 logic 的 MAX_VX 保持量级一致）。 */
const MAX_VX_REF = 400

/**
 * 画速度线：速度越高越多越长的竖向细流线（位置由 t 确定性驱动）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSpeedLines(ctx: CanvasRenderingContext2D, state: SkiState): void {
  const k = (state.speed - 200) / 230
  if (k <= 0 || state.phase === 'over') return
  const count = Math.floor(k * 9)
  ctx.strokeStyle = 'rgba(226,236,255,' + (0.10 + k * 0.14).toFixed(2) + ')'
  ctx.lineWidth = 2
  for (let i = 0; i < count; i += 1) {
    const phase = ((state.t / 160) + i * 97) % 240
    const x = ((i * 127 + 31) % W)
    const y = H - phase * (H / 240) * (0.6 + k)
    const len = 26 + k * 34
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + len)
    ctx.stroke()
  }
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: SkiState): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = 'bold 18px system-ui, sans-serif'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / FLOAT_MS))
    ctx.globalAlpha = k
    ctx.fillStyle = THEME.gold
    ctx.fillText(fl.text, Math.max(40, Math.min(W - 40, fl.x)), Math.max(40, fl.y))
  }
  ctx.restore()
}

/**
 * 画 HUD：分数 / 距离 / 速度 与生命（心形）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: SkiState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  hudPair(ctx, 110, hudY, '距离', displayDistance(state) + 'm')
  hudPair(ctx, 210, hudY, '速度', displaySpeed(state) + ' · 档' + state.gear, 'left', state.speed > 360 ? THEME.bad : THEME.text)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = state.lives <= 1 ? THEME.bad : THEME.gold
  ctx.fillText('♥'.repeat(state.lives) + '·'.repeat(START_LIVES - state.lives), W - 10, hudY)
}

/**
 * 渲染一帧：雪道、雪痕、地形、滑雪者、速度线、粒子、飘字、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderSki(ctx: CanvasRenderingContext2D, state: SkiState, paused: boolean): void {
  drawSlope(ctx, state)
  drawTrail(ctx, state)
  drawTerrain(ctx, state)
  drawSkier(ctx, state)
  drawSpeedLines(ctx, state)

  // 消费逻辑层事件：穿门迸发蓝色粒子，撞击迸发红色雪屑。
  for (const ev of state.events) {
    if (ev.type === 'gate') particles.burst(ev.x, ev.y, THEME.accents[0]!, 18, 160)
    else particles.burst(ev.x, ev.y, THEME.bad, 16, 150)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawFloats(ctx, state)
  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '摔倒了', '得分 ' + state.score + ' · 距离 ' + displayDistance(state) + 'm · 按 R 重开', THEME.bad)
  }
}
