/**
 * 水排序 WaterSort 渲染层：玻璃试管、水层色块与液面微晃、选中高亮与
 * 顶段上浮、倾倒水流弧线动画、完成勾标、HUD 与过关/暂停遮罩。全部为
 * 纯 canvas 绘制，状态只读；动画进度由 {@link WaterSortView} 持有。
 */
import { LEVELS, TUBE_CAPACITY, isDeadlocked, isTubeComplete, topRun, type WaterSortState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, noGlow, roundRectPath, hudPair } from '../theme.ts'

/** 逻辑画布宽（px）。 */
export const LOGICAL_W = 640
/** 逻辑画布高（px）。 */
export const LOGICAL_H = 470

/** 单管宽。 */
const TUBE_W = 52
/** 管间距。 */
const TUBE_GAP = 22
/** 单水层高。 */
const LAYER_H = 33
/** 管高（4 层 + 上下余量）。 */
const TUBE_H = TUBE_CAPACITY * LAYER_H + 14
/** 双排布局的行距。 */
const ROW_GAP = 30
/** 倾倒动画时长（ms）。 */
export const POUR_MS = 300

/** 一根试管的矩形（逻辑坐标）。 */
export interface TubeRect {
  x: number
  y: number
  w: number
  h: number
}

/** 动画视图状态：累计时间与进行中的倾倒动画。 */
export interface WaterSortView {
  /** 累计时间（秒），驱动液面晃动。 */
  time: number
  /** 进行中的倾倒（null = 无）；t 为已进行毫秒。 */
  pour: { from: number; to: number; color: number; amount: number; t: number } | null
}

/** 新建动画视图。
 * @returns 空视图（无倾倒进行中）。 */
export function createWaterSortView(): WaterSortView {
  return { time: 0, pour: null }
}

/** 开始一段倾倒动画。
 * @param view - 动画视图。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @param color - 被倾倒的颜色编号。
 * @param amount - 移动层数。 */
export function startPourAnim(view: WaterSortView, from: number, to: number, color: number, amount: number): void {
  view.pour = { from, to, color, amount, t: 0 }
}

/** 推进动画时钟。
 * @param view - 动画视图。
 * @param dt - 帧间隔（秒）。
 * @returns 是否仍有倾倒动画进行中（true 时应继续逐帧重绘）。 */
export function tickWaterSortView(view: WaterSortView, dt: number): boolean {
  view.time += dt
  if (view.pour !== null) {
    view.pour.t += dt * 1000
    if (view.pour.t > POUR_MS + 140) view.pour = null
    return true
  }
  return false
}

/** 计算各试管矩形：≤5 根单排居中，更多则双排。
 * @param count - 试管数。
 * @returns 每根试管的矩形。 */
export function tubeRects(count: number): TubeRect[] {
  const rows = count <= 5 ? 1 : 2
  const perRow = rows === 1 ? count : Math.ceil(count / 2)
  const totalW = perRow * TUBE_W + (perRow - 1) * TUBE_GAP
  const x0 = (LOGICAL_W - totalW) / 2
  const y0 = rows === 1 ? 160 : 96
  const out: TubeRect[] = []
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / perRow)
    const col = i % perRow
    out.push({ x: x0 + col * (TUBE_W + TUBE_GAP), y: y0 + row * (TUBE_H + ROW_GAP), w: TUBE_W, h: TUBE_H })
  }
  return out
}

/** 命中测试：逻辑坐标落在哪根试管（±6px 容差）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param count - 试管数。
 * @returns 试管下标，未命中为 null。 */
export function tubeAt(x: number, y: number, count: number): number | null {
  const rects = tubeRects(count)
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i]!
    if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 10 && y <= r.y + r.h + 8) return i
  }
  return null
}

/** 画一根试管：玻璃管身 + 水层（选中时顶段上浮）。 */
function drawTube(
  ctx: CanvasRenderingContext2D, r: TubeRect, layers: readonly number[], index: number,
  selected: boolean, view: WaterSortView,
): void {
  const complete = isTubeComplete(layers)
  const run = selected ? topRun(layers) : 0
  const lift = selected ? 6 + Math.sin(view.time * 4) * 3 : 0
  const surface = Math.sin(view.time * 2.4 + index * 1.9) * 1.5

  // 管身玻璃底色。
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()

  // 内腔裁剪后画水层（自底向上）。
  const inset = 5
  const innerH = r.h - inset * 2
  const layerH = innerH / TUBE_CAPACITY
  ctx.save()
  roundRectPath(ctx, r.x + inset, r.y + inset, r.w - inset * 2, innerH, 10)
  ctx.clip()
  const bottomY = r.y + r.h - inset
  const floating = new Set<number>()
  if (selected) for (let i = layers.length - run; i < layers.length; i += 1) floating.add(i)
  for (let i = 0; i < layers.length; i += 1) {
    const isTop = i === layers.length - 1
    let y = bottomY - (i + 1) * layerH
    if (isTop) y += surface
    if (floating.has(i)) continue
    ctx.fillStyle = accent(layers[i]!)
    roundRectPath(ctx, r.x + inset + 1, y + 1, r.w - inset * 2 - 2, layerH - 1.5, 4)
    ctx.fill()
  }
  ctx.restore()

  // 选中顶段：在管口上方浮起，提示将被倒出的连续段。
  for (let i = 0; i < layers.length; i += 1) {
    if (!floating.has(i)) continue
    const y = bottomY - (i + 1) * layerH - lift
    ctx.globalAlpha = 0.92
    ctx.fillStyle = accent(layers[i]!)
    roundRectPath(ctx, r.x + inset + 1, y + 1, r.w - inset * 2 - 2, layerH - 1.5, 4)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // 玻璃描边（选中/完成高亮）与左侧高光。
  const edge = complete ? THEME.good : selected ? THEME.accents[0]! : THEME.panelEdge
  if (selected || complete) glow(ctx, edge, 10)
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 14)
  ctx.strokeStyle = edge
  ctx.lineWidth = selected ? 2.5 : 2
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fillRect(r.x + 7, r.y + 12, 3, r.h - 26)

  // 完成勾标。
  if (complete) {
    ctx.font = 'bold 17px system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, THEME.good, 8)
    ctx.fillStyle = THEME.good
    ctx.fillText('\u2713', r.x + r.w / 2, r.y - 10)
    noGlow(ctx)
  }
}

/** 倾倒水流弧线：从源管口到目标管口的二次贝塞尔，随进度淡出。 */
function drawPour(ctx: CanvasRenderingContext2D, pour: NonNullable<WaterSortView['pour']>, rects: TubeRect[]): void {
  const a = rects[pour.from]
  const b = rects[pour.to]
  if (a === undefined || b === undefined) return
  const p = Math.min(1, pour.t / POUR_MS)
  const sx = a.x + a.w / 2
  const sy = a.y - 4
  const tx = b.x + b.w / 2
  const ty = b.y - 4
  const color = accent(pour.color)
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo((sx + tx) / 2, Math.min(sy, ty) - 46, tx, ty)
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.35 * (1 - p * 0.6)
  ctx.lineWidth = 7
  ctx.stroke()
  ctx.globalAlpha = Math.min(1, 1.4 - p)
  glow(ctx, color, 8)
  ctx.lineWidth = 3
  ctx.stroke()
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/** 整帧绘制：背景、HUD、试管、动画、提示与遮罩。
 * @param ctx - 画布上下文（已应用逻辑坐标变换）。
 * @param w - 逻辑宽。
 * @param h - 逻辑高。
 * @param state - 只读局面。
 * @param view - 动画视图。
 * @param selected - 选中的源管下标（null = 未选）。
 * @param paused - 是否暂停（绘制暂停遮罩）。
 * @param toast - 顶部临时提示（null = 无）。 */
export function renderWaterSort(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: WaterSortState,
  view: WaterSortView, selected: number | null, paused: boolean, toast: string | null,
): void {
  drawBackground(ctx, w, h)

  // HUD。
  hudPair(ctx, 16, 32, '关卡 ', String(state.level) + '/' + String(LEVELS.length))
  hudPair(ctx, 130, 32, '步数 ', String(state.moves))
  hudPair(ctx, 220, 32, '参考 ', String(state.par))
  hudPair(ctx, w - 16, 32, '加管 ', state.extraUsed ? '已用' : 'A 可用', 'right')

  // 顶部提示条。
  if (toast !== null) {
    ctx.font = '600 13px system-ui, sans-serif'
    const tw = ctx.measureText(toast).width
    roundRectPath(ctx, w / 2 - tw / 2 - 12, 44, tw + 24, 24, 12)
    ctx.fillStyle = 'rgba(30,30,42,0.92)'
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText(toast, w / 2, 60)
  }

  // 试管。
  const rects = tubeRects(state.tubes.length)
  for (let i = 0; i < state.tubes.length; i += 1) {
    drawTube(ctx, rects[i]!, state.tubes[i]!, i, selected === i, view)
  }
  if (view.pour !== null) drawPour(ctx, view.pour, rects)

  // 死局提示。
  if (state.status === 'playing' && isDeadlocked(state.tubes)) {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, THEME.bad, 8)
    ctx.fillStyle = THEME.bad
    ctx.fillText('死局：没有可行倒法 · R 重开 / A 加管', w / 2, h - 18)
    noGlow(ctx)
  }

  if (state.status === 'won') {
    drawOverlay(ctx, w, h, '全部纯色！', '关卡 ' + String(state.level) + ' 完成', THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续')
  }
}
