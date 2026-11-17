/**
 * 光轮对决渲染层：暗色竞技场 + 微光网格、双方发光光轮与渐隐光墙轨迹、
 * 方向预览箭头、提速提示、局分 HUD、撞击爆炸粒子与胜负 overlay。
 * 纯 canvas 绘制，状态全部来自 logic.ts。
 */
import type { Dir, Side, TronState } from './logic.ts'
import { DIR_DELTA, stepIntervalMs, matchOver } from './logic.ts'
import {
  THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair,
  createParticles, type ParticleSystem,
} from '../theme.ts'

/** 单格逻辑边长（px）。 */
export const CELL = 24
/** 顶部 HUD 高度（px）。 */
export const HUD_H = 36
/** 逻辑画布宽。 */
export const VIEW_W = 40 * CELL
/** 逻辑画布高。 */
export const VIEW_H = 26 * CELL + HUD_H

/** 双方配色：玩家青、AI 橙（取自主题 accents）。 */
const COLORS: Record<Side, string> = { player: accent(5), ai: accent(6) }

/** 创建渲染层自带的粒子系统（爆炸用）。
 * @returns 粒子系统。
 */
export function createTronParticles(): ParticleSystem {
  return createParticles()
}

/** 在撞击点喷射双方颜色粒子（局结束时调用一次）。
 * @param particles - 粒子系统。
 * @param state - 引擎状态（读取 crashCells）。
 */
export function burstCrash(particles: ParticleSystem, state: TronState): void {
  const colors: Side[] = ['player', 'ai']
  state.crashCells.forEach((cell, i) => {
    const color = COLORS[colors[Math.min(i, 1)]!]
    const cx = cell.x * CELL + CELL / 2
    const cy = HUD_H + cell.y * CELL + CELL / 2
    particles.burst(cx, cy, color, 26, 200)
    particles.burst(cx, cy, THEME.text, 8, 90)
  })
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(122,162,247,0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= 40; x += 1) {
    ctx.moveTo(x * CELL + 0.5, HUD_H)
    ctx.lineTo(x * CELL + 0.5, VIEW_H)
  }
  for (let y = 0; y <= 26; y += 1) {
    ctx.moveTo(0, HUD_H + y * CELL + 0.5)
    ctx.lineTo(VIEW_W, HUD_H + y * CELL + 0.5)
  }
  ctx.stroke()
  // 边框微光
  ctx.strokeStyle = 'rgba(122,162,247,0.35)'
  glow(ctx, accent(0), 8)
  ctx.strokeRect(1.5, HUD_H + 1.5, VIEW_W - 3, 26 * CELL - 3)
  noGlow(ctx)
}

function drawTrail(ctx: CanvasRenderingContext2D, state: TronState, side: Side): void {
  const trail = state.trails[side]
  const color = COLORS[side]
  const len = trail.length
  for (let i = 0; i < len; i += 1) {
    const cell = trail[i]!
    const alpha = 0.22 + 0.6 * (i / Math.max(1, len - 1))
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    const pad = 3.5
    roundRectPath(ctx, cell.x * CELL + pad, HUD_H + cell.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 4)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function drawRider(ctx: CanvasRenderingContext2D, state: TronState, side: Side, fraction: number): void {
  const rider = state.riders[side]
  const color = COLORS[side]
  const x = lerp(rider.px, rider.x, fraction) * CELL
  const y = HUD_H + lerp(rider.py, rider.y, fraction) * CELL
  glow(ctx, color, 16)
  ctx.fillStyle = color
  roundRectPath(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 5)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(x + CELL / 2 - 2, y + CELL / 2 - 2, 4, 4)
}

function drawPreview(ctx: CanvasRenderingContext2D, state: TronState): void {
  const rider = state.riders.player
  const dir: Dir = state.pending.player ?? rider.dir
  const delta = DIR_DELTA[dir]
  const cx = (rider.x + delta.dx * 1.8) * CELL + CELL / 2
  const cy = HUD_H + (rider.y + delta.dy * 1.8) * CELL + CELL / 2
  ctx.strokeStyle = 'rgba(125,207,255,0.6)'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  const tipX = cx + delta.dx * 8
  const tipY = cy + delta.dy * 8
  ctx.moveTo(cx - delta.dx * 6, cy - delta.dy * 6)
  ctx.lineTo(tipX, tipY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  // 箭头头部：垂直于方向展开两翼。
  const wx = delta.dx === 0 ? 1 : 0
  const wy = delta.dy === 0 ? 1 : 0
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - delta.dx * 6 + wx * 5, tipY - delta.dy * 6 + wy * 5)
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - delta.dx * 6 - wx * 5, tipY - delta.dy * 6 - wy * 5)
  ctx.stroke()
}

function drawHud(ctx: CanvasRenderingContext2D, state: TronState): void {
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, VIEW_W, HUD_H - 4)
  hudPair(ctx, 12, 22, '局分 你 ' + state.wins.player + ' : ' + state.wins.ai + ' AI', '第 ' + state.round + ' 局')
  const interval = stepIntervalMs(state)
  const level = interval <= 82 ? 'MAX' : interval <= 92 ? 'Lv3' : interval <= 101 ? 'Lv2' : 'Lv1'
  hudPair(ctx, VIEW_W - 12, 22, '速度', level, 'right', interval <= 82 ? THEME.bad : THEME.text)
  if (state.tick - state.lastSpeedTierChange <= 18 && state.lastSpeedTierChange > 0 && !state.roundOver) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText('提速！', VIEW_W / 2, 22)
  }
}

/**
 * 渲染一帧：背景、网格、双方轨迹与光轮（按步进进度插值）、方向预览、
 * 粒子、HUD 与结束 overlay。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param state - 引擎状态。
 * @param particles - 粒子系统（由调用方 tick，这里只绘制）。
 * @param paused - 是否暂停（绘制暂停 overlay）。
 */
export function renderTron(
  ctx: CanvasRenderingContext2D, state: TronState, particles: ParticleSystem, paused: boolean,
): void {
  drawBackground(ctx, VIEW_W, VIEW_H)
  drawGrid(ctx)
  drawTrail(ctx, state, 'player')
  drawTrail(ctx, state, 'ai')
  const fraction = state.roundOver ? 1 : Math.min(1, state.stepAccumMs / stepIntervalMs(state))
  drawRider(ctx, state, 'player', fraction)
  drawRider(ctx, state, 'ai', fraction)
  if (!state.roundOver) drawPreview(ctx, state)
  drawHud(ctx, state)
  if (state.roundOver) {
    const subtitle = matchOver(state) ? '按 R 重开整场' : '1.6 秒后进入下一局 · R 重开'
    if (matchOver(state)) {
      if (state.wins.player > state.wins.ai) drawOverlay(ctx, VIEW_W, VIEW_H, '比赛胜利', subtitle, COLORS.player)
      else drawOverlay(ctx, VIEW_W, VIEW_H, '比赛落败', subtitle, COLORS.ai)
    } else if (state.winner === 'player') drawOverlay(ctx, VIEW_W, VIEW_H, '本局获胜', subtitle, COLORS.player)
    else if (state.winner === 'ai') drawOverlay(ctx, VIEW_W, VIEW_H, '本局落败', subtitle, COLORS.ai)
    else drawOverlay(ctx, VIEW_W, VIEW_H, '平局', subtitle)
  } else if (paused) {
    drawOverlay(ctx, VIEW_W, VIEW_H, '已暂停', '按 P 继续 · R 重开')
  }
}
