/**
 * 找茬大师画布渲染：左右并排两幅程序绘制的风景（右图带修改），天空/
 * 草地打底、16 种基元按层绘制；已找到的修改在两侧同时圈绿；HUD 显示
 * 关卡、剩余数与倒计时时间条，结束/暂停时叠加共享 overlay。全部为纯
 * 绘制，不持有游戏状态（粒子系统为渲染侧观察，与 logic 无关）。
 */
import type { PhotoHuntState, SceneElement } from './logic.ts'
import { PANEL_H, PANEL_W } from './logic.ts'
import {
  THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 顶部 HUD 高度。 */
export const HUD_H = 36
/** 左图左上角横坐标。 */
export const LEFT_X = 16
/** 右图左上角横坐标。 */
export const RIGHT_X = LEFT_X + PANEL_W + 14
/** 图片顶部纵坐标。 */
export const PANEL_Y = HUD_H + 6
/** 画布逻辑宽度。 */
export const LOGICAL_W = RIGHT_X + PANEL_W + 16
/** 画布逻辑高度（图片 + 底部时间条区域）。 */
export const LOGICAL_H = PANEL_Y + PANEL_H + 30

/** 背景层基元（先画，被前景遮挡）。 */
const BACK_KINDS = new Set(['sun', 'cloud', 'mountain', 'lake'])

/** 基元主体色：色相 → hsl。 */
function bodyColor(el: SceneElement): string {
  return 'hsl(' + Math.round(el.hue) + ',62%,62%)'
}

/** 每种基元的程序绘制（以原点为中心，已应用缩放/旋转/镜像）。 */
function drawPrimitive(ctx: CanvasRenderingContext2D, el: SceneElement): void {
  const c = bodyColor(el)
  switch (el.kind) {
    case 'sun': {
      ctx.strokeStyle = c
      ctx.lineWidth = 3
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13)
        ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19)
        ctx.stroke()
      }
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(0, 0, 10, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'cloud': {
      ctx.fillStyle = 'hsl(' + Math.round(el.hue) + ',32%,86%)'
      ctx.beginPath()
      ctx.ellipse(-9, 3, 11, 8, 0, 0, Math.PI * 2)
      ctx.ellipse(8, 2, 13, 9, 0, 0, Math.PI * 2)
      ctx.ellipse(-1, -5, 9, 8, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'bird': {
      ctx.strokeStyle = c
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-10, 2)
      ctx.quadraticCurveTo(-5, -7, 0, 0)
      ctx.quadraticCurveTo(5, -7, 10, 2)
      ctx.stroke()
      ctx.lineCap = 'butt'
      break
    }
    case 'tree': {
      ctx.fillStyle = '#8b6f47'
      ctx.fillRect(-2.5, 2, 5, 14)
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(0, -6, 12, 0, Math.PI * 2)
      ctx.arc(-8, 1, 8, 0, Math.PI * 2)
      ctx.arc(8, 1, 8, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'pine': {
      ctx.fillStyle = '#8b6f47'
      ctx.fillRect(-2, 8, 4, 9)
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(0, -16)
      ctx.lineTo(10, 0)
      ctx.lineTo(-10, 0)
      ctx.closePath()
      ctx.moveTo(0, -8)
      ctx.lineTo(12, 8)
      ctx.lineTo(-12, 8)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'house': {
      ctx.fillStyle = c
      ctx.fillRect(-16, -4, 32, 20)
      ctx.fillStyle = 'hsl(' + Math.round(el.hue) + ',45%,42%)'
      ctx.beginPath()
      ctx.moveTo(-19, -4)
      ctx.lineTo(0, -16)
      ctx.lineTo(19, -4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#5b4a32'
      ctx.fillRect(4, 4, 8, 12)
      ctx.fillStyle = '#7a7a8c'
      ctx.fillRect(-12, -1, 7, 7)
      ctx.fillStyle = '#b06a4a'
      ctx.fillRect(9, -15, 5, 8)
      break
    }
    case 'flower': {
      ctx.strokeStyle = '#5f9e4e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, 1)
      ctx.lineTo(0, 10)
      ctx.stroke()
      ctx.fillStyle = c
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5
        ctx.beginPath()
        ctx.arc(Math.cos(a) * 5, -1 + Math.sin(a) * 5, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = THEME.gold
      ctx.beginPath()
      ctx.arc(0, -1, 3, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'bush': {
      ctx.fillStyle = 'hsl(' + Math.round(el.hue) + ',45%,45%)'
      ctx.beginPath()
      ctx.arc(-8, 2, 8, 0, Math.PI * 2)
      ctx.arc(8, 2, 8, 0, Math.PI * 2)
      ctx.arc(0, -3, 9, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'mountain': {
      ctx.fillStyle = 'hsl(' + Math.round(el.hue) + ',22%,52%)'
      ctx.beginPath()
      ctx.moveTo(-34, 22)
      ctx.lineTo(0, -24)
      ctx.lineTo(34, 22)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(240,240,250,0.9)'
      ctx.beginPath()
      ctx.moveTo(0, -24)
      ctx.lineTo(-7, -14)
      ctx.lineTo(-2, -16)
      ctx.lineTo(3, -12)
      ctx.lineTo(7, -14)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'fence': {
      ctx.fillStyle = '#9c7c50'
      for (let i = -1; i <= 1; i += 1) {
        ctx.fillRect(i * 12 - 2.5, -10, 5, 22)
        ctx.fillRect(i * 12 - 4.5, -12, 9, 3)
      }
      ctx.fillRect(-16, -4, 32, 3)
      ctx.fillRect(-16, 5, 32, 3)
      break
    }
    case 'kite': {
      ctx.strokeStyle = 'rgba(230,230,240,0.7)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, 8)
      ctx.quadraticCurveTo(-6, 14, -3, 20)
      ctx.stroke()
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(0, -11)
      ctx.lineTo(7, 0)
      ctx.lineTo(0, 9)
      ctx.lineTo(-7, 0)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'windmill': {
      ctx.fillStyle = '#a89a90'
      ctx.beginPath()
      ctx.moveTo(-4, 14)
      ctx.lineTo(-7, -2)
      ctx.lineTo(7, -2)
      ctx.lineTo(4, 14)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = c
      for (let i = 0; i < 3; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.moveTo(0, -2)
        ctx.lineTo(Math.cos(a) * 13 - Math.sin(a) * 2.5, -2 + Math.sin(a) * 13 + Math.cos(a) * 2.5)
        ctx.lineTo(Math.cos(a) * 13 + Math.sin(a) * 2.5, -2 + Math.sin(a) * 13 - Math.cos(a) * 2.5)
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'rock': {
      ctx.fillStyle = 'hsl(' + Math.round(el.hue) + ',12%,58%)'
      ctx.beginPath()
      ctx.moveTo(-9, 6)
      ctx.lineTo(-7, -3)
      ctx.lineTo(-1, -7)
      ctx.lineTo(6, -5)
      ctx.lineTo(9, 3)
      ctx.lineTo(5, 7)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'balloon': {
      ctx.strokeStyle = 'rgba(230,230,240,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, 8)
      ctx.quadraticCurveTo(4, 12, 1, 16)
      ctx.stroke()
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.ellipse(0, -2, 8, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#7a5a3a'
      ctx.fillRect(-3, 9, 6, 5)
      break
    }
    case 'butterfly': {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.ellipse(-6, -2, 6, 4.5, -0.5, 0, Math.PI * 2)
      ctx.ellipse(6, -2, 6, 4.5, 0.5, 0, Math.PI * 2)
      ctx.ellipse(-5, 4, 4.5, 3.5, 0.5, 0, Math.PI * 2)
      ctx.ellipse(5, 4, 4.5, 3.5, -0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3a3a4a'
      ctx.fillRect(-1.5, -6, 3, 13)
      break
    }
    case 'lake': {
      ctx.fillStyle = 'hsl(' + Math.round(el.hue) + ',55%,48%)'
      ctx.beginPath()
      ctx.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(240,240,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-12, -2)
      ctx.lineTo(-4, -2)
      ctx.moveTo(-6, 2)
      ctx.lineTo(6, 2)
      ctx.stroke()
      break
    }
  }
}

/** 画一个基元（平移到面板坐标 + 应用缩放/旋转/镜像）。 */
function drawElement(ctx: CanvasRenderingContext2D, el: SceneElement, ox: number, oy: number): void {
  ctx.save()
  ctx.translate(ox + el.x, oy + el.y)
  ctx.rotate((el.rotation * Math.PI) / 180)
  ctx.scale(el.flip ? -el.scale : el.scale, el.scale)
  drawPrimitive(ctx, el)
  ctx.restore()
}

/** 一幅图：天空/草地底 + 分层基元 + 已找到修改的绿圈。 */
function drawPicture(
  ctx: CanvasRenderingContext2D, elements: SceneElement[], ox: number, state: PhotoHuntState,
): void {
  ctx.save()
  roundRectPath(ctx, ox, PANEL_Y, PANEL_W, PANEL_H, 10)
  ctx.clip()
  // 天空渐变 + 草地。
  const sky = ctx.createLinearGradient(0, PANEL_Y, 0, PANEL_Y + PANEL_H)
  sky.addColorStop(0, 'hsl(215,45%,26%)')
  sky.addColorStop(1, 'hsl(200,40%,40%)')
  ctx.fillStyle = sky
  ctx.fillRect(ox, PANEL_Y, PANEL_W, PANEL_H)
  ctx.fillStyle = 'hsl(105,32%,26%)'
  ctx.fillRect(ox, PANEL_Y + PANEL_H * 0.68, PANEL_W, PANEL_H * 0.32)

  const back = elements.filter((el) => BACK_KINDS.has(el.kind))
  const front = elements.filter((el) => !BACK_KINDS.has(el.kind))
  for (const el of back) drawElement(ctx, el, ox, PANEL_Y)
  for (const el of front) drawElement(ctx, el, ox, PANEL_Y)
  ctx.restore()

  // 边框在 clip 外描一圈。
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  roundRectPath(ctx, ox, PANEL_Y, PANEL_W, PANEL_H, 10)
  ctx.stroke()

  // 已找到的修改：两侧同时圈绿。
  for (let i = 0; i < state.scene.diffs.length; i += 1) {
    if (!state.found[i]) continue
    const d = state.scene.diffs[i]!
    ctx.strokeStyle = THEME.good
    ctx.lineWidth = 3
    glow(ctx, THEME.good, 10)
    ctx.beginPath()
    ctx.arc(ox + d.x, PANEL_Y + d.y, 20, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
  }
}

// 渲染侧事件观察：命中处爆出粒子。
const particles = createParticles()
let prevFound: boolean[] = []
let prevFrameMs = 0

/**
 * 绘制一帧。
 * @param paused - 是否显示暂停 overlay。
 */
export function renderPhotoHunt(ctx: CanvasRenderingContext2D, state: PhotoHuntState, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：关卡 / 剩余 / 倒计时。
  hudPair(ctx, 14, 24, '关卡 ', String(state.level) + '/5')
  const left = state.found.filter((f) => !f).length
  hudPair(ctx, LOGICAL_W / 2, 24, '剩余不同 ', String(left), 'center', THEME.gold)
  hudPair(ctx, LOGICAL_W - 14, 24, '时间 ', String(Math.ceil(state.timeLeft)) + 's', 'right',
    state.timeLeft <= 10 ? THEME.bad : THEME.text)

  drawPicture(ctx, state.scene.left, LEFT_X, state)
  drawPicture(ctx, state.scene.right, RIGHT_X, state)

  // 时间条：剩余时间占满度，低于 25% 变红。
  const frac = Math.max(0, Math.min(1, state.timeLeft / state.timeLimit))
  const barX = LEFT_X
  const barW = LOGICAL_W - LEFT_X * 2
  const barY = PANEL_Y + PANEL_H + 10
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRectPath(ctx, barX, barY, barW, 8, 4)
  ctx.fill()
  ctx.fillStyle = frac < 0.25 ? THEME.bad : THEME.good
  roundRectPath(ctx, barX, barY, Math.max(6, barW * frac), 8, 4)
  ctx.fill()

  // 命中处粒子（渲染侧观察 found 变化）。
  for (let i = 0; i < state.found.length && i < prevFound.length; i += 1) {
    if (state.found[i] && !prevFound[i]) {
      const d = state.scene.diffs[i]!
      particles.burst(LEFT_X + d.x, PANEL_Y + d.y, THEME.good, 10, 110)
      particles.burst(RIGHT_X + d.x, PANEL_Y + d.y, THEME.good, 10, 110)
    }
  }
  prevFound = [...state.found]
  particles.tick(ctx, dtMs)

  if (state.status === 'won') {
    const more = state.level < 5
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部找到！',
      more ? '按 空格 进入下一关 · 按 R 重开' : '通关！按 R 再来一局', THEME.gold)
  } else if (state.status === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '时间到', '还有 ' + String(left) + ' 处未找到 · 按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
