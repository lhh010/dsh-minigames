/**
 * 杂技抛球渲染层：共享主题舞台背景（渐变夜幕 + 顶灯光斑）、底部跟随
 * 指针的双手托盘、渐变彩球 + 运动拖尾、拍击波纹与粒子迸发、飘字、
 * HUD（分数 / 生命 / 球数 / 连击倍率）、暂停与结算遮罩。渲染层自持
 * 粒子与波纹池，只消费逻辑层 events，不做任何游戏规则判断。
 */
import type { JuggleState, Ball } from './logic.ts'
import { W, H, BALL_R, FLOAT_MS } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const STAGE_SPOT = 'rgba(122,162,247,0.10)'
const HAND_SKIN = '#e8b98f'
const HAND_EDGE = '#c4906a'
const PLATE_BODY = '#2a2a3c'
const PLATE_EDGE = THEME.panelEdge
const TRAIL_ALPHA = 0.28
const HUD_BAND = 'rgba(13,13,20,0.42)'

/** 一个拍击波纹：从点击点扩散的圆环。 */
interface Ripple {
  x: number, y: number
  r: number, maxR: number
  life: number, maxLife: number
  color: string
}

// 渲染层自有的粒子与波纹池（每个画布一组实例）。
const particles = createParticles()
const ripples: Ripple[] = []

/**
 * 画舞台背景：共享渐变 + 顶部两盏聚灯光斑 + 地面线。
 * @param ctx - 画布上下文。
 */
function drawStage(ctx: CanvasRenderingContext2D): void {
  drawBackground(ctx, W, H)
  // 顶灯光斑。
  for (const [sx, sr] of [[W * 0.3, 130], [W * 0.7, 150]] as const) {
    const spot = ctx.createRadialGradient(sx, -20, 10, sx, -20, sr)
    spot.addColorStop(0, STAGE_SPOT)
    spot.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = spot
    ctx.fillRect(sx - sr, 0, sr * 2, sr)
  }
  // 地面线。
  ctx.strokeStyle = 'rgba(52,52,74,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, H - 12)
  ctx.lineTo(W, H - 12)
  ctx.stroke()
}

/**
 * 画一颗彩球：渐变球体 + 辉光 + 高光 + 运动拖尾（越旧越小越淡）。
 * @param ctx - 画布上下文。
 * @param ball - 球实体。
 */
function drawBall(ctx: CanvasRenderingContext2D, ball: Ball): void {
  const color = accent(ball.hue)
  // 拖尾。
  for (let i = 0; i < ball.trail.length; i += 1) {
    const p = ball.trail[i]!
    const k = (i + 1) / ball.trail.length
    ctx.globalAlpha = TRAIL_ALPHA * k
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, BALL_R * (0.3 + 0.55 * k), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  // 球体。
  glow(ctx, color, 12)
  const grad = ctx.createRadialGradient(ball.x - BALL_R * 0.35, ball.y - BALL_R * 0.4, BALL_R * 0.15, ball.x, ball.y, BALL_R)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.35, color)
  grad.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 高光点。
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.38, 2.4, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画底部双手托盘：深色托盘 + 左右两只手掌（跟随指针 x）。
 * @param ctx - 画布上下文。
 * @param trayX - 托盘中心逻辑 x。
 */
function drawTray(ctx: CanvasRenderingContext2D, trayX: number): void {
  const y = H - 26
  const halfW = 74
  // 托盘。
  ctx.fillStyle = PLATE_BODY
  ctx.strokeStyle = PLATE_EDGE
  ctx.lineWidth = 1.5
  roundRectPath(ctx, trayX - halfW, y, halfW * 2, 12, 6)
  ctx.fill()
  ctx.stroke()
  // 双手：托盘上方两枚手掌弧。
  for (const side of [-1, 1]) {
    const hx = trayX + side * 40
    ctx.fillStyle = HAND_SKIN
    ctx.strokeStyle = HAND_EDGE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(hx, y - 4, 13, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // 指尖小弧。
    ctx.beginPath()
    ctx.ellipse(hx + side * 10, y - 8, 6, 4, side * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: JuggleState): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = 'bold 16px system-ui, sans-serif'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / FLOAT_MS))
    ctx.globalAlpha = k
    ctx.fillStyle = THEME.gold
    ctx.fillText(fl.text, Math.max(36, Math.min(W - 36, fl.x)), Math.max(40, fl.y))
  }
  ctx.restore()
}

/**
 * 推进并画波纹池。
 * @param ctx - 画布上下文。
 * @param dtMs - 渲染帧间隔 ms（暂停时传 0）。
 */
function tickRipples(ctx: CanvasRenderingContext2D, dtMs: number): void {
  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const r = ripples[i]!
    r.life += dtMs
    if (r.life >= r.maxLife) { ripples.splice(i, 1); continue }
    const k = r.life / r.maxLife
    ctx.globalAlpha = (1 - k) * 0.85
    ctx.strokeStyle = r.color
    ctx.lineWidth = 2.5 * (1 - k) + 0.5
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

/**
 * 渲染一帧：舞台、托盘、球、飘字、波纹、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param trayX - 托盘中心逻辑 x（跟随指针）。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderJuggle(ctx: CanvasRenderingContext2D, state: JuggleState, trayX: number, paused: boolean): void {
  drawStage(ctx)
  drawTray(ctx, trayX)
  for (const ball of state.balls) drawBall(ctx, ball)
  drawFloats(ctx, state)

  // 消费逻辑层事件：拍击波纹 + 拍中/丢球粒子。
  for (const ev of state.events) {
    if (ev.type === 'tap') {
      if (ripples.length >= 24) ripples.shift()
      const maxR = 26 + 44 * ev.strength
      ripples.push({ x: ev.x, y: ev.y, r: 8, maxR, life: 0, maxLife: 320, color: ev.strength > 0 ? THEME.gold : THEME.textMuted })
    } else if (ev.type === 'hit') {
      particles.burst(ev.x, ev.y, accent(ev.hue), 10, 140)
    } else if (ev.type === 'drop') {
      particles.burst(ev.x, H - 8, accent(ev.hue), 14, 170)
    } else if (ev.type === 'spawn') {
      particles.burst(ev.x, 40, accent(ev.hue), 8, 110)
    }
  }
  const dtMs = paused ? 0 : 16
  tickRipples(ctx, dtMs)
  particles.tick(ctx, dtMs)

  // HUD：半透明深色条 + 分数 / 生命 / 球数 / 连击倍率。
  ctx.fillStyle = HUD_BAND
  roundRectPath(ctx, 4, 4, W - 8, 24, 8)
  ctx.fill()
  const hudY = 20
  hudPair(ctx, 14, hudY, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = state.lives <= 1 ? THEME.bad : THEME.text
  ctx.fillText('\u2764 \u00d7' + state.lives, W / 2, hudY)
  if (state.combo >= 2 && state.comboExpire > state.t) {
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = THEME.gold
    ctx.fillText('\u00d7' + state.combo + ' \u8fde\u51fb', W - 14, hudY)
  } else {
    hudPair(ctx, W - 14, hudY, '\u7403', String(state.balls.length) + '/' + String(Math.min(6, 1 + Math.floor(state.t / 10000))), 'right')
  }

  if (paused) {
    drawOverlay(ctx, W, H, '\u6682\u505c', '\u6309 P \u7ee7\u7eed \u00b7 R \u91cd\u5f00')
  } else if (state.over) {
    drawOverlay(ctx, W, H, '\u6e38\u620f\u7ed3\u675f', '\u5f97\u5206 ' + state.score + ' \u00b7 \u4e22\u7403 ' + state.dropped + ' \u6b21 \u00b7 \u6309 R \u91cd\u5f00', state.lives <= 0 ? THEME.bad : THEME.text)
  }
}
