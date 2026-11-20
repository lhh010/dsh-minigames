/**
 * 天平称重 Scales 画布渲染器：中上天平（横梁随最近一次结果倾斜、左右
 * 盘吊绳 + 盘上硬币小圆点）、底部硬币网格（点击循环 台面→左盘→右盘→
 * 台面）、右侧称量历史（三态着色）、左侧推理助手候选面板（开关时）、
 * 称量/清盘按钮与指认模式（选币 + 轻/重按钮）。渲染器无状态（倾斜缓
 * 动由调用方持有的 ScalesView 承担），共用 ../theme.ts 视觉套件。
 */
import type { ScalesState, WeighResult } from './logic.ts'
import { candidatesAfter } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 720
export const LOGICAL_H = 480

const HUD_H = 32
/** 天平支点。 */
const PIVOT_X = 360
const PIVOT_Y = 132
/** 横梁半长与吊绳长度。 */
const BEAM_HALF = 132
const STRING_LEN = 56
/** 最大倾角（弧度）：左重为负（左端下沉）。 */
const MAX_TILT = 0.13

/** 按钮与面板的点击区（逻辑坐标）。 */
export const WEIGH_BTN = { x: 306, y: 248, w: 108, h: 30 }
export const CLEAR_BTN = { x: 198, y: 248, w: 96, h: 30 }
export const LIGHT_BTN = { x: 286, y: 292, w: 100, h: 28 }
export const HEAVY_BTN = { x: 404, y: 292, w: 100, h: 28 }
const ASSIST_RECT = { x: 12, y: HUD_H + 14, w: 168, h: 216 }
const HIST_RECT = { x: 540, y: HUD_H + 14, w: 168, h: 232 }

/** 倾斜缓动动画状态（调用方持有，每帧 tick）。 */
export interface ScalesView {
  /** 当前展示倾角（向目标指数缓动）。 */
  tilt: number
  /** 目标倾角（由最近一次称量结果决定）。 */
  target: number
}

/** 为一局创建视图（初始水平）。 */
export function createScalesView(): ScalesView {
  return { tilt: 0, target: 0 }
}

/** 最近一次称量结果 → 目标倾角。 */
function tiltFor(result: WeighResult | null): number {
  if (result === 'left') return -MAX_TILT
  if (result === 'right') return MAX_TILT
  return 0
}

/**
 * 倾斜缓动推进一帧（指数逼近，误差 <0.002 时吸附）。
 * @param view - 视图（原地更新）。
 * @param dt - 帧间秒。
 * @returns 是否仍在动画（调用方据此继续 markDirty）。
 */
export function tickScalesView(view: ScalesView, dt: number): boolean {
  const diff = view.target - view.tilt
  if (Math.abs(diff) < 0.002) {
    view.tilt = view.target
    return false
  }
  view.tilt += diff * Math.min(1, dt * 7)
  return true
}

/**
 * 命中检测：逻辑坐标 (x,y) 落在哪枚硬币上。
 * @param coins - 硬币总数。
 * @returns 硬币下标，或 null。
 */
export function coinAt(coins: number, x: number, y: number): number | null {
  for (let i = 0; i < coins; i += 1) {
    const c = coinCenter(i)
    if (Math.hypot(x - c.x, y - c.y) <= 24) return i
  }
  return null
}

/** 硬币圆心（网格：每行 8 枚，最多两行）。 */
function coinCenter(i: number): { x: number; y: number } {
  const col = i % 8
  const row = Math.floor(i / 8)
  return { x: 186 + col * 50, y: row === 0 ? 374 : 430 }
}

function inRect(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** (x,y) 是否落在称量按钮上。 */
export function weighBtnAt(x: number, y: number): boolean {
  return inRect(WEIGH_BTN, x, y)
}

/** (x,y) 是否落在清盘按钮上。 */
export function clearBtnAt(x: number, y: number): boolean {
  return inRect(CLEAR_BTN, x, y)
}

/** (x,y) 是否落在指认「偏轻」按钮上。 */
export function lightBtnAt(x: number, y: number): boolean {
  return inRect(LIGHT_BTN, x, y)
}

/** (x,y) 是否落在指认「偏重」按钮上。 */
export function heavyBtnAt(x: number, y: number): boolean {
  return inRect(HEAVY_BTN, x, y)
}

/** 三态结果的中文短名与着色。 */
function resultStyle(result: WeighResult): { label: string; color: string } {
  if (result === 'left') return { label: '左重', color: accent(4) }
  if (result === 'right') return { label: '右重', color: accent(0) }
  return { label: '平衡', color: THEME.good }
}

/** 画天平：底座、立柱、随 view.tilt 倾斜的横梁与两吊盘（含盘中硬币）。 */
function drawScale(ctx: CanvasRenderingContext2D, state: ScalesState, view: ScalesView, left: readonly number[], right: readonly number[]): void {
  // 底座与立柱。
  ctx.fillStyle = THEME.panelEdge
  roundRectPath(ctx, PIVOT_X - 46, PIVOT_Y + 30, 92, 12, 5)
  ctx.fill()
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, PIVOT_X - 8, PIVOT_Y - 26, 16, 58, 4)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  roundRectPath(ctx, PIVOT_X - 8, PIVOT_Y - 26, 16, 58, 4)
  ctx.stroke()
  // 指针盘。
  ctx.fillStyle = THEME.panel
  ctx.beginPath()
  ctx.arc(PIVOT_X, PIVOT_Y, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = accent(2)
  glow(ctx, accent(2), 8)
  ctx.beginPath()
  ctx.arc(PIVOT_X, PIVOT_Y, 4.5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)

  ctx.save()
  ctx.translate(PIVOT_X, PIVOT_Y)
  ctx.rotate(view.tilt)
  // 横梁。
  ctx.fillStyle = accent(6)
  glow(ctx, accent(6), 6)
  roundRectPath(ctx, -BEAM_HALF, -5, BEAM_HALF * 2, 10, 5)
  ctx.fill()
  noGlow(ctx)
  // 两侧吊盘（端点随梁旋转）。
  for (const side of [-1, 1] as const) {
    const endX = side * BEAM_HALF
    const panX = endX
    const panY = STRING_LEN + 6
    ctx.strokeStyle = THEME.textMuted
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(endX - 22, 0)
    ctx.lineTo(panX, panY)
    ctx.moveTo(endX + 22, 0)
    ctx.lineTo(panX, panY)
    ctx.stroke()
    // 盘体（浅碗）。
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, panX - 34, panY, 68, 16, 8)
    ctx.fill()
    ctx.strokeStyle = side < 0 ? accent(0) : accent(4)
    ctx.lineWidth = 2.5
    roundRectPath(ctx, panX - 34, panY, 68, 16, 8)
    ctx.stroke()
    // 盘中硬币小圆点（一行最多 7 枚）。
    const ids = side < 0 ? left : right
    for (let i = 0; i < Math.min(ids.length, 7); i += 1) {
      const cx = panX - (Math.min(ids.length, 7) - 1) * 9 + i * 18
      ctx.fillStyle = THEME.gold
      glow(ctx, THEME.gold, 5)
      ctx.beginPath()
      ctx.arc(cx, panY + 8, 7, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
      ctx.font = '700 9px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#15151b'
      ctx.fillText(String(ids[i]! + 1), cx, panY + 11)
    }
  }
  ctx.restore()

  // 左右盘标签。
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = accent(0)
  ctx.fillText('左盘', PIVOT_X - BEAM_HALF, PIVOT_Y + STRING_LEN + 42)
  ctx.fillStyle = accent(4)
  ctx.fillText('右盘', PIVOT_X + BEAM_HALF, PIVOT_Y + STRING_LEN + 42)
  // 尚未称量时的提示。
  if (state.history.length === 0) {
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 12px system-ui, sans-serif'
    // 提示行移到按钮区（248-320）与硬币区（374+）之间的空带——原 y=252 正压在称量按钮上。
  ctx.fillText('选币入盘后按 空格 或点「称量」', PIVOT_X, 340)
  }
}

/** 画一枚网格硬币：编号 + 分配着色（左蓝/右红/台面灰），指认选中发光。 */
function drawCoin(
  ctx: CanvasRenderingContext2D, i: number,
  side: 'bench' | 'left' | 'right', selected: boolean,
): void {
  const c = coinCenter(i)
  const color = side === 'left' ? accent(0) : side === 'right' ? accent(4) : THEME.gold
  ctx.fillStyle = '#2a2a3a'
  if (selected) glow(ctx, THEME.text, 14)
  else if (side !== 'bench') glow(ctx, color, 9)
  ctx.beginPath()
  ctx.arc(c.x, c.y, 20, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = selected ? THEME.text : color
  ctx.lineWidth = selected ? 3.5 : 2.5
  ctx.beginPath()
  ctx.arc(c.x, c.y, 20, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = THEME.text
  ctx.font = '700 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(String(i + 1), c.x, c.y + 5)
}

/** 通用按钮：面板底 + 着色描边 + 居中文字。 */
function drawBtn(
  ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number },
  label: string, color: string,
): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 7)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 7)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, r.x + r.w / 2, r.y + 19)
}

/** 画称量历史面板：每行 = 序号 + 两侧编号摘要 + 三态结果着色。 */
function drawHistory(ctx: CanvasRenderingContext2D, state: ScalesState): void {
  ctx.fillStyle = 'rgba(30,30,42,0.88)'
  roundRectPath(ctx, HIST_RECT.x, HIST_RECT.y, HIST_RECT.w, HIST_RECT.h, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  roundRectPath(ctx, HIST_RECT.x, HIST_RECT.y, HIST_RECT.w, HIST_RECT.h, 10)
  ctx.stroke()
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('称量记录', HIST_RECT.x + 12, HIST_RECT.y + 22)
  ctx.font = '600 12px system-ui, sans-serif'
  if (state.history.length === 0) {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('暂无 · 剩 ' + (state.params.weighings - state.history.length) + ' 次', HIST_RECT.x + 12, HIST_RECT.y + 44)
    return
  }
  const brief = (ids: readonly number[]): string => ids.map(c => String(c + 1)).join()
  for (const [idx, wgt] of state.history.entries()) {
    const y = HIST_RECT.y + 46 + idx * 36
    const st = resultStyle(wgt.result)
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(idx + 1) + '.', HIST_RECT.x + 10, y)
    ctx.fillStyle = accent(0)
    ctx.fillText(brief(wgt.left), HIST_RECT.x + 26, y)
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('vs', HIST_RECT.x + 26, y + 14)
    ctx.fillStyle = accent(4)
    ctx.fillText(brief(wgt.right), HIST_RECT.x + 42, y + 14)
    ctx.fillStyle = st.color
    glow(ctx, st.color, 6)
    ctx.fillText(st.label, HIST_RECT.x + HIST_RECT.w - 40, y + 7)
    noGlow(ctx)
  }
}

/** 画推理助手面板：与全部历史一致的候选集合（编号 + 箭头方向）。 */
function drawAssistant(ctx: CanvasRenderingContext2D, state: ScalesState): void {
  ctx.fillStyle = 'rgba(30,30,42,0.88)'
  roundRectPath(ctx, ASSIST_RECT.x, ASSIST_RECT.y, ASSIST_RECT.w, ASSIST_RECT.h, 10)
  ctx.fill()
  ctx.strokeStyle = accent(7)
  ctx.lineWidth = 1.5
  roundRectPath(ctx, ASSIST_RECT.x, ASSIST_RECT.y, ASSIST_RECT.w, ASSIST_RECT.h, 10)
  ctx.stroke()
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = accent(7)
  ctx.fillText('推理助手 A', ASSIST_RECT.x + 12, ASSIST_RECT.y + 22)
  const cands = candidatesAfter(state.history, state.params.coins)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('候选 ' + cands.length + ' 种', ASSIST_RECT.x + 12, ASSIST_RECT.y + 42)
  // 逐行列出候选：编号 + ↑偏重 / ↓偏轻，最多 8 行。
  const perRow = 3
  for (const [idx, cand] of cands.slice(0, 24).entries()) {
    const row = Math.floor(idx / perRow)
    const col = idx % perRow
    const x = ASSIST_RECT.x + 14 + col * 50
    const y = ASSIST_RECT.y + 66 + row * 22
    ctx.textAlign = 'left'
    ctx.fillStyle = cand.heavy ? accent(4) : accent(5)
    ctx.fillText(String(cand.coin + 1) + (cand.heavy ? '↑' : '↓'), x, y)
  }
  if (cands.length > 24) {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('…', ASSIST_RECT.x + 12, ASSIST_RECT.y + 66 + 8 * 22)
  }
}

/**
 * 绘制一帧。
 * @param view - 倾斜缓动视图。
 * @param left - 当前放在左盘的硬币下标。
 * @param right - 当前放在右盘的硬币下标。
 * @param accuseMode - 指认模式（点币选中而非入盘）。
 * @param accuseSel - 指认模式下选中的硬币，null 未选。
 * @param assistantOn - 推理助手是否开启。
 * @param remainingSec - 限时剩余秒数，null 不限时。
 * @param paused - 显示暂停遮罩。
 * @param toast - 瞬时提示，null 无。
 */
export function renderScales(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: ScalesState, view: ScalesView,
  left: readonly number[], right: readonly number[], accuseMode: boolean, accuseSel: number | null,
  assistantOn: boolean, remainingSec: number | null, paused: boolean, toast: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  // HUD：关卡 / 剩余称量 / 限时或助手状态。
  hudPair(ctx, 14, 21, '关卡 ', state.level + ' / 5')
  const leftCount = state.params.weighings - state.history.length
  hudPair(ctx, w / 2 - 60, 21, '剩余称量 ', String(leftCount), 'left', leftCount === 0 ? THEME.bad : THEME.text)
  if (remainingSec !== null) {
    hudPair(ctx, w - 14, 21, '限时 ', Math.ceil(remainingSec) + 's', 'right', remainingSec < 30 ? THEME.bad : THEME.text)
  } else {
    hudPair(ctx, w - 14, 21, '助手 ', assistantOn ? '开·分减半' : '关', 'right', assistantOn ? accent(7) : THEME.textMuted)
  }

  if (assistantOn) drawAssistant(ctx, state)
  drawScale(ctx, state, view, left, right)
  drawHistory(ctx, state)

  // 操作按钮（指认模式下替换为 轻/重 指认按钮）。
  if (!accuseMode) {
    const canWeigh = left.length > 0 && left.length === right.length
    drawBtn(ctx, WEIGH_BTN, '称量 空格', canWeigh ? accent(2) : THEME.panelEdge)
    drawBtn(ctx, CLEAR_BTN, '清盘', THEME.panelEdge)
  } else {
    drawBtn(ctx, LIGHT_BTN, '指认偏轻 ↓', accent(5))
    drawBtn(ctx, HEAVY_BTN, '指认偏重 ↑', accent(4))
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    glow(ctx, THEME.gold, 8)
    const pick = accuseSel === null ? '点选一枚硬币' : '已选 ' + (accuseSel + 1) + ' 号 · 选轻重'
    ctx.fillText('指认模式：' + pick + ' · Enter 退出', 360, 288)
    noGlow(ctx)
  }

  // 硬币网格。
  for (let i = 0; i < state.params.coins; i += 1) {
    const side: 'bench' | 'left' | 'right' = left.includes(i) ? 'left' : right.includes(i) ? 'right' : 'bench'
    drawCoin(ctx, i, side, accuseMode && accuseSel === i)
  }

  // 底部提示。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  const hint = accuseMode
    ? '点币选中 · 点「偏轻/偏重」按钮指认 · Enter 退出指认'
    : '点硬币入左盘 → 右盘 → 取下 · 空格称量 · Enter 指认 · A 助手 · R 重开 · P 暂停'
  ctx.fillText(hint, w / 2, h - 10)

  if (toast !== null) {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 10)
    ctx.fillText(toast, w / 2, 338)
    noGlow(ctx)
  }

  if (state.status === 'won') {
    drawOverlay(ctx, w, h, '指认正确', '假币正是 ' + (state.setup.coin + 1) + ' 号（' + (state.setup.heavy ? '偏重' : '偏轻') + '）', THEME.good)
  } else if (state.status === 'lost') {
    const why = state.lostReason === 'timeout' ? '时间到' : '指认错误'
    drawOverlay(ctx, w, h, why, '假币是 ' + (state.setup.coin + 1) + ' 号（' + (state.setup.heavy ? '偏重' : '偏轻') + '）· 按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
