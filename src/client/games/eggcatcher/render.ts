/**
 * 接鸡蛋渲染层：农场晨光背景（暖色天空渐变、太阳、云、草地与栅栏）、
 * 顶部来回走动的母鸡（随步伐摆动的腿与身体起伏）、白 / 金 / 绿臭蛋、
 * 编织篮（接住时挤压动画）、接住 / 臭蛋 / 漏蛋的粒子迸发、上浮渐隐的
 * 飘字、HUD（分数 / 生命 🐣×n / 连击）、暂停与结算遮罩。HUD 覆在半透明
 * 深色条上以保持共享主题文字的可读性。
 */
import type { EggCatcherState, Egg } from './logic.ts'
import { W, H, BASKET_W, BASKET_H, BASKET_Y, SQUASH_MS, FLOAT_MS, EGG_R } from './logic.ts'
import { THEME, createParticles, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const SKY_TOP = '#8ec9f0'
const SKY_MID = '#cfe8f7'
const SKY_LOW = '#ffe9c4'
const GROUND = '#7fb254'
const GROUND_DARK = '#5f8f3e'
const SUN = '#ffd166'
const EGG_WHITE = '#fdf6ec'
const EGG_EDGE = '#d9c9ae'
const EGG_GOLD = THEME.gold
const EGG_ROTTEN = '#8fae4a'
const BASKET_BODY = '#c98d4e'
const BASKET_DARK = '#a06a35'
const BASKET_RIM = '#8a5a2a'
const HEN_BODY = '#f6f2ea'
const HEN_EDGE = '#d8cfc0'
const HEN_COMB = '#e05252'
const HEN_BEAK = '#f0a03a'
const HUD_BAND = 'rgba(13,13,20,0.42)'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/**
 * 画农场晨光背景：天空三段渐变、太阳、两朵云、草地与栅栏。
 * @param ctx - 画布上下文。
 */
function drawFarm(ctx: CanvasRenderingContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H - 60)
  sky.addColorStop(0, SKY_TOP)
  sky.addColorStop(0.55, SKY_MID)
  sky.addColorStop(1, SKY_LOW)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H - 48)
  // 太阳。
  glow(ctx, SUN, 28)
  ctx.fillStyle = SUN
  ctx.beginPath()
  ctx.arc(64, 84, 26, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 云（静止的两团椭圆）。
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (const [cx, cy, s] of [[150, 70, 1], [360, 52, 0.8]] as const) {
    ctx.beginPath()
    ctx.ellipse(cx, cy, 34 * s, 12 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(cx + 22 * s, cy + 4 * s, 22 * s, 9 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 草地。
  ctx.fillStyle = GROUND
  ctx.fillRect(0, H - 48, W, 48)
  ctx.fillStyle = GROUND_DARK
  ctx.fillRect(0, H - 48, W, 4)
  // 栅栏：底部一排浅色桩。
  ctx.fillStyle = '#e7d9bd'
  for (let x = 12; x < W; x += 48) ctx.fillRect(x, H - 40, 7, 26)
  ctx.fillRect(0, H - 34, W, 5)
}

/**
 * 画顶部走动的母鸡：身体起伏 + 腿部摆动随回合钟，朝向随 dir 翻转。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHen(ctx: CanvasRenderingContext2D, state: EggCatcherState): void {
  const { x, dir } = state.hen
  const bob = Math.sin(state.t / 130) * 2
  const legSwing = Math.sin(state.t / 90) * 4
  ctx.save()
  ctx.translate(x, 56 + bob)
  ctx.scale(dir, 1)
  // 腿。
  ctx.strokeStyle = HEN_BEAK
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(-4, 10)
  ctx.lineTo(-4 + legSwing, 20)
  ctx.moveTo(5, 10)
  ctx.lineTo(5 - legSwing, 20)
  ctx.stroke()
  // 身体。
  ctx.fillStyle = HEN_BODY
  ctx.strokeStyle = HEN_EDGE
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // 尾羽。
  ctx.fillStyle = '#e3d9c8'
  ctx.beginPath()
  ctx.ellipse(-17, -4, 7, 5, -0.6, 0, Math.PI * 2)
  ctx.fill()
  // 头（朝向正方向）。
  ctx.fillStyle = HEN_BODY
  ctx.beginPath()
  ctx.arc(15, -10, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // 鸡冠。
  ctx.fillStyle = HEN_COMB
  ctx.beginPath()
  ctx.arc(13, -18, 3, 0, Math.PI * 2)
  ctx.arc(17, -19, 3, 0, Math.PI * 2)
  ctx.fill()
  // 喙与眼睛。
  ctx.fillStyle = HEN_BEAK
  ctx.beginPath()
  ctx.moveTo(22, -11)
  ctx.lineTo(29, -9)
  ctx.lineTo(22, -6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#33322e'
  ctx.beginPath()
  ctx.arc(17, -12, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画一颗蛋：白 / 金（带辉光）/ 绿臭蛋（带 💀 小标），统一椭圆 + 高光。
 * @param ctx - 画布上下文。
 * @param e - 蛋实体。
 */
function drawEgg(ctx: CanvasRenderingContext2D, e: Egg): void {
  const fill = e.kind === 1 ? EGG_GOLD : e.kind === 2 ? EGG_ROTTEN : EGG_WHITE
  const edge = e.kind === 1 ? '#b8862f' : e.kind === 2 ? '#5f7a2e' : EGG_EDGE
  if (e.kind === 1) glow(ctx, EGG_GOLD, 12)
  ctx.fillStyle = fill
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(e.x, e.y, EGG_R * 0.82, EGG_R, 0, 0, Math.PI * 2)
  ctx.fill()
  if (e.kind === 1) noGlow(ctx)
  ctx.stroke()
  // 左上高光。
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(e.x - EGG_R * 0.25, e.y - EGG_R * 0.4, 3, 4, -0.4, 0, Math.PI * 2)
  ctx.fill()
  // 臭蛋骷髅小标。
  if (e.kind === 2) {
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('💀', e.x, e.y + 4)
  }
}

/**
 * 画编织篮：梯形主体 + 横向编织条 + 篮口沿，接住时按 squash 挤压
 * （横向外扩、纵向压扁）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBasket(ctx: CanvasRenderingContext2D, state: EggCatcherState): void {
  const k = state.squashMs > 0 ? state.squashMs / SQUASH_MS : 0
  const sx = 1 + 0.14 * k
  const sy = 1 - 0.26 * k
  ctx.save()
  ctx.translate(state.basketX, BASKET_Y + BASKET_H)
  ctx.scale(sx, sy)
  const halfW = BASKET_W / 2
  const halfTop = halfW * 0.86
  // 主体梯形。
  ctx.fillStyle = BASKET_BODY
  ctx.beginPath()
  ctx.moveTo(-halfTop, -BASKET_H)
  ctx.lineTo(halfTop, -BASKET_H)
  ctx.lineTo(halfW, 0)
  ctx.lineTo(-halfW, 0)
  ctx.closePath()
  ctx.fill()
  // 横向编织条。
  ctx.strokeStyle = BASKET_DARK
  ctx.lineWidth = 2
  for (let i = 1; i <= 3; i += 1) {
    const yy = -BASKET_H + (BASKET_H / 4) * i
    const shrink = (i / 4) * (halfW - halfTop)
    ctx.beginPath()
    ctx.moveTo(-halfTop - shrink, yy)
    ctx.lineTo(halfTop + shrink, yy)
    ctx.stroke()
  }
  // 竖向编织弧。
  ctx.strokeStyle = 'rgba(160,106,53,0.6)'
  for (let i = -2; i <= 2; i += 1) {
    const xx = (i / 2.5) * halfTop
    ctx.beginPath()
    ctx.moveTo(xx, -BASKET_H + 2)
    ctx.quadraticCurveTo(xx * 1.12, -BASKET_H / 2, xx * 1.18, -2)
    ctx.stroke()
  }
  // 篮口沿（浅色椭圆环）。
  ctx.fillStyle = BASKET_RIM
  ctx.beginPath()
  ctx.ellipse(0, -BASKET_H, halfTop, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = BASKET_DARK
  ctx.beginPath()
  ctx.ellipse(0, -BASKET_H, halfTop - 4, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: EggCatcherState): void {
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
 * 渲染一帧：农场背景、母鸡、蛋、篮子、飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderEggCatcher(ctx: CanvasRenderingContext2D, state: EggCatcherState, paused: boolean): void {
  drawFarm(ctx)
  drawHen(ctx, state)
  for (const e of state.eggs) drawEgg(ctx, e)
  drawBasket(ctx, state)
  drawFloats(ctx, state)

  // 消费逻辑层事件：接住迸发蛋色粒子、臭蛋红色、漏蛋白色碎壳。
  for (const ev of state.events) {
    const color = ev.type === 'rotten' ? THEME.bad
      : ev.type === 'miss' ? '#fdf6ec'
        : ev.kind === 1 ? EGG_GOLD : ev.kind === 2 ? EGG_ROTTEN : '#fdf6ec'
    particles.burst(ev.x, ev.y, color, ev.type === 'miss' ? 14 : 12, ev.type === 'miss' ? 170 : 150)
  }
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：半透明深色条 + 共享主题文字。
  ctx.fillStyle = HUD_BAND
  roundRectPath(ctx, 4, 4, W - 8, 24, 8)
  ctx.fill()
  const hudY = 20
  hudPair(ctx, 14, hudY, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = state.lives <= 1 ? THEME.bad : THEME.text
  ctx.fillText('🐣 ×' + state.lives, W / 2, hudY)
  if (state.combo >= 2 && state.comboExpire > state.t) {
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = THEME.gold
    ctx.fillText('x' + state.combo + ' 连击', W - 14, hudY)
  } else {
    hudPair(ctx, W - 14, hudY, '漏', String(state.missed), 'right', THEME.bad)
  }

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 按 R 重开', state.lives <= 0 ? THEME.bad : THEME.text)
  }
}
