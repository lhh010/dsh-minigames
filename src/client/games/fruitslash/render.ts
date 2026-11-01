/**
 * 切水果渲染层：共享主题的深色渐变背景、白到透明的渐变刀光轨迹、
 * 带高光与叶柄的圆形水果（按种类表配色）、黑体炸弹与火花、切开的
 * 两半半圆飞散、切开/爆炸的粒子迸发、HUD（分数/连击、生命 ❤、剩余时间）、
 * 暂停与结算遮罩。
 */
import type { Fruit, FruitSlashState, Half } from './logic.ts'
import { W, H, HUD_H, TRAIL_MS, FLASH_MS, FRUIT_KINDS } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

const TRAIL_COLOR = '#ffffff'
const BOMB_BODY = '#26262e'
const BOMB_EDGE = '#4a4a5a'
const SPARK_COLOR = accent(6)
const FLASH_COLOR = 'rgba(247,118,142,0.28)'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/**
 * 画带高光和叶柄的一个水果圆。
 * @param ctx - 画布上下文。
 * @param f - 水果实体。
 */
function drawFruit(ctx: CanvasRenderingContext2D, f: Fruit): void {
  const kind = FRUIT_KINDS[f.kind % FRUIT_KINDS.length]!
  // 果体。
  ctx.fillStyle = kind.color
  ctx.beginPath()
  ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
  ctx.fill()
  // 左上高光。
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(f.x - f.r * 0.3, f.y - f.r * 0.35, f.r * 0.32, 0, Math.PI * 2)
  ctx.fill()
  // 叶柄：顶部短棕色柄 + 一片绿叶。
  ctx.strokeStyle = '#8a6b45'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(f.x, f.y - f.r + 1)
  ctx.lineTo(f.x + 2, f.y - f.r - 5)
  ctx.stroke()
  ctx.fillStyle = '#5faa5f'
  ctx.beginPath()
  ctx.ellipse(f.x + 6, f.y - f.r - 4, 6, 3, -0.5, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画黑色炸弹：深色圆 + 引信火花（随回合钟闪烁）。
 * @param ctx - 画布上下文。
 * @param f - 炸弹实体。
 * @param t - 回合内毫秒钟。
 */
function drawBomb(ctx: CanvasRenderingContext2D, f: Fruit, t: number): void {
  glow(ctx, BOMB_EDGE, 10)
  ctx.fillStyle = BOMB_BODY
  ctx.beginPath()
  ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = BOMB_EDGE
  ctx.lineWidth = 2
  ctx.stroke()
  // 短引信。
  ctx.strokeStyle = '#8a6b45'
  ctx.beginPath()
  ctx.moveTo(f.x + f.r * 0.5, f.y - f.r * 0.6)
  ctx.lineTo(f.x + f.r * 0.9, f.y - f.r - 4)
  ctx.stroke()
  // 火花：亮色小圆闪烁。
  if (Math.floor(t / 90) % 2 === 0) {
    glow(ctx, SPARK_COLOR, 10)
    ctx.fillStyle = SPARK_COLOR
    ctx.beginPath()
    ctx.arc(f.x + f.r * 0.9, f.y - f.r - 4, 3, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
}

/**
 * 画飞散中的半块水果：半圆果肉 + 外圈果皮，随存活时间淡出。
 * @param ctx - 画布上下文。
 * @param h - 半块实体。
 */
function drawHalf(ctx: CanvasRenderingContext2D, h: Half): void {
  const kind = FRUIT_KINDS[h.kind % FRUIT_KINDS.length]!
  const alpha = Math.max(0, Math.min(1, h.life / 400))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(h.x, h.y)
  ctx.rotate(h.rot)
  // 果皮半圆。
  ctx.fillStyle = kind.color
  ctx.beginPath()
  ctx.arc(0, 0, h.r, 0, Math.PI)
  ctx.closePath()
  ctx.fill()
  // 内侧果肉。
  ctx.fillStyle = kind.inner
  ctx.beginPath()
  ctx.arc(0, 0, h.r * 0.75, 0, Math.PI)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * 画刀光轨迹：按点龄从白色渐隐、线宽收窄的折线。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTrail(ctx: CanvasRenderingContext2D, state: FruitSlashState): void {
  const pts = state.trail
  if (pts.length < 2) return
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const age = state.t - b.t
    const k = Math.max(0, 1 - age / TRAIL_MS)
    if (k <= 0) continue
    ctx.strokeStyle = TRAIL_COLOR
    ctx.globalAlpha = k
    ctx.lineWidth = 1 + 5 * k
    ctx.lineCap = 'round'
    glow(ctx, TRAIL_COLOR, 12 * k)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    noGlow(ctx)
  }
  ctx.globalAlpha = 1
}

/**
 * 渲染一帧：背景、半块、水果、炸弹、刀光、粒子、红闪、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderFruitSlash(ctx: CanvasRenderingContext2D, state: FruitSlashState, paused: boolean): void {
  drawBackground(ctx, W, H)

  for (const h of state.halves) drawHalf(ctx, h)
  for (const f of state.fruits) {
    if (f.bomb) drawBomb(ctx, f, state.t)
    else drawFruit(ctx, f)
  }
  drawTrail(ctx, state)

  // 消费逻辑层事件：切开迸发果色粒子，炸弹迸发红色粒子。
  for (const ev of state.events) {
    if (ev.type === 'slice') {
      particles.burst(ev.x, ev.y, FRUIT_KINDS[ev.kind % FRUIT_KINDS.length]!.color, 12, 150)
    } else {
      particles.burst(ev.x, ev.y, THEME.bad, 26, 220)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  // 炸弹红闪。
  if (state.flashMs > 0) {
    ctx.fillStyle = FLASH_COLOR
    ctx.globalAlpha = state.flashMs / FLASH_MS
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }

  // HUD。
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  if (state.combo >= 2 && state.comboExpire > state.t) {
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.gold
    ctx.fillText('x' + state.combo + ' 连击', 10 + ctx.measureText('分数 000').width + 14, hudY)
  }
  const secs = Math.ceil(state.timeLeft / 1000)
  hudPair(ctx, W - 10, hudY, '时间', String(secs) + 's', 'right')
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.bad
  const hearts = state.lives >= 1 ? '❤'.repeat(state.lives) : '♡'
  ctx.fillText(hearts, W / 2, hudY)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 按 R 重开', state.lives <= 0 ? THEME.bad : THEME.text)
  }
}
