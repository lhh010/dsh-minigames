/**
 * 转碟杂技渲染层：舞台幕布背景（顶部垂幕 + 侧幕 + 地面）、透视长杆、
 * 旋转纹理碟子（转速慢时摇晃倾斜 + 红光预警）、掉落碟子的坠落碎裂
 * 动画、左右移动并带补转手势的杂技演员、HUD（命 / 碟数 / 分数 / 时
 * 间）、暂停与结算遮罩。渲染层自持粒子与坠落碟池，只消费逻辑层
 * events，不做任何游戏规则判断。
 */
import type { PlatesState, Plate } from './logic.ts'
import {
  W, H, POLE_TOP_Y, POLE_BASE_Y, MAX_PLATES, WOBBLE_SPIN, slotX, isWobbling, plateTargetOf,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

const CURTAIN = '#46233a'
const CURTAIN_DARK = '#331a2b'
const CURTAIN_TRIM = '#e0af68'
const POLE_COLOR = '#8a8aa8'
const POLE_DARK = '#5b5b78'
const PLATE_FACE = '#c9cede'
const PLATE_RIM = '#9aa2c8'
const PERFORMER_SUIT = '#f7768e'
const PERFORMER_SKIN = '#e8b98f'
const HUD_BAND = 'rgba(13,13,20,0.42)'
const STAGE_FLOOR = '#2a2140'

/** 一只正在坠落/碎裂的碟子（渲染层动画实体）。 */
interface FallingPlate {
  x: number, y: number
  vy: number
  rot: number, vr: number
  hue: number
  life: number
}

// 渲染层自有的粒子与坠落碟池（每个画布一组实例）。
const particles = createParticles()
const falling: FallingPlate[] = []
/** 最近一次成功补转后的手势倒计时 ms（>0 时演员抬手）。 */
let gestureLeft = 0

/**
 * 画舞台：共享渐变背景 + 顶部垂幕（褶皱条 + 金边）+ 侧幕 + 地面。
 * @param ctx - 画布上下文。
 */
function drawStage(ctx: CanvasRenderingContext2D): void {
  drawBackground(ctx, W, H)
  // 顶部垂幕：交替深浅竖条模拟褶皱。
  const curtH = 74
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? CURTAIN : CURTAIN_DARK
    ctx.fillRect((i * W) / 16, 0, W / 16 + 1, curtH)
  }
  // 垂幕底缘扇贝弧。
  ctx.fillStyle = CURTAIN
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath()
    ctx.arc((i + 0.5) * (W / 8), curtH, W / 16, 0, Math.PI)
    ctx.fill()
  }
  // 金色边绳。
  ctx.strokeStyle = CURTAIN_TRIM
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, curtH - 2)
  ctx.lineTo(W, curtH - 2)
  ctx.stroke()
  // 侧幕。
  ctx.fillStyle = CURTAIN_DARK
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(56, 0)
  ctx.lineTo(26, 250)
  ctx.lineTo(0, 250)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(W, 0)
  ctx.lineTo(W - 56, 0)
  ctx.lineTo(W - 26, 250)
  ctx.lineTo(W, 250)
  ctx.closePath()
  ctx.fill()
  // 地面台板。
  ctx.fillStyle = STAGE_FLOOR
  ctx.fillRect(0, POLE_BASE_Y, W, H - POLE_BASE_Y)
  ctx.strokeStyle = 'rgba(224,175,104,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, POLE_BASE_Y + 0.5)
  ctx.lineTo(W, POLE_BASE_Y + 0.5)
  ctx.stroke()
}

/**
 * 画一根长杆：底宽顶窄的透视杆身 + 底座。
 * @param ctx - 画布上下文。
 * @param x - 杆中心 x。
 */
function drawPole(ctx: CanvasRenderingContext2D, x: number): void {
  const topHalf = 2
  const baseHalf = 6
  ctx.fillStyle = POLE_COLOR
  ctx.beginPath()
  ctx.moveTo(x - topHalf, POLE_TOP_Y)
  ctx.lineTo(x + topHalf, POLE_TOP_Y)
  ctx.lineTo(x + baseHalf, POLE_BASE_Y)
  ctx.lineTo(x - baseHalf, POLE_BASE_Y)
  ctx.closePath()
  ctx.fill()
  // 右侧暗面（透视光）。
  ctx.fillStyle = POLE_DARK
  ctx.beginPath()
  ctx.moveTo(x, POLE_TOP_Y)
  ctx.lineTo(x + topHalf, POLE_TOP_Y)
  ctx.lineTo(x + baseHalf, POLE_BASE_Y)
  ctx.lineTo(x, POLE_BASE_Y)
  ctx.closePath()
  ctx.fill()
  // 底座。
  ctx.fillStyle = THEME.panel
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  roundRectPath(ctx, x - 13, POLE_BASE_Y - 5, 26, 9, 3)
  ctx.fill()
  ctx.stroke()
}

/**
 * 画一只碟子：椭圆碟身 + 旋转纹理条纹（按 phase 旋转）+ 边缘高光；
 * 转速低于预警线时按剩余量倾斜摇晃并叠加红光。
 * @param ctx - 画布上下文。
 * @param plate - 碟子实体。
 * @param tMs - 回合毫秒钟（摇晃相位用）。
 */
function drawPlate(ctx: CanvasRenderingContext2D, plate: Plate, tMs: number): void {
  const x = slotX(plate.slot)
  const color = accent(plate.hue)
  let tilt = 0
  if (isWobbling(plate)) {
    // 转速越低摇晃越大：幅度最高约 0.32 rad。
    const urgency = 1 - plate.spin / WOBBLE_SPIN
    tilt = Math.sin(tMs / 1000 * (8 + 14 * urgency)) * 0.32 * urgency
  }
  ctx.save()
  ctx.translate(x, POLE_TOP_Y)
  ctx.rotate(tilt)
  // 预警红光。
  if (isWobbling(plate)) glow(ctx, THEME.bad, 8 + 8 * (1 - plate.spin / WOBBLE_SPIN))
  else glow(ctx, color, 7)
  // 碟身：侧视浅碗（上缘椭圆 + 碗壁）。
  ctx.fillStyle = PLATE_FACE
  ctx.beginPath()
  ctx.ellipse(0, -7, 30, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-30, -7)
  ctx.quadraticCurveTo(0, 12, 30, -7)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // 旋转纹理：中条纹随 phase 平移（模拟自转），转速越慢条纹越窄。
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, -7, 28, 6.5, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  const bands = 4
  const span = 56 / bands
  const offset = ((plate.phase * 10) % span + span) % span
  for (let i = -1; i <= bands; i += 1) {
    const sx = -28 + i * span + offset
    ctx.globalAlpha = 0.35 + 0.45 * plate.spin
    ctx.beginPath()
    ctx.moveTo(sx, -15)
    ctx.lineTo(sx, 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.restore()
  // 边缘描线 + 杆顶接触点。
  ctx.strokeStyle = PLATE_RIM
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(0, -7, 30, 8, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = PLATE_RIM
  ctx.beginPath()
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画杂技演员：火柴人（头 / 躯干 / 双腿）+ 礼服色，补转后的短时间内
 * 抬右臂做手势。
 * @param ctx - 画布上下文。
 * @param x - 演员中心 x。
 * @param gesturing - 是否处于补转手势中。
 */
function drawPerformer(ctx: CanvasRenderingContext2D, x: number, gesturing: boolean): void {
  const y = POLE_BASE_Y - 6
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = PERFORMER_SUIT
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  // 腿。
  ctx.beginPath()
  ctx.moveTo(0, -26)
  ctx.lineTo(-7, 0)
  ctx.moveTo(0, -26)
  ctx.lineTo(7, 0)
  ctx.stroke()
  // 躯干。
  ctx.beginPath()
  ctx.moveTo(0, -46)
  ctx.lineTo(0, -26)
  ctx.stroke()
  // 双臂：手势中右臂高举，否则双臂侧平举。
  ctx.beginPath()
  ctx.moveTo(0, -42)
  ctx.lineTo(-13, -34)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -42)
  if (gesturing) { ctx.lineTo(11, -56) } else { ctx.lineTo(13, -34) }
  ctx.stroke()
  // 头。
  ctx.fillStyle = PERFORMER_SKIN
  ctx.beginPath()
  ctx.arc(0, -53, 6.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 手势光点。
  if (gesturing) {
    glow(ctx, THEME.gold, 10)
    ctx.fillStyle = THEME.gold
    ctx.beginPath()
    ctx.arc(x + 11, y - 58, 3, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
}

/**
 * 推进并画坠落碟池：碟子旋转坠落，触地碎裂迸发粒子。
 * @param ctx - 画布上下文。
 * @param dtMs - 渲染帧间隔 ms（暂停时传 0）。
 */
function tickFalling(ctx: CanvasRenderingContext2D, dtMs: number): void {
  for (let i = falling.length - 1; i >= 0; i -= 1) {
    const p = falling[i]!
    if (dtMs > 0) {
      p.vy += 900 * (dtMs / 1000)
      p.y += p.vy * (dtMs / 1000)
      p.rot += p.vr * (dtMs / 1000)
    }
    if (p.y >= POLE_BASE_Y - 4) {
      particles.burst(p.x, POLE_BASE_Y - 4, accent(p.hue), 16, 180)
      falling.splice(i, 1)
      continue
    }
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = PLATE_FACE
    ctx.beginPath()
    ctx.ellipse(0, 0, 28, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = accent(p.hue)
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }
}

/**
 * 渲染一帧：舞台、长杆、碟子、坠落碎裂、演员、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param dtMs - 渲染帧间隔 ms（暂停时传 0，动画冻结）。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderPlates(ctx: CanvasRenderingContext2D, state: PlatesState, dtMs: number, paused: boolean): void {
  drawStage(ctx)
  const usedSlots = new Set(state.plates.map((p) => p.slot))
  // 杆：空闲槽位也画空杆，暗示即将补碟的位置。
  for (let i = 0; i < MAX_PLATES; i += 1) {
    if (!usedSlots.has(i)) drawPole(ctx, slotX(i))
  }
  for (const plate of state.plates) drawPlate(ctx, plate, state.t)
  tickFalling(ctx, paused ? 0 : dtMs)

  // 消费逻辑层事件：补转迸发 / 拒绝提示 / 掉落坠碟 / 新碟闪现。
  for (const ev of state.events) {
    if (ev.type === 'spin') {
      gestureLeft = 400
      particles.burst(ev.x, ev.y - 8, accent(ev.hue), 12, 150)
    } else if (ev.type === 'deny') {
      particles.burst(ev.x, ev.y - 8, THEME.textMuted, 4, 70)
    } else if (ev.type === 'drop') {
      if (falling.length >= 12) falling.shift()
      falling.push({ x: ev.x, y: POLE_TOP_Y, vy: -60, rot: 0, vr: 5, hue: ev.hue, life: 0 })
    } else if (ev.type === 'spawn') {
      particles.burst(ev.x, POLE_TOP_Y - 8, accent(ev.hue), 8, 110)
    }
  }
  if (dtMs > 0) gestureLeft = Math.max(0, gestureLeft - dtMs)
  particles.tick(ctx, paused ? 0 : dtMs)

  drawPerformer(ctx, state.playerX, gestureLeft > 0)

  // HUD：命 / 碟数 / 分数 / 时间。
  ctx.fillStyle = HUD_BAND
  roundRectPath(ctx, 4, 4, W - 8, 24, 8)
  ctx.fill()
  const hudY = 20
  hudPair(ctx, 14, hudY, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = state.lives <= 1 ? THEME.bad : THEME.text
  ctx.fillText('❤ ×' + state.lives, W / 2, hudY)
  const secs = Math.floor(state.t / 1000)
  const timeText = String(Math.floor(secs / 60)).padStart(1, '0') + ':' + String(secs % 60).padStart(2, '0')
  hudPair(ctx, W - 14, hudY, '碟 ' + state.plates.length + '/' + plateTargetOf(state.t), timeText, 'right')

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 掉碟 ' + state.dropped + ' 次 · 按 R 重开', THEME.bad)
  }
}
