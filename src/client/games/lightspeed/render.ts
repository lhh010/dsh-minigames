/**
 * 「光速穿梭 Lightspeed」渲染：深空背景、发光引力井（吸引波纹动画）、
 * 小行星、光子拖尾、A/B 点标记与速度线。全部为纯 canvas 绘制。
 */
import { THEME, drawBackground, drawOverlay, glow, noGlow, hudPair, spaced } from '../theme.ts'
import { LS_W, LS_H, LEVEL_COUNT, type LightspeedState } from './logic.ts'

/** 逻辑画布尺寸（供 fitCanvas 使用）。 */
export const LS_RENDER_W = LS_W
export const LS_RENDER_H = LS_H

/** 一颗背景星。 */
interface Star {
  x: number
  y: number
  size: number
  phase: number
}

/** 星空缓存：按种子缓存一份，切关时重建。 */
let starCacheSeed = -1
let starCache: Star[] = []

/**
 * 确定性生成星空（简单 LCG，与逻辑层互不依赖）。
 * @param seed - 关卡种子。
 * @returns 星点数组。
 */
function starsFor(seed: number): Star[] {
  if (starCacheSeed === seed) return starCache
  let s = seed | 0
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return ((s >>> 8) & 0xffff) / 0xffff
  }
  const stars: Star[] = []
  for (let i = 0; i < 70; i += 1) {
    stars.push({ x: next() * LS_W, y: next() * LS_H, size: 0.6 + next() * 1.6, phase: next() * Math.PI * 2 })
  }
  starCacheSeed = seed
  starCache = stars
  return stars
}

/** 深空背景：渐变 + 缓慢闪烁的星点。 */
function drawSpace(ctx: CanvasRenderingContext2D, seed: number, timeMs: number): void {
  drawBackground(ctx, LS_W, LS_H)
  for (const star of starsFor(seed)) {
    const tw = 0.35 + 0.3 * (1 + Math.sin(timeMs / 900 + star.phase))
    ctx.globalAlpha = tw
    ctx.fillStyle = '#c8caf0'
    ctx.fillRect(star.x, star.y, star.size, star.size)
  }
  ctx.globalAlpha = 1
}

/** 引力井：发光核 + 向内收缩的吸引波纹环。 */
function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, timeMs: number): void {
  const color = '#bb9af7'
  glow(ctx, color, 18)
  ctx.fillStyle = '#2a1f45'
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = color
  for (let i = 0; i < 3; i += 1) {
    const t = ((timeMs / 1400 + i / 3) % 1)
    const r = radius * (1.9 - 1.1 * t)
    ctx.globalAlpha = 0.55 * t
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  glow(ctx, color, 10)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.22, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/** 小行星：暗岩色圆 + 高光边。 */
function drawAsteroid(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.fillStyle = '#4a4a5e'
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6b6b85'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(200,200,220,0.18)'
  ctx.beginPath()
  ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

/** A/B 点标记：脉冲圆环 + 字母。 */
function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, label: string, color: string, timeMs: number): void {
  const pulse = 0.7 + 0.3 * Math.sin(timeMs / 260)
  ctx.globalAlpha = pulse
  glow(ctx, color, 12)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(x, y, r * 1.35, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y)
  ctx.textBaseline = 'alphabetic'
}

/** 拖尾：由透明到亮的折线；速度线沿航向反向、长度随速度。 */
function drawTrail(ctx: CanvasRenderingContext2D, state: LightspeedState): void {
  const trail = state.trail
  const n = trail.length
  if (n >= 2) {
    ctx.lineCap = 'round'
    for (let i = 1; i < n; i += 1) {
      const a = i / n
      ctx.globalAlpha = a * 0.7
      ctx.strokeStyle = i > n - 12 ? '#7dcfff' : '#7aa2f7'
      ctx.lineWidth = 1 + a * 3
      ctx.beginPath()
      ctx.moveTo(trail[i - 1]!.x, trail[i - 1]!.y)
      ctx.lineTo(trail[i]!.x, trail[i]!.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  const p = state.photon
  const speedFrac = Math.min(1, Math.max(0, (p.speed - 150) / 350))
  if (speedFrac > 0.05) {
    ctx.globalAlpha = 0.35 + speedFrac * 0.4
    ctx.strokeStyle = '#7dcfff'
    ctx.lineWidth = 1.5
    for (let k = -2; k <= 2; k += 1) {
      if (k === 0) continue
      const off = k * 6
      const px = -Math.sin(p.heading) * off
      const py = Math.cos(p.heading) * off
      const len = 14 + speedFrac * 34
      ctx.beginPath()
      ctx.moveTo(p.x + px, p.y + py)
      ctx.lineTo(p.x + px - Math.cos(p.heading) * len, p.y + py - Math.sin(p.heading) * len)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  glow(ctx, '#7dcfff', 16)
  ctx.fillStyle = '#eafcff'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/** 顶部 HUD：关卡、分数、速度。 */
function drawHud(ctx: CanvasRenderingContext2D, state: LightspeedState): void {
  hudPair(ctx, 14, 22, '关卡', (state.level.index + 1) + '/' + LEVEL_COUNT)
  hudPair(ctx, 14, 42, '分数', String(state.score), 'left', THEME.gold)
  hudPair(ctx, LS_W - 14, 22, '速度', Math.round(state.photon.speed) + ' px/s', 'right')
}

/**
 * 渲染一帧完整画面。
 * @param ctx - 已套用逻辑变换的 2d 上下文。
 * @param state - 游戏状态。
 * @param timeMs - 展示用时钟（毫秒）。
 * @param paused - 暂停中（覆盖暂停面板）。
 */
export function renderLightspeed(ctx: CanvasRenderingContext2D, state: LightspeedState, timeMs: number, paused: boolean): void {
  drawSpace(ctx, state.level.seed, timeMs)
  const g = state.level.goal
  drawMarker(ctx, state.level.start.x, state.level.start.y, 20, 'A', THEME.textMuted, timeMs)
  drawMarker(ctx, g.x, g.y, state.level.goalRadius, 'B', THEME.good, timeMs)
  for (const w of state.level.wells) drawWell(ctx, w.x, w.y, w.radius, timeMs)
  for (const rock of state.level.asteroids) drawAsteroid(ctx, rock.x, rock.y, rock.radius)
  drawTrail(ctx, state)
  drawHud(ctx, state)
  if (state.result === 'dead') {
    drawOverlay(ctx, LS_W, LS_H, spaced('湮灭'), '撞上障碍或坠入引力核 · 按 R 重来', THEME.bad)
  } else if (state.result === 'levelClear') {
    drawOverlay(ctx, LS_W, LS_H, spaced('到达'), '引力弹弓成功 · 即将跃迁下一维', THEME.good)
  } else if (state.result === 'victory') {
    drawOverlay(ctx, LS_W, LS_H, spaced('穿越成功'), '总分 ' + state.score + ' · 按 R 再来一局', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LS_W, LS_H, spaced('暂停'), '按 P 继续 · 按 R 重开')
  }
}
