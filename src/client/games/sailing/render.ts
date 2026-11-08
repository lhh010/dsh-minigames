/**
 * 帆船远航渲染层：动态波纹海面、风向箭头与风旗、航线虚线与浮标
 * （下一目标金色脉冲）、船体 + 可旋转帆、航迹拖尾、速度表与帆角指示、
 * HUD（关卡 / 分数 / 剩余时间 / 浮标进度）、过关与结束遮罩。
 */
import {
  W,
  H,
  SAIL_MAX,
  BUOY_R,
  DEAD_ZONE,
  timeLeft,
  timeLimitOf,
  sailPower,
  optimalSail,
  powerRatio,
  normAngle,
  mulberry32,
  type SailingState,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

// 波纹网格：挂载时确定性生成一次，随时间起伏流动，纯视觉。
const ripples: { x: number, y: number, r: number, ph: number }[] = (() => {
  const rng = mulberry32(20261108)
  const list: { x: number, y: number, r: number, ph: number }[] = []
  for (let i = 0; i < 46; i += 1) {
    list.push({ x: rng() * W, y: rng() * H, r: 5 + rng() * 14, ph: rng() * 6.28 })
  }
  return list
})()

/**
 * 画海面：共享渐变底 + 随时间扩散渐隐的波纹圆环。
 * @param ctx - 画布上下文。
 * @param t - 关卡内毫秒钟。
 */
function drawSea(ctx: CanvasRenderingContext2D, t: number): void {
  drawBackground(ctx, W, H)
  ctx.strokeStyle = 'rgba(122,162,247,0.16)'
  ctx.lineWidth = 1
  for (const r of ripples) {
    const k = (t / 2400 + r.ph) % 1
    ctx.globalAlpha = 0.35 * (1 - k)
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.r * (0.4 + k * 1.6), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/**
 * 画风向指示：右上角风旗箭头，指向风吹向的方向，长度随风力。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawWindGauge(ctx: CanvasRenderingContext2D, state: SailingState): void {
  const cx = W - 56
  const cy = 88
  const speed = state.wind.speed
  const len = 16 + speed * 0.18
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(state.wind.travel)
  const color = accent(0)
  glow(ctx, color, 8)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-len, 0)
  ctx.lineTo(len - 6, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(len, 0)
  ctx.lineTo(len - 9, -5)
  ctx.lineTo(len - 9, 5)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.restore()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('风 ' + Math.round(speed), cx, cy + 34)
}

/**
 * 画航线：出发位 → 浮标依次的虚线，已完成的赛段变淡。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawCourse(ctx: CanvasRenderingContext2D, state: SailingState): void {
  ctx.save()
  ctx.setLineDash([8, 8])
  ctx.lineWidth = 1.5
  const startX = W / 2
  const startY = H - 60
  let fromX = startX
  let fromY = startY
  for (let i = 0; i < state.buoys.length; i += 1) {
    const b = state.buoys[i]!
    const done = i < state.next
    ctx.strokeStyle = done ? 'rgba(226,226,238,0.12)' : 'rgba(122,162,247,0.35)'
    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    fromX = b.x
    fromY = b.y
  }
  ctx.restore()
}

/**
 * 画浮标：锥形浮体 + 编号；下一目标金色脉冲光环，已通过变暗。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param t - 关卡内毫秒钟（脉冲相位用）。
 */
function drawBuoys(ctx: CanvasRenderingContext2D, state: SailingState, t: number): void {
  for (let i = 0; i < state.buoys.length; i += 1) {
    const b = state.buoys[i]!
    const isNext = i === state.next
    const done = i < state.next
    const color = done ? THEME.textMuted : isNext ? THEME.gold : THEME.bad
    if (isNext) {
      // 通过圈：金色脉冲。
      const pulse = 0.5 + 0.5 * Math.sin(t / 260)
      ctx.globalAlpha = 0.5 + 0.35 * pulse
      glow(ctx, color, 10)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(b.x, b.y, BUOY_R, 0, Math.PI * 2)
      ctx.stroke()
      noGlow(ctx)
      ctx.globalAlpha = 1
    }
    glow(ctx, color, isNext ? 12 : 5)
    ctx.fillStyle = done ? '#4a4a5e' : '#e0af68'
    ctx.beginPath()
    ctx.moveTo(b.x, b.y - 10)
    ctx.lineTo(b.x + 7, b.y + 8)
    ctx.lineTo(b.x - 7, b.y + 8)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = isNext ? THEME.gold : THEME.textMuted
    ctx.fillText(String(i + 1), b.x, b.y + 22)
  }
}

/**
 * 画航迹拖尾：越旧越透明的水花圆点。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTrail(ctx: CanvasRenderingContext2D, state: SailingState): void {
  const n = state.trail.length
  for (let i = 0; i < n; i += 1) {
    const p = state.trail[i]!
    const k = (i + 1) / n
    ctx.globalAlpha = 0.25 * k
    ctx.fillStyle = '#7dcfff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1 + 2.5 * k, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画帆船：旋转到航向的尖头船体 + 相对船身可旋转的帆（弧形帆面），
 * 死角区帆抖动（虚线），动力为负时帆面变红。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param t - 关卡内毫秒钟。
 */
function drawBoat(ctx: CanvasRenderingContext2D, state: SailingState, t: number): void {
  const rel = normAngle(state.wind.travel - state.heading)
  const inDead = Math.abs(Math.PI - Math.abs(rel)) <= DEAD_ZONE
  const power = sailPower(rel, state.sail, state.wind.speed)
  const badSail = power < -1
  ctx.save()
  ctx.translate(state.x, state.y)
  ctx.rotate(state.heading)

  // 帆：从桅杆（船中心）向后张开的弧面。
  const sailLen = 26
  const sailTilt = state.sail + (inDead ? 0.25 * Math.sin(t / 60) : 0)
  const tipX = Math.sin(sailTilt) * sailLen
  const tipY = -Math.cos(sailTilt) * sailLen * 0.2 + sailLen * 0.9
  const sailColor = badSail ? THEME.bad : THEME.text
  glow(ctx, sailColor, 8)
  ctx.strokeStyle = sailColor
  ctx.fillStyle = inDead ? 'rgba(226,226,238,0.18)' : 'rgba(226,226,238,0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, -4)
  ctx.quadraticCurveTo(tipX * 0.7, (tipY - 4) * 0.5, tipX, tipY - 4)
  ctx.quadraticCurveTo(tipX * 0.4, (tipY - 4) * 0.6, 0, 4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  noGlow(ctx)

  // 船体：尖头水滴形。
  glow(ctx, '#7dcfff', 8)
  ctx.fillStyle = '#b8c4d8'
  ctx.beginPath()
  ctx.moveTo(16, 0)
  ctx.quadraticCurveTo(2, 9, -13, 6)
  ctx.lineTo(-13, -6)
  ctx.quadraticCurveTo(2, -9, 16, 0)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // 舱盖。
  ctx.fillStyle = '#7aa2f7'
  ctx.beginPath()
  ctx.arc(-2, 0, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画速度表：左下角半圆刻度 + 指针，速度越快越亮。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSpeedo(ctx: CanvasRenderingContext2D, state: SailingState): void {
  const cx = 52
  const cy = H - 36
  const r = 26
  const maxV = 260
  const k = Math.max(0, Math.min(1, state.v / maxV))
  ctx.strokeStyle = '#34344a'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, 0)
  ctx.stroke()
  ctx.strokeStyle = k > 0.7 ? THEME.good : accent(0)
  glow(ctx, THEME.good, 6)
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * k)
  ctx.stroke()
  noGlow(ctx)
  const ang = Math.PI + Math.PI * k
  ctx.strokeStyle = THEME.text
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(ang) * (r - 7), cy + Math.sin(ang) * (r - 7))
  ctx.stroke()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(Math.round(state.v) + ' px/s', cx, cy + 14)
  // 动力条：当前帆动力占该风角最优动力的比例（绿=高、黄=中、红=近零）。
  const rel = normAngle(state.wind.travel - state.heading)
  const ratio = powerRatio(rel, state.sail)
  const barW = 52
  const bx = cx - barW / 2
  const by = cy + 22
  ctx.fillStyle = '#34344a'
  roundRectPath(ctx, bx, by, barW, 5, 2)
  ctx.fill()
  const fillC = ratio > 0.66 ? THEME.good : ratio > 0.33 ? THEME.gold : THEME.bad
  ctx.fillStyle = fillC
  roundRectPath(ctx, bx, by, Math.max(2, barW * ratio), 5, 2)
  ctx.fill()
  ctx.font = '600 9px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('动力 ' + Math.round(ratio * 100) + '%', cx, by + 14)
}

/**
 * 画帆角指示：速度表右侧的船身横置示意 + 帆角刻度与当前帆位。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSailGauge(ctx: CanvasRenderingContext2D, state: SailingState): void {
  const cx = 132
  const cy = H - 36
  const rel = normAngle(state.wind.travel - state.heading)
  const inDead = Math.abs(Math.PI - Math.abs(rel)) <= DEAD_ZONE
  ctx.strokeStyle = '#34344a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 34, cy)
  ctx.lineTo(cx + 34, cy)
  ctx.stroke()
  // 死角区提示：顶风时船身线两端标红（帆抖动无动力）。
  if (inDead) {
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - 34, cy)
    ctx.lineTo(cx - 22, cy)
    ctx.moveTo(cx + 22, cy)
    ctx.lineTo(cx + 34, cy)
    ctx.stroke()
  }
  // 最优帆位幽灵标记（金色虚线）：当前风角下的推荐帆角。
  const best = optimalSail(rel)
  if (!inDead) {
    const bx = cx + Math.sin(best) * 30
    const by = cy - Math.cos(best) * 6 - 4
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2
    glow(ctx, THEME.gold, 5)
    ctx.beginPath()
    ctx.moveTo(cx, cy - 4)
    ctx.lineTo(bx, by)
    ctx.stroke()
    noGlow(ctx)
    ctx.setLineDash([])
  }
  // 帆位指示。
  const sailX = cx + Math.sin(state.sail) * 30
  const sailY = cy - Math.cos(state.sail) * 6 - 4
  const color = inDead ? THEME.bad : THEME.text
  glow(ctx, color, 6)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy - 4)
  ctx.lineTo(sailX, sailY)
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('帆角 ' + Math.round((state.sail * 180) / Math.PI) + '°', cx, cy + 14)
  ctx.fillText('±' + Math.round((SAIL_MAX * 180) / Math.PI) + '°', cx, cy - 34)
  // 调帆方向提示：偏离最优超过 15° 时指示按 ↑ 还是 ↓。
  if (!inDead && Math.abs(state.sail - best) > (15 * Math.PI) / 180) {
    ctx.fillStyle = THEME.gold
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillText(state.sail < best ? '↑ 松帆' : '↓ 收帆', cx, cy - 20)
  }
  // 顶风时最醒目的动作提示：转向离开死角区。
  if (inDead) {
    ctx.fillStyle = THEME.bad
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillText('顶风！←/→ 转向', cx, cy - 20)
  }
}

/**
 * 画 HUD：关卡 / 分数 / 剩余时间（不足 15s 变红）/ 浮标进度。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: SailingState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '关卡', String(state.level))
  hudPair(ctx, 78, hudY, '分数', String(state.score))
  hudPair(ctx, 150, hudY, '浮标', state.next + ' / ' + state.buoys.length)
  const left = timeLeft(state)
  const low = left < 15000 && state.phase === 'racing'
  hudPair(ctx, W - 10, hudY, '时间', (left / 1000).toFixed(1) + 's', 'right', low ? THEME.bad : THEME.text)
  const total = timeLimitOf(state.level)
  ctx.fillStyle = '#26262e'
  ctx.fillRect(W - 170, hudY + 6, 160, 4)
  ctx.fillStyle = low ? THEME.bad : THEME.good
  ctx.fillRect(W - 170, hudY + 6, 160 * (left / total), 4)
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: SailingState): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = 'bold 15px system-ui, sans-serif'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / 1200))
    ctx.globalAlpha = k
    ctx.fillStyle = THEME.gold
    ctx.fillText(fl.text, Math.max(40, Math.min(W - 40, fl.x)), Math.max(40, fl.y))
  }
  ctx.restore()
}

/**
 * 渲染一帧：海面、航线与浮标、风向指示、拖尾、帆船、速度表与帆角、
 * 飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderSailing(ctx: CanvasRenderingContext2D, state: SailingState, paused: boolean): void {
  drawSea(ctx, state.t)
  drawCourse(ctx, state)
  drawBuoys(ctx, state, state.t)
  drawWindGauge(ctx, state)
  drawTrail(ctx, state)
  if (state.phase !== 'gameover') drawBoat(ctx, state, state.t)

  // 消费逻辑层事件：过标金色迸发，过关绿色，失败红色。
  for (const ev of state.events) {
    if (ev.type === 'buoy') particles.burst(ev.x, ev.y, THEME.gold, 18, 170)
    else if (ev.type === 'finish') particles.burst(ev.x, ev.y, THEME.good, 28, 210)
    else particles.burst(ev.x, ev.y, THEME.bad, 26, 200)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawSpeedo(ctx, state)
  drawSailGauge(ctx, state)
  drawFloats(ctx, state)
  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'finished') {
    drawOverlay(ctx, W, H, '过 关', '第 ' + state.level + ' 关 +' + state.lastPoints + ' 分 · 前往下一关', THEME.good)
  } else if (state.phase === 'gameover') {
    const why = state.reason === 'miss' ? '漏标判负' : '超时判负'
    drawOverlay(ctx, W, H, '航 行 结 束', why + ' · 累计 ' + state.score + ' 分 · 按 R 重开', THEME.bad)
  }
}
