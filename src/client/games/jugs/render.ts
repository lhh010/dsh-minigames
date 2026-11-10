/**
 * 倒水谜题 Jugs 画布渲染器：左侧水龙头（点击装满选中壶）、右侧排水槽（点击倒空）、
 * 中间容量各异的壶（高度按容量比例，水位带缓动画，标注容量/当前水量）。
 * 渲染器无状态（缓动画由调用方持有的 JugsView 承担），共用 ../theme.ts 视觉套件。
 */
import type { JugsState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 560
export const LOGICAL_H = 360

const HUD_H = 32
/** 壶底基线（壶自下而上生长）。 */
const BASE_Y = 292
const JUG_W = 78
/** 壶高 = 最小高 + 按最大容量归一的比例段。 */
const JUG_MIN_H = 72
const JUG_VAR_H = 150
/** 壶区域水平范围（居中）。 */
const JUG_ZONE_X0 = 128
const JUG_ZONE_X1 = 432

/** 水龙头与排水槽的点击区。 */
export const TAP_RECT = { x: 16, y: HUD_H + 20, w: 92, h: 180 }
export const DRAIN_RECT = { x: LOGICAL_W - 108, y: HUD_H + 20, w: 92, h: 180 }

/** 壶水位缓动动画状态（调用方持有，每帧 tick）。 */
export interface JugsView {
  /** 各壶展示水量（向真实水量指数缓动）。 */
  display: number[]
}

/**
 * 为一局创建水位缓动视图（初始展示 = 真实水量）。
 * @param state - 当前局面。
 * @returns 新视图对象。
 */
export function createJugsView(state: JugsState): JugsView {
  return { display: state.amounts.slice() }
}

/**
 * 水位缓动推进一帧（指数逼近，误差 <0.01 时吸附）。
 * @param view - 视图（原地更新）。
 * @param state - 目标局面（壶数不变时复用同一视图）。
 * @param dt - 帧间秒。
 * @returns 是否仍在动画（调用方据此继续 markDirty）。
 */
export function tickJugsView(view: JugsView, state: JugsState, dt: number): boolean {
  let animating = false
  const rate = Math.min(1, dt * 9)
  for (let i = 0; i < state.amounts.length; i += 1) {
    const target = state.amounts[i]!
    let cur = view.display[i]!
    const diff = target - cur
    if (Math.abs(diff) < 0.01) cur = target
    else {
      cur += diff * rate
      animating = true
    }
    view.display[i] = cur
  }
  return animating
}

/**
 * 第 i 只壶的矩形（逻辑坐标，高度按容量比例）。
 * @param capacities - 各壶容量。
 * @param i - 壶序号。
 * @returns x/y/w/h 矩形。
 */
export function jugRect(capacities: readonly number[], i: number): { x: number; y: number; w: number; h: number } {
  const n = capacities.length
  const zoneW = JUG_ZONE_X1 - JUG_ZONE_X0
  const step = zoneW / n
  const maxCap = Math.max(...capacities)
  const h = JUG_MIN_H + (capacities[i]! / maxCap) * JUG_VAR_H
  return { x: JUG_ZONE_X0 + step * i + (step - JUG_W) / 2, y: BASE_Y - h, w: JUG_W, h }
}

/**
 * 命中检测：逻辑坐标 (x,y) 落在哪只壶上。
 * @param capacities - 各壶容量。
 * @returns 壶序号，或 null。
 */
export function jugAt(capacities: readonly number[], x: number, y: number): number | null {
  for (let i = 0; i < capacities.length; i += 1) {
    const r = jugRect(capacities, i)
    if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= BASE_Y + 6) return i
  }
  return null
}

/** (x,y) 是否落在水龙头区。 */
export function tapAt(x: number, y: number): boolean {
  return x >= TAP_RECT.x && x <= TAP_RECT.x + TAP_RECT.w && y >= TAP_RECT.y && y <= TAP_RECT.y + TAP_RECT.h
}

/** (x,y) 是否落在排水槽区。 */
export function drainAt(x: number, y: number): boolean {
  return x >= DRAIN_RECT.x && x <= DRAIN_RECT.x + DRAIN_RECT.w && y >= DRAIN_RECT.y && y <= DRAIN_RECT.y + DRAIN_RECT.h
}

/** 画水龙头：顶部水管 + 阀门 + 水滴（点击装满选中壶）。 */
function drawTap(ctx: CanvasRenderingContext2D): void {
  const cx = TAP_RECT.x + TAP_RECT.w / 2
  ctx.fillStyle = THEME.panelEdge
  ctx.fillRect(cx - 26, TAP_RECT.y, 52, 10)
  ctx.fillRect(cx - 9, TAP_RECT.y + 10, 18, 34)
  ctx.fillRect(cx - 13, TAP_RECT.y + 44, 26, 8)
  // 阀门手轮。
  ctx.fillStyle = accent(0)
  glow(ctx, accent(0), 8)
  ctx.beginPath()
  ctx.arc(cx + 14, TAP_RECT.y + 26, 6, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 出水口与水流。
  ctx.fillStyle = accent(5)
  ctx.fillRect(cx - 3, TAP_RECT.y + 52, 6, 5)
  ctx.globalAlpha = 0.5
  ctx.fillRect(cx - 2, TAP_RECT.y + 57, 4, 22)
  ctx.globalAlpha = 1
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('\u6c34\u6e90', cx, TAP_RECT.y + 108)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillText('\u70b9\u51fb\u88c5\u6ee1\u9009\u4e2d\u58f6', cx, TAP_RECT.y + 126)
}

/** 画排水槽：槽体 + 波纹（点击倒空选中壶）。 */
function drawDrain(ctx: CanvasRenderingContext2D): void {
  const cx = DRAIN_RECT.x + DRAIN_RECT.w / 2
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, cx - 34, DRAIN_RECT.y + 48, 68, 34, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = THEME.panelEdge
  roundRectPath(ctx, cx - 40, DRAIN_RECT.y + 42, 80, 8, 4)
  ctx.fill()
  // 下水管。
  ctx.fillRect(cx - 5, DRAIN_RECT.y + 82, 10, 18)
  ctx.strokeStyle = accent(4)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 20, DRAIN_RECT.y + 56)
  ctx.quadraticCurveTo(cx, DRAIN_RECT.y + 68, cx + 20, DRAIN_RECT.y + 56)
  ctx.stroke()
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('\u6392\u6c34', cx, DRAIN_RECT.y + 124)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillText('\u70b9\u51fb\u5012\u7a7a\u9009\u4e2d\u58f6', cx, DRAIN_RECT.y + 142)
}

/**
 * 画一只壶：壶体描边 + 水体（缓动水位）+ 容量/水量标注；选中壶发光。
 */
function drawJug(
  ctx: CanvasRenderingContext2D, state: JugsState, view: JugsView, i: number, selected: boolean,
): void {
  const cap = state.capacities[i]!
  const shown = view.display[i]!
  const r = jugRect(state.capacities, i)
  const water = accent(5)
  // 壶体。
  ctx.fillStyle = THEME.panel
  if (selected) glow(ctx, THEME.text, 14)
  else if (shown === state.target && state.target > 0) glow(ctx, THEME.gold, 14)
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = selected ? THEME.text : THEME.panelEdge
  ctx.lineWidth = selected ? 3 : 2
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.stroke()
  // 水体（裁剪到壶内，上方留出壶颈空白）。
  if (shown > 0.01) {
    const waterH = Math.max(4, (shown / cap) * (r.h - 14))
    ctx.save()
    roundRectPath(ctx, r.x + 5, r.y + 5, r.w - 10, r.h - 10, 7)
    ctx.clip()
    ctx.fillStyle = water
    ctx.globalAlpha = 0.85
    ctx.fillRect(r.x + 5, r.y + r.h - 5 - waterH, r.w - 10, waterH)
    ctx.globalAlpha = 1
    // 水面高光线。
    ctx.fillStyle = '#b9e3ff'
    ctx.fillRect(r.x + 5, r.y + r.h - 5 - waterH, r.w - 10, 3)
    ctx.restore()
  }
  // 容量标注在壶颈上方，当前水量在壶底。
  ctx.textAlign = 'center'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillStyle = selected ? THEME.text : THEME.textMuted
  ctx.fillText(cap + 'L', r.x + r.w / 2, r.y - 8)
  ctx.font = '700 15px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  glow(ctx, water, 6)
  ctx.fillText(String(Math.round(shown * 10) / 10), r.x + r.w / 2, r.y + r.h - 12)
  noGlow(ctx)
}

/**
 * 绘制一帧。
 * @param view - 水位缓动视图。
 * @param selected - 选中（源）壶序号，null 未选。
 * @param paused - 显示暂停遮罩。
 * @param toast - 瞬时非法操作提示，null 无。
 */
export function renderJugs(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: JugsState, view: JugsView,
  selected: number | null, paused: boolean, toast: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, 14, 21, '\u5173\u5361 ', String(state.level))
  hudPair(ctx, w / 2 - 40, 21, '\u76ee\u6807 ', state.target + 'L', 'left', THEME.gold)
  hudPair(ctx, w - 14, 21, '\u6b65\u6570 ', state.moves + ' / ' + state.par + ' \u00b7 \u4e0a\u9650 ' + state.maxMoves, 'right',
    state.moves > state.par ? THEME.bad : THEME.text)

  drawTap(ctx)
  drawDrain(ctx)
  for (let i = 0; i < state.capacities.length; i += 1) drawJug(ctx, state, view, i, selected === i)

  // 底部操作提示。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  const hint = selected === null
    ? '\u70b9\u58f6\u9009\u4e3a\u6e90 \u00b7 \u518d\u70b9\u53e6\u4e00\u58f6\u503e\u5012 \u00b7 \u70b9\u6c34\u9f99\u5934\u88c5\u6ee1 \u00b7 \u70b9\u6392\u6c34\u69fd\u5012\u7a7a'
    : '\u5df2\u9009 ' + state.capacities[selected]! + 'L \u58f6\uff1a\u70b9\u76ee\u6807\u58f6\u503e\u5012 \u00b7 \u70b9\u6c34\u9f99\u5934\u88c5\u6ee1 \u00b7 \u70b9\u6392\u6c34\u69fd\u5012\u7a7a \u00b7 U \u64a4\u56de'
  ctx.fillText(hint, w / 2, h - 12)

  if (toast !== null) {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 10)
    ctx.fillText(toast, w / 2, h - 34)
    noGlow(ctx)
  }

  if (state.status === 'won') {
    drawOverlay(ctx, w, h, '\u5b8c\u6210', state.moves + ' \u6b65 \u00b7 \u6700\u5c11 ' + state.par + ' \u6b65', THEME.good)
  } else if (state.status === 'lost') {
    drawOverlay(ctx, w, h, '\u6b65\u6570\u8d85\u9650', '\u8d85\u8fc7 ' + state.maxMoves + ' \u6b65\u672a\u91cf\u51fa\u76ee\u6807 \u00b7 \u6309 R \u91cd\u5f00', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, w, h, '\u5df2\u6682\u505c', '\u6309 P \u7ee7\u7eed', THEME.text)
  }
}
