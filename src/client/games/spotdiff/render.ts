/**
 * 找不同画布渲染：同一画布左右分割为两幅图案面板，形状按种类绘制
 * （圆/方/三角/星），已找到的差异在两侧同时圈红；HUD 显示关卡、剩余差异
 * 与点错数，底部为时间条，结束/暂停时叠加共享 overlay。全部为纯绘制，
 * 不持有任何游戏状态（粒子系统除外，与 logic 无关）。
 */
import type { Shape, SpotDiffState } from './logic.ts'
import { PANEL_H, PANEL_W } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 顶部 HUD 高度。 */
export const HUD_H = 36
/** 左面板左上角横坐标。 */
export const LEFT_X = 16
/** 右面板左上角横坐标。 */
export const RIGHT_X = LEFT_X + PANEL_W + 14
/** 面板顶部纵坐标。 */
export const PANEL_Y = HUD_H + 6
/** 画布逻辑宽度。 */
export const LOGICAL_W = RIGHT_X + PANEL_W + 16
/** 画布逻辑高度（面板 + 底部时间条区域）。 */
export const LOGICAL_H = PANEL_Y + PANEL_H + 30

// 渲染侧事件观察：命中处爆出粒子。
const particles = createParticles()
let prevFound: boolean[] = []
let prevFrameMs = 0

/** 画一个几何形状（以 (ox+shape.x, oy+shape.y) 为中心）。 */
function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, ox: number, oy: number): void {
  const cx = ox + shape.x
  const cy = oy + shape.y
  const r = shape.size
  const color = accent(shape.color)
  glow(ctx, color, 8)
  ctx.fillStyle = color
  ctx.beginPath()
  if (shape.kind === 'circle') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  } else if (shape.kind === 'square') {
    ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7)
  } else if (shape.kind === 'triangle') {
    for (let i = 0; i < 3; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15)
      else ctx.lineTo(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15)
    }
    ctx.closePath()
  } else {
    // 五角星：外径 r、内径 r*0.45 交替。
    for (let i = 0; i < 10; i += 1) {
      const rr = i % 2 === 0 ? r * 1.2 : r * 0.5
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
    }
    ctx.closePath()
  }
  ctx.fill()
  noGlow(ctx)
}

/** 一个面板：底板 + 形状 + 已找到差异的红圈。 */
function drawPanel(
  ctx: CanvasRenderingContext2D, shapes: Shape[], ox: number, state: SpotDiffState,
): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, ox, PANEL_Y, PANEL_W, PANEL_H, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  for (const shape of shapes) drawShape(ctx, shape, ox, PANEL_Y)
  // 已找到的差异：两侧同时圈红。
  for (let i = 0; i < state.puzzle.diffs.length; i += 1) {
    if (!state.found[i]) continue
    const d = state.puzzle.diffs[i]!
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 3
    glow(ctx, THEME.bad, 10)
    ctx.beginPath()
    ctx.arc(ox + d.x, PANEL_Y + d.y, 20, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
  }
}

/**
 * 绘制一帧。
 * @param paused - 是否显示暂停 overlay。
 */
export function renderSpotDiff(ctx: CanvasRenderingContext2D, state: SpotDiffState, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：关卡 / 剩余差异 / 点错。
  hudPair(ctx, 14, 24, '关卡 ', String(state.level) + '/5')
  const left = state.found.filter((f) => !f).length
  hudPair(ctx, LOGICAL_W / 2, 24, '剩余差异 ', String(left), 'center', THEME.gold)
  hudPair(ctx, LOGICAL_W - 14, 24, '点错 ', String(state.misses), 'right', THEME.bad)

  drawPanel(ctx, state.puzzle.left, LEFT_X, state)
  drawPanel(ctx, state.puzzle.right, RIGHT_X, state)

  // 时间条：剩余时间占满度，低于 25% 变红。
  const frac = Math.max(0, Math.min(1, state.timeLeft / 60))
  const barX = LEFT_X
  const barW = LOGICAL_W - LEFT_X * 2
  const barY = PANEL_Y + PANEL_H + 10
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
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部找到！',
      more ? '按 空格 进入下一关 · 按 R 重开' : '通关！按 R 再来一局', THEME.gold)
  } else if (state.status === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '时间到', '还有 ' + String(left) + ' 处未找到 · 按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
