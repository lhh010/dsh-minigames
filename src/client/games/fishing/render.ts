/**
 * 悠闲钓鱼渲染层：天空 / 水面分界线（上天空下水下渐深）、确定性游动的
 * 水下鱼影、咬钩波纹与浮标、钓线与搏斗中的鱼影（深度随收线距离）、
 * 右侧张力条（绿→黄→红渐变）与收线进度条、HUD 分数 / 断线次数 /
 * 剩余时间、捕获结算浮字、粒子、暂停与结束遮罩。无状态：只读逻辑态。
 */
import {
  W, H, WATER_Y, BOBBER_X, TENSION_MAX, DIST_START, DIST_ESCAPE, FLOAT_MS, MAX_BREAKS,
  BITE_MS, FISH_KINDS, mulberry32, depthOf, type FishingState,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

// 装饰鱼影群：确定性生成一次，纯视觉（与逻辑鱼群无关）。
const shadows: { x: number, y: number, r: number, sp: number, dir: 1 | -1, wob: number }[] = (() => {
  const rng = mulberry32(20261101)
  const list: { x: number, y: number, r: number, sp: number, dir: 1 | -1, wob: number }[] = []
  for (let i = 0; i < 8; i += 1) {
    list.push({
      x: rng() * W,
      y: WATER_Y + 30 + rng() * (H - WATER_Y - 70),
      r: 5 + rng() * 9,
      sp: 14 + rng() * 26,
      dir: rng() < 0.5 ? 1 : -1,
      wob: rng() * 6.28,
    })
  }
  return list
})()

/**
 * 画天空与水面分界线：上部夜空微光，分界线发光，水下按深度加深。
 * @param ctx - 画布上下文。
 */
function drawWater(ctx: CanvasRenderingContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, WATER_Y)
  sky.addColorStop(0, '#141426')
  sky.addColorStop(1, '#1d2a40')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, WATER_Y)
  const sea = ctx.createLinearGradient(0, WATER_Y, 0, H)
  sea.addColorStop(0, '#16324a')
  sea.addColorStop(0.5, '#0f2438')
  sea.addColorStop(1, '#0a1830')
  ctx.fillStyle = sea
  ctx.fillRect(0, WATER_Y, W, H - WATER_Y)
  glow(ctx, '#7dcfff', 10)
  ctx.strokeStyle = 'rgba(125,207,255,0.75)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, WATER_Y)
  ctx.lineTo(W, WATER_Y)
  ctx.stroke()
  noGlow(ctx)
}

/**
 * 画水下鱼影群：左右巡游 + 上下摆动的暗色小鱼形。
 * @param ctx - 画布上下文。
 * @param t - 回合内毫秒钟。
 */
function drawShadows(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = 'rgba(8,16,28,0.6)'
  for (const s of shadows) {
    const span = W + 60
    const x = (((s.x + s.sp * s.dir * t / 1000) % span) + span) % span - 30
    const y = s.y + Math.sin(t / 900 + s.wob) * 8
    ctx.beginPath()
    ctx.ellipse(x, y, s.r, s.r * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - s.dir * s.r, y)
    ctx.lineTo(x - s.dir * (s.r * 1.6), y - s.r * 0.4)
    ctx.lineTo(x - s.dir * (s.r * 1.6), y + s.r * 0.4)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * 画浮标：待咬时轻微起伏，咬钩窗口内剧烈抖动 + 扩散波纹。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBobber(ctx: CanvasRenderingContext2D, state: FishingState): void {
  let y = WATER_Y
  if (state.phase === 'idle') y = WATER_Y + Math.sin(state.t / 700) * 3
  if (state.phase === 'bite') y = WATER_Y + Math.sin(state.t / 60) * 6
  if (state.phase === 'fight') y = WATER_Y + Math.sin(state.t / 120) * 4
  // 咬钩波纹：随窗口倒计时扩散的三圈。
  if (state.phase === 'bite') {
    const k = 1 - state.biteMs / BITE_MS
    ctx.strokeStyle = 'rgba(125,207,255,' + (0.7 * (1 - k)).toFixed(2) + ')'
    for (let i = 0; i < 3; i += 1) {
      const rr = 6 + ((k * 2 + i / 3) % 1) * 34
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(BOBBER_X, WATER_Y, rr, rr * 0.34, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  glow(ctx, '#f7768e', 8)
  ctx.fillStyle = '#f7768e'
  ctx.beginPath()
  ctx.arc(BOBBER_X, y - 5, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e2e2ee'
  ctx.beginPath()
  ctx.arc(BOBBER_X, y + 1, 3, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画钓线（岸上竿口到浮标）与搏斗中的鱼影（深度随收线距离，颜色随品种，
 * 挣扎越猛摆动越快）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawLineAndFish(ctx: CanvasRenderingContext2D, state: FishingState): void {
  // 竿口在右上角。
  const rodX = W - 36
  const rodY = 46
  let lineEndX = BOBBER_X
  let lineEndY = WATER_Y
  if (state.phase === 'fight' && state.fish !== null) {
    const depth = depthOf(state)
    const kind = FISH_KINDS[state.fish.kind % FISH_KINDS.length]!
    const fy = WATER_Y + 30 + depth * (H - WATER_Y - 80)
    const fx = BOBBER_X + Math.sin(state.fightT / (140 - state.pullNow * 0.9)) * (12 + state.pullNow * 0.3)
    lineEndY = fy
    lineEndX = fx
    // 鱼影：品种色椭圆 + 尾鳍，随拉力微倾。
    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(Math.sin(state.fightT / 150) * 0.2)
    const size = 10 + state.fish.weight * 0.9
    glow(ctx, accent(state.fish.kind % 8), 12)
    ctx.fillStyle = 'rgba(20,40,60,0.85)'
    ctx.beginPath()
    ctx.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = accent(state.fish.kind % 8)
    ctx.beginPath()
    ctx.moveTo(size, 0)
    ctx.lineTo(size * 1.6, -size * 0.4)
    ctx.lineTo(size * 1.6, size * 0.4)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // 搏斗提示：张力高危时浮标处红闪。
    if (state.tension > TENSION_MAX * 0.8 && Math.floor(state.t / 110) % 2 === 0) {
      glow(ctx, THEME.bad, 12)
      ctx.fillStyle = THEME.bad
      ctx.beginPath()
      ctx.arc(BOBBER_X, WATER_Y, 4, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    }
  }
  ctx.strokeStyle = 'rgba(226,226,238,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(rodX, rodY)
  ctx.quadraticCurveTo((rodX + lineEndX) / 2, Math.min(rodY, lineEndY) + 26, lineEndX, lineEndY)
  ctx.stroke()
  // 钓竿：右上斜出的短杆。
  ctx.strokeStyle = '#8a94aa'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(W - 8, 60)
  ctx.lineTo(rodX, rodY)
  ctx.stroke()
}

/**
 * 张力条颜色：绿 → 黄 → 红 渐变（按张力比例插值三段）。
 * @param k - 张力比例 0~1。
 * @returns CSS 颜色。
 */
function tensionColor(k: number): string {
  if (k < 0.5) {
    const g = Math.round(206 - (k / 0.5) * 108)
    return 'rgb(158,' + g + ',106)'
  }
  if (k < 0.8) {
    const r = Math.round(158 + ((k - 0.5) / 0.3) * 82)
    const g = Math.round(98 + ((k - 0.5) / 0.3) * 55)
    return 'rgb(' + r + ',' + g + ',106)'
  }
  const g = Math.round(153 - ((k - 0.8) / 0.2) * 110)
  return 'rgb(242,' + g + ',94)'
}

/**
 * 画右侧仪表：竖直张力条（绿→黄→红，含当前拉力指示刻痕）与
 * 收线进度条（距离从 DIST_START 收到 0）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawGauges(ctx: CanvasRenderingContext2D, state: FishingState): void {
  const barX = W - 26
  const barY = WATER_Y + 24
  const barH = H - barY - 60
  // 张力条底。
  ctx.fillStyle = '#26262e'
  roundRectPath(ctx, barX - 5, barY, 10, barH, 5)
  ctx.fill()
  const k = Math.max(0, Math.min(1, state.tension / TENSION_MAX))
  if (k > 0) {
    ctx.fillStyle = tensionColor(k)
    roundRectPath(ctx, barX - 5, barY + barH * (1 - k), 10, barH * k, 5)
    ctx.fill()
  }
  ctx.strokeStyle = '#34344a'
  ctx.lineWidth = 1
  roundRectPath(ctx, barX - 5, barY, 10, barH, 5)
  ctx.stroke()
  // 拉力指示：条内侧的小刻痕（鱼瞬时拉力标尺，帮助预判）。
  const pk = Math.max(0, Math.min(1, state.pullNow / TENSION_MAX))
  if (pk > 0) {
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(barX - 8, barY + barH * (1 - pk))
    ctx.lineTo(barX + 3, barY + barH * (1 - pk))
    ctx.stroke()
  }
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('张力', barX, barY - 6)

  // 收线进度条（竖直，越满越接近水面）。
  const progK = state.phase === 'fight'
    ? Math.max(0, Math.min(1, 1 - state.distance / DIST_START))
    : 0
  const px = barX - 24
  ctx.fillStyle = '#26262e'
  roundRectPath(ctx, px - 4, barY, 8, barH, 4)
  ctx.fill()
  if (progK > 0) {
    glow(ctx, '#7dcfff', 8)
    ctx.fillStyle = '#7dcfff'
    roundRectPath(ctx, px - 4, barY + barH * (1 - progK), 8, barH * progK, 4)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('收线', px, barY - 6)
}

/**
 * 画结算浮字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: FishingState): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = 'bold 17px system-ui, sans-serif'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / FLOAT_MS))
    ctx.globalAlpha = k
    ctx.fillStyle = THEME.gold
    ctx.fillText(fl.text, Math.max(60, Math.min(W - 60, fl.x)), Math.max(70, fl.y))
  }
  ctx.restore()
}

/**
 * 画 HUD：分数 / 断线次数（断1次）/ 剩余时间 / 已捕获条数。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: FishingState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  const hearts = state.breaks >= MAX_BREAKS ? '' : '❤'.repeat(MAX_BREAKS - state.breaks)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.bad
  ctx.fillText(hearts.length > 0 ? hearts : '♡', W / 2 - 40, hudY)
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillText('断 ' + state.breaks + '/' + MAX_BREAKS + ' · 上 ' + state.catches + ' 条', W / 2 + 50, hudY)
  const secs = Math.ceil(state.timeLeft / 1000)
  hudPair(ctx, W - 10, hudY, '时间', String(secs) + 's', 'right')
  // 待咬提示（分界线下方居中）。
  if (state.phase === 'idle') {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('等待鱼上钩…', W / 2, WATER_Y + 22)
  } else if (state.phase === 'bite') {
    glow(ctx, THEME.gold, 8)
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    ctx.fillText('咬钩了！按住收线！', W / 2, WATER_Y + 24)
    noGlow(ctx)
  } else if (state.phase === 'fight') {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = state.holding ? THEME.good : THEME.textMuted
    ctx.fillText(state.holding ? '收线中…注意张力' : '松线回张力中', W / 2, WATER_Y + 22)
  }
}

/**
 * 渲染一帧：天空水体、鱼影、浮标与钓线、仪表、浮字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderFishing(ctx: CanvasRenderingContext2D, state: FishingState, paused: boolean): void {
  drawWater(ctx)
  drawShadows(ctx, state.t)
  drawLineAndFish(ctx, state)
  drawBobber(ctx, state)
  drawGauges(ctx, state)
  drawFloats(ctx, state)

  // 消费逻辑层事件：咬钩/刺鱼小水花，捕获彩色迸发，断线红色迸发。
  for (const ev of state.events) {
    if (ev.type === 'bite') particles.burst(ev.x, WATER_Y, '#7dcfff', 8, 90)
    else if (ev.type === 'hook') particles.burst(ev.x, WATER_Y, '#7dcfff', 12, 130)
    else if (ev.type === 'catch') particles.burst(ev.x, ev.y, accent(ev.kind % 8), 24, 200)
    else if (ev.type === 'break') particles.burst(ev.x, WATER_Y, THEME.bad, 22, 220)
    else if (ev.type === 'escape') particles.burst(ev.x, WATER_Y, THEME.textMuted, 10, 110)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'over') {
    const title = state.breaks >= MAX_BREAKS ? '断线太多次' : '收竿了'
    drawOverlay(ctx, W, H, title, '捕获 ' + state.catches + ' 条 · 得分 ' + state.score + ' · 按 R 重开')
  }
}
