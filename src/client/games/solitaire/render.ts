/**
 * 纸牌接龙渲染层：绿色呢面牌桌、圆角白卡（红黑花色与点数）、牌背斜纹、
 * 发牌堆与基础堆的虚线提示框、选中牌金色高亮、HUD 区绘制分数 / 步数 /
 * 局号与撤销按钮、胜利金色粒子 + 遮罩、暂停遮罩。渲染为无状态纯绘制
 * （粒子系统为画布级单例）。
 */
import {
  W, H, CARD_W, CARD_H, TOP_Y, COL_Y,
  slotX, colX, cardY, SUITS, RANKS, isRed,
  type Card, type SolitaireState, type CardSource,
} from './logic.ts'
import { THEME, createParticles, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

/** 撤销按钮矩形（HUD 区，供交互层命中检测）。 */
export const UNDO_BTN = { x: W / 2 - 70, y: 6, w: 62, h: 22 }
/** 牌桌绿色（顶部亮、底部暗的纵向渐变）。 */
const FELT_TOP = '#2d6e4f'
const FELT_BOTTOM = '#1c4a35'

// 渲染层自有的粒子系统（胜利庆祝；每个画布一个实例）。
const particles = createParticles()

/**
 * 画一张明牌：白底圆角、红/黑点数与花色、中央大花色。
 * @param ctx - 画布上下文。
 * @param card - 牌数据。
 * @param x - 左上角 x。
 * @param y - 左上角 y。
 * @param selected - 是否选中（金色描边 + 微光）。
 */
function drawFace(ctx: CanvasRenderingContext2D, card: Card, x: number, y: number, selected: boolean): void {
  const color = isRed(card) ? '#c0392b' : '#1e1e26'
  if (selected) glow(ctx, THEME.gold, 12)
  ctx.fillStyle = '#f4f4f0'
  roundRectPath(ctx, x, y, CARD_W, CARD_H, 8)
  ctx.fill()
  noGlow(ctx)
  ctx.lineWidth = selected ? 3 : 1
  ctx.strokeStyle = selected ? THEME.gold : 'rgba(0,0,0,0.35)'
  roundRectPath(ctx, x, y, CARD_W, CARD_H, 8)
  ctx.stroke()
  // 左上点数 + 花色。
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillText(RANKS[card.rank]!, x + 6, y + 19)
  ctx.font = '15px system-ui, sans-serif'
  ctx.fillText(SUITS[card.suit]!, x + 6, y + 36)
  // 中央大花色。
  ctx.textAlign = 'center'
  ctx.font = '30px system-ui, sans-serif'
  ctx.fillText(SUITS[card.suit]!, x + CARD_W / 2 + 8, y + CARD_H / 2 + 14)
}

/**
 * 画一张暗牌：深色圆角牌背 + 斜纹。
 * @param ctx - 画布上下文。
 * @param x - 左上角 x。
 * @param y - 左上角 y。
 */
function drawBack(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#3b3b5c'
  roundRectPath(ctx, x, y, CARD_W, CARD_H, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  roundRectPath(ctx, x, y, CARD_W, CARD_H, 8)
  ctx.stroke()
  // 牌背斜纹：裁剪后画一组斜线。
  ctx.save()
  roundRectPath(ctx, x + 4, y + 4, CARD_W - 8, CARD_H - 8, 6)
  ctx.clip()
  ctx.strokeStyle = 'rgba(122,162,247,0.5)'
  ctx.lineWidth = 3
  for (let d = -CARD_H; d < CARD_W + CARD_H; d += 10) {
    ctx.beginPath()
    ctx.moveTo(x + d, y + CARD_H)
    ctx.lineTo(x + d + CARD_H, y)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * 画一个空槽提示框：虚线圆角 + 居中花色 / 记号。
 * @param ctx - 画布上下文。
 * @param x - 左上角 x。
 * @param y - 左上角 y。
 * @param label - 框内提示（A 或花色记号）。
 */
function drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1.5
  roundRectPath(ctx, x, y, CARD_W, CARD_H, 8)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.font = '600 24px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillText(label, x + CARD_W / 2, y + CARD_H / 2 + 8)
}

/**
 * 判断某张列牌当前是否处于选中状态（选中源为列时取 cardIndex 起整段）。
 * @param selected - 当前选中的源（可为 null）。
 * @param colIndex - 列号。
 * @param cardIndex - 牌序号。
 * @returns true 表示该牌选中。
 */
function isCardSelected(selected: CardSource | null, colIndex: number, cardIndex: number): boolean {
  return selected !== null && selected.zone === 'column' && selected.index === colIndex && cardIndex >= selected.cardIndex
}

/**
 * 渲染一帧：呢面牌桌、顶排、7 列、HUD（含撤销按钮）、胜利 / 暂停遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param selected - 当前选中的移动源（null 表示未选中）。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderSolitaire(ctx: CanvasRenderingContext2D, state: SolitaireState, selected: CardSource | null, paused: boolean): void {
  // 绿色呢面牌桌。
  const felt = ctx.createLinearGradient(0, 0, 0, H)
  felt.addColorStop(0, FELT_TOP)
  felt.addColorStop(1, FELT_BOTTOM)
  ctx.fillStyle = felt
  ctx.fillRect(0, 0, W, H)

  // 顶排：发牌堆 / 废牌堆 / 4 基础堆。
  if (state.stock.length > 0) {
    drawBack(ctx, slotX(0), TOP_Y)
  } else {
    drawSlot(ctx, slotX(0), TOP_Y, '\u21ba')
  }
  drawSlot(ctx, slotX(1), TOP_Y, '')
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1]!
    drawFace(ctx, card, slotX(1), TOP_Y, selected !== null && selected.zone === 'waste')
  }
  for (let f = 0; f < 4; f += 1) {
    const x = slotX(f + 2 + 1)
    const pile = state.foundations[f]!
    if (pile.length > 0) {
      const card = pile[pile.length - 1]!
      drawFace(ctx, card, x, TOP_Y, selected !== null && selected.zone === 'foundation' && selected.index === f)
    } else {
      drawSlot(ctx, x, TOP_Y, SUITS[f]!)
    }
  }

  // 7 列。
  for (let c = 0; c < 7; c += 1) {
    const column = state.columns[c]!
    if (column.length === 0) drawSlot(ctx, colX(c), COL_Y, '')
    for (let i = 0; i < column.length; i += 1) {
      const card = column[i]!
      const y = cardY(column, i)
      if (card.faceUp) drawFace(ctx, card, colX(c), y, isCardSelected(selected, c, i))
      else drawBack(ctx, colX(c), y)
    }
  }

  // 胜利庆祝粒子（won 时持续迸发）。
  if (state.won && !paused) {
    particles.burst(W / 2, H / 2, THEME.gold, 3, 200)
  }
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：分数 / 撤销按钮 / 局号。
  const hudY = 21
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  hudPair(ctx, 150, hudY, '步', String(state.moves))
  hudPair(ctx, W - 10, hudY, '局', '#' + state.gameNo, 'right')
  const canUndo = state.undoStack.length > 0 && !state.won
  ctx.fillStyle = canUndo ? THEME.panel : 'rgba(30,30,42,0.55)'
  roundRectPath(ctx, UNDO_BTN.x, UNDO_BTN.y, UNDO_BTN.w, UNDO_BTN.h, 8)
  ctx.fill()
  ctx.strokeStyle = canUndo ? THEME.panelEdge : 'rgba(52,52,74,0.6)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = canUndo ? THEME.text : THEME.textMuted
  ctx.fillText('撤销 U', UNDO_BTN.x + UNDO_BTN.w / 2, UNDO_BTN.y + 15)

  if (state.won) {
    drawOverlay(ctx, W, H, spaced('胜利'), '满分 ' + state.score + ' · R 开新局', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  }
}
