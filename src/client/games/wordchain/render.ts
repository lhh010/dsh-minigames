/**
 * 词语接龙 WordChain 渲染层：卷轴风棋盘——上方卷轴展示当前链尾词大字
 * （尾字红显 + 光晕）、卷轴内附最近历史词；AI 出词从右侧滑入；下方 5
 * 张手牌卡（可接亮边发光、不可接灰暗）；HUD 展示链长/分数/回合；结束
 * 或暂停盖共享 overlay。纯 canvas 绘制，无 DOM 状态。
 */
import { ROUNDS, type LinkKind } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 680
export const LOGICAL_H = 480

/** 手牌卡布局常量（点击命中与绘制共用）。 */
const CARD_W = 116
const CARD_H = 88
const CARD_GAP = 10
const CARD_Y = 264
const HAND_X0 = (LOGICAL_W - (CARD_W * 5 + CARD_GAP * 4)) / 2
/** 跳过按钮布局常量。 */
const SKIP_W = 230
const SKIP_H = 38
const SKIP_Y = 368
const SKIP_X = (LOGICAL_W - SKIP_W) / 2

/** 卷轴区域。 */
const SCROLL = { x: 80, y: 52, w: 520, h: 168 }

/** 渲染层需要的只读视图（index 层从 MatchState 投影出来）。 */
export interface WordChainView {
  /** 当前回合（1..ROUNDS）。 */
  round: number
  /** 链长（词数）。 */
  chainLen: number
  /** 当前链尾词（终局后为空串）。 */
  tailWord: string
  /** 链尾词尾字拼音（接龙提示用）。 */
  tailPy: string
  /** 链尾之前的最近几个词（历史小字）。 */
  history: string[]
  /** 手牌词（≤5 张，出掉即短）。 */
  hand: string[]
  /** 每张手牌的尾字拼音（卡面小字）。 */
  handTailPy: string[]
  /** 每张手牌的可接性（exact/homophone/不可接 null）。 */
  playable: Array<LinkKind | null>
  playerScore: number
  aiScore: number
  /** AI 最近一步的提示行（滑入动画源）。 */
  aiLine: string
  /** aiLine 出现的时间戳（performance.now，毫秒）。 */
  aiAtMs: number
  /** 顶部轻提示（跳过/重起等）。 */
  toast: string
  phase: 'playing' | 'over'
  /** 用户按 P 自暂停。 */
  userPaused: boolean
  /** 面板级暂停（未 start / 已 pause）。 */
  paused: boolean
}

/** 手牌卡命中：返回下标，未命中返回 null。 */
export function cardAt(x: number, y: number): number | null {
  if (y < CARD_Y || y > CARD_Y + CARD_H) return null
  for (let i = 0; i < 5; i += 1) {
    const cx = HAND_X0 + i * (CARD_W + CARD_GAP)
    if (x >= cx && x <= cx + CARD_W) return i
  }
  return null
}

/** 跳过按钮命中。 */
export function skipButtonAt(x: number, y: number): boolean {
  return x >= SKIP_X && x <= SKIP_X + SKIP_W && y >= SKIP_Y && y <= SKIP_Y + SKIP_H
}

/** 卷轴上下两根卷杆（木质滚轴感）。 */
function drawRollers(ctx: CanvasRenderingContext2D): void {
  for (const y of [SCROLL.y - 14, SCROLL.y + SCROLL.h - 4]) {
    roundRectPath(ctx, SCROLL.x - 16, y, SCROLL.w + 32, 18, 9)
    ctx.fillStyle = '#3b3350'
    ctx.fill()
    roundRectPath(ctx, SCROLL.x - 16, y, SCROLL.w + 32, 6, 3)
    ctx.fillStyle = THEME.panelEdge
    ctx.fill()
    // 轴头小圆钮。
    for (const cx of [SCROLL.x - 10, SCROLL.x + SCROLL.w + 10]) {
      ctx.beginPath()
      ctx.arc(cx, y + 9, 5, 0, Math.PI * 2)
      ctx.fillStyle = THEME.gold
      glow(ctx, THEME.gold, 5)
      ctx.fill()
      noGlow(ctx)
    }
  }
}

/** 卷轴主体：历史小字 + 当前词大字（尾字红显）+ 接龙提示。 */
function drawScroll(ctx: CanvasRenderingContext2D, view: WordChainView): void {
  drawRollers(ctx)
  roundRectPath(ctx, SCROLL.x, SCROLL.y, SCROLL.w, SCROLL.h, 10)
  ctx.fillStyle = 'rgba(30,30,42,0.92)'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.textAlign = 'center'
  if (view.history.length > 0) {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    const shown = view.history.slice(-4).join(' → ')
    ctx.fillText(shown, LOGICAL_W / 2, SCROLL.y + 30)
  }

  const word = view.tailWord
  if (word !== '') {
    const chars = [...word]
    const size = 58
    const step = chars.length >= 3 ? 64 : 76
    const startX = LOGICAL_W / 2 - ((chars.length - 1) * step) / 2
    ctx.font = 'bold ' + size + 'px "KaiTi", "STKaiti", system-ui, sans-serif'
    chars.forEach((ch, i) => {
      const last = i === chars.length - 1
      if (last) {
        ctx.fillStyle = THEME.bad
        glow(ctx, THEME.bad, 14)
      } else {
        ctx.fillStyle = THEME.text
        noGlow(ctx)
      }
      ctx.fillText(ch, startX + i * step, SCROLL.y + 106)
    })
    noGlow(ctx)
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('下一词开头同音「' + view.tailPy + '」 · 同字额外加分', LOGICAL_W / 2, SCROLL.y + 144)
  }
}

/** AI 提示行：出现后 450ms 内从右滑入、淡入，3.2s 后由 index 层清除。 */
function drawAiLine(ctx: CanvasRenderingContext2D, view: WordChainView, now: number): void {
  if (view.aiLine === '') return
  const age = Math.max(0, now - view.aiAtMs)
  const slide = Math.max(0, 1 - age / 450)
  const alpha = Math.min(1, age / 200)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = accent(5)
  const cx = LOGICAL_W / 2 + slide * 70
  ctx.fillText(view.aiLine, cx, 244)
  ctx.restore()
}

/** 手牌区：可接亮边发光、不可接灰暗；角标数字对应键盘 1-5。 */
function drawHand(ctx: CanvasRenderingContext2D, view: WordChainView): void {
  view.hand.forEach((word, i) => {
    const kind = view.playable[i] ?? null
    const cx = HAND_X0 + i * (CARD_W + CARD_GAP)
    ctx.save()
    if (kind === null) ctx.globalAlpha = 0.45
    roundRectPath(ctx, cx, CARD_Y, CARD_W, CARD_H, 10)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    const edge = kind === null ? THEME.panelEdge : accent(i)
    ctx.strokeStyle = edge
    ctx.lineWidth = kind === null ? 1 : 2
    if (kind !== null) glow(ctx, edge, 8)
    ctx.stroke()
    noGlow(ctx)
    ctx.textAlign = 'center'
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.fillStyle = kind === null ? THEME.textMuted : THEME.text
    ctx.fillText(word, cx + CARD_W / 2, CARD_Y + 42)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = kind === null ? THEME.textMuted : THEME.textMuted
    ctx.fillText('尾 ' + (view.handTailPy[i] ?? ''), cx + CARD_W / 2, CARD_Y + 68)
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(i + 1), cx + 8, CARD_Y + 16)
    ctx.restore()
  })
}

/** 跳过按钮与顶部轻提示。 */
function drawSkipAndToast(ctx: CanvasRenderingContext2D, view: WordChainView): void {
  roundRectPath(ctx, SKIP_X, SKIP_Y, SKIP_W, SKIP_H, 10)
  ctx.fillStyle = 'rgba(30,30,42,0.9)'
  ctx.fill()
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillStyle = THEME.gold
  ctx.fillText('跳过（AI +5）· S', LOGICAL_W / 2, SKIP_Y + 24)
  if (view.toast !== '') {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText(view.toast, LOGICAL_W / 2, 430)
  }
}

/**
 * 整帧绘制（背景 → HUD → 卷轴 → AI 行 → 手牌 → 跳过/提示 → overlay）。
 * @param ctx - 画布上下文（逻辑坐标）。
 * @param view - 当前只读视图。
 * @param now - performance.now() 时间戳（动画用）。
 */
export function renderWordChain(ctx: CanvasRenderingContext2D, view: WordChainView, now: number): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  hudPair(ctx, 16, 26, '分数', String(view.playerScore))
  hudPair(ctx, 150, 26, 'AI', String(view.aiScore), 'left', THEME.bad)
  hudPair(ctx, 300, 26, '链长', String(view.chainLen))
  hudPair(ctx, LOGICAL_W - 16, 26, '回合', view.round + '/' + ROUNDS, 'right')
  drawScroll(ctx, view)
  drawAiLine(ctx, view, now)
  drawHand(ctx, view)
  drawSkipAndToast(ctx, view)
  if (view.phase === 'over') {
    const color = view.playerScore > view.aiScore ? THEME.good : view.playerScore < view.aiScore ? THEME.bad : THEME.text
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '十回合终局', '你 ' + view.playerScore + ' 分 · AI ' + view.aiScore + ' 分 · 点击或 R 再来一局', color)
    return
  }
  if (view.userPaused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续接龙')
    return
  }
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板恢复后继续')
  }
}
