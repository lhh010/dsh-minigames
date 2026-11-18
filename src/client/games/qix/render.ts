/**
 * 圈地争夺渲染层：复古像素风——暗色空地 + 微网格、安全带亮框、己占区
 * 着色、拖动中闪烁的笔迹亮线、旋转线条风墨怪、HUD（占领率/命/关卡/
 * 得分）与过关/失败 overlay。纯 canvas 绘制，状态全部来自 logic.ts。
 */
import type { QixState } from './logic.ts'
import { COLS, ROWS, PLAYER_STEP_MS, targetFor, LEVELS, matchWon } from './logic.ts'
import {
  THEME, accent, glow, noGlow, drawBackground, drawOverlay, hudPair,
  createParticles, type ParticleSystem,
} from '../theme.ts'

/** 单格逻辑边长（px）。 */
export const CELL = 22
/** 顶部 HUD 高度（px）。 */
export const HUD_H = 36
/** 逻辑画布宽。 */
export const VIEW_W = COLS * CELL
/** 逻辑画布高。 */
export const VIEW_H = ROWS * CELL + HUD_H

/** 玩家主色（主题蓝）。 */
const PLAYER_COLOR = accent(0)
/** 墨怪主色（霓虹粉）。 */
const QIX_COLOR = accent(4)
/** 笔迹色（青白）。 */
const TRAIL_COLOR = accent(5)

/** 创建渲染层自带的粒子系统（闭合填充庆祝用）。
 * @returns 粒子系统。
 */
export function createQixParticles(): ParticleSystem {
  return createParticles()
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(122,162,247,0.05)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= COLS; x += 1) {
    ctx.moveTo(x * CELL + 0.5, HUD_H)
    ctx.lineTo(x * CELL + 0.5, VIEW_H)
  }
  for (let y = 0; y <= ROWS; y += 1) {
    ctx.moveTo(0, HUD_H + y * CELL + 0.5)
    ctx.lineTo(VIEW_W, HUD_H + y * CELL + 0.5)
  }
  ctx.stroke()
}

function drawOwned(ctx: CanvasRenderingContext2D, state: QixState): void {
  // 复古像素感：己占格按位置加微光抖动着色，格间留 1px 缝。
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (state.own[y * COLS + x] !== 1) continue
      const belt = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1
      const px = x * CELL
      const py = HUD_H + y * CELL
      if (belt) {
        ctx.fillStyle = 'rgba(122,162,247,0.28)'
        ctx.fillRect(px, py, CELL, CELL)
      } else {
        const shade = ((x * 7 + y * 13) % 5) * 0.012
        ctx.fillStyle = 'rgba(122,162,247,' + (0.34 + shade).toFixed(3) + ')'
        ctx.fillRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1)
      }
    }
  }
}

function drawTrail(ctx: CanvasRenderingContext2D, state: QixState, nowMs: number): void {
  if (state.mode !== 'draw' || state.trail.length === 0) return
  // 拖动中闪烁：透明度随时间方波振荡（复古像素式硬闪）。
  const blink = Math.floor(nowMs / 160) % 2 === 0 ? 0.95 : 0.45
  ctx.globalAlpha = blink
  ctx.strokeStyle = TRAIL_COLOR
  glow(ctx, TRAIL_COLOR, 10)
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.lineCap = 'square'
  ctx.beginPath()
  state.trail.forEach((t, i) => {
    const x = t % COLS
    const y = (t - x) / COLS
    const cx = x * CELL + CELL / 2
    const cy = HUD_H + y * CELL + CELL / 2
    if (i === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  })
  const hx = state.px * CELL + CELL / 2
  const hy = HUD_H + state.py * CELL + CELL / 2
  ctx.lineTo(hx, hy)
  ctx.stroke()
  noGlow(ctx)
  ctx.globalAlpha = 1
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: QixState): void {
  const t = Math.min(1, state.playerAccumMs / PLAYER_STEP_MS)
  const x = (state.prevCell.x + (state.px - state.prevCell.x) * t) * CELL
  const y = HUD_H + (state.prevCell.y + (state.py - state.prevCell.y) * t) * CELL
  glow(ctx, PLAYER_COLOR, 14)
  ctx.fillStyle = state.mode === 'draw' ? TRAIL_COLOR : PLAYER_COLOR
  ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8)
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(x + CELL / 2 - 2, y + CELL / 2 - 2, 4, 4)
}

function drawQix(ctx: CanvasRenderingContext2D, state: QixState, nowMs: number): void {
  // 旋转线条风墨怪：过中心的四条发光线段，各自不同相位旋转。
  state.qix.forEach((q, i) => {
    const cx = q.x * CELL + CELL / 2
    const cy = HUD_H + q.y * CELL + CELL / 2
    const base = nowMs / 380 + i * 1.7
    ctx.strokeStyle = QIX_COLOR
    ctx.lineWidth = 2
    glow(ctx, QIX_COLOR, 12)
    ctx.beginPath()
    for (let k = 0; k < 4; k += 1) {
      const angle = base + (k * Math.PI) / 4
      const r = CELL * 0.62
      ctx.moveTo(cx - Math.cos(angle) * r, cy - Math.sin(angle) * r)
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
    }
    ctx.stroke()
    noGlow(ctx)
    ctx.fillStyle = THEME.bad
    ctx.fillRect(cx - 2, cy - 2, 4, 4)
  })
}

function drawHud(ctx: CanvasRenderingContext2D, state: QixState, ratio: number): void {
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, VIEW_W, HUD_H - 4)
  hudPair(ctx, 12, 22, '关卡', state.level + '/' + LEVELS)
  hudPair(ctx, 110, 22, '命', '♥'.repeat(Math.max(0, state.lives)))
  const pct = Math.floor(ratio * 100)
  const goal = Math.floor(targetFor(state.level) * 100)
  hudPair(ctx, VIEW_W - 12, 22, pct + '% / ' + goal + '%', '占领 ' + state.score + ' 分', 'right',
    ratio >= targetFor(state.level) ? THEME.good : THEME.text)
}

/**
 * 渲染一帧：背景、网格、己占区、闪烁笔迹、玩家、旋转墨怪、HUD 与
 * 过关/失败 overlay。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param state - 引擎状态。
 * @param particles - 粒子系统（由调用方 tick，这里只绘制）。
 * @param paused - 是否暂停（绘制暂停 overlay）。
 * @param nowMs - 当前时间戳（笔迹闪烁与墨怪旋转相位）。
 */
export function renderQix(
  ctx: CanvasRenderingContext2D, state: QixState, particles: ParticleSystem, paused: boolean, nowMs: number,
): void {
  drawBackground(ctx, VIEW_W, VIEW_H)
  drawGrid(ctx)
  drawOwned(ctx, state)
  drawTrail(ctx, state, nowMs)
  drawPlayer(ctx, state)
  drawQix(ctx, state, nowMs)
  particles.tick(ctx, 16)
  const ratio = ownedRatioSafe(state)
  drawHud(ctx, state, ratio)
  if (state.status === 'levelClear') {
    const title = matchWon(state) ? '全部通关' : '第 ' + state.level + ' 关通过'
    drawOverlay(ctx, VIEW_W, VIEW_H, title, '按 R 重开 · 下一关更快更险', THEME.good)
  } else if (state.status === 'gameover') {
    drawOverlay(ctx, VIEW_W, VIEW_H, '游戏结束', '按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, VIEW_W, VIEW_H, '暂停', '按 P 继续')
  }
}

/** 渲染用的占领率（避免循环导入语义，直接转发 logic 计算）。 */
function ownedRatioSafe(state: QixState): number {
  let owned = 0
  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (state.own[y * COLS + x] === 1) owned += 1
    }
  }
  return owned / ((COLS - 2) * (ROWS - 2))
}
