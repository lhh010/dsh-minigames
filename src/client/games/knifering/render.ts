/**
 * 飞刀转盘渲染层：共享主题背景、木纹转盘（同心年轮 + 中心轴帽）、
 * 钉在盘上的飞刀随盘旋转（障碍刀用暗色区分）、正上方快速下落的插刀
 * 残影线、碰刀失败时刀崩开的粒子与画布抖动、HUD（关卡/已插/命）、
 * 暂停 / 过关 / 失败遮罩。
 */
import type { KnifeRingState } from './logic.ts'
import {
  W, H, CENTER_X, CENTER_Y, RING_R, KNIFE_R,
  THROW_MS, FAIL_SHAKE_MS, knivesFor, minGapFor,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

const WOOD_1 = '#8a5a33'
const WOOD_2 = '#9c6a3f'
const WOOD_RING = 'rgba(70,45,25,0.55)'
const HUB_COLOR = '#3d3d4d'
const BLADE_COLOR = '#d8dce8'
const BLADE_EDGE = '#aab0c4'
const HANDLE_COLOR = '#5a4632'
const OBSTACLE_COLOR = '#4a4a58'
const FALL_LINE = 'rgba(226,226,238,0.5)'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 刀落点在画布上的位置（盘面固有角 → 世界坐标）。
 * @param ringAngle - 盘面当前朝向 rad。
 * @param knifeAngle - 刀的盘面固有角 rad。
 */
function knifePoint(ringAngle: number, knifeAngle: number): { x: number, y: number, rot: number } {
  const a = knifeAngle + ringAngle
  return {
    x: CENTER_X + Math.sin(a) * KNIFE_R,
    y: CENTER_Y - Math.cos(a) * KNIFE_R,
    rot: a,
  }
}

/**
 * 画一把钉在盘上的刀：刃朝盘心、柄朝外，障碍刀整体暗色。
 * @param ctx - 画布上下文。
 * @param x - 刀刃入盘点 x。
 * @param y - 刀刃入盘点 y。
 * @param rot - 刀指向（0 = 竖直向上插入）。
 * @param obstacle - 是否障碍刀。
 */
function drawPinnedKnife(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, obstacle: boolean): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  // 刀柄（外侧）。
  ctx.fillStyle = obstacle ? OBSTACLE_COLOR : HANDLE_COLOR
  ctx.fillRect(-3.5, -34, 7, 20)
  ctx.fillRect(-5, -38, 10, 6)
  // 刀刃（指向盘心，即 +y 方向）。
  const blade = obstacle ? OBSTACLE_COLOR : BLADE_COLOR
  glow(ctx, obstacle ? OBSTACLE_COLOR : BLADE_EDGE, 6)
  ctx.fillStyle = blade
  ctx.beginPath()
  ctx.moveTo(-4, -14)
  ctx.lineTo(4, -14)
  ctx.lineTo(0, 8)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.restore()
}

/**
 * 画木纹转盘：径向渐变底色 + 同心年轮 + 中心轴帽。
 * @param ctx - 画布上下文。
 * @param ringAngle - 盘面当前朝向 rad（年轮缺口随盘转）。
 */
function drawWheel(ctx: CanvasRenderingContext2D, ringAngle: number): void {
  ctx.save()
  ctx.translate(CENTER_X, CENTER_Y)
  ctx.rotate(ringAngle)
  const grad = ctx.createRadialGradient(-RING_R * 0.3, -RING_R * 0.3, RING_R * 0.1, 0, 0, RING_R)
  grad.addColorStop(0, WOOD_2)
  grad.addColorStop(1, WOOD_1)
  glow(ctx, WOOD_1, 14)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, RING_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 年轮。
  ctx.strokeStyle = WOOD_RING
  ctx.lineWidth = 1.5
  for (let r = 24; r < RING_R - 6; r += 18) {
    ctx.beginPath()
    ctx.arc(0, 0, r, 0.3, Math.PI * 2 - 0.3)
    ctx.stroke()
  }
  // 外缘。
  ctx.strokeStyle = 'rgba(50,30,15,0.8)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(0, 0, RING_R - 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  // 中心轴帽（不随视觉旋转差异，画在恢复后的坐标系）。
  glow(ctx, THEME.panelEdge, 8)
  ctx.fillStyle = HUB_COLOR
  ctx.beginPath()
  ctx.arc(CENTER_X, CENTER_Y, 16, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = THEME.panelEdge
  ctx.beginPath()
  ctx.arc(CENTER_X, CENTER_Y, 6, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 渲染一帧：背景、转盘、已钉飞刀、下落插刀残影、粒子、抖动、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderKnifeRing(ctx: CanvasRenderingContext2D, state: KnifeRingState, paused: boolean): void {
  drawBackground(ctx, W, H)

  // 失败抖动：整屏小幅水平晃动。
  let shakeX = 0
  if (state.shakeMs > 0) {
    const k = state.shakeMs / FAIL_SHAKE_MS
    shakeX = Math.sin(state.t / 18) * 7 * k
  }
  ctx.save()
  ctx.translate(shakeX, 0)

  drawWheel(ctx, state.ringAngle)
  for (const k of state.knives) {
    const p = knifePoint(state.ringAngle, k.angle)
    drawPinnedKnife(ctx, p.x, p.y, p.rot, k.obstacle)
  }

  // 下落插刀：从画布顶部到盘缘的快速残影线 + 进度位置的刀形。
  const th = state.throwing
  if (th !== null) {
    const progress = Math.min(1, th.ms / THROW_MS)
    const startY = 30
    const endY = CENTER_Y - KNIFE_R
    ctx.strokeStyle = FALL_LINE
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(CENTER_X, startY)
    ctx.lineTo(CENTER_X, endY)
    ctx.stroke()
    const y = startY + (endY - startY) * progress
    ctx.save()
    ctx.translate(CENTER_X, y)
    ctx.fillStyle = HANDLE_COLOR
    ctx.fillRect(-3.5, -22, 7, 16)
    glow(ctx, BLADE_EDGE, 10)
    ctx.fillStyle = BLADE_COLOR
    ctx.beginPath()
    ctx.moveTo(-4, -6)
    ctx.lineTo(4, -6)
    ctx.lineTo(0, 14)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
    ctx.restore()
  }

  // 消费逻辑层事件：插中迸发白粒，碰刀迸发红粒。
  for (const ev of state.events) {
    if (ev.type === 'stick') {
      const p = knifePoint(state.ringAngle, ev.angle)
      particles.burst(p.x, p.y, THEME.text, 10, 120)
    } else if (ev.type === 'hit') {
      const p = knifePoint(state.ringAngle, ev.angle)
      particles.burst(p.x, p.y, THEME.bad, 26, 220)
    } else {
      particles.burst(CENTER_X, CENTER_Y, THEME.gold, 30, 260)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  ctx.restore()

  // HUD：关卡 / 已插 / 命。
  const hudY = 18
  hudPair(ctx, 10, hudY, '关卡', String(state.level))
  const total = knivesFor(state.level)
  hudPair(ctx, 110, hudY, '已插', String(total - state.remaining) + '/' + String(total))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = state.lives >= 1 ? THEME.bad : THEME.textMuted
  const hearts = state.lives >= 1 ? '❤'.repeat(state.lives) : '♡'
  ctx.fillText(hearts, W / 2 - 20, hudY)
  // 间隔提示（灰字）。
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillText('最小间隔 ' + Math.round((minGapFor(state.level) * 180 / Math.PI)) + '°', W / 2 + 66, hudY)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.text
  ctx.fillText('分数 ' + state.score, W - 10, hudY)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', '第 ' + state.level + ' 关 · ' + state.score + ' 分 · 按 R 重开', THEME.bad)
  } else if (state.breakMs > 0 && state.level > 1) {
    drawOverlay(ctx, W, H, '第 ' + (state.level - 1) + ' 关 完成', '即将进入第 ' + state.level + ' 关…', THEME.good)
  }
}