/**
 * 月球着陆渲染层：星空背景（确定性星点）、灰色折线山脊与发光 pad
 * （绿色 = 低倍率，金色 = 高倍率）、三角登月舱（喷口火焰随点火闪烁）、
 * 速度 / 燃料 / 高度 HUD、飘字与成功 / 坠毁 / 结束遮罩。
 */
import {
  W,
  H,
  FUEL_MAX,
  LAND_VY_MAX,
  LAND_VX_MAX,
  LAND_TILT_MAX,
  FLOAT_MS,
  groundAt,
  altitude,
  mulberry32,
  type LanderState,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

// 星空：挂载时确定性生成一次，纯视觉。
const stars: { x: number, y: number, r: number, tw: number }[] = (() => {
  const rng = mulberry32(20260831)
  const list: { x: number, y: number, r: number, tw: number }[] = []
  for (let i = 0; i < 70; i += 1) {
    list.push({ x: rng() * W, y: rng() * H * 0.8, r: 0.5 + rng() * 1.4, tw: rng() * 6.28 })
  }
  return list
})()

/**
 * 画星空：暗色星点按各自相位缓慢闪烁。
 * @param ctx - 画布上下文。
 * @param t - 回合内毫秒钟。
 */
function drawStars(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = THEME.text
  for (const s of stars) {
    const k = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 900 + s.tw))
    ctx.globalAlpha = k * 0.8
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画山脊填充与折线，pad 段发光（绿 = x1 倍率，金 = 高倍率）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTerrain(ctx: CanvasRenderingContext2D, state: LanderState): void {
  const pts = state.terrain.points
  ctx.fillStyle = '#2a2a36'
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (const p of pts) ctx.lineTo(p.x, p.y)
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#4a4a5e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y)
  ctx.stroke()
  for (const pad of state.terrain.pads) {
    const color = pad.mult >= 3 ? THEME.gold : THEME.good
    glow(ctx, color, 12)
    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(pad.x1, pad.y)
    ctx.lineTo(pad.x2, pad.y)
    ctx.stroke()
    noGlow(ctx)
    ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText('x' + pad.mult, (pad.x1 + pad.x2) / 2, pad.y + 14)
  }
}

/**
 * 画登月舱：旋转三角机体 + 支腿，点火时喷口画随钟闪烁的火焰。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawLander(ctx: CanvasRenderingContext2D, state: LanderState): void {
  ctx.save()
  ctx.translate(state.x, state.y)
  ctx.rotate(state.angle)
  // 火焰：点火中随机长度，橙黄双层。
  if (state.thrusting && state.phase === 'flying') {
    const flick = 8 + Math.random() * 10
    glow(ctx, '#ff9e64', 14)
    ctx.fillStyle = '#ff9e64'
    ctx.beginPath()
    ctx.moveTo(-5, 10)
    ctx.lineTo(5, 10)
    ctx.lineTo(0, 10 + flick)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.moveTo(-2.5, 10)
    ctx.lineTo(2.5, 10)
    ctx.lineTo(0, 10 + flick * 0.55)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
  }
  // 机体三角。
  glow(ctx, '#7dcfff', 8)
  ctx.fillStyle = '#b8c4d8'
  ctx.beginPath()
  ctx.moveTo(0, -12)
  ctx.lineTo(9, 10)
  ctx.lineTo(-9, 10)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // 舷窗。
  ctx.fillStyle = '#7dcfff'
  ctx.beginPath()
  ctx.arc(0, -2, 3, 0, Math.PI * 2)
  ctx.fill()
  // 支腿。
  ctx.strokeStyle = '#8a94aa'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-9, 8)
  ctx.lineTo(-13, 14)
  ctx.moveTo(9, 8)
  ctx.lineTo(13, 14)
  ctx.stroke()
  ctx.restore()
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: LanderState): void {
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
 * 画 HUD：关卡 / 生命 / 累计分，燃料条，垂直 / 水平速度（超阈值变红）
 * 与离地高度。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: LanderState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '关卡', String(state.level))
  hudPair(ctx, 78, hudY, '分数', String(state.score))
  const hearts = state.lives >= 1 ? '❤'.repeat(state.lives) : '♡'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.bad
  ctx.fillText(hearts, W / 2, hudY)

  // 燃料条（右上一条）。
  const barW = 120
  const barX = W - 10 - barW
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('燃料', barX - 26, hudY)
  ctx.fillStyle = '#26262e'
  ctx.fillRect(barX, hudY - 9, barW, 9)
  const fuelK = Math.max(0, state.fuel / FUEL_MAX)
  ctx.fillStyle = fuelK > 0.25 ? THEME.good : THEME.bad
  ctx.fillRect(barX, hudY - 9, barW * fuelK, 9)

  // 第二行：速度与高度。
  const y2 = 38
  const vy = Math.round(Math.abs(state.vy))
  const vx = Math.round(Math.abs(state.vx))
  hudPair(ctx, 10, y2, '垂直', vy + ' / ' + LAND_VY_MAX, 'left', vy < LAND_VY_MAX ? THEME.text : THEME.bad)
  hudPair(ctx, 130, y2, '水平', vx + ' / ' + LAND_VX_MAX, 'left', vx < LAND_VX_MAX ? THEME.text : THEME.bad)
  hudPair(ctx, W - 10, y2, '高度', String(Math.round(altitude(state))), 'right')

  // 燃料耗尽提示。
  if (state.fuel <= 0 && state.phase === 'flying') {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.bad
    ctx.fillText('燃料耗尽', W / 2, y2 + 4)
  }
}

/**
 * 渲染一帧：星空、山脊与 pad、登月舱、飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderLander(ctx: CanvasRenderingContext2D, state: LanderState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawStars(ctx, state.t)
  drawTerrain(ctx, state)

  if (state.phase !== 'crashed' && state.phase !== 'gameover') drawLander(ctx, state)

  // 消费逻辑层事件：着陆迸发绿色粒子，坠毁迸发红色粒子。
  for (const ev of state.events) {
    if (ev.type === 'land') particles.burst(ev.x, ev.y, THEME.good, 20, 180)
    else particles.burst(ev.x, ev.y, THEME.bad, 30, 240)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawFloats(ctx, state)
  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'landed') {
    drawOverlay(ctx, W, H, '着陆成功', '第 ' + state.level + ' 关 +' + state.lastPoints + ' 分 · 前往下一关', THEME.good)
  } else if (state.phase === 'crashed') {
    drawOverlay(ctx, W, H, '坠 毁', '剩余 ' + state.lives + ' 命 · 稍后重来', THEME.bad)
  } else if (state.phase === 'gameover') {
    drawOverlay(ctx, W, H, '任务失败', '累计 ' + state.score + ' 分 · 按 R 重开', THEME.bad)
  }

  // 直立指示：倾角超阈值时机体旁红点提示（仅在飞行时）。
  let tilt = state.angle % (Math.PI * 2)
  if (tilt > Math.PI) tilt -= Math.PI * 2
  if (tilt < -Math.PI) tilt += Math.PI * 2
  if (state.phase === 'flying' && Math.abs(tilt) > LAND_TILT_MAX) {
    ctx.fillStyle = 'rgba(247,118,142,0.8)'
    ctx.beginPath()
    ctx.arc(state.x, state.y - 20, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // 地面高度参考线（帮助读高度）：舱体正下方细线到地面。
  if (state.phase === 'flying') {
    const ground = groundAt(state.terrain, state.x)
    ctx.strokeStyle = 'rgba(226,226,238,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(state.x, state.y + 14)
    ctx.lineTo(state.x, ground)
    ctx.stroke()
  }
}
