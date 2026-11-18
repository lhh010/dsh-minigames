/**
 * 起重机 Crane 渲染层：码头夜景（星空 + 水面反光 + 龙门吊剪影）、三根
 * 立柱与堆叠集装箱色块（目标柱金色标牌）、吊臂台车 + 吊绳 + 吊钩、携带
 * 箱随摆速倾斜、抛落箱旋转与轨迹尾迹、落定弹跳与倒塔 / 落水粒子、
 * 关卡 / 步数 / 失败 / 分数 HUD、过关切换与竣工遮罩。无状态：只读逻辑
 * 态，事件转粒子爆发（logic 每帧开头清空事件）。
 */
import {
  W, H, TOWER_X, TARGET, GROUND_Y, BOOM_Y, ROPE_LEN, BOX_H, LEVELS,
  boxWidth, type Box, type CraneState,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()
// 抛落轨迹尾迹（渲染层局部，随局清空）。
let trail: { x: number, y: number }[] = []
let trailRun = 0

/** 固定星空（确定性装饰，不占逻辑随机流）。 */
const STARS = [
  { x: 46, y: 60, r: 1.4 }, { x: 120, y: 34, r: 1 }, { x: 210, y: 78, r: 1.2 },
  { x: 300, y: 44, r: 1 }, { x: 396, y: 70, r: 1.4 }, { x: 470, y: 30, r: 1 },
  { x: 552, y: 62, r: 1.2 }, { x: 606, y: 40, r: 1 }, { x: 86, y: 130, r: 1 },
  { x: 610, y: 120, r: 1.1 }, { x: 264, y: 118, r: 0.9 }, { x: 430, y: 132, r: 1 },
] as const

/**
 * 画码头夜景背景：星空、远处城市剪影、水面与码头岸线。
 * @param ctx - 画布上下文。
 */
function drawDock(ctx: CanvasRenderingContext2D): void {
  for (const s of STARS) {
    ctx.fillStyle = 'rgba(226,226,238,0.5)'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 远处城市剪影。
  ctx.fillStyle = '#14141f'
  const skyline: readonly number[] = [30, 58, 40, 72, 46, 66, 36, 80, 52, 44, 70, 38, 62, 48]
  let bx = 8
  for (let i = 0; i < skyline.length; i += 1) {
    const bh = skyline[i]!
    ctx.fillRect(bx, GROUND_Y + 34 - bh, 42, bh)
    bx += 46
  }
  // 水面：岸线以下深蓝渐变 + 微光横纹。
  const water = ctx.createLinearGradient(0, GROUND_Y + 34, 0, H)
  water.addColorStop(0, '#0d1524')
  water.addColorStop(1, '#0a0e18')
  ctx.fillStyle = water
  ctx.fillRect(0, GROUND_Y + 34, W, H - GROUND_Y - 34)
  ctx.strokeStyle = 'rgba(125,207,255,0.14)'
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i += 1) {
    const wy = GROUND_Y + 46 + i * 16
    ctx.beginPath()
    ctx.moveTo(14, wy)
    ctx.lineTo(W - 14, wy)
    ctx.stroke()
  }
  // 码头岸面。
  ctx.fillStyle = '#23232f'
  ctx.fillRect(0, GROUND_Y, W, 34)
  ctx.strokeStyle = 'rgba(122,162,247,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, GROUND_Y)
  ctx.lineTo(W, GROUND_Y)
  ctx.stroke()
}

/**
 * 画龙门吊剪影：两根 A 型腿 + 顶部横梁 + 警示条纹，横梁即吊臂导轨。
 * @param ctx - 画布上下文。
 */
function drawGantry(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#191926'
  ctx.strokeStyle = '#2c2c40'
  ctx.lineWidth = 3
  // 左右 A 型腿。
  for (const lx of [58, W - 58]) {
    ctx.beginPath()
    ctx.moveTo(lx - 26, GROUND_Y)
    ctx.lineTo(lx, BOOM_Y - 14)
    ctx.lineTo(lx + 26, GROUND_Y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // 横梁。
  roundRectPath(ctx, 20, BOOM_Y - 16, W - 40, 16, 5)
  ctx.fill()
  ctx.stroke()
  // 警示条纹。
  ctx.save()
  roundRectPath(ctx, 20, BOOM_Y - 16, W - 40, 16, 5)
  ctx.clip()
  ctx.fillStyle = 'rgba(224,175,104,0.55)'
  for (let x = 28; x < W - 30; x += 26) {
    ctx.beginPath()
    ctx.moveTo(x, BOOM_Y)
    ctx.lineTo(x + 10, BOOM_Y)
    ctx.lineTo(x + 22, BOOM_Y - 16)
    ctx.lineTo(x + 12, BOOM_Y - 16)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * 画一根立柱：柱身 + 柱顶灯，目标柱加金色标牌。
 * @param ctx - 画布上下文。
 * @param index - 柱索引。
 */
function drawTowerPole(ctx: CanvasRenderingContext2D, index: number): void {
  const x = TOWER_X[index]!
  const isTarget = index === TARGET
  ctx.fillStyle = isTarget ? 'rgba(224,175,104,0.24)' : 'rgba(122,162,247,0.10)'
  roundRectPath(ctx, x - 46, GROUND_Y - 4, 92, 10, 3)
  ctx.fill()
  ctx.strokeStyle = isTarget ? 'rgba(224,175,104,0.7)' : 'rgba(122,162,247,0.4)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x, BOOM_Y + 20)
  ctx.lineTo(x, GROUND_Y)
  ctx.stroke()
  // 柱顶指示灯（目标柱金色呼吸）。
  const pulse = isTarget ? 0.55 + 0.45 * Math.sin(performance.now() / 380) : 0.4
  const color = isTarget ? THEME.gold : '#7dcfff'
  ctx.globalAlpha = pulse
  glow(ctx, color, 8)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, BOOM_Y + 14, 4, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
  if (isTarget) {
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    ctx.fillText('目标', x, BOOM_Y + 36)
  }
}

/**
 * 画一只集装箱色块：主体色 + 波纹 + 端部锁扣高光。
 * @param ctx - 画布上下文。
 * @param cx - 箱中心 x（px）。
 * @param y - 箱顶 y（px）。
 * @param box - 箱数据。
 * @param tilt - 倾斜角（rad，携带摆动感）。
 */
function drawBox(ctx: CanvasRenderingContext2D, cx: number, y: number, box: Box, tilt = 0): void {
  const color = accent(box.color + 1)
  ctx.save()
  ctx.translate(cx, y + BOX_H / 2)
  ctx.rotate(tilt)
  roundRectPath(ctx, -box.w / 2, -BOX_H / 2, box.w, BOX_H, 4)
  glow(ctx, color, 5)
  ctx.fillStyle = color
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(10,10,16,0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 波纹。
  ctx.strokeStyle = 'rgba(10,10,16,0.28)'
  ctx.lineWidth = 1
  for (let i = -box.w / 2 + 8; i < box.w / 2 - 6; i += 9) {
    ctx.beginPath()
    ctx.moveTo(i, -BOX_H / 2 + 5)
    ctx.lineTo(i, BOX_H / 2 - 5)
    ctx.stroke()
  }
  // 端部锁扣。
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(-box.w / 2 + 3, -BOX_H / 2 + 4, 3, 4)
  ctx.fillRect(box.w / 2 - 6, -BOX_H / 2 + 4, 3, 4)
  ctx.restore()
}

/**
 * 消费逻辑事件：入柱 / 倒塔 / 落水 / 过关粒子爆发。
 * @param state - 当前状态。
 */
function consumeEvents(state: CraneState): void {
  for (const ev of state.events) {
    if (ev.type === 'land') particles.burst(ev.x, ev.y - 8, THEME.good, 12, 150)
    else if (ev.type === 'topple') particles.burst(ev.x, ev.y - 10, THEME.bad, 16, 190)
    else if (ev.type === 'splash') particles.burst(ev.x, ev.y, '#7dcfff', 14, 160)
    else if (ev.type === 'win') particles.burst(W / 2, H / 2 - 40, THEME.gold, 26, 220)
  }
}

/**
 * 画吊臂台车、吊绳、吊钩与携带箱（随摆速倾斜的物理感）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHook(ctx: CanvasRenderingContext2D, state: CraneState): void {
  const x = state.hookX
  // 台车。
  ctx.fillStyle = '#3a3a52'
  roundRectPath(ctx, x - 17, BOOM_Y - 8, 34, 15, 4)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 吊绳 + 吊钩。
  const hookY = BOOM_Y + ROPE_LEN
  ctx.strokeStyle = 'rgba(226,226,238,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, BOOM_Y + 6)
  ctx.lineTo(x, hookY - 12)
  ctx.stroke()
  ctx.fillStyle = '#c9c9da'
  ctx.beginPath()
  ctx.arc(x, hookY - 8, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#c9c9da'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, hookY - 1, 6, Math.PI * 0.15, Math.PI * 0.85, false)
  ctx.stroke()
  // 携带箱：挂在钩下，随摆速倾斜（甩尾感）。
  if (state.carried !== null) {
    const tilt = Math.max(-0.35, Math.min(0.35, state.hookVx / 900))
    drawBox(ctx, x + Math.sin(tilt) * 14, hookY + 2, state.carried, tilt)
  }
}

/**
 * 画主场景并推进渲染层动画；index 的帧循环每帧调用。
 * @param ctx - 画布上下文。
 * @param state - 当前逻辑态。
 * @param paused - 是否暂停（画遮罩）。
 */
export function renderCrane(ctx: CanvasRenderingContext2D, state: CraneState, paused: boolean): void {
  if (trailRun !== state.nextId + state.level * 1000 + state.steps) {
    if (state.phase === 'swing' && state.fall === null) trail = []
    trailRun = state.nextId + state.level * 1000 + state.steps
  }
  if (state.fall !== null) {
    trail.push({ x: state.fall.x + state.fall.box.w / 2, y: state.fall.y })
    if (trail.length > 14) trail.shift()
  }

  drawBackground(ctx, W, H)
  drawDock(ctx)
  drawGantry(ctx)
  for (let i = 0; i < 3; i += 1) drawTowerPole(ctx, i)

  // 柱上堆叠的箱。
  for (let i = 0; i < 3; i += 1) {
    const tower = state.towers[i]!
    for (let b = 0; b < tower.length; b += 1) {
      drawBox(ctx, TOWER_X[i]!, GROUND_Y - BOX_H * (b + 1), tower[b]!)
    }
  }

  // 抛落轨迹尾迹 + 旋转箱。
  if (trail.length > 1) {
    ctx.strokeStyle = 'rgba(226,226,238,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(trail[0]!.x, trail[0]!.y)
    for (const p of trail.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  if (state.fall !== null) {
    drawBox(ctx, state.fall.x + state.fall.box.w / 2, state.fall.y, state.fall.box, state.fall.spin)
  }

  // 落定弹跳：成功轻弹、失败抖动。
  if (state.settle !== null) {
    const s = state.settle
    const frac = Math.max(0, s.ms) / (s.ok ? 320 : 520)
    const amp = s.ok ? 5 : 9
    const dy = -Math.abs(Math.sin(frac * Math.PI * 2.5)) * amp * frac
    const shake = s.ok ? 0 : Math.sin(frac * Math.PI * 6) * 5 * frac
    const stack = s.tower >= 0 ? state.towers[s.tower]! : []
    const topBox = stack.length > 0 ? stack[stack.length - 1]! : null
    const topY = GROUND_Y - BOX_H * stack.length
    const ghost = topBox !== null ? topBox : { id: -1, size: 0, w: boxWidth(0), color: 0 }
    drawBox(ctx, s.x + shake, topY - BOX_H + dy, ghost, s.ok ? 0 : shake * 0.02)
  }

  drawHook(ctx, state)
  consumeEvents(state)
  particles.tick(ctx, 16)

  // HUD。
  const cfg = LEVELS[state.level]
  hudPair(ctx, 16, 24, '关卡', String(state.level + 1) + ' / ' + LEVELS.length)
  if (cfg !== undefined && cfg.colorGroup) {
    hudPair(ctx, 16, 44, '要求', '大下小上 · 同色相邻', 'left', THEME.gold)
  }
  hudPair(ctx, W - 16, 24, '步数', String(state.steps), 'right')
  hudPair(ctx, W - 16, 44, '失败', String(state.fails), 'right', state.fails > 0 ? THEME.bad : THEME.text)
  hudPair(ctx, W - 16, 64, '分数', String(state.score), 'right', THEME.gold)

  if (state.phase === 'between') {
    drawOverlay(ctx, W, H, '过关', '正在装载下一批集装箱…', THEME.good)
  } else if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '码头竣工', '总分 ' + String(state.score) + ' · R 重开', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, W, H, '暂停', 'P 继续 · R 重开')
  }
}
