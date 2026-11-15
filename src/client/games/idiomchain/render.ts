/**
 * 成语接龙 IdiomChain 画布渲染：卷轴式上一成语展示（尾字红字高亮）、
 * AI 出牌行（滑入动画）、6 张手牌候选（成语+简注，可接者亮边发光）、
 * 跳过按钮、链长/分数/局数/倒计时 HUD、暂停与胜负覆盖层。共享 theme
 * 视觉件；本模块无状态，全部命中检测为纯函数。
 */
import type { IdiomEntry, LinkKind } from './logic.ts'
import { ROUNDS, TURN_MS } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 640
const HUD_H = 30

/** 卷轴展示区。 */
const SCROLL = { x: 60, y: 44, w: 360, h: 150 }
const ROLL_H = 14
const IDIOM_Y = 112
const MEANING_Y = 150
const AI_LINE_Y = 178

/** 手牌区：2 行 × 3 列。 */
const CARD_W = 140
const CARD_H = 92
const CARD_GAP_X = 12
const CARD_GAP_Y = 12
const HAND_Y0 = 210
const HAND_X0 = (LOGICAL_W - (3 * CARD_W + 2 * CARD_GAP_X)) / 2

const SKIP_BTN = { x: LOGICAL_W / 2 - 70, y: LOGICAL_H - 52, w: 140, h: 32 }
const FOOTER_Y = LOGICAL_H - 8

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface IdiomChainView {
  /** 当前局（1..ROUNDS）。 */
  round: number
  /** 当前链长。 */
  chainLen: number
  /** 链尾成语（卷轴大字展示）。 */
  tail: IdiomEntry
  /** 手牌候选。 */
  hand: IdiomEntry[]
  /** 手牌每张的接法（null 为不可接）。 */
  playable: Array<LinkKind | null>
  playerScore: number
  aiScore: number
  /** 本回合剩余毫秒。 */
  remainingMs: number
  /** AI 提示行（如「AI：一马当先 +20」），空串无。 */
  aiLine: string
  /** AI 行出现的时间戳（毫秒，滑入动画用）。 */
  aiAtMs: number
  /** 临时提示（如「这张接不上」）。 */
  toast: string
  phase: 'playing' | 'over'
  /** 玩家按 P 的手动暂停。 */
  userPaused: boolean
  /** 面板驱动的暂停（实例未运行）。 */
  paused: boolean
}

/** 第 i 张手牌的矩形。 */
export function cardRect(i: number): { x: number, y: number, w: number, h: number } {
  const col = i % 3
  const row = Math.floor(i / 3)
  return { x: HAND_X0 + col * (CARD_W + CARD_GAP_X), y: HAND_Y0 + row * (CARD_H + CARD_GAP_Y), w: CARD_W, h: CARD_H }
}

/** 命中检测：返回点击到的手牌下标，未命中返回 null。 */
export function cardAt(x: number, y: number): number | null {
  for (let i = 0; i < 6; i += 1) {
    const r = cardRect(i)
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i
  }
  return null
}

/** 跳过按钮命中。 */
export function skipButtonAt(x: number, y: number): boolean {
  return x >= SKIP_BTN.x && x <= SKIP_BTN.x + SKIP_BTN.w
    && y >= SKIP_BTN.y && y <= SKIP_BTN.y + SKIP_BTN.h
}

/** 卷轴底板：两根卷轴辊 + 泛黄纸面。 */
function drawScroll(ctx: CanvasRenderingContext2D): void {
  // 纸面。
  glow(ctx, 'rgba(224,175,104,0.35)', 14)
  roundRectPath(ctx, SCROLL.x, SCROLL.y, SCROLL.w, SCROLL.h, 8)
  ctx.fillStyle = '#efe3c8'
  ctx.fill()
  noGlow(ctx)
  // 上下卷轴辊。
  for (const ry of [SCROLL.y - ROLL_H / 2, SCROLL.y + SCROLL.h - ROLL_H / 2]) {
    const grad = ctx.createLinearGradient(SCROLL.x, ry, SCROLL.x, ry + ROLL_H)
    grad.addColorStop(0, '#8a6a3f')
    grad.addColorStop(0.5, '#5c452a')
    grad.addColorStop(1, '#8a6a3f')
    ctx.fillStyle = grad
    roundRectPath(ctx, SCROLL.x - 8, ry, SCROLL.w + 16, ROLL_H, ROLL_H / 2)
    ctx.fill()
  }
}

/** 卷轴上的成语大字：四字横排，尾字红色高亮发光。 */
function drawTailIdiom(ctx: CanvasRenderingContext2D, tail: IdiomEntry): void {
  const chars = [...tail.idiom]
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const step = 78
  const x0 = LOGICAL_W / 2 - (chars.length - 1) * step / 2
  chars.forEach((ch, i) => {
    const last = i === chars.length - 1
    if (last) glow(ctx, THEME.bad, 14)
    ctx.fillStyle = last ? '#d43a4f' : '#3a3226'
    ctx.fillText(ch, x0 + i * step, IDIOM_Y)
    noGlow(ctx)
  })
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(58,50,38,0.7)'
  ctx.fillText(tail.meaning, LOGICAL_W / 2, MEANING_Y)
}

/** AI 行：滑入 + 轻微上浮的动画（出现后 600ms 内）。 */
function drawAiLine(ctx: CanvasRenderingContext2D, view: IdiomChainView, nowMs: number): void {
  if (view.aiLine === '') return
  const age = Math.max(0, nowMs - view.aiAtMs)
  const t = Math.min(1, age / 600)
  const ease = 1 - (1 - t) * (1 - t)
  ctx.globalAlpha = t < 1 ? ease : 1
  const dx = (1 - ease) * 40
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.accents[5]!
  ctx.fillText(view.aiLine, LOGICAL_W / 2 + dx, AI_LINE_Y)
  ctx.globalAlpha = 1
}

/** 一张手牌：可接亮边发光（正接绿 / 同音金），不可接灰暗。 */
function drawCard(ctx: CanvasRenderingContext2D, i: number, entry: IdiomEntry, playable: LinkKind | null): void {
  const r = cardRect(i)
  const color = playable === 'exact' ? THEME.good : playable === 'homophone' ? THEME.gold : THEME.panelEdge
  if (playable !== null) glow(ctx, color, 12)
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.fillStyle = playable !== null ? THEME.panel : '#191922'
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = color
  ctx.lineWidth = playable !== null ? 2.5 : 1
  ctx.stroke()
  // 序号角标。
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(String(i + 1), r.x + 8, r.y + 16)
  // 成语。
  ctx.textAlign = 'center'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillStyle = playable !== null ? THEME.text : THEME.textMuted
  ctx.fillText(entry.idiom, r.x + r.w / 2, r.y + 42)
  // 简注（超长截断到 9 字）。
  const short = entry.meaning.length > 9 ? entry.meaning.slice(0, 9) + '…' : entry.meaning
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(short, r.x + r.w / 2, r.y + 64)
  if (playable === 'homophone') {
    ctx.fillStyle = THEME.gold
    ctx.fillText('同音可接', r.x + r.w / 2, r.y + 82)
  } else if (playable === 'exact') {
    ctx.fillStyle = THEME.good
    ctx.fillText('可接龙', r.x + r.w / 2, r.y + 82)
  }
}

/** 跳过按钮。 */
function drawSkipButton(ctx: CanvasRenderingContext2D): void {
  roundRectPath(ctx, SKIP_BTN.x, SKIP_BTN.y, SKIP_BTN.w, SKIP_BTN.h, 16)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('跳过 S（AI +5）', SKIP_BTN.x + SKIP_BTN.w / 2, SKIP_BTN.y + 21)
}

/** 倒计时进度条（卷轴下沿与 AI 行之间）。 */
function drawTimerBar(ctx: CanvasRenderingContext2D, remainingMs: number): void {
  const ratio = Math.max(0, Math.min(1, remainingMs / TURN_MS))
  const w = SCROLL.w * ratio
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(SCROLL.x, AI_LINE_Y + 10, SCROLL.w, 4)
  ctx.fillStyle = ratio > 0.3 ? THEME.accents[0]! : THEME.bad
  glow(ctx, ratio > 0.3 ? THEME.accents[0]! : THEME.bad, 6)
  ctx.fillRect(SCROLL.x, AI_LINE_Y + 10, w, 4)
  noGlow(ctx)
}

/**
 * 整帧绘制。
 * @param ctx - 画布上下文。
 * @param view - 当前视图状态。
 * @param nowMs - 当前时间戳（毫秒，动画相位用）。
 */
export function renderIdiomChain(ctx: CanvasRenderingContext2D, view: IdiomChainView, nowMs: number): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD。
  hudPair(ctx, 12, HUD_H, '局', view.round + '/' + ROUNDS)
  hudPair(ctx, 86, HUD_H, '链长', String(view.chainLen))
  hudPair(ctx, LOGICAL_W - 12, HUD_H, 'AI', String(view.aiScore), 'right', THEME.accents[5]!)
  hudPair(ctx, LOGICAL_W - 96, HUD_H, '我方', String(view.playerScore), 'right', THEME.good)
  const secs = Math.max(0, Math.ceil(view.remainingMs / 1000))
  hudPair(ctx, LOGICAL_W / 2, HUD_H, '倒计时', secs + 's', 'center', secs <= 5 ? THEME.bad : THEME.text)

  drawScroll(ctx)
  drawTailIdiom(ctx, view.tail)
  drawAiLine(ctx, view, nowMs)
  drawTimerBar(ctx, view.remainingMs)

  view.hand.forEach((entry, i) => drawCard(ctx, i, entry, view.playable[i] ?? null))
  drawSkipButton(ctx)

  if (view.toast !== '') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.bad
    ctx.fillText(view.toast, LOGICAL_W / 2, HAND_Y0 + 2 * CARD_H + CARD_GAP_Y + 24)
  }
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点击候选 / 数字键 1-6 出牌', LOGICAL_W / 2, FOOTER_Y)

  if (view.phase === 'over') {
    const playerWin = view.playerScore > view.aiScore
    const draw = view.playerScore === view.aiScore
    const title = draw ? '平局' : playerWin ? '胜利' : '惜败'
    const sub = '总分 ' + view.playerScore + ' : ' + view.aiScore + ' · 按 R 重开'
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, title, sub, draw ? THEME.text : playerWin ? THEME.good : THEME.bad)
    return
  }
  if (view.userPaused || view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续', THEME.text)
  }
}
