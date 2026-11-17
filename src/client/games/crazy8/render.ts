/**
 * 疯狂八号渲染器：绿呢牌桌、对方牌背与张数、中央牌堆与弃牌顶（含
 * 宣告花色徽记）、己方手牌扇形（可出牌亮边、不可出牌压暗）、出 8 时
 * 的花色选择器、局分/牌堆余量 HUD 与胜负/暂停遮罩。全部为纯 canvas
 * 绘制，状态由 index.ts 传入（见 Crazy8View）；命中测试函数与绘制
 * 使用同一套布局几何，保证点哪判哪。
 */
import { canPlayCard, type Card, type Crazy8State, topCard } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽度 px。 */
export const W = 780
/** 逻辑画布高度 px。 */
export const H = 620
/** HUD 条高度（含在 H 内）。 */
export const HUD_H = 40
/** 牌面宽 px。 */
export const CARD_W = 64
/** 牌面高 px。 */
export const CARD_H = 90
/** 牌堆（摸牌堆）中心。 */
export const DRAW_X = W / 2 - 118
export const DRAW_Y = 222
/** 弃牌堆顶中心。 */
export const DISCARD_X = W / 2 + 62
export const DISCARD_Y = 222
/** 手牌扇形基线 y。 */
export const FAN_BASE_Y = 496
/** 花色选择器行 y。 */
export const SUIT_Y = 316

/** 花色记号（索引 0-3：黑桃/红心/方块/梅花）。 */
const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'] as const
/** 花色中文名。 */
const SUIT_NAMES = ['黑桃', '红心', '方块', '梅花'] as const
/** 牌点显示（1-13 → A..K）。 */
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
/** 牌桌呢面绿。 */
const FELT = '#26543f'
const FELT_EDGE = '#3d7a5c'

/** 一次渲染所需的全部状态。 */
export interface Crazy8View {
  state: Crazy8State
  paused: boolean
}

/** 花色显示颜色（红心/方块红，黑桃/梅花白）。 */
export function suitColor(suit: number): string {
  return suit === 1 || suit === 2 ? '#f46a80' : '#e8e8f2'
}

/**
 * 手牌扇形第 index 张（共 count 张）的几何：中心点与旋转角。
 * @param index - 手牌下标。
 * @param count - 手牌张数。
 */
export function fanSlot(index: number, count: number): { x: number, y: number, angle: number } {
  const spacing = count > 1 ? Math.min(58, 400 / (count - 1)) : 0
  const total = (count - 1) * spacing + CARD_W
  const t = index - (count - 1) / 2
  return {
    x: W / 2 - total / 2 + CARD_W / 2 + index * spacing,
    y: FAN_BASE_Y + t * t * 2.4,
    angle: t * Math.min(0.05, 0.34 / count),
  }
}

/**
 * 命中测试：手牌扇形（视觉最上层优先），返回手牌下标，未命中 -1。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param count - 手牌张数。
 */
export function hitHand(x: number, y: number, count: number): number {
  for (let i = count - 1; i >= 0; i -= 1) {
    const s = fanSlot(i, count)
    if (Math.abs(x - s.x) <= CARD_W / 2 + 3 && y >= s.y - CARD_H / 2 - 16 && y <= s.y + CARD_H / 2 + 4) return i
  }
  return -1
}

/**
 * 命中测试：摸牌堆（无牌可出时点击摸牌）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export function hitDrawPile(x: number, y: number): boolean {
  return Math.abs(x - DRAW_X) <= CARD_W / 2 + 12 && Math.abs(y - DRAW_Y) <= CARD_H / 2 + 14
}

/** 花色选择器第 suit 个按钮中心。 */
function suitButtonX(suit: number): number {
  const total = 4 * 62 + 3 * 22
  return W / 2 - total / 2 + 31 + suit * (62 + 22)
}

/**
 * 命中测试：花色选择器，返回花色 0-3，未命中 -1。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export function hitSuit(x: number, y: number): number {
  for (let s = 0; s < 4; s += 1) {
    if (Math.hypot(x - suitButtonX(s), y - SUIT_Y) <= 30) return s
  }
  return -1
}

/** 牌背花纹（中心 cx/cy、旋转 angle）。 */
function drawCardBack(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle = 0): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  roundRectPath(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 7)
  ctx.fillStyle = '#3b2f6e'
  ctx.fill()
  ctx.strokeStyle = '#7aa2f7'
  ctx.lineWidth = 1.5
  ctx.stroke()
  roundRectPath(ctx, -CARD_W / 2 + 6, -CARD_H / 2 + 6, CARD_W - 12, CARD_H - 12, 4)
  ctx.strokeStyle = 'rgba(122,162,247,0.4)'
  ctx.stroke()
  ctx.fillStyle = 'rgba(226,226,238,0.5)'
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('8', 0, 7)
  ctx.restore()
}

/**
 * 牌面（中心 cx/cy、旋转 angle）；highlight 时描亮边，dim 时压暗。
 */
export function drawCardFace(
  ctx: CanvasRenderingContext2D, card: Card, cx: number, cy: number,
  angle = 0, highlight = false, dim = false,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  roundRectPath(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 7)
  ctx.fillStyle = '#f2f2f6'
  ctx.fill()
  if (highlight) {
    glow(ctx, THEME.good, 12)
    ctx.strokeStyle = THEME.good
    ctx.lineWidth = 3
  } else {
    ctx.strokeStyle = '#b9b9c8'
    ctx.lineWidth = 1.5
  }
  ctx.stroke()
  noGlow(ctx)
  const label = RANKS[card.rank]!
  const glyph = SUITS[card.suit]!
  ctx.fillStyle = suitColor(card.suit)
  ctx.textAlign = 'left'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillText(label, -CARD_W / 2 + 6, -CARD_H / 2 + 18)
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText(glyph, -CARD_W / 2 + 6, -CARD_H / 2 + 33)
  ctx.font = 'bold 32px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(glyph, 0, 10)
  if (card.rank === 8) {
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2
    roundRectPath(ctx, -CARD_W / 2 + 3, -CARD_H / 2 + 3, CARD_W - 6, CARD_H - 6, 5)
    ctx.stroke()
  }
  if (dim) {
    roundRectPath(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 7)
    ctx.fillStyle = 'rgba(16,16,26,0.45)'
    ctx.fill()
  }
  ctx.restore()
}

/** 绿呢牌桌面板。 */
function drawTable(ctx: CanvasRenderingContext2D): void {
  roundRectPath(ctx, 22, HUD_H + 8, W - 44, H - HUD_H - 118, 18)
  ctx.fillStyle = FELT
  ctx.fill()
  ctx.strokeStyle = FELT_EDGE
  ctx.lineWidth = 2
  ctx.stroke()
}

/** 顶部 HUD：局分 / 局号 / 牌堆余量。 */
function drawHud(ctx: CanvasRenderingContext2D, state: Crazy8State): void {
  hudPair(ctx, 18, 26, '局分', '你 ' + state.wins[0] + ' : ' + state.wins[1] + ' AI')
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('第 ' + state.round + ' 局 · 3 局 2 胜', W / 2, 26)
  hudPair(ctx, W - 18, 26, '牌堆', String(state.drawPile.length), 'right')
}

/** 对手区：牌背排 + 张数 + 行动指示。 */
function drawOpponent(ctx: CanvasRenderingContext2D, state: Crazy8State): void {
  const count = state.hands[1]!.length
  const shown = Math.min(count, 13)
  const spacing = count > 1 ? Math.min(30, 340 / (count - 1)) : 0
  for (let i = 0; i < shown; i += 1) {
    drawCardBack(ctx, W / 2 - ((shown - 1) * spacing) / 2 + i * spacing, 96, 0)
  }
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('AI · ' + count + ' 张' + (state.turn === 1 && state.roundWinner === null ? ' · 思考中' : ''), W / 2, 162)
}

/** 中央区：摸牌堆、弃牌顶、宣告花色徽记。 */
function drawCenter(ctx: CanvasRenderingContext2D, state: Crazy8State): void {
  // 摸牌堆：叠影牌背 + 余量。
  for (let i = 2; i >= 0; i -= 1) {
    drawCardBack(ctx, DRAW_X + i * 3, DRAW_Y - i * 3, 0)
  }
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('牌堆 ' + state.drawPile.length, DRAW_X, DRAW_Y + CARD_H / 2 + 30)
  // 弃牌堆：底牌残影 + 顶牌。
  const top = topCard(state)
  drawCardFace(ctx, state.discard[state.discard.length - 2] ?? top, DISCARD_X - 6, DISCARD_Y + 4, -0.05)
  drawCardFace(ctx, top, DISCARD_X, DISCARD_Y, -0.03)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('弃牌顶', DISCARD_X, DISCARD_Y + CARD_H / 2 + 30)
  // 宣告花色徽记。
  const bx = DISCARD_X + CARD_W / 2 + 40
  ctx.beginPath()
  ctx.arc(bx, DISCARD_Y, 20, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(16,16,26,0.55)'
  ctx.fill()
  ctx.strokeStyle = suitColor(state.activeSuit)
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = suitColor(state.activeSuit)
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.fillText(SUITS[state.activeSuit]!, bx, DISCARD_Y + 7)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(SUIT_NAMES[state.activeSuit]!, bx, DISCARD_Y + 38)
}

/** 己方手牌扇形：可出牌亮边，其余压暗（仅在己方回合区分）。 */
function drawHand(ctx: CanvasRenderingContext2D, state: Crazy8State): void {
  const hand = state.hands[0]!
  const top = topCard(state)
  const mine = state.turn === 0 && state.roundWinner === null && !state.pendingSuitChoice
  for (let i = 0; i < hand.length; i += 1) {
    const s = fanSlot(i, hand.length)
    const playable = mine && (hand[i]!.rank === 8 || hand[i]!.suit === state.activeSuit || hand[i]!.rank === top.rank)
    drawCardFace(ctx, hand[i]!, s.x, s.y, s.angle, playable, mine && !playable)
  }
}

/** 出 8 的花色选择器（半透明遮板 + 四个花色按钮）。 */
function drawSuitChooser(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(13,13,20,0.6)'
  ctx.fillRect(0, 236, W, 172)
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText('出 8 · 宣告下一花色', W / 2, 274)
  for (let s = 0; s < 4; s += 1) {
    const bx = suitButtonX(s)
    ctx.beginPath()
    ctx.arc(bx, SUIT_Y, 28, 0, Math.PI * 2)
    ctx.fillStyle = '#f2f2f6'
    ctx.fill()
    ctx.strokeStyle = suitColor(s)
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = suitColor(s)
    ctx.font = 'bold 26px system-ui, sans-serif'
    ctx.fillText(SUITS[s]!, bx, SUIT_Y + 9)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(SUIT_NAMES[s] + ' ' + (s + 1), bx, SUIT_Y + 52)
  }
}

/** 提示行与回合指示。 */
function drawMessage(ctx: CanvasRenderingContext2D, state: Crazy8State): void {
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  if (state.roundWinner !== null) return
  if (state.turn === 0 && !state.pendingSuitChoice) {
    ctx.fillStyle = THEME.good
    ctx.fillText(hasPlayableText(state), W / 2, 392)
  } else {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(state.message, W / 2, 392)
  }
}

/** 己方回合提示文案（可出亮边牌 / 摸牌 / 放弃）。 */
function hasPlayableText(state: Crazy8State): string {
  const top = topCard(state)
  const playable = state.hands[0]!.some(c => canPlayCard(c, state.activeSuit, top.rank))
  const hint = state.drawnPlayable ? '摸到可出的牌：点击打出，或点牌堆放弃'
    : playable ? '轮到你了：点击亮边手牌出牌'
      : '无可出：点击牌堆摸一张'
  return hint + ' · ' + state.message
}

/**
 * 绘制完整一帧。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 设置）。
 * @param view - 状态与暂停标记。
 */
export function renderCrazy8(ctx: CanvasRenderingContext2D, view: Crazy8View): void {
  const state = view.state
  drawBackground(ctx, W, H)
  drawTable(ctx)
  drawHud(ctx, state)
  drawOpponent(ctx, state)
  drawCenter(ctx, state)
  drawHand(ctx, state)
  drawMessage(ctx, state)
  if (state.pendingSuitChoice) drawSuitChooser(ctx)
  if (view.paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.matchWinner !== null) {
    const won = state.matchWinner === 0
    drawOverlay(ctx, W, H, won ? '比赛胜利' : '比赛失利',
      (won ? '3 局 2 胜拿下！' : 'AI 先赢两局。') + ' 按 R 重开', won ? THEME.gold : THEME.bad)
  } else if (state.roundWinner !== null) {
    const title = state.roundWinner === -1 ? '本局平局' : state.roundWinner === 0 ? '本局胜利' : '本局失利'
    const color = state.roundWinner === 0 ? THEME.good : state.roundWinner === 1 ? THEME.bad : THEME.text
    drawOverlay(ctx, W, H, title, 'Enter 下一局 · R 重开', color)
  }
}
