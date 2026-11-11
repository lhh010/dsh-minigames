/**
 * 飞镖 501 canvas 渲染：主题化标准镖盘（分区数字、双色扇区、双 / 三倍
 * 环、内外靶心）、手抖准星（十字 + 漂移预览圈）、本 turn 三镖落点标记、
 * 剩余分与 ≤170 结账建议、轮数与对战 HUD、胜负 / 暂停遮罩。
 */
import type { DartsState, ThrowResult } from './logic.ts'
import {
  BOARD_R, BULL_INNER, BULL_OUTER, DOUBLE_INNER, DOUBLE_OUTER, DARTS_PER_TURN,
  LOGICAL_H, LOGICAL_W, MAX_ROUNDS, SECTORS, TRIPLE_INNER, TRIPLE_OUTER,
  checkoutHint, driftAt, sectorPoint,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

/** 镖盘中心（逻辑坐标，index 换算指针坐标用）。 */
export const BOARD_CX = LOGICAL_W / 2
export const BOARD_CY = 186
const CX = BOARD_CX
const CY = BOARD_CY
/** 扇区双色（与主题协调的奶油 / 墨色传统配色）。 */
const LIGHT = '#d8dae2'
const DARK = '#2a2f4a'
const RING_GLOW = accent(4)
const CROSSHAIR = accent(0)
const DRIFT_RING = 'rgba(122,162,247,0.35)'
const MARK_HUMAN = accent(6)
const MARK_AI = accent(4)

/** UI 阶段（与实例侧 Phase 对齐）。 */
export type UiPhase = 'ready' | 'playing' | 'paused' | 'over'

/** 本 turn 三镖指示圆点纵坐标。 */
const DOT_Y = LOGICAL_H - 14

const particles = createParticles()
let prevMarks = 0

/** 画一镖盘半径倍率坐标对应的逻辑坐标。 */
function toBoard(x: number, y: number): { x: number; y: number } {
  return { x: CX + x * BOARD_R, y: CY - y * BOARD_R }
}

/** 一帧渲染入口。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 * @param aim - 瞄准点（镖盘半径倍率单位；null 表示非瞄准阶段）。
 * @param t - 时间秒（漂移动画）。
 * @param phase - UI 阶段。
 */
export function renderDarts(
  ctx: CanvasRenderingContext2D, state: DartsState, aim: { x: number; y: number } | null,
  t: number, phase: UiPhase,
): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  drawBoard(ctx)
  drawMarks(ctx, state)
  if (phase === 'playing' && state.turn === 'human' && state.winner === null && aim !== null) {
    drawCrosshair(ctx, state, aim, t)
  }

  // 新落点触发出镖粒子。
  if (state.marks.length > prevMarks && state.marks.length > 0) {
    const m = state.marks[state.marks.length - 1]!
    const p = toBoard(m.x, m.y)
    particles.burst(p.x, p.y, m.player === 'human' ? MARK_HUMAN : MARK_AI, 8, 110)
  }
  prevMarks = state.marks.length
  particles.tick(ctx, Math.min(50, 16))

  drawHud(ctx, state)
  drawTurnDots(ctx, state)

  if (phase === 'ready') {
    overlay(ctx, '飞镖 5 0 1', '点击瞄准，再次点击掷镖 · 先归零且末镖双倍者胜', '方向键微调 · 空格掷镖 · P 暂停 · R 重开')
  } else if (phase === 'paused') {
    overlay(ctx, '已暂停', '按 P 或点击继续 · R 重开')
  } else if (phase === 'over') {
    const title = state.winner === 'human' ? '你赢了！' : state.winner === 'ai' ? 'AI 获胜' : '平局'
    const sub = '你剩 ' + state.human.remaining.toString() +
      (state.vsAI ? ' · AI 剩 ' + state.ai.remaining.toString() : '') +
      ' · 点击再来一局'
    overlay(ctx, title, sub)
  }
}

/** 标准镖盘：外圈数字带、双色扇区、双 / 三倍环、内外靶心。 */
function drawBoard(ctx: CanvasRenderingContext2D): void {
  const sectorAngle = Math.PI * 2 / SECTORS.length
  // 分区扇区（从双倍环内缘到外缘整体双色）。
  for (let i = 0; i < SECTORS.length; i += 1) {
    const a0 = -Math.PI / 2 - sectorAngle / 2 + i * sectorAngle
    const a1 = a0 + sectorAngle
    const dark = i % 2 === 1
    // 单倍大区。
    ctx.fillStyle = dark ? DARK : LIGHT
    pie(ctx, CX, CY, TRIPLE_INNER * BOARD_R, DOUBLE_INNER * BOARD_R, a0, a1)
    // 双倍环。
    pie(ctx, CX, CY, DOUBLE_INNER * BOARD_R, DOUBLE_OUTER * BOARD_R, a0, a1)
    // 三倍环。
    ctx.fillStyle = dark ? LIGHT : DARK
    pie(ctx, CX, CY, TRIPLE_INNER * BOARD_R, TRIPLE_OUTER * BOARD_R, a0, a1)
  }
  // 环线。
  ctx.strokeStyle = 'rgba(226,226,238,0.5)'
  ctx.lineWidth = 1
  for (const r of [DOUBLE_OUTER, DOUBLE_INNER, TRIPLE_OUTER, TRIPLE_INNER]) {
    ctx.beginPath()
    ctx.arc(CX, CY, r * BOARD_R, 0, Math.PI * 2)
    ctx.stroke()
  }
  // 靶心：外 25（绿）、内 50（红）。
  ctx.fillStyle = '#4a7a52'
  ctx.beginPath()
  ctx.arc(CX, CY, BULL_OUTER * BOARD_R, 0, Math.PI * 2)
  ctx.fill()
  glow(ctx, RING_GLOW, 10)
  ctx.fillStyle = '#c04848'
  ctx.beginPath()
  ctx.arc(CX, CY, BULL_INNER * BOARD_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 分区数字。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < SECTORS.length; i += 1) {
    const a = -Math.PI / 2 + i * sectorAngle
    const nr = 1.1
    ctx.fillText(SECTORS[i]!.toString(), CX + Math.cos(a) * nr * BOARD_R, CY + Math.sin(a) * nr * BOARD_R)
  }
  ctx.textBaseline = 'alphabetic'
}

/** 填充一个环形扇（含描边路径）。 */
function pie(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number,
  a0: number, a1: number,
): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r1, a0, a1)
  ctx.arc(cx, cy, r0, a1, a0, true)
  ctx.closePath()
  ctx.fill()
}

/** 落点标记（本 turn 已投的镖）。 */
function drawMarks(ctx: CanvasRenderingContext2D, state: DartsState): void {
  for (const m of state.marks) {
    const p = toBoard(m.x, m.y)
    ctx.strokeStyle = m.player === 'human' ? MARK_HUMAN : MARK_AI
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p.x - 5, p.y - 5)
    ctx.lineTo(p.x + 5, p.y + 5)
    ctx.moveTo(p.x + 5, p.y - 5)
    ctx.lineTo(p.x - 5, p.y + 5)
    ctx.stroke()
  }
}

/** 手抖准星：十字 + 漂移可达范围预览圈 + 当前漂移落点小圈。 */
function drawCrosshair(
  ctx: CanvasRenderingContext2D, state: DartsState, aim: { x: number; y: number }, t: number,
): void {
  const p = toBoard(aim.x, aim.y)
  const d = driftAt(state, t)
  const lp = toBoard(aim.x + d.dx, aim.y + d.dy)
  ctx.strokeStyle = DRIFT_RING
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, 0.05 * BOARD_R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = CROSSHAIR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(p.x - 12, p.y)
  ctx.lineTo(p.x - 4, p.y)
  ctx.moveTo(p.x + 4, p.y)
  ctx.lineTo(p.x + 12, p.y)
  ctx.moveTo(p.x, p.y - 12)
  ctx.lineTo(p.x, p.y - 4)
  ctx.moveTo(p.x, p.y + 4)
  ctx.lineTo(p.x, p.y + 12)
  ctx.stroke()
  ctx.fillStyle = 'rgba(224,175,104,0.9)'
  ctx.beginPath()
  ctx.arc(lp.x, lp.y, 3, 0, Math.PI * 2)
  ctx.fill()
}

/** 顶部 HUD：轮数、双方剩余、最近一镖、结账建议。 */
function drawHud(ctx: CanvasRenderingContext2D, state: DartsState): void {
  hudPair(ctx, 10, 18, '轮 ', state.round.toString() + ' / ' + MAX_ROUNDS.toString(), 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W - 10, 18, '你剩 ', state.human.remaining.toString(), 'right',
    state.lastBust ? THEME.bad : THEME.text)
  if (state.vsAI) {
    hudPair(ctx, LOGICAL_W / 2, 18, 'AI 剩 ', state.ai.remaining.toString(), 'left', accent(4))
  }
  // 建议路线。
  const hint = checkoutHint(state.human.remaining)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(hint === null ? '建议：暂无固定路线' : '建议：' + hint, 10, 34)
  // 最近一镖。
  const last = state.lastResult
  if (last !== null) {
    ctx.textAlign = 'right'
    ctx.fillStyle = last.checkout ? THEME.good : last.bust ? THEME.bad : THEME.text
    ctx.fillText(
      last.ring === 'miss' ? '脱靶 0' :
        last.ring === 'bull50' ? '红心 50' :
          last.ring === 'bull25' ? '外靶心 25' :
            (last.ring === 'double' ? '双倍 ' : last.ring === 'triple' ? '三倍 ' : '') + last.sector.toString() + ' = ' + last.points.toString() + (last.bust ? '（爆分！）' : ''),
      LOGICAL_W - 10, 34,
    )
  }
  if (state.lastBust) {
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.bad
    ctx.fillText('爆分！分数回退本回合起点', CX, CY + BOARD_R * 1.22)
  }
  ctx.fillStyle = THEME.textMuted
  ctx.font = '11px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText('移动瞄准 · 点击 / 空格 掷镖 · 方向键微调 · P 暂停 · R 重开', 10, DOT_Y)
}

/** 本 turn 三镖指示：已投实心、未投空心。 */
function drawTurnDots(ctx: CanvasRenderingContext2D, state: DartsState): void {
  const total = state.vsAI && state.turn === 'ai' ? DARTS_PER_TURN : DARTS_PER_TURN
  const color = state.turn === 'ai' ? MARK_AI : MARK_HUMAN
  const x0 = LOGICAL_W - 14 - (total - 1) * 16
  for (let i = 0; i < total; i += 1) {
    ctx.beginPath()
    ctx.arc(x0 + i * 16, DOT_Y, 4, 0, Math.PI * 2)
    if (i < state.dartIndex) {
      ctx.fillStyle = color
      ctx.fill()
    } else {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}

/** 共享风格遮罩（标题 + 两行说明）。 */
function overlay(ctx: CanvasRenderingContext2D, title: string, line1: string, line2?: string): void {
  drawOverlay(ctx, LOGICAL_W, LOGICAL_H, title, line1, title.includes('赢') ? THEME.good : THEME.gold)
  if (line2 !== undefined) {
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(line2, LOGICAL_W / 2, LOGICAL_H / 2 + 42)
  }
}

/** 供 index 复用：给出玩家瞄准某个结账目标的坐标（双倍 16 等）。 */
export function aimHint(state: DartsState): { x: number; y: number } {
  const rem = state.human.remaining
  if (rem === 50) return { x: 0, y: 0 }
  if (rem % 2 === 0 && rem / 2 <= 20) return sectorPoint(rem / 2, 'double')
  return sectorPoint(20, 'triple')
}
