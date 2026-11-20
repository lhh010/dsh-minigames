/**
 * 大家来找茬画布渲染：同一画布左右并排两张"照片"面板，程序化几何元素
 * 按 hsl 颜色绘制（圆/方/三角/线/纹理块，带随机角度），已找到的差异在
 * 两侧同时圈红；HUD 显示关卡、剩余差异与点错数，底部为限时条，结束/
 * 暂停时叠加共享 overlay。全部为纯绘制，不持有任何游戏状态（粒子系统
 * 除外，与 logic 无关）。
 */
import type { PhotoElement, SpotPhotoState } from './logic.ts'
import { PHOTO_H, PHOTO_W } from './logic.ts'
import {
  THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 顶部 HUD 高度。 */
export const HUD_H = 36
/** 左照片左上角横坐标。 */
export const LEFT_X = 16
/** 右照片左上角横坐标。 */
export const RIGHT_X = LEFT_X + PHOTO_W + 14
/** 面板顶部纵坐标。 */
export const PANEL_Y = HUD_H + 6
/** 画布逻辑宽度。 */
export const LOGICAL_W = RIGHT_X + PHOTO_W + 16
/** 画布逻辑高度（照片 + 底部限时条区域）。 */
export const LOGICAL_H = PANEL_Y + PHOTO_H + 32

// 渲染侧事件观察：命中处爆出粒子。
const particles = createParticles()
let prevFound: boolean[] = []
let prevFrameMs = 0

/** 元素颜色（hsl 字符串，无模板字面量）。 */
function elementColor(e: PhotoElement): string {
  return 'hsl(' + Math.round(e.hue) + ', ' + e.sat + '%, ' + e.light + '%)'
}

/** 画一个几何元素（以 (ox+e.x, oy+e.y) 为中心）。 */
function drawElement(ctx: CanvasRenderingContext2D, e: PhotoElement, ox: number, oy: number): void {
  const cx = ox + e.x
  const cy = oy + e.y
  const color = elementColor(e)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(e.angle)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  if (e.kind === 'circle') {
    glow(ctx, color, 5)
    ctx.beginPath()
    ctx.arc(0, 0, e.size, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  } else if (e.kind === 'square') {
    ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2)
  } else if (e.kind === 'triangle') {
    ctx.beginPath()
    for (let i = 0; i < 3; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
      if (i === 0) ctx.moveTo(Math.cos(a) * e.size * 1.15, Math.sin(a) * e.size * 1.15)
      else ctx.lineTo(Math.cos(a) * e.size * 1.15, Math.sin(a) * e.size * 1.15)
    }
    ctx.closePath()
    ctx.fill()
  } else if (e.kind === 'line') {
    ctx.lineWidth = Math.max(1.5, e.size * 0.3)
    ctx.beginPath()
    ctx.moveTo(-e.size, 0)
    ctx.lineTo(e.size, 0)
    ctx.stroke()
  } else {
    // 纹理块：3x3 小格矩阵，营造照片里的颗粒区域。
    const cell = Math.max(2, e.size / 3)
    for (let ix = 0; ix < 3; ix += 1) {
      for (let iy = 0; iy < 3; iy += 1) {
        if ((ix + iy * 3 + Math.round(e.angle * 10)) % 4 === 0) continue
        ctx.fillRect((ix - 1) * cell, (iy - 1) * cell, cell - 1, cell - 1)
      }
    }
  }
  ctx.restore()
}

/** 一张照片：底板 + 元素 + 已找到差异的红圈。 */
function drawPhoto(
  ctx: CanvasRenderingContext2D, elements: PhotoElement[], ox: number, state: SpotPhotoState,
): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, ox, PANEL_Y, PHOTO_W, PHOTO_H, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.save()
  roundRectPath(ctx, ox, PANEL_Y, PHOTO_W, PHOTO_H, 10)
  ctx.clip()
  for (const e of elements) drawElement(ctx, e, ox, PANEL_Y)
  ctx.restore()
  // 已找到的差异：两侧同时圈红。
  for (let i = 0; i < state.puzzle.diffs.length; i += 1) {
    if (!state.found[i]) continue
    const d = state.puzzle.diffs[i]!
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 3
    glow(ctx, THEME.bad, 10)
    ctx.beginPath()
    ctx.arc(ox + d.x, PANEL_Y + d.y, 18, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
  }
}

/**
 * 绘制一帧。
 * @param paused - 是否显示暂停 overlay。
 */
export function renderSpotPhoto(ctx: CanvasRenderingContext2D, state: SpotPhotoState, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：关卡 / 剩余差异 / 点错。
  hudPair(ctx, 14, 24, '关卡 ', String(state.level) + '/5')
  const left = state.found.filter((f) => !f).length
  hudPair(ctx, LOGICAL_W / 2, 24, '剩余不同 ', String(left) + '/5', 'center', THEME.gold)
  hudPair(ctx, LOGICAL_W - 14, 24, '点错 ', String(state.misses), 'right', THEME.bad)

  drawPhoto(ctx, state.puzzle.left, LEFT_X, state)
  drawPhoto(ctx, state.puzzle.right, RIGHT_X, state)

  // 限时条：剩余时间占满度，低于 25% 变红。
  const frac = Math.max(0, Math.min(1, state.timeLeft / state.timeLimitS))
  const barX = LEFT_X
  const barW = LOGICAL_W - LEFT_X * 2
  const barY = PANEL_Y + PHOTO_H + 10
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRectPath(ctx, barX, barY, barW, 8, 4)
  ctx.fill()
  ctx.fillStyle = frac < 0.25 ? THEME.bad : THEME.good
  roundRectPath(ctx, barX, barY, Math.max(6, barW * frac), 8, 4)
  ctx.fill()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('时间 ' + String(Math.ceil(state.timeLeft)) + 's', LOGICAL_W / 2, barY + 22)

  // 命中处粒子（渲染侧观察 found 变化）。
  for (let i = 0; i < state.found.length && i < prevFound.length; i += 1) {
    if (state.found[i] && !prevFound[i]) {
      const d = state.puzzle.diffs[i]!
      particles.burst(LEFT_X + d.x, PANEL_Y + d.y, THEME.good, 10, 110)
      particles.burst(RIGHT_X + d.x, PANEL_Y + d.y, THEME.good, 10, 110)
    }
  }
  prevFound = [...state.found]
  particles.tick(ctx, dtMs)

  if (state.status === 'won') {
    const more = state.level < 5
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '五处全中！',
      more ? '按 空格 进入下一关 · 按 R 重开' : '通关！按 R 再来一局', THEME.gold)
  } else if (state.status === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '时间到', '还有 ' + String(left) + ' 处未找到 · 按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
