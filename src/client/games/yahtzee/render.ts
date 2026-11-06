/**
 * 五骰 Yahtzee 画布渲染：五颗骰子（锁定高亮 + 图钉、滚动动画抖动）、
 * 掷骰按钮、13 格计分面板（未填格实时预估分灰色、已填格实分亮色、
 * 上区/快速艇加成与总分汇总）、回合 HUD、暂停与终局覆盖层。共享 theme
 * 视觉件；本模块无状态，全部命中检测为纯函数。
 */
import type { Category, Scores } from './logic.ts'
import { CATEGORIES, CATEGORY_LABELS } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 660
export const HUD_H = 30

const DICE_SIZE = 54
const DICE_GAP = 12
const DICE_N = 5
const DICE_Y = 56
const DICE_X0 = (LOGICAL_W - (DICE_N * DICE_SIZE + (DICE_N - 1) * DICE_GAP)) / 2

const HINT_Y = 132
const ROLL_BTN = { x: 165, y: 144, w: 150, h: 34 }

const PANEL_X0 = 70
const PANEL_W = 340
const ROW_H = 26
const PANEL_Y0 = 192
const LABEL_X = PANEL_X0 + 12
const VALUE_X = PANEL_X0 + PANEL_W - 14

const SUMMARY_Y0 = PANEL_Y0 + CATEGORIES.length * ROW_H + 12
const SUMMARY_H = 24
const TOTAL_Y = SUMMARY_Y0 + 2 * SUMMARY_H + 12
const FOOTER_Y = LOGICAL_H - 14

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface YahtzeeView {
  /** 当前 5 颗骰面（1..6；动画期间未锁定骰由渲染层另算展示面）。 */
  dice: number[]
  /** 每颗骰的锁定标记。 */
  held: boolean[]
  /** 本回合已掷次数（0..3）。 */
  rollsUsed: number
  /** 已填格数（0..13）。 */
  filledCount: number
  /** 已填格记录。 */
  scores: Scores
  /** 快速艇奖励次数。 */
  yahtzeeBonus: number
  /** 当前总分。 */
  total: number
  /** 掷骰滚动动画进行中。 */
  rolling: boolean
  /** 未填格在当前骰面下的预估分（由 index.ts 注入 scoreCategory，渲染层不重复计分）。 */
  estimate: (category: Category) => number
  /** 临时提示文本（如「该格已填」），空串表示无。 */
  toast: string
  status: 'playing' | 'ended'
  /** 玩家按 P 的手动暂停。 */
  userPaused: boolean
  /** 面板驱动的暂停（实例未运行）。 */
  paused: boolean
}

/** 第 i 颗骰子的矩形。 */
export function dieRect(i: number): { x: number, y: number, w: number, h: number } {
  return { x: DICE_X0 + i * (DICE_SIZE + DICE_GAP), y: DICE_Y, w: DICE_SIZE, h: DICE_SIZE }
}

/**
 * 命中检测：返回点击到的骰子下标（0..4），未命中返回 null。
 */
export function dieAt(x: number, y: number): number | null {
  for (let i = 0; i < DICE_N; i += 1) {
    const r = dieRect(i)
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i
  }
  return null
}

/** 掷骰按钮命中。 */
export function rollButtonAt(x: number, y: number): boolean {
  return x >= ROLL_BTN.x && x <= ROLL_BTN.x + ROLL_BTN.w
    && y >= ROLL_BTN.y && y <= ROLL_BTN.y + ROLL_BTN.h
}

/**
 * 命中检测：返回点击到的计分格，未命中返回 null。
 */
export function categoryAt(x: number, y: number): Category | null {
  if (x < PANEL_X0 || x > PANEL_X0 + PANEL_W) return null
  const idx = Math.floor((y - PANEL_Y0) / ROW_H)
  if (idx < 0 || idx >= CATEGORIES.length) return null
  return CATEGORIES[idx]!
}

/** 骰面点位的九宫格坐标（0..1 相对位置），下标 = 面值。 */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.26, 0.26], [0.74, 0.74]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.74], [0.74, 0.74]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.5], [0.74, 0.5], [0.26, 0.74], [0.74, 0.74]],
}

/**
 * 画一颗骰子：滚动中的骰子按时间轮换面并轻微抖动；锁定骰 accent 描边
 * + 顶部图钉。
 * @param face - 展示面值（1..6）。
 * @param held - 是否锁定。
 * @param rolling - 该骰是否处于滚动动画。
 * @param tMs - 当前时间戳（毫秒，动画相位用）。
 */
function drawDie(ctx: CanvasRenderingContext2D, i: number, face: number, held: boolean, rolling: boolean, tMs: number): void {
  const r = dieRect(i)
  const jitter = rolling ? Math.sin(tMs / 55 + i * 1.9) * 2 : 0
  const x = r.x + jitter
  const y = r.y
  if (held) glow(ctx, THEME.accents[0]!, 10)
  roundRectPath(ctx, x, y, r.w, r.h, 10)
  ctx.fillStyle = '#eceaf4'
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = held ? THEME.accents[0]! : THEME.panelEdge
  ctx.lineWidth = held ? 2.5 : 1.5
  ctx.stroke()
  ctx.fillStyle = '#23232e'
  for (const [px, py] of PIPS[face] ?? []) {
    ctx.beginPath()
    ctx.arc(x + px * r.w, y + py * r.h, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  if (held) {
    // 图钉：钉帽圆 + 针脚线。
    const cx = x + r.w / 2
    glow(ctx, THEME.accents[4]!, 6)
    ctx.beginPath()
    ctx.arc(cx, y - 6, 5, 0, Math.PI * 2)
    ctx.fillStyle = THEME.accents[4]!
    ctx.fill()
    noGlow(ctx)
    ctx.beginPath()
    ctx.moveTo(cx, y - 1)
    ctx.lineTo(cx, y + 3)
    ctx.strokeStyle = THEME.accents[4]!
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function drawPanel(ctx: CanvasRenderingContext2D, view: YahtzeeView): void {
  // 分隔底板。
  roundRectPath(ctx, PANEL_X0 - 6, PANEL_Y0 - 6, PANEL_W + 12, CATEGORIES.length * ROW_H + 2 * SUMMARY_H + 66, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.textBaseline = 'middle'
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const cat = CATEGORIES[i]!
    const cy = PANEL_Y0 + i * ROW_H + ROW_H / 2
    const filled = view.scores[cat]
    let text: string
    let color: string
    if (filled !== undefined) {
      text = String(filled)
      color = filled > 0 ? THEME.text : THEME.bad
    } else if (view.status === 'playing' && view.rollsUsed > 0 && !view.rolling) {
      // 未填格：当前骰面的预估分，灰色示意可点。
      text = String(view.estimate(cat))
      color = THEME.textMuted
    } else {
      text = '—'
      color = THEME.textMuted
    }
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = filled !== undefined ? THEME.text : THEME.textMuted
    ctx.fillText(CATEGORY_LABELS[cat], LABEL_X, cy)
    ctx.textAlign = 'right'
    ctx.fillStyle = color
    ctx.fillText(text, VALUE_X, cy)
  }
  // 上区 / 下区分隔线。
  const sepY = PANEL_Y0 + 6 * ROW_H
  ctx.beginPath()
  ctx.moveTo(PANEL_X0 + 6, sepY)
  ctx.lineTo(PANEL_X0 + PANEL_W - 6, sepY)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // 汇总：上区加成 / 快速艇奖励 / 总分。
  const upper = view.scores
  let upperSum = 0
  for (let i = 0; i < 6; i += 1) upperSum += upper[CATEGORIES[i]!] ?? 0
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('上区小计 ' + upperSum + '（≥63 加成 35）', LABEL_X, SUMMARY_Y0 + SUMMARY_H / 2)
  ctx.fillText('快速艇奖励 ' + (view.yahtzeeBonus > 0 ? '+' + String(view.yahtzeeBonus * 50) : '—'), LABEL_X, SUMMARY_Y0 + SUMMARY_H + SUMMARY_H / 2)
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.text
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillText('总分 ' + String(view.total), VALUE_X, TOTAL_Y + 8)
  ctx.textBaseline = 'alphabetic'
}

function drawHint(ctx: CanvasRenderingContext2D, view: YahtzeeView): void {
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  let hint: string
  if (view.rollsUsed === 0) hint = '空格 / 点击按钮掷骰（每回合最多 3 次）'
  else if (view.rollsUsed >= 3) hint = '三次已掷完 · 点击右侧面板填分'
  else hint = '点击骰子 / 数字键 1-5 锁定 · 再掷 ' + String(3 - view.rollsUsed) + ' 次或直接填分'
  ctx.fillText(hint, LOGICAL_W / 2, HINT_Y)

  const disabled = view.rollsUsed >= 3 || view.rolling || view.status !== 'playing'
  roundRectPath(ctx, ROLL_BTN.x, ROLL_BTN.y, ROLL_BTN.w, ROLL_BTN.h, 8)
  ctx.fillStyle = disabled ? THEME.panel : THEME.accents[0]!
  ctx.fill()
  ctx.strokeStyle = disabled ? THEME.panelEdge : THEME.accents[0]!
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = disabled ? THEME.textMuted : '#14141c'
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  const label = view.rollsUsed === 0 ? '掷骰' : '再掷（剩 ' + String(3 - view.rollsUsed) + '）'
  ctx.fillText(label, ROLL_BTN.x + ROLL_BTN.w / 2, ROLL_BTN.y + ROLL_BTN.h / 2)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 绘制一帧。
 * @param nowMs - 当前时间戳（毫秒），驱动滚动动画的轮换面与抖动相位。
 */
export function renderYahtzee(ctx: CanvasRenderingContext2D, view: YahtzeeView, nowMs: number): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD 条：总分 / 回合与掷数。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  hudPair(ctx, 10, 20, '总分 ', String(view.total), 'left', view.total >= 63 ? THEME.gold : THEME.text)
  const roundNo = Math.min(view.filledCount + 1, CATEGORIES.length)
  hudPair(ctx, LOGICAL_W - 10, 20, '回合 ', roundNo + '/' + CATEGORIES.length + ' · 掷 ' + view.rollsUsed + '/3', 'right')

  for (let i = 0; i < DICE_N; i += 1) {
    const rolling = view.rolling && !view.held[i]
    // 滚动中的骰子按时间轮换展示面（无随机源，纯确定性动画）。
    const face = rolling ? 1 + (Math.floor(nowMs / 70) + i) % 6 : view.dice[i]!
    drawDie(ctx, i, face, view.held[i] === true, rolling, nowMs)
  }
  drawHint(ctx, view)
  drawPanel(ctx, view)

  if (view.toast !== '') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, accent(4), 8)
    ctx.fillStyle = accent(4)
    ctx.fillText(view.toast, LOGICAL_W / 2, ROLL_BTN.y + ROLL_BTN.h + 16)
    noGlow(ctx)
  }

  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('R：重开 · P：暂停', LOGICAL_W / 2, FOOTER_Y)

  if (view.status === 'ended') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '终局', spaced('总分') + ' ' + String(view.total) + ' · 空格 / 点击再来一局', THEME.gold)
  } else if (view.userPaused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · R 重开', THEME.text)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板恢复后继续', THEME.text)
  }
}
