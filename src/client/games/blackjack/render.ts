/**
 * 21点渲染器：绿呢赌桌、牌靴与弃牌堆、庄家暗牌翻牌动画、筹码叠、
 * 操作按钮与下注档、结算浮字、HUD（牌靴余量/余额/局数）与破产遮罩。
 * 全部为纯 canvas 绘制，状态由 index.ts 传入（见 BlackjackView）。
 */
import { BET_STEPS, cardValue, handValue, type BlackjackState, type Card, type Hand } from './logic.ts'
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
/** 同手牌横向偏移 px。 */
export const CARD_GAP = 24
/** 两手间距 px。 */
export const HAND_GAP = 40
/** 庄家手牌区中心 y。 */
export const DEALER_Y = 96
/** 玩家手牌区 y（牌顶）。 */
export const PLAYER_Y = 330
/** 按钮行 y。 */
export const BTN_Y = H - 58
/** 单个按钮宽 px。 */
export const BTN_W = 128
/** 按钮高 px。 */
export const BTN_H = 40
/** 按钮间距 px。 */
export const BTN_GAP = 14
/** 下注档筹码行 y。 */
export const CHIP_Y = H - 106

/** 花色记号（索引 0-3：黑桃/红心/方块/梅花）。 */
const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'] as const
/** 牌点显示（1-13 → A..K）。 */
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

/** 结算浮字（age/maxAge 均为 ms）。 */
export interface FloatText {
  text: string
  x: number
  y: number
  color: string
  age: number
  maxAge: number
}

/** 一次渲染所需的全部状态。 */
export interface BlackjackView {
  state: BlackjackState
  /** 庄家暗牌翻开进度 0-1（1 为完全翻开）。 */
  flip: number
  floats: FloatText[]
  paused: boolean
  /** >0 时显示破产重发遮罩（秒）。 */
  rebuyFlash: number
}

/** 按钮定义（从左到右固定五档）。 */
export interface ButtonDef { id: 'hit' | 'stand' | 'double' | 'bet' | 'deal'; label: string; enabled: boolean }

const CHIP_COLORS: readonly [string, number][] = [
  ['#7aa2f7', 25],
  ['#9ece6a', 50],
  ['#bb9af7', 100],
  ['#e0af68', 250],
]

/** 第 i 个按钮的矩形。 */
export function buttonRect(id: ButtonDef['id'], index: number): { x: number, y: number, w: number, h: number } {
  const total = 5 * BTN_W + 4 * BTN_GAP
  const x = (W - total) / 2 + index * (BTN_W + BTN_GAP)
  return { x, y: BTN_Y, w: BTN_W, h: BTN_H }
}

/** 命中测试：返回按钮 id，未命中返回 null。 */
export function hitButton(x: number, y: number): ButtonDef['id'] | null {
  const ids: ButtonDef['id'][] = ['hit', 'stand', 'double', 'bet', 'deal']
  for (let i = 0; i < ids.length; i += 1) {
    const r = buttonRect(ids[i]!, i)
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return ids[i]!
  }
  return null
}

/** 命中测试：下注档筹码行，返回档索引，未命中返回 -1。 */
export function hitChip(x: number, y: number): number {
  const total = 4 * 56 + 3 * 18
  const x0 = (W - total) / 2
  for (let i = 0; i < 4; i += 1) {
    const cx = x0 + i * (56 + 18) + 28
    if (Math.hypot(x - cx, y - CHIP_Y) <= 26) return i
  }
  return -1
}

/** 第 i 手（共 n 手）的牌区中心 x。 */
export function handX(index: number, count: number): number {
  if (count <= 1) return W / 2
  const span = CARD_W + HAND_GAP
  const x0 = W / 2 - span / 2
  return x0 + index * span
}

/** 一手牌的起始 x（最左牌左缘）。 */
function handStartX(centerX: number, count: number): number {
  return centerX - (count * CARD_W + (count - 1) * CARD_GAP) / 2
}

/** 牌背花纹。 */
function drawCardBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number = CARD_W): void {
  const h = CARD_H
  roundRectPath(ctx, x, y, w, h, 7)
  ctx.fillStyle = '#3b2f6e'
  ctx.fill()
  ctx.strokeStyle = '#c9b8ff'
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (w > 14) {
    roundRectPath(ctx, x + 5, y + 5, w - 10, h - 10, 4)
    ctx.strokeStyle = 'rgba(201,184,255,0.5)'
    ctx.stroke()
  }
}

/** 牌面：点数 + 花色角标与中心花色。 */
function drawCardFace(ctx: CanvasRenderingContext2D, x: number, y: number, card: Card, w: number = CARD_W): void {
  const h = CARD_H
  roundRectPath(ctx, x, y, w, h, 7)
  ctx.fillStyle = '#f4f2ec'
  ctx.fill()
  ctx.strokeStyle = 'rgba(20,20,30,0.35)'
  ctx.lineWidth = 1
  ctx.stroke()
  if (w < 14) return
  const suit = SUITS[card.suit] ?? SUITS[0]!
  const red = card.suit === 1 || card.suit === 2
  const rank = RANKS[card.rank] ?? '?'
  ctx.fillStyle = red ? '#c33' : '#1c1c2a'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const scale = w / CARD_W
  ctx.font = 'bold ' + Math.round(16 * scale) + 'px system-ui, sans-serif'
  ctx.fillText(rank, x + 6, y + 5)
  ctx.font = Math.round(14 * scale) + 'px system-ui, sans-serif'
  ctx.fillText(suit, x + 7, y + 24)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = Math.round(26 * scale) + 'px system-ui, sans-serif'
  ctx.fillText(suit, x + w / 2, y + h * 0.62)
}

/**
 * 画一张牌；hole 为暗牌时按 flip 进度做横向翻转动画
 * （前半程收窄牌背、后半程展开牌面）。
 */
function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, card: Card | null, flip = 1): void {
  if (card === null) { drawCardBack(ctx, x, y); return }
  if (flip >= 1) { drawCardFace(ctx, x, y, card); return }
  // 翻转动画：前半程牌背横向收窄，后半程牌面展开。
  const t = flip <= 0.5 ? 1 - flip * 2 : (flip - 0.5) * 2
  const w = Math.max(CARD_W * t, 2)
  const bx = x + (CARD_W - w) / 2
  if (flip <= 0.5) drawCardBack(ctx, bx, y, w)
  else drawCardFace(ctx, bx, y, card, w)
}

/** 一枚筹码。 */
function drawChip(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.beginPath()
  ctx.ellipse(cx, cy, 16, 13, 0, 0, Math.PI * 2)
  ctx.fillStyle = color
  glow(ctx, color, 6)
  ctx.fill()
  noGlow(ctx)
  ctx.beginPath()
  ctx.ellipse(cx, cy, 9, 7, 0, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/** 金额 → 面额筹码叠（从大到小、从左到右堆叠）。 */
export function drawChipStack(ctx: CanvasRenderingContext2D, cx: number, baseY: number, amount: number): void {
  let rest = amount
  const parts: { color: string, count: number }[] = []
  for (let i = CHIP_COLORS.length - 1; i >= 0; i -= 1) {
    const [color, denom] = CHIP_COLORS[i]!
    const n = Math.floor(rest / denom)
    if (n > 0) { parts.push({ color, count: Math.min(n, 5) }); rest -= n * denom }
  }
  if (parts.length === 0) return
  const each = 34
  const x0 = cx - (parts.length - 1) * each / 2
  parts.forEach((p, i) => {
    const px = x0 + i * each
    for (let c = 0; c < p.count; c += 1) drawChip(ctx, px, baseY - c * 6, p.color)
  })
}

/** 点数徽标（如 17 / 软 17 / 爆!）。 */
function totalBadge(ctx: CanvasRenderingContext2D, x: number, y: number, hand: Hand, hidden: boolean): void {
  const v = handValue(hand.cards)
  const label = v.busted ? '爆 ' + v.total : (v.soft ? '软 ' : '') + v.total + (hidden ? '?' : '')
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  roundRectPath(ctx, x - 26, y - 12, 52, 24, 12)
  ctx.fillStyle = v.busted ? THEME.bad : 'rgba(13,13,20,0.72)'
  ctx.fill()
  ctx.fillStyle = v.busted ? '#fff' : THEME.text
  ctx.fillText(label, x, y + 1)
}

/** 主渲染入口。 */
export function renderBlackjack(ctx: CanvasRenderingContext2D, view: BlackjackView): void {
  const s = view.state
  drawBackground(ctx, W, H)

  // 绿呢赌桌。
  const feltX = 16, feltY = HUD_H + 8, feltW = W - 32, feltH = H - 168 - HUD_H
  roundRectPath(ctx, feltX, feltY, feltW, feltH, 26)
  const grad = ctx.createRadialGradient(W / 2, feltY + feltH / 2, 60, W / 2, feltY + feltH / 2, feltW * 0.7)
  grad.addColorStop(0, '#1e6b44')
  grad.addColorStop(1, '#0c3b24')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText('BLACKJACK PAYS 3 TO 2 · DEALER ' + (s.rule === 'S17' ? 'STANDS' : 'HITS') + ' ON SOFT 17', W / 2, feltY + 20)

  // 牌靴（右上）与弃牌堆（左上）。
  for (let i = 0; i < 3; i += 1) drawCardBack(ctx, feltX + feltW - 96 + i * 3, feltY + 34 - i * 2, 56)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('牌靴 ' + s.shoe.length, feltX + feltW - 68, feltY + 66)
  if (s.discard.length > 0) {
    for (let i = 0; i < Math.min(3, s.discard.length); i += 1) drawCardBack(ctx, feltX + 26 + i * 3, feltY + 34 - i * 2, 56)
    ctx.fillText('弃牌 ' + s.discard.length, feltX + 54, feltY + 66)
  }

  // 庄家手牌（暗牌按 flip 翻开）。
  if (s.dealer.length > 0) {
    const startX = handStartX(W / 2, s.dealer.length)
    for (let i = 0; i < s.dealer.length; i += 1) {
      // 第二张为暗牌：翻开前只画牌背，翻开过程按 flip 动画。
      const hole = i === 1 && (s.holeHidden || view.flip < 1)
      drawCard(ctx, startX + i * (CARD_W + CARD_GAP), DEALER_Y, s.dealer[i]!, hole ? (s.holeHidden ? 0 : view.flip) : 1)
    }
    const badgeHand: Hand = { cards: s.holeHidden ? [s.dealer[0]!] : s.dealer, bet: 0, doubled: false, fromSplit: false, stood: false, outcome: null, payout: 0 }
    totalBadge(ctx, W / 2, DEALER_Y + CARD_H + 18, badgeHand, s.holeHidden)
  }

  // 玩家各手 + 注码筹码 + 结算标记。
  for (let hi = 0; hi < s.hands.length; hi += 1) {
    const hand = s.hands[hi]!
    const cx = handX(hi, s.hands.length)
    const startX = handStartX(cx, hand.cards.length)
    for (let i = 0; i < hand.cards.length; i += 1) {
      drawCardFace(ctx, startX + i * (CARD_W + CARD_GAP), PLAYER_Y, hand.cards[i]!)
    }
    totalBadge(ctx, cx, PLAYER_Y - 22, hand, false)
    drawChipStack(ctx, cx, PLAYER_Y + CARD_H + 44, hand.bet)
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    if (hand.outcome === null) {
      if (hi === s.active && s.phase === 'player') {
        ctx.fillStyle = THEME.gold
        ctx.fillText('▶ 当前手 · 注 ' + hand.bet + (hand.doubled ? '（加倍）' : ''), cx, PLAYER_Y + CARD_H + 74)
      }
    } else {
      ctx.fillStyle = hand.outcome === 'lose' ? THEME.bad : hand.outcome === 'push' ? THEME.textMuted : hand.outcome === 'blackjack' ? THEME.gold : THEME.good
      const label = hand.outcome === 'blackjack' ? 'BLACKJACK 3:2' : hand.outcome === 'win' ? '胜 +' + (hand.payout - hand.bet) : hand.outcome === 'push' ? '平局' : '负 -' + hand.bet
      ctx.fillText(label, cx, PLAYER_Y + CARD_H + 74)
    }
  }

  // 下注档筹码行（可点击 / B 循环）。
  if (s.phase !== 'player') {
    const total = 4 * 56 + 3 * 18
    const x0 = (W - total) / 2
    for (let i = 0; i < 4; i += 1) {
      const cx = x0 + i * (56 + 18) + 28
      const [color, denom] = CHIP_COLORS[i]!
      drawChip(ctx, cx, CHIP_Y, color)
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.fillStyle = i === s.betStep ? '#fff' : 'rgba(255,255,255,0.6)'
      ctx.textAlign = 'center'
      ctx.fillText(String(denom), cx, CHIP_Y + 30)
      if (i === s.betStep) {
        ctx.beginPath()
        ctx.ellipse(cx, CHIP_Y, 20, 16.5, 0, 0, Math.PI * 2)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  // 按钮行。
  const bet = BET_STEPS[s.betStep]!
  const buttons: ButtonDef[] = [
    { id: 'hit', label: '要牌 H', enabled: s.phase === 'player' },
    { id: 'stand', label: '停牌 S', enabled: s.phase === 'player' },
    { id: 'double', label: '加倍 D', enabled: s.phase === 'player' && s.hands[s.active]?.cards.length === 2 && s.bankroll >= bet },
    { id: 'bet', label: '下注 ' + bet + ' B', enabled: s.phase !== 'player' },
    { id: 'deal', label: s.phase === 'player' ? '···' : '发牌 Enter', enabled: s.phase !== 'player' && s.bankroll >= bet },
  ]
  buttons.forEach((b, i) => {
    const r = buttonRect(b.id, i)
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
    ctx.fillStyle = b.enabled ? 'rgba(122,162,247,0.16)' : 'rgba(122,162,247,0.05)'
    ctx.fill()
    ctx.strokeStyle = b.enabled ? THEME.accents[0]! : 'rgba(122,162,247,0.25)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = b.enabled ? THEME.text : THEME.textMuted
    ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 + 1)
  })

  // HUD。
  hudPair(ctx, 24, 24, '余额 ', String(s.bankroll), 'left', THEME.gold)
  hudPair(ctx, 170, 24, '局 ', String(s.round))
  hudPair(ctx, 250, 24, '重洗 ', String(s.reshuffles))
  hudPair(ctx, W - 24, 24, s.message, '', 'right')

  // 结算浮字。
  for (const f of view.floats) {
    const alpha = 1 - f.age / f.maxAge
    if (alpha <= 0) continue
    ctx.globalAlpha = alpha
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = f.color
    glow(ctx, f.color, 8)
    ctx.fillText(f.text, f.x, f.y - f.age * 0.03)
    noGlow(ctx)
    ctx.globalAlpha = 1
  }

  if (view.rebuyFlash > 0) {
    drawOverlay(ctx, W, H, '破产重发', '补发 500 筹码 · Enter 续局', THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续 · R 重开', THEME.text)
  }
}
