/**
 * N-Back 记忆训练渲染层：极简实验室风。左侧 3×3 网格蓝色脉冲点亮当前
 * 位置；右侧双流数字窗与「位置匹配 A / 声音匹配 S」两个按钮（命中绿闪、
 * 误按红震、漏按灰闪）；顶部 N 档/进度/准确率 HUD；节间小结面板与
 * ready/paused/over 共享 overlay。全部为纯 canvas 绘制。
 */
import type { FeedbackKind, NBackState } from './logic.ts'
import { GRID_CELLS, LIGHT_MS, TRIALS_PER_SESSION, LOGICAL_W, LOGICAL_H } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced,
} from '../theme.ts'
import { overallAccuracy } from './logic.ts'

/** 渲染阶段（与实例侧 uiPhase 对应）。 */
export type UiPhase = 'ready' | 'playing' | 'paused' | 'summary' | 'over'

/** 矩形命中区（index.ts 点击命中复用）。 */
export interface NBackRect { x: number; y: number; w: number; h: number }

const CELL = 66
const GAP = 12
const GRID_X = 28
const GRID_Y = 66
const GRID_SIZE = CELL * 3 + GAP * 2
const PANEL_X = 292
const PANEL_W = LOGICAL_W - PANEL_X - 24
const DIGIT_RECT: NBackRect = { x: PANEL_X, y: GRID_Y, w: PANEL_W, h: 92 }
const POSITION_BTN: NBackRect = { x: PANEL_X, y: GRID_Y + 108, w: PANEL_W, h: 44 }
const AUDIO_BTN: NBackRect = { x: PANEL_X, y: GRID_Y + 164, w: PANEL_W, h: 44 }
const CELL_LIT = accent(0)
const HIT = THEME.good
const BAD = THEME.bad

/** 「位置匹配」按钮命中区。 */
export function nbackPositionButton(): NBackRect { return { ...POSITION_BTN } }
/** 「声音匹配」按钮命中区。 */
export function nbackAudioButton(): NBackRect { return { ...AUDIO_BTN } }

/** 逻辑坐标 → 按钮命中判定。 */
export function pointInRect(px: number, py: number, rect: NBackRect): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h
}

// 命中粒子（渲染侧观察计数变化触发）。
const particles = createParticles()
let prevTotalHits = -1

/** trial 内点亮强度：点亮期内脉冲衰减，之后为 0。 */
function lightLevel(state: NBackState, t: number): number {
  if (state.trialElapsed >= LIGHT_MS) return 0
  const k = 1 - state.trialElapsed / LIGHT_MS
  return k * (0.72 + 0.28 * Math.sin(t * 10))
}

/** 反馈按钮绘制：绿闪命中 / 红震误按 / 灰闪漏按；已作答降透明。 */
function drawButton(
  ctx: CanvasRenderingContext2D, rect: NBackRect, label: string, sub: string,
  flashT: number, kind: FeedbackKind | null, responded: boolean, enabled: boolean,
): void {
  const shake = kind === 'false' && flashT > 0 ? Math.sin(flashT * 60) * 3 : 0
  ctx.save()
  ctx.translate(shake, 0)
  let fill: string = THEME.panel
  let edge: string = THEME.panelEdge
  if (kind !== null && flashT > 0) {
    if (kind === 'hit') { fill = 'rgba(158,206,106,0.28)'; edge = HIT }
    else if (kind === 'false') { fill = 'rgba(247,118,142,0.30)'; edge = BAD }
    else { fill = 'rgba(226,226,238,0.10)'; edge = THEME.textMuted }
  } else if (responded) {
    fill = 'rgba(30,30,42,0.5)'
  }
  ctx.globalAlpha = enabled ? 1 : 0.35
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 10)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillStyle = enabled ? THEME.text : THEME.textMuted
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + 19)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(sub, rect.x + rect.w / 2, rect.y + 35)
  ctx.restore()
  ctx.globalAlpha = 1
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 应用）。
 * @param state - 逻辑状态。
 * @param t - 运行秒数（脉冲/震动动画）。
 * @param phase - 渲染阶段。
 */
export function renderNBack(ctx: CanvasRenderingContext2D, state: NBackState, t: number, phase: UiPhase): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：N 档（左）· 进度与准确率（右）。
  hudPair(ctx, 10, 20, 'N 档 ', 'N=' + state.n, 'left', accent(0))
  const acc = Math.round(overallAccuracy(state) * 100)
  hudPair(ctx, LOGICAL_W - 10, 20, '进度 ' + Math.min(state.trialIndex + 1, TRIALS_PER_SESSION) + '/' + TRIALS_PER_SESSION + ' · ',
    '准确率 ' + acc + '%', 'right')

  // 3×3 网格。
  for (let i = 0; i < GRID_CELLS; i += 1) {
    const cx = GRID_X + (i % 3) * (CELL + GAP)
    const cy = GRID_Y + Math.floor(i / 3) * (CELL + GAP)
    const active = phase === 'playing' && state.plan.positions[state.trialIndex] === i
    const level = active ? lightLevel(state, t) : 0
    roundRectPath(ctx, cx, cy, CELL, CELL, 12)
    ctx.fillStyle = active ? 'rgba(122,162,247,' + (0.18 + level * 0.5).toFixed(3) + ')' : THEME.panel
    if (active) glow(ctx, CELL_LIT, 18)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = active ? CELL_LIT : THEME.panelEdge
    ctx.lineWidth = active ? 2 : 1
    ctx.stroke()
  }
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.textAlign = 'left'
  ctx.fillText('位置流：与 N 步前相同 → A', GRID_X, GRID_Y + GRID_SIZE + 18)

  // 数字窗（双流时显示当前数字，单流显示解锁提示）。
  roundRectPath(ctx, DIGIT_RECT.x, DIGIT_RECT.y, DIGIT_RECT.w, DIGIT_RECT.h, 12)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  if (state.plan.dual) {
    const lit = phase === 'playing' && state.trialElapsed < LIGHT_MS
    ctx.textAlign = 'center'
    ctx.font = 'bold 44px ui-monospace, monospace'
    ctx.fillStyle = lit ? THEME.text : THEME.textMuted
    if (lit) glow(ctx, accent(5), 12)
    ctx.fillText(String(state.plan.digits[state.trialIndex] ?? '-'), DIGIT_RECT.x + DIGIT_RECT.w / 2, DIGIT_RECT.y + 62)
    noGlow(ctx)
  } else {
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('声音流', DIGIT_RECT.x + DIGIT_RECT.w / 2, DIGIT_RECT.y + 40)
    ctx.fillText('第 3 节解锁双流', DIGIT_RECT.x + DIGIT_RECT.w / 2, DIGIT_RECT.y + 60)
  }

  // 两个作答按钮。
  drawButton(ctx, POSITION_BTN, '位置匹配', 'A 键 / 点击', state.flashPosition, state.flashPositionKind, state.respondedPosition, true)
  drawButton(ctx, AUDIO_BTN, '声音匹配', 'S 键 / 点击', state.flashAudio, state.flashAudioKind, state.respondedAudio, state.plan.dual)

  // 命中粒子：观察全局命中数变化。
  if (prevTotalHits >= 0 && state.total.hits > prevTotalHits) {
    particles.burst(GRID_X + GRID_SIZE / 2, GRID_Y + GRID_SIZE / 2, HIT, 12, 140)
  }
  prevTotalHits = state.total.hits
  particles.tick(ctx, Math.min(50, 16))

  // 阶段覆盖层。
  if (phase === 'ready') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, 'N-Back 记忆训练',
      '位置与 N 步前相同按 A，不同不按 · 第 3 节起加声音流', accent(0))
  } else if (phase === 'paused') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · R 重开')
  } else if (phase === 'summary') {
    drawSummary(ctx, state)
  } else if (phase === 'over') {
    const last = state.history[state.history.length - 1]
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '训练完成',
      '最高 N 档 N=' + state.maxN + ' · 总准确率 ' + Math.round(overallAccuracy(state) * 100) + '% · 得分 ' + state.score,
      last !== undefined && last.nextN > last.n ? HIT : THEME.text)
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('按 R 或点击重开', LOGICAL_W / 2, LOGICAL_H / 2 + 44)
  }
}

/** 节间小结面板：准确率 + 升/降档提示 + 继续引导。 */
function drawSummary(ctx: CanvasRenderingContext2D, state: NBackState): void {
  const last = state.history[state.history.length - 1]
  if (last === undefined) return
  ctx.fillStyle = 'rgba(13,13,20,0.74)'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  const w = 320
  const h = 150
  const x = (LOGICAL_W - w) / 2
  const y = (LOGICAL_H - h) / 2
  roundRectPath(ctx, x, y, w, h, 14)
  ctx.fillStyle = THEME.panel
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.fill()
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(spaced('第 ' + state.history.length + ' 节完成'), LOGICAL_W / 2, y + 34)
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillStyle = accent(0)
  ctx.fillText('准确率 ' + Math.round(last.accuracy * 100) + '%', LOGICAL_W / 2, y + 64)
  const up = last.nextN > last.n
  const down = last.nextN < last.n
  ctx.fillStyle = up ? HIT : down ? BAD : THEME.textMuted
  const arrow = up ? ' ↑ 升档' : down ? ' ↓ 降档' : ' → 保持'
  ctx.fillText('N 档 ' + last.n + ' → ' + last.nextN + arrow, LOGICAL_W / 2, y + 92)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('空格 / 点击 进入下一节 · R 重开', LOGICAL_W / 2, y + 124)
}
