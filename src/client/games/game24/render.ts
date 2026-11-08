/**
 * 24点渲染器：目标 24 大字、四张初始牌扇形排列（合并出的中间结果
 * 牌新起一行）、运算符按钮、本局历史表达式、无解提示、连胜 HUD 与
 * 获胜/暂停遮罩。全部为纯 canvas 绘制，状态由 index.ts 传入
 * （见 Game24View）。
 */
import { OPS, OP_SYMBOL, hasSolution, type Game24Card, type Game24State, type Op } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽度 px。 */
export const W = 780
/** 逻辑画布高度 px。 */
export const H = 620
/** HUD 条高度（含在 H 内）。 */
export const HUD_H = 40
/** 牌面宽 px。 */
export const CARD_W = 92
/** 牌面高 px。 */
export const CARD_H = 128
/** 初始牌扇形相邻槽位间距 px。 */
const FAN_SPAN = 118
/** 初始牌行中心 y。 */
const FAN_Y = 268
/** 中间结果牌行中心 y。 */
const MERGE_Y = 418
/** 中间结果牌间距 px。 */
const MERGE_SPAN = CARD_W + 26
/** 目标 24 大字基线 y。 */
const TARGET_Y = 116
/** 运算符按钮行 y。 */
export const OP_Y = 508
/** 运算符按钮宽 px。 */
export const OP_W = 64
/** 运算符按钮高 px。 */
export const OP_H = 44
/** 运算符按钮间距 px。 */
const OP_GAP = 22
/** 功能按钮行 y。 */
export const ACT_Y = 570
/** 功能按钮宽 px。 */
const ACT_W = 122
/** 功能按钮高 px。 */
const ACT_H = 32
/** 功能按钮间距 px。 */
const ACT_GAP = 16
/** 历史表达式列右缘 x。 */
const HISTORY_X = W - 36

/** 一张牌的摆放位置（rot 为弧度，扇形微转）。 */
export interface CardSlot {
  x: number
  y: number
  rot: number
}

/**
 * 计算当前牌面布局：初始牌（id < 4）扇形一行（边缘下垂微转），
 * 中间结果牌（id ≥ 4）新起一行水平居中。
 * @param cards - 当前牌面。
 * @returns 牌 id → 摆放位置。
 */
export function layoutCards(cards: Game24Card[]): Map<number, CardSlot> {
  const slots = new Map<number, CardSlot>()
  const orig = cards.filter(c => c.id < 4)
  const merged = cards.filter(c => c.id >= 4)
  const n = orig.length
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
    slots.set(orig[i]!.id, {
      x: W / 2 + (t * FAN_SPAN * (n - 1)) / 2,
      y: FAN_Y + t * t * 20,
      rot: t * 0.12,
    })
  }
  const x0 = W / 2 - ((merged.length - 1) * MERGE_SPAN) / 2
  merged.forEach((c, i) => slots.set(c.id, { x: x0 + i * MERGE_SPAN, y: MERGE_Y, rot: 0 }))
  return slots
}

/**
 * 命中测试：牌面点击，返回 cards 下标。
 * @param cards - 当前牌面。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 命中牌下标；未命中为 -1。
 */
export function hitCard(cards: Game24Card[], x: number, y: number): number {
  const slots = layoutCards(cards)
  for (let i = 0; i < cards.length; i += 1) {
    const s = slots.get(cards[i]!.id)
    if (s === undefined) continue
    if (Math.abs(x - s.x) <= CARD_W / 2 + 8 && Math.abs(y - s.y) <= CARD_H / 2 + 8) return i
  }
  return -1
}

/** 第 i 个运算符按钮的矩形。 */
export function opRect(index: number): { x: number, y: number, w: number, h: number } {
  const total = OPS.length * OP_W + (OPS.length - 1) * OP_GAP
  const x0 = (W - total) / 2
  return { x: x0 + index * (OP_W + OP_GAP), y: OP_Y, w: OP_W, h: OP_H }
}

/**
 * 命中测试：运算符按钮。
 * @returns 命中的运算符；未命中为 null。
 */
export function hitOp(x: number, y: number): Op | null {
  for (let i = 0; i < OPS.length; i += 1) {
    const r = opRect(i)
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return OPS[i]!
  }
  return null
}

/** 功能按钮 id：撤回 / 提示 / 换一局。 */
export type Game24Action = 'undo' | 'hint' | 'new'

/** 第 i 个功能按钮的矩形。 */
export function actionRect(index: number): { x: number, y: number, w: number, h: number } {
  const total = 3 * ACT_W + 2 * ACT_GAP
  const x0 = (W - total) / 2
  return { x: x0 + index * (ACT_W + ACT_GAP), y: ACT_Y, w: ACT_W, h: ACT_H }
}

/**
 * 命中测试：功能按钮。
 * @returns 命中的按钮 id；未命中为 null。
 */
export function hitAction(x: number, y: number): Game24Action | null {
  const ids: Game24Action[] = ['undo', 'hint', 'new']
  for (let i = 0; i < ids.length; i += 1) {
    const r = actionRect(i)
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return ids[i]!
  }
  return null
}

/** 一次渲染所需的全部状态。 */
export interface Game24View {
  state: Game24State
  paused: boolean
  /** 提示闪现剩余秒数（>0 时高亮 hintIds 并显示 hintText）。 */
  hintFlash: number
  /** 提示涉及的两张牌 id。 */
  hintIds: number[]
  /** 提示文本（如 "8 ÷ 3"）。 */
  hintText: string
}

/** 单张牌：深色面板 + 大数值；选中金框发光，提示高亮呼吸描边。 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  card: Game24Card,
  slot: CardSlot,
  selected: boolean,
  hintPulse: number,
): void {
  ctx.save()
  ctx.translate(slot.x, slot.y)
  ctx.rotate(slot.rot)
  roundRectPath(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12)
  ctx.fillStyle = card.id < 4 ? '#23232f' : '#282040'
  if (selected) glow(ctx, THEME.gold, 16)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = selected ? THEME.gold : card.id < 4 ? THEME.panelEdge : accent(1)
  ctx.lineWidth = selected ? 2.5 : 1.5
  ctx.stroke()
  if (hintPulse > 0) {
    ctx.globalAlpha = hintPulse
    roundRectPath(ctx, -CARD_W / 2 - 3, -CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, 14)
    ctx.strokeStyle = accent(0)
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 38px system-ui, sans-serif'
  ctx.fillStyle = selected ? THEME.gold : THEME.text
  ctx.fillText(String(card.value), 0, -10)
  if (card.id >= 4) {
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(card.label, 0, CARD_H / 2 - 16)
  }
  ctx.restore()
}

/** 主渲染入口。 */
export function renderGame24(ctx: CanvasRenderingContext2D, view: Game24View): void {
  const s = view.state
  drawBackground(ctx, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 目标 24 大字。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('目 标', W / 2, 74)
  ctx.font = 'bold 78px system-ui, sans-serif'
  ctx.fillStyle = THEME.gold
  glow(ctx, THEME.gold, 20)
  ctx.fillText('24', W / 2, TARGET_Y)
  noGlow(ctx)

  // 无解提示：当前牌面（多于一张）已凑不出 24。
  const stuck = s.status === 'playing' && s.cards.length > 1 && !hasSolution(s.cards.map(c => c.value))
  if (stuck) {
    const label = s.cards.length === 4 && !s.dealSolvable ? '本局无解 · N 换一局（-20 分）' : '当前牌面无解 · U 撤回 / N 换一局'
    ctx.font = '700 14px system-ui, sans-serif'
    const w = ctx.measureText(label).width + 28
    roundRectPath(ctx, W / 2 - w / 2, 160, w, 28, 14)
    ctx.fillStyle = 'rgba(247,118,142,0.16)'
    ctx.fill()
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = THEME.bad
    ctx.fillText(label, W / 2, 175)
  }

  // 牌面：初始牌扇形 + 中间结果牌新行。
  const slots = layoutCards(s.cards)
  const pulse = view.hintFlash > 0 ? 0.5 + 0.5 * Math.sin(view.hintFlash * 9) : 0
  s.cards.forEach((card, i) => {
    const slot = slots.get(card.id)
    if (slot === undefined) return
    const selected = s.selected.includes(i)
    const hinted = view.hintFlash > 0 && view.hintIds.includes(card.id)
    drawCard(ctx, card, slot, selected, hinted ? pulse : 0)
  })

  // 已选预览（a ? b）与提示文本。
  ctx.font = '600 14px system-ui, sans-serif'
  if (s.selected.length === 2 && s.status === 'playing') {
    const a = s.cards[s.selected[0]!]
    const b = s.cards[s.selected[1]!]
    if (a !== undefined && b !== undefined) {
      ctx.fillStyle = THEME.text
      ctx.fillText(a.value + '  ?  ' + b.value, W / 2, OP_Y - 38)
    }
  }
  if (view.hintFlash > 0) {
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillStyle = accent(0)
    ctx.fillText('提示：' + view.hintText + '（本局降为 25 分）', W / 2, OP_Y - 18)
  }

  // 运算符按钮行。
  const twoSelected = s.selected.length === 2 && s.status === 'playing'
  OPS.forEach((op, i) => {
    const r = opRect(i)
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
    ctx.fillStyle = twoSelected ? 'rgba(122,162,247,0.18)' : 'rgba(122,162,247,0.05)'
    ctx.fill()
    ctx.strokeStyle = twoSelected ? THEME.accents[0]! : 'rgba(122,162,247,0.25)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.fillStyle = twoSelected ? THEME.text : THEME.textMuted
    ctx.fillText(OP_SYMBOL[op], r.x + r.w / 2, r.y + r.h / 2 + 1)
  })

  // 功能按钮行：撤回 / 提示 / 换一局。
  const solvableNow = s.status === 'playing' && hasSolution(s.cards.map(c => c.value))
  const actions: { id: Game24Action, label: string, enabled: boolean }[] = [
    { id: 'undo', label: '撤回 U', enabled: s.status === 'playing' && s.undoStack.length > 0 },
    { id: 'hint', label: '提示 H', enabled: solvableNow },
    { id: 'new', label: s.status === 'won' ? '下一局 N' : '换一局 N', enabled: true },
  ]
  actions.forEach((a, i) => {
    const r = actionRect(i)
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 9)
    ctx.fillStyle = a.enabled ? 'rgba(187,154,247,0.14)' : 'rgba(187,154,247,0.05)'
    ctx.fill()
    ctx.strokeStyle = a.enabled ? accent(1) : 'rgba(187,154,247,0.25)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.fillStyle = a.enabled ? THEME.text : THEME.textMuted
    ctx.fillText(a.label, r.x + r.w / 2, r.y + r.h / 2 + 1)
  })

  // 本局历史表达式（右列）。
  ctx.textAlign = 'right'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('本局历史', HISTORY_X, 152)
  s.history.forEach((line, i) => {
    ctx.fillStyle = i === s.history.length - 1 ? THEME.text : THEME.textMuted
    ctx.fillText(line, HISTORY_X, 176 + i * 24)
  })

  // HUD：分数 / 连胜 / 局数 / 消息。
  hudPair(ctx, 24, 24, '分数 ', String(s.score), 'left', THEME.gold)
  hudPair(ctx, 122, 24, '连胜 ', String(s.streak))
  hudPair(ctx, 212, 24, '局 ', String(s.deal + 1))
  hudPair(ctx, W - 24, 24, s.message, '', 'right')

  if (s.status === 'won') {
    drawOverlay(ctx, W, H, '达成 24', '本局 + ' + s.lastGain + ' 分 · N 下一局 · R 重开', THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续 · R 重开', THEME.text)
  }
}
