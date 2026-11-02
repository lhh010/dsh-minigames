/**
 * 电流急急棒渲染层：深色电路板背景（网格 + 焊盘走线）、发光金属轨
 * （双层描边 + 电流流动虚线动画）、中段安全岛呼吸光、终点标记、电环
 * （圆环 + 指针跟随光晕 + 环到指针的牵引线）、触电闪电链 + 红闪 +
 * 震屏、沿轨进度条、HUD（命/计时/最佳/分数）、暂停与结束遮罩。
 */
import type { SteadyHandState, Track } from './logic.ts'
import {
  W, H, CHECKPOINT_R, END_R, FLASH_MS, SHAKE_MS, LEVEL_COUNT,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

const RAIL_DARK = '#232a3d'
const RAIL_BODY = '#3d4d70'
const RAIL_CORE = '#cfe8ff'
const CURRENT_COLOR = '#7dcfff'
const ISLAND_COLOR = '#e0af68'
const END_COLOR = '#9ece6a'
const RING_COLOR = '#e2e2ee'
const TRACE_COLOR = 'rgba(56,66,96,0.5)'
const PAD_COLOR = 'rgba(80,94,130,0.45)'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 确定性伪随机（电路板装饰纹路用，与逻辑无关）。 */
function decor(seed: number): number {
  let t = seed >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * 深色电路板背景：共享渐变底 + 细网格 + 若干确定性水平走线与焊盘。
 * @param ctx - 画布上下文。
 * @param t - 动画时钟 ms（走线电流微光流动）。
 */
function drawCircuitBoard(ctx: CanvasRenderingContext2D, t: number): void {
  drawBackground(ctx, W, H)
  ctx.strokeStyle = TRACE_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 20; x < W; x += 40) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
  }
  for (let y = 20; y < H; y += 40) {
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
  }
  ctx.stroke()
  // 确定性走线：6 条水平折线，各自带流动微光段。
  for (let i = 0; i < 6; i += 1) {
    const y = 60 + decor(i * 97 + 13) * (H - 120)
    const x0 = decor(i * 31 + 7) * W * 0.5
    const x1 = W * 0.5 + decor(i * 57 + 29) * W * 0.5
    ctx.strokeStyle = TRACE_COLOR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    // 焊盘。
    ctx.fillStyle = PAD_COLOR
    for (const px of [x0, x1]) {
      ctx.beginPath()
      ctx.arc(px, y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // 流动微光段（相位随动画时钟移动）。
    const span = x1 - x0
    const ph = ((t / 40 + i * 300) % (span + 120)) - 60
    ctx.strokeStyle = 'rgba(122,162,247,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(Math.max(x0, x0 + ph - 40), y)
    ctx.lineTo(Math.min(x1, x0 + ph + 40), y)
    ctx.stroke()
  }
}

/**
 * 画金属轨：外层暗晕 + 轨身双层描边 + 中心亮线 + 流动电流虚线。
 * @param ctx - 画布上下文。
 * @param track - 轨道。
 * @param t - 动画时钟 ms（虚线相位）。
 */
function drawRail(ctx: CanvasRenderingContext2D, track: Track, t: number): void {
  const pts = track.points
  const path = (): void => {
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y)
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // 外层暗晕。
  glow(ctx, RAIL_BODY, 16)
  ctx.strokeStyle = RAIL_DARK
  ctx.lineWidth = track.railR * 2 + 12
  path()
  ctx.stroke()
  noGlow(ctx)
  // 轨身。
  ctx.strokeStyle = RAIL_BODY
  ctx.lineWidth = track.railR * 2
  path()
  ctx.stroke()
  // 中心亮线。
  glow(ctx, RAIL_CORE, 8)
  ctx.strokeStyle = RAIL_CORE
  ctx.lineWidth = 2
  path()
  ctx.stroke()
  noGlow(ctx)
  // 流动电流虚线。
  ctx.setLineDash([12, 16])
  ctx.lineDashOffset = -(t / 12) % 28
  glow(ctx, CURRENT_COLOR, 10)
  ctx.strokeStyle = CURRENT_COLOR
  ctx.lineWidth = 3
  path()
  ctx.stroke()
  noGlow(ctx)
  ctx.setLineDash([])
}

/**
 * 画终点标记：绿色光环 + 内点。
 * @param ctx - 画布上下文。
 * @param track - 轨道。
 * @param t - 动画时钟 ms。
 */
function drawEnd(ctx: CanvasRenderingContext2D, track: Track, t: number): void {
  const pulse = 1 + Math.sin(t / 260) * 0.12
  glow(ctx, END_COLOR, 14)
  ctx.strokeStyle = END_COLOR
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(track.end.x, track.end.y, END_R * pulse * 0.8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = END_COLOR
  ctx.beginPath()
  ctx.arc(track.end.x, track.end.y, 5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画中段安全岛：金色呼吸光环 + 半透明填充；已存档后常亮。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawIsland(ctx: CanvasRenderingContext2D, state: SteadyHandState): void {
  const { checkpoint } = state.track
  const breathe = 1 + Math.sin(state.t / 320) * 0.1
  const r = CHECKPOINT_R * breathe
  const color = state.checkpointTaken ? END_COLOR : ISLAND_COLOR
  ctx.fillStyle = state.checkpointTaken ? 'rgba(158,206,106,0.10)' : 'rgba(224,175,104,0.10)'
  ctx.beginPath()
  ctx.arc(checkpoint.x, checkpoint.y, r, 0, Math.PI * 2)
  ctx.fill()
  glow(ctx, color, 12)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(checkpoint.x, checkpoint.y, r, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
}

/**
 * 画电环：环体 + 指针光晕 + 环到指针的牵引细线。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawRing(ctx: CanvasRenderingContext2D, state: SteadyHandState): void {
  const holeR = state.track.holeR
  // 牵引线。
  ctx.strokeStyle = 'rgba(226,226,238,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(state.ringX, state.ringY)
  ctx.lineTo(state.targetX, state.targetY)
  ctx.stroke()
  // 指针跟随光晕。
  glow(ctx, THEME.accents[1]!, 10)
  ctx.fillStyle = 'rgba(187,154,247,0.35)'
  ctx.beginPath()
  ctx.arc(state.targetX, state.targetY, 5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 环体。
  const danger = state.graceMs > 0
  glow(ctx, danger ? THEME.bad : CURRENT_COLOR, 14)
  ctx.strokeStyle = danger ? THEME.bad : RING_COLOR
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(state.ringX, state.ringY, holeR, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  // 环心十字。
  ctx.strokeStyle = 'rgba(226,226,238,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(state.ringX - 6, state.ringY)
  ctx.lineTo(state.ringX + 6, state.ringY)
  ctx.moveTo(state.ringX, state.ringY - 6)
  ctx.lineTo(state.ringX, state.ringY + 6)
  ctx.stroke()
}

/**
 * 画触电闪电链：从环到轨道最近点的锯齿折线（纯视觉随机）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawLightning(ctx: CanvasRenderingContext2D, state: SteadyHandState): void {
  if (state.flashMs <= 0) return
  const alpha = state.flashMs / FLASH_MS
  let bx = 0, by = 0, bd = Infinity
  for (const p of state.track.points) {
    const d = Math.hypot(p.x - state.ringX, p.y - state.ringY)
    if (d < bd) { bd = d; bx = p.x; by = p.y }
  }
  ctx.globalAlpha = alpha
  glow(ctx, THEME.bad, 12)
  ctx.strokeStyle = THEME.bad
  ctx.lineWidth = 2
  for (let bolt = 0; bolt < 3; bolt += 1) {
    ctx.beginPath()
    ctx.moveTo(state.ringX, state.ringY)
    const segsN = 5
    for (let i = 1; i <= segsN; i += 1) {
      const k = i / segsN
      const jx = (Math.random() - 0.5) * 26 * (1 - Math.abs(k - 0.5) * 2 + 0.2)
      const jy = (Math.random() - 0.5) * 26 * (1 - Math.abs(k - 0.5) * 2 + 0.2)
      ctx.lineTo(state.ringX + (bx - state.ringX) * k + jx, state.ringY + (by - state.ringY) * k + jy)
    }
    ctx.stroke()
  }
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/**
 * 渲染一帧：背景、轨道、安全岛、终点、电环、闪电、粒子、红闪、震屏、
 * 进度条、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderSteadyHand(ctx: CanvasRenderingContext2D, state: SteadyHandState, paused: boolean): void {
  drawCircuitBoard(ctx, state.t)

  // 震屏：触电后整屏小幅晃动。
  let shakeX = 0, shakeY = 0
  if (state.shakeMs > 0) {
    const k = state.shakeMs / SHAKE_MS
    shakeX = Math.sin(state.t / 16) * 8 * k
    shakeY = Math.cos(state.t / 21) * 5 * k
  }
  ctx.save()
  ctx.translate(shakeX, shakeY)

  drawRail(ctx, state.track, state.t)
  drawIsland(ctx, state)
  drawEnd(ctx, state.track, state.t)
  drawRing(ctx, state)

  // 消费逻辑事件：触电迸发红黄粒子。
  for (const ev of state.events) {
    if (ev.type === 'shock') {
      particles.burst(ev.x, ev.y, THEME.bad, 24, 240)
      particles.burst(ev.x, ev.y, THEME.gold, 10, 160)
    } else if (ev.type === 'checkpoint') {
      particles.burst(state.track.checkpoint.x, state.track.checkpoint.y, ISLAND_COLOR, 14, 140)
    } else if (ev.type === 'clear') {
      particles.burst(state.track.end.x, state.track.end.y, END_COLOR, 30, 260)
    } else {
      particles.burst(W / 2, H / 2, THEME.gold, 40, 320)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawLightning(ctx, state)
  ctx.restore()

  // 触电红闪：全屏红色渐隐。
  if (state.flashMs > 0) {
    ctx.fillStyle = 'rgba(247,118,142,' + (0.32 * (state.flashMs / FLASH_MS)).toFixed(3) + ')'
    ctx.fillRect(0, 0, W, H)
  }

  // 沿轨进度条（底部）。
  const barY = H - 16
  const barW = W - 20
  ctx.fillStyle = 'rgba(226,226,238,0.12)'
  ctx.fillRect(10, barY, barW, 6)
  const grad = ctx.createLinearGradient(10, 0, 10 + barW, 0)
  grad.addColorStop(0, CURRENT_COLOR)
  grad.addColorStop(1, END_COLOR)
  ctx.fillStyle = grad
  ctx.fillRect(10, barY, barW * state.progress, 6)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('进度 ' + Math.round(state.progress * 100) + '%', 10, barY - 4)

  // HUD：命 / 关卡 / 计时 / 最佳 / 分数。
  const hudY = 18
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = state.lives >= 1 ? THEME.bad : THEME.textMuted
  ctx.fillText(state.lives >= 1 ? '❤'.repeat(state.lives) : '♡', 40, hudY)
  hudPair(ctx, 90, hudY, '关卡', state.level + '/' + LEVEL_COUNT)
  hudPair(ctx, 200, hudY, '用时', (state.levelMs / 1000).toFixed(1) + 's')
  hudPair(ctx, 320, hudY, '最佳', state.bestMs === null ? '--' : (state.bestMs / 1000).toFixed(1) + 's')
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.text
  ctx.fillText('分数 ' + state.score, W - 10, hudY)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over && state.complete) {
    drawOverlay(ctx, W, H, '全部通关', state.score + ' 分 · 最快 ' + ((state.bestMs ?? 0) / 1000).toFixed(1) + 's · 按 R 重开', END_COLOR)
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', '第 ' + state.level + '/' + LEVEL_COUNT + ' 关 · ' + state.score + ' 分 · 按 R 重开', THEME.bad)
  }
}
