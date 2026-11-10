/**
 * 天平谜题 Balance 画布渲染：中央支点 + 可倾斜横梁（按净力矩偏转）、
 * 挂点刻度（力臂 1-5）、底部砝码架（待放 / 已放）、左右力矩读数、关卡
 * HUD 与过关 / 暂停 overlay。渲染器无状态（倾斜角由调用方动画驱动），
 * 全部走 ../theme.ts 共享视觉件。
 */
import { SLOTS_PER_SIDE, SLOT_COUNT, slotArm, type BalanceState, occupants } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 640
export const LOGICAL_H = 400
/** 支点（横梁旋转中心）。 */
export const PIVOT_X = LOGICAL_W / 2
export const PIVOT_Y = 258
/** 相邻力臂刻度的像素间距。 */
export const ARM_PX = 50
/** 横梁最大倾角（弧度）。 */
export const MAX_TILT = 0.16
/** 砝码架区（画布底部）。 */
export const SHELF_Y = LOGICAL_H - 78
const WEIGHT_SIZE = 40
const GAP = 12

/** 由净力矩求目标倾角（钳制到 ±MAX_TILT）。 */
export function tiltForTorque(net: number): number {
  const clamped = Math.max(-1, Math.min(1, net / 60))
  return clamped * MAX_TILT
}

/** 挂点在横梁局部坐标（未旋转）中的 x：左负右正。 */
export function slotX(slot: number): number {
  const arm = slotArm(slot)
  return arm.side === 'L' ? -arm.distance * ARM_PX : arm.distance * ARM_PX
}

/** 挂点在画布坐标中的位置（忽略倾角，用于点击命中与刻度标注）。 */
export function slotPoint(slot: number): { x: number, y: number } {
  return { x: PIVOT_X + slotX(slot), y: PIVOT_Y - 6 }
}

/** 点击命中的挂点：命中半径 22px，超出返回 null。 */
export function slotAt(x: number, y: number): number | null {
  for (let s = 0; s < SLOT_COUNT; s += 1) {
    const p = slotPoint(s)
    const dx = x - p.x
    const dy = y - p.y
    if (dx * dx + dy * dy <= 22 * 22) return s
  }
  return null
}

/** 砝码架上第 wi 个待放砝码的矩形（砝码架只陈列未挂的）。 */
export function shelfRect(state: BalanceState, wi: number): { x: number, y: number, w: number, h: number } | null {
  const pending: number[] = []
  for (let i = 0; i < state.placement.length; i += 1) if (state.placement[i]! < 0) pending.push(i)
  const idx = pending.indexOf(wi)
  if (idx < 0) return null
  const total = pending.length
  const startX = (LOGICAL_W - (total * (WEIGHT_SIZE + GAP) - GAP)) / 2
  return { x: startX + idx * (WEIGHT_SIZE + GAP), y: SHELF_Y, w: WEIGHT_SIZE, h: WEIGHT_SIZE }
}

/** 点击命中的待放砝码下标，超出返回 null。 */
export function shelfWeightAt(state: BalanceState, x: number, y: number): number | null {
  for (let i = 0; i < state.weights.length; i += 1) {
    const r = shelfRect(state, i)
    if (r === null) continue
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i
  }
  return null
}

/** 已挂砝码的命中：返回其挂点下的砝码下标，超出返回 null（与 slotAt 同半径）。 */
export function placedWeightAt(state: BalanceState, x: number, y: number): number | null {
  const slot = slotAt(x, y)
  if (slot === null) return null
  const wi = occupants(state)[slot]!
  return wi >= 0 ? wi : null
}

function weightColor(value: number): string {
  return accent(value - 1)
}

/** 画一枚方形砝码：数值大字号居中。 */
function drawWeight(ctx: CanvasRenderingContext2D, cx: number, cy: number, value: number, selected: boolean): void {
  const color = weightColor(value)
  glow(ctx, color, selected ? 20 : 8)
  ctx.fillStyle = color
  roundRectPath(ctx, cx - WEIGHT_SIZE / 2, cy - WEIGHT_SIZE / 2, WEIGHT_SIZE, WEIGHT_SIZE, 8)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(13,13,20,0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#10101a'
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(value), cx, cy + 1)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 画一帧。
 * @param angle 当前横梁倾角（弧度，动画值，由 index 每帧逼近目标）。
 * @param selected 选中的待放砝码下标（高亮），null 无。
 * @param leftValue / rightValue 力矩读数。
 * @param paused 暂停 overlay。
 * @param winText 过关副标题，null 进行中。
 * @param toast 短暂提示文字，null 无。
 */
export function renderBalance(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: BalanceState,
  angle: number, selected: number | null, level: number,
  leftValue: number, rightValue: number, paused: boolean, winText: string | null, toast: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP, 21, '关卡 ', String(level) + ' / 5')
  hudPair(ctx, w / 2 - 8, 21, '已挂 ', String(state.weights.length - state.placement.filter(s => s < 0).length) + ' / ' + String(state.weights.length), 'right')
  hudPair(ctx, w - GAP, 21, '剩余 ', String(state.placement.filter(s => s < 0).length), 'right', THEME.gold)

  // 支点三角座。
  ctx.fillStyle = THEME.panel
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PIVOT_X, PIVOT_Y)
  ctx.lineTo(PIVOT_X - 26, PIVOT_Y + 60)
  ctx.lineTo(PIVOT_X + 26, PIVOT_Y + 60)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = THEME.panelEdge
  ctx.beginPath()
  ctx.arc(PIVOT_X, PIVOT_Y, 7, 0, Math.PI * 2)
  ctx.fill()

  // 横梁 + 挂点 + 已挂砝码（随梁旋转）。
  ctx.save()
  ctx.translate(PIVOT_X, PIVOT_Y)
  ctx.rotate(angle)
  ctx.strokeStyle = angle === 0 ? THEME.panelEdge : (angle > 0 ? accent(4) : accent(0))
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-(SLOTS_PER_SIDE * ARM_PX + 18), 0)
  ctx.lineTo(SLOTS_PER_SIDE * ARM_PX + 18, 0)
  ctx.stroke()
  const occ = occupants(state)
  for (let s = 0; s < SLOT_COUNT; s += 1) {
    const x = slotX(s)
    ctx.fillStyle = occ[s]! >= 0 ? THEME.text : THEME.panelEdge
    ctx.beginPath()
    ctx.arc(x, 0, occ[s]! >= 0 ? 4 : 3.5, 0, Math.PI * 2)
    ctx.fill()
    // 力臂数字刻度（梁上方）。
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(slotArm(s).distance), x, -10)
    const wi = occ[s]!
    if (wi >= 0) {
      // 挂绳 + 砝码垂在梁下。
      ctx.strokeStyle = 'rgba(226,226,238,0.4)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 16)
      ctx.stroke()
      drawWeight(ctx, x, 16 + WEIGHT_SIZE / 2 + 2, state.weights[wi]!, false)
    }
  }
  ctx.restore()

  // 力矩读数：横梁左右两侧。
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = leftValue === rightValue ? THEME.good : accent(0)
  glow(ctx, leftValue === rightValue ? THEME.good : accent(0), 8)
  ctx.fillText('左 ' + String(leftValue), PIVOT_X - SLOTS_PER_SIDE * ARM_PX - 16, PIVOT_Y - 44)
  ctx.textAlign = 'right'
  ctx.fillStyle = leftValue === rightValue ? THEME.good : accent(4)
  glow(ctx, leftValue === rightValue ? THEME.good : accent(4), 8)
  ctx.fillText('右 ' + String(rightValue), PIVOT_X + SLOTS_PER_SIDE * ARM_PX + 16, PIVOT_Y - 44)
  noGlow(ctx)
  if (leftValue === rightValue && winText === null) {
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.good
    ctx.fillText('力矩相等', PIVOT_X, PIVOT_Y - 64)
  }

  // 砝码架：底部面板 + 待放砝码。
  ctx.fillStyle = 'rgba(30,30,42,0.85)'
  roundRectPath(ctx, GAP, SHELF_Y - 18, LOGICAL_W - GAP * 2, WEIGHT_SIZE + 30, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('砝码架（点击选中 → 点击挂点）', GAP + 10, SHELF_Y - 5)
  for (let i = 0; i < state.weights.length; i += 1) {
    const r = shelfRect(state, i)
    if (r === null) continue
    drawWeight(ctx, r.x + r.w / 2, r.y + r.h / 2, state.weights[i]!, i === selected)
  }

  if (toast !== null) {
    ctx.textAlign = 'center'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 10)
    ctx.fillText(toast, w / 2, SHELF_Y + WEIGHT_SIZE + 22)
    noGlow(ctx)
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '平衡达成', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
