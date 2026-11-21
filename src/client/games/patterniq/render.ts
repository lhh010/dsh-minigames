/**
 * 找规律 PatternIQ 渲染：题卡（数字序列大字 / 图形序列程序绘制）、
 * 4 选项卡（点击热区与绘制同一几何）、题卡右上倒计时环、反馈阶段
 * 规律解释条滑出、节末小结 + 错题回顾、题号/分数 HUD 与底部常驻速览。
 * 逻辑坐标 640×420，全部矩形两两不相交（见各常量注释）。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced, type ParticleSystem } from '../theme.ts'
import {
  QUESTIONS_PER_SECTION, SECTIONS, optionText,
  type GraphicCell, type PatternOption, type PatterniqState, type WrongEntry,
} from './logic.ts'

/** 逻辑画布宽。 */
export const LOGICAL_W = 640
/** 逻辑画布高。 */
export const LOGICAL_H = 420

// ---- 布局常量（两两不相交核算基准）----
/** HUD 基线 y=26：左侧两对（x=16 与 x=120），右侧分数右锚 x=624。 */
const HUD_Y = 26
/** 题卡：(40,44) 起 560×118，水平居中（(640-560)/2=40）。 */
export const CARD_X = 40
export const CARD_Y = 44
export const CARD_W = 560
export const CARD_H = 118
/** 序列大字锚点：(320,112) 居中，最大占宽约 380（≤ ring 左缘 548）。 */
const SEQ_Y = 112
/** 倒计时环：圆心 (566,74) r=18，含在题卡右上角内。 */
const RING_X = 566
const RING_Y = 74
const RING_R = 18
/** 解释条：(80,178) 起 480×64，位于题卡(162)与选项(262)之间。 */
export const EXPLAIN_X = 80
export const EXPLAIN_Y = 178
export const EXPLAIN_W = 480
export const EXPLAIN_H = 64
/** 4 选项卡：起点 (28,262)，每卡 134×56、间距 16，行宽 584 居中。 */
export const OPT_Y = 262
export const OPT_W = 134
export const OPT_H = 56
export const OPT_GAP = 16
export const OPT_START_X = 28
/** 底部常驻速览：居中锚点 (320,408)。 */
const HINT_Y = 408

/** 选项卡 i 的左上角 x。 */
export function optionX(i: number): number {
  return OPT_START_X + i * (OPT_W + OPT_GAP)
}

/**
 * 点击热区命中检测（与绘制同一几何）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 选项下标 0-3，未命中为 null。
 */
export function optionCardAt(x: number, y: number): number | null {
  if (y < OPT_Y || y > OPT_Y + OPT_H) return null
  for (let i = 0; i < 4; i += 1) {
    if (x >= optionX(i) && x <= optionX(i) + OPT_W) return i
  }
  return null
}

/** 错题回顾一行文案：「3, 7, 11, 15 → 19（等差数列，公差 4；你答 20）」。 */
export function wrongEntryText(entry: WrongEntry): string {
  const q = entry.question
  const shown = q.terms !== null
    ? q.terms.join(', ') + ', ?'
    : (q.cells ?? []).map((c) => c.count + '点' + c.rotation + '°' + (c.filled ? '实' : '空')).join(', ') + ', ?'
  return shown + ' → ' + optionText(q.answer as PatternOption) + '（' + q.explanation + '；你答 ' + entry.wrongText + '）'
}

/** 画一格图形序列：旋转方框内画 count 个圆点，filled 决定框内底色。 */
function drawCell(ctx: CanvasRenderingContext2D, cell: GraphicCell, x: number, y: number, size: number, color: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((cell.rotation * Math.PI) / 180)
  roundRectPath(ctx, -size / 2, -size / 2, size, size, 8)
  ctx.fillStyle = cell.filled ? color : THEME.panel
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
  // 圆点画在未旋转坐标：一排 count 个小点。
  const dotR = 3
  const totalW = cell.count * 10
  ctx.fillStyle = cell.filled ? THEME.bgBottom : color
  for (let i = 0; i < cell.count; i += 1) {
    ctx.beginPath()
    ctx.arc(x - totalW / 2 + 5 + i * 10, y, dotR, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 渲染整局画面（含暂停遮罩，dtMs 驱动解释条滑出动画）。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param state - 局面。
 * @param particles - 粒子系统（答对爆发后在此 tick）。
 * @param paused - 是否暂停（叠加遮罩）。
 * @param dtMs - 距上一帧毫秒数。
 */
export function renderPatterniq(
  ctx: CanvasRenderingContext2D,
  state: PatterniqState,
  particles: ParticleSystem,
  paused: boolean,
  dtMs: number,
): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const color = accent(state.section + 2)

  // HUD：左两对 + 右侧分数（右锚 624）。
  hudPair(ctx, 16, HUD_Y, '题', Math.min(state.questionIndex + 1, QUESTIONS_PER_SECTION) + '/' + QUESTIONS_PER_SECTION)
  hudPair(ctx, 120, HUD_Y, '节', state.section + '/' + SECTIONS)
  hudPair(ctx, LOGICAL_W - 16, HUD_Y, '分数', String(state.score), 'right', color)

  // 题卡。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 12)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // 序列主体：数字大字居中；图形序列程序绘制（4 格）。
  const q = state.question
  if (q.terms !== null) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 34px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(q.terms.join(', ') + ', ?', LOGICAL_W / 2, SEQ_Y)
  } else if (q.cells !== null) {
    const cellSize = 64
    const gap = 78
    const totalW = gap * (q.cells.length - 1)
    for (let i = 0; i < q.cells.length; i += 1) {
      drawCell(ctx, q.cells[i]!, LOGICAL_W / 2 - totalW / 2 + i * gap, SEQ_Y - 16, cellSize, color)
    }
    // 末位「?」占位框（虚线弱化，位于第 5 格位置）。
    const qx = LOGICAL_W / 2 - totalW / 2 + gap * q.cells.length
    ctx.save()
    ctx.setLineDash([5, 4])
    roundRectPath(ctx, qx - cellSize / 2, SEQ_Y - 16 - cellSize / 2, cellSize, cellSize, 8)
    ctx.strokeStyle = THEME.textMuted
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
    ctx.textAlign = 'center'
    ctx.font = 'bold 26px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('?', qx, SEQ_Y - 6)
  }

  // 倒计时环：题卡右上，剩余比例弧，低于 30% 变红。
  const frac = state.timeLimitMs <= 0 ? 0 : Math.max(0, Math.min(1, state.remainingMs / state.timeLimitMs))
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(Math.ceil(state.remainingMs / 1000) + 's', RING_X, RING_Y + 4)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(RING_X, RING_Y, RING_R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = frac < 0.3 ? THEME.bad : color
  glow(ctx, frac < 0.3 ? THEME.bad : color, 6)
  ctx.beginPath()
  ctx.arc(RING_X, RING_Y, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
  ctx.stroke()
  noGlow(ctx)

  // 反馈阶段：解释条（规律解释 + 空格提示）。
  if (state.phase === 'feedback') {
    ctx.fillStyle = 'rgba(30,30,42,0.94)'
    roundRectPath(ctx, EXPLAIN_X, EXPLAIN_Y, EXPLAIN_W, EXPLAIN_H, 10)
    ctx.fill()
    ctx.strokeStyle = state.lastOutcome === 'correct' ? THEME.good : THEME.bad
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = state.lastOutcome === 'correct' ? '600 15px system-ui, sans-serif' : '600 13px system-ui, sans-serif'
    ctx.fillStyle = state.lastOutcome === 'correct' ? THEME.good : THEME.bad
    const head = state.lastOutcome === 'correct' ? '答对 · ' : '超时 · '
    ctx.fillText(head + q.explanation, LOGICAL_W / 2, EXPLAIN_Y + 26)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('空格：下一题', LOGICAL_W / 2, EXPLAIN_Y + 47)
  }

  // 4 选项卡（反馈阶段高亮对错）。
  for (let i = 0; i < q.options.length; i += 1) {
    const opt = q.options[i]!
    const x = optionX(i)
    const isAnswer = opt.kind === q.answer.kind
      && (opt.kind === 'number'
        ? opt.value === (q.answer as { kind: 'number'; value: number }).value
        : opt.kind === 'cell' && opt.cell.count === (q.answer as { kind: 'cell'; cell: GraphicCell }).cell.count && opt.cell.rotation === (q.answer as { kind: 'cell'; cell: GraphicCell }).cell.rotation && opt.cell.filled === (q.answer as { kind: 'cell'; cell: GraphicCell }).cell.filled)
    let border: string = THEME.panelEdge
    let bg: string = THEME.panel
    if (state.phase === 'feedback' && isAnswer) { border = THEME.good; bg = 'rgba(158,206,106,0.14)' }
    if (state.phase === 'feedback' && !isAnswer && i === state.chosenIndex) { border = THEME.bad; bg = 'rgba(247,118,142,0.14)' }
    ctx.fillStyle = bg
    roundRectPath(ctx, x, OPT_Y, OPT_W, OPT_H, 10)
    ctx.fill()
    ctx.strokeStyle = border
    ctx.lineWidth = state.phase === 'feedback' && isAnswer ? 2 : 1
    ctx.stroke()
    if (opt.kind === 'number') {
      ctx.textAlign = 'center'
      ctx.font = 'bold 22px system-ui, sans-serif'
      ctx.fillStyle = THEME.text
      ctx.fillText(String(opt.value), x + OPT_W / 2, OPT_Y + 36)
    } else {
      drawCell(ctx, opt.cell, x + OPT_W / 2, OPT_Y + 30, 36, color)
    }
    ctx.textAlign = 'left'
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(i + 1), x + 10, OPT_Y + 15)
  }

  particles.tick(ctx, dtMs)

  // 底部常驻速览（居中，选项卡下缘 318 与之相隔 80+）。
  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('1-4 选择 · 空格 下一题 · P 暂停 · R 重开', LOGICAL_W / 2, HINT_Y)

  if (state.phase === 'summary') {
    const correct = 10 - state.sectionWrong.length
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '第 ' + state.section + ' 节完成', '答对 ' + correct + '/' + QUESTIONS_PER_SECTION + ' · 空格继续', color)
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('错题回顾', LOGICAL_W / 2, 258)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    const wrong = state.sectionWrong
    const shown = wrong.slice(0, 4)
    for (let i = 0; i < shown.length; i += 1) {
      ctx.fillText(wrongEntryText(shown[i]!), LOGICAL_W / 2, 280 + i * 24)
    }
    if (wrong.length > 4) ctx.fillText('……另 ' + (wrong.length - 4) + ' 题', LOGICAL_W / 2, 280 + 4 * 24)
    if (wrong.length === 0) ctx.fillText('本节全对，无错题 🎉', LOGICAL_W / 2, 280)
  } else if (state.phase === 'end') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, spaced('全部完成'), '总分 ' + state.score + ' · 答对 ' + state.totalCorrect + '/' + state.questionsAsked + ' · R 重开', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P：继续 · R：重开')
  }
}
