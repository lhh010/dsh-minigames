/**
 * 吹牛骰渲染器：酒馆木桌、两方骰区（己方亮面 / 对方骰背与剩余颗数堆）、
 * 出价历史表（每口出价带概率色条）、开骰翻面动画（万能 1 金光高亮）、
 * 数量/点数选择器、出价与吹牛大按钮、局分 HUD、一局结束面板与胜负
 * 遮罩。全部为纯 canvas 绘制，状态由 index.ts 传入（见 LiarDiceView）。
 */
import { bidCredibility, isLegalRaise, type Bid, type LiarDiceState } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽度 px。 */
export const W = 780
/** 逻辑画布高度 px。 */
export const H = 620
/** HUD 条高度（含在 H 内）。 */
export const HUD_H = 40
/** 对方骰尺寸 px。 */
const AI_DIE = 46
/** 对方骰行顶 y。 */
const AI_DICE_Y = 74
/** 当前出价横幅 y。 */
const BID_Y = 158
/** 历史表面板。 */
const HIST_X = 96
const HIST_Y = 180
const HIST_W = 588
const HIST_H = 190
/** 历史表最多显示行数。 */
const HIST_ROWS = 6
/** 单行高 px。 */
const ROW_H = 27
/** 己方骰尺寸 px。 */
const MY_DIE = 52
/** 己方骰行顶 y。 */
const MY_DICE_Y = 386
/** 数量选择器行 y。 */
export const COUNT_Y = 462
/** 点数选择器行 y。 */
export const FACE_Y = 512
/** 选择器横向中心 x。 */
const SEL_CX = 250
/** 吹牛大按钮矩形。 */
export const LIAR_RECT = { x: 606, y: 456, w: 136, h: 56 }
/** 出价确认按钮矩形。 */
export const CONFIRM_RECT = { x: 606, y: 524, w: 136, h: 44 }
/** 一局结束「下一局」面板矩形。 */
const NEXT_RECT = { x: 240, y: 292, w: 300, h: 64 }

/** 命中区域：选择器数值 / 吹牛 / 出价 / 下一局。 */
export type HitRegion =
  | { kind: 'count' | 'face'; value: number }
  | { kind: 'liar' }
  | { kind: 'confirm' }
  | { kind: 'next' }

/** 一次渲染所需的全部状态。 */
export interface LiarDiceView {
  state: LiarDiceState
  /** 选择器当前组合（数量 × 点数）。 */
  selected: Bid
  /** 开骰翻面进度 0-1（>0 且有开骰记录时对方亮骰）。 */
  reveal: number
  paused: boolean
}

/** 骰面点阵坐标（0/0.5/1 相对网格）。 */
const PIPS: readonly (readonly [number, number][])[] = [
  [],
  [[0.5, 0.5]],
  [[0, 0], [1, 1]],
  [[0, 0], [0.5, 0.5], [1, 1]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0.5, 0.5], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0.5, 0], [0.5, 1], [1, 0], [1, 1]],
]

/** 骰背：暗红木色 + 中心纹章。 */
function drawDieBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  roundRectPath(ctx, x, y, w, h, h * 0.18)
  ctx.fillStyle = '#7a2f33'
  ctx.fill()
  ctx.strokeStyle = 'rgba(240,220,180,0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (w > 12) {
    ctx.fillStyle = 'rgba(240,220,180,0.55)'
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 画一颗骰：back 为骰背；face 按 flip 做横向翻面（前半程收窄背面、
 * 后半程展开点面）；wild 为万能命中（报点或 1）时金框金点。
 */
function drawDie(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, value: number,
  back: boolean, flip = 1, wild = false,
): void {
  if (back || flip < 0.5) {
    const t = back ? 1 : Math.max(1 - flip * 2, 0.02)
    drawDieBack(ctx, x + (size - size * t) / 2, y, size * t, size)
    return
  }
  const t = Math.max((flip - 0.5) * 2, 0.02)
  const w = size * t
  const bx = x + (size - w) / 2
  roundRectPath(ctx, bx, y, w, size, size * 0.18)
  ctx.fillStyle = '#f3ead8'
  ctx.fill()
  ctx.strokeStyle = wild ? THEME.gold : 'rgba(30,24,16,0.4)'
  ctx.lineWidth = wild ? 2.5 : 1
  if (wild) glow(ctx, THEME.gold, 10)
  ctx.stroke()
  noGlow(ctx)
  if (w < size * 0.3) return
  const pips = PIPS[value] ?? PIPS[0]!
  ctx.fillStyle = wild ? THEME.gold : '#2b2318'
  for (const [fx, fy] of pips) {
    const px = bx + w * (0.5 + (fx - 0.5) * 0.52)
    const py = y + size * (0.5 + (fy - 0.5) * 0.52)
    ctx.beginPath()
    ctx.arc(px, py, size * 0.085, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 一行居中骰子（间距 gap），返回绘制回调数组由调用方决定翻面进度。 */
function diceRowX(count: number, size: number, gap: number): number {
  return W / 2 - (count * size + (count - 1) * gap) / 2
}

/** 概率 → 色条颜色（低红 / 中金 / 高绿）。 */
function probColor(p: number): string {
  if (p < 0.35) return THEME.bad
  if (p < 0.6) return THEME.gold
  return THEME.good
}

/** 按钮矩形绘制（enabled 高亮）。 */
function drawButton(
  ctx: CanvasRenderingContext2D, r: { x: number, y: number, w: number, h: number },
  label: string, enabled: boolean, color: string,
): void {
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.fillStyle = enabled ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'
  ctx.fill()
  ctx.strokeStyle = enabled ? color : 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1.5
  if (enabled) glow(ctx, color, 6)
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '700 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = enabled ? THEME.text : THEME.textMuted
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1)
}

/**
 * 命中测试：数量/点数选择器、吹牛与出价按钮、下一局面板。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param maxCount - 数量选择器的最大档（全场骰总数）。
 * @returns 命中区域，未命中返回 null。
 */
export function hitTest(x: number, y: number, maxCount: number): HitRegion | null {
  if (x >= NEXT_RECT.x && x < NEXT_RECT.x + NEXT_RECT.w && y >= NEXT_RECT.y && y < NEXT_RECT.y + NEXT_RECT.h) {
    return { kind: 'next' }
  }
  const n = Math.max(1, Math.min(maxCount, 12))
  const cx0 = SEL_CX - (n * 34 - 4) / 2
  for (let i = 0; i < n; i += 1) {
    if (x >= cx0 + i * 34 && x < cx0 + i * 34 + 30 && y >= COUNT_Y && y < COUNT_Y + 30) {
      return { kind: 'count', value: i + 1 }
    }
  }
  const fx0 = SEL_CX - (6 * 48 - 8) / 2
  for (let i = 0; i < 6; i += 1) {
    if (x >= fx0 + i * 48 && x < fx0 + i * 48 + 40 && y >= FACE_Y && y < FACE_Y + 40) {
      return { kind: 'face', value: i + 1 }
    }
  }
  if (x >= LIAR_RECT.x && x < LIAR_RECT.x + LIAR_RECT.w && y >= LIAR_RECT.y && y < LIAR_RECT.y + LIAR_RECT.h) {
    return { kind: 'liar' }
  }
  if (x >= CONFIRM_RECT.x && x < CONFIRM_RECT.x + CONFIRM_RECT.w && y >= CONFIRM_RECT.y && y < CONFIRM_RECT.y + CONFIRM_RECT.h) {
    return { kind: 'confirm' }
  }
  return null
}

/** 主渲染入口。 */
export function renderLiarDice(ctx: CanvasRenderingContext2D, view: LiarDiceView): void {
  const s = view.state
  drawBackground(ctx, W, H)

  // 酒馆木桌。
  const tableY = HUD_H + 6
  const tableH = H - HUD_H - 20
  roundRectPath(ctx, 14, tableY, W - 28, tableH, 22)
  const wood = ctx.createLinearGradient(0, tableY, 0, tableY + tableH)
  wood.addColorStop(0, '#5d4126')
  wood.addColorStop(1, '#33200f')
  ctx.fillStyle = wood
  ctx.fill()
  ctx.strokeStyle = '#86603a'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 5; i += 1) {
    const py = tableY + (tableH * i) / 6
    ctx.beginPath()
    ctx.moveTo(20, py)
    ctx.lineTo(W - 20, py)
    ctx.stroke()
  }

  const revealing = s.lastChallenge !== null
  const chFace = s.lastChallenge?.bid.face ?? 0

  // 对方骰区：开骰前骰背 + 剩余颗数，开骰后按 reveal 翻面。
  const aiN = s.aiDice.length
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('对方 · 剩 ' + aiN + ' 颗', W / 2, tableY + 18)
  const aiX0 = diceRowX(Math.max(aiN, 1), AI_DIE, 10)
  for (let i = 0; i < aiN; i += 1) {
    const v = s.aiDice[i]!
    const flip = revealing ? Math.max(0, Math.min(1, view.reveal * 1.8 - i * 0.14)) : 0
    const wild = revealing && chFace > 1 && (v === chFace || v === 1)
    drawDie(ctx, aiX0 + i * (AI_DIE + 10), AI_DICE_Y, AI_DIE, v, !revealing, flip, wild)
  }

  // 当前出价横幅。
  ctx.font = 'bold 22px system-ui, sans-serif'
  if (s.currentBid !== null) {
    ctx.fillStyle = THEME.gold
    glow(ctx, THEME.gold, 8)
    ctx.fillText('当前出价 ' + s.currentBid.count + ' × ' + s.currentBid.face, W / 2, BID_Y)
    noGlow(ctx)
  } else if (s.phase === 'bidding') {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('重新出价（1 为万能百搭）', W / 2, BID_Y)
  }

  // 出价历史表。
  roundRectPath(ctx, HIST_X, HIST_Y, HIST_W, HIST_H, 12)
  ctx.fillStyle = 'rgba(0,0,0,0.30)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('出价历史', HIST_X + 12, HIST_Y + 15)
  ctx.textAlign = 'right'
  ctx.fillText('可信度为玩家视角概率', HIST_X + HIST_W - 12, HIST_Y + 15)
  const entries = s.log.slice(-HIST_ROWS)
  const rowY0 = HIST_Y + 28 + (HIST_ROWS - entries.length) * ROW_H
  ctx.font = '600 12px system-ui, sans-serif'
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]!
    const y = rowY0 + i * ROW_H + ROW_H / 2
    if (e.kind === 'bid') {
      ctx.textAlign = 'left'
      ctx.fillStyle = e.by === 'you' ? THEME.accents[0]! : THEME.accents[1]!
      ctx.fillText((e.by === 'you' ? '你' : '对方') + (e.bluff && revealing ? ' 诈' : ''), HIST_X + 12, y)
      ctx.fillStyle = THEME.text
      ctx.fillText(e.bid.count + ' × ' + e.bid.face, HIST_X + 70, y)
      // 概率色条。
      const barX = HIST_X + 330
      const barW = 150
      roundRectPath(ctx, barX, y - 5, barW, 10, 5)
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      ctx.fill()
      roundRectPath(ctx, barX, y - 5, Math.max(6, barW * e.prob), 10, 5)
      ctx.fillStyle = probColor(e.prob)
      ctx.fill()
      ctx.textAlign = 'right'
      ctx.fillStyle = probColor(e.prob)
      ctx.fillText(Math.round(e.prob * 100) + '%', HIST_X + HIST_W - 12, y)
    } else {
      ctx.textAlign = 'left'
      ctx.fillStyle = e.loser === 'you' ? THEME.bad : THEME.good
      ctx.fillText(
        '开骰 ' + e.bid.count + ' × ' + e.bid.face + ' → 实际 ' + e.total + ' 颗（含万能 1 × ' + e.wilds + '）· '
          + (e.loser === 'you' ? '你' : '对方') + ' 输 1 颗',
        HIST_X + 12, y,
      )
    }
  }

  // 己方骰区（始终亮面；开骰时命中骰金光）。
  const myN = s.yourDice.length
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('你 · 剩 ' + myN + ' 颗', W / 2, MY_DICE_Y - 14)
  const myX0 = diceRowX(Math.max(myN, 1), MY_DIE, 10)
  for (let i = 0; i < myN; i += 1) {
    const v = s.yourDice[i]!
    const wild = revealing && chFace > 1 && (v === chFace || v === 1)
    drawDie(ctx, myX0 + i * (MY_DIE + 10), MY_DICE_Y, MY_DIE, v, false, 1, wild)
  }

  if (s.phase === 'bidding') {
    // 数量选择器。
    const total = myN + aiN
    const n = Math.min(total, 12)
    const cx0 = SEL_CX - (n * 34 - 4) / 2
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('数量', cx0 - 34, COUNT_Y + 15)
    for (let i = 0; i < n; i += 1) {
      const on = view.selected.count === i + 1
      roundRectPath(ctx, cx0 + i * 34, COUNT_Y, 30, 30, 8)
      ctx.fillStyle = on ? 'rgba(224,175,104,0.28)' : 'rgba(0,0,0,0.30)'
      ctx.fill()
      ctx.strokeStyle = on ? THEME.gold : 'rgba(255,255,255,0.15)'
      ctx.lineWidth = on ? 2 : 1
      ctx.stroke()
      ctx.font = '700 14px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = on ? THEME.text : THEME.textMuted
      ctx.fillText(String(i + 1), cx0 + i * 34 + 15, COUNT_Y + 16)
    }

    // 点数选择器（迷你骰面按钮）。
    const fx0 = SEL_CX - (6 * 48 - 8) / 2
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('点数', fx0 - 34, FACE_Y + 20)
    for (let i = 1; i <= 6; i += 1) {
      const on = view.selected.face === i
      const bx = fx0 + (i - 1) * 48
      roundRectPath(ctx, bx, FACE_Y, 40, 40, 10)
      ctx.fillStyle = on ? 'rgba(224,175,104,0.22)' : 'rgba(0,0,0,0.30)'
      ctx.fill()
      ctx.strokeStyle = on ? THEME.gold : 'rgba(255,255,255,0.15)'
      ctx.lineWidth = on ? 2 : 1
      ctx.stroke()
      drawDie(ctx, bx + 3, FACE_Y + 3, 34, i, false, 1, i === 1)
    }

    // 出价与吹牛按钮。
    const legal = isLegalRaise(s.currentBid, view.selected)
    drawButton(ctx, CONFIRM_RECT, '出价 Enter', legal, THEME.accents[0]!)
    const canLiar = s.currentBid !== null && s.bidBy === 'ai' && s.turn === 'you'
    drawButton(ctx, LIAR_RECT, '吹牛！ L', canLiar, THEME.bad)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(
      '拟出价 ' + view.selected.count + ' × ' + view.selected.face + ' · 可信 ' + Math.round(bidCredibility(s, view.selected) * 100) + '%',
      CONFIRM_RECT.x + CONFIRM_RECT.w / 2, CONFIRM_RECT.y + CONFIRM_RECT.h + 12,
    )
  } else if (s.phase === 'roundOver') {
    roundRectPath(ctx, NEXT_RECT.x, NEXT_RECT.y, NEXT_RECT.w, NEXT_RECT.h, 14)
    ctx.fillStyle = 'rgba(13,13,20,0.86)'
    ctx.fill()
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = '700 16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = THEME.text
    ctx.fillText('第 ' + s.round + ' 局结束 · ' + s.roundWinsYou + ' - ' + s.roundWinsAi, W / 2, NEXT_RECT.y + 24)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('Enter / 点击 下一局', W / 2, NEXT_RECT.y + 44)
  }

  // HUD。
  hudPair(ctx, 24, 24, '局分 ', s.roundWinsYou + ' - ' + s.roundWinsAi, 'left', THEME.gold)
  hudPair(ctx, 130, 24, '第 ', s.round + ' 局')
  hudPair(ctx, 200, 24, '我的骰 ', String(s.yourDice.length))
  hudPair(ctx, 290, 24, '对方骰 ', String(s.aiDice.length))
  hudPair(ctx, W - 24, 24, s.message, '', 'right')

  if (s.phase === 'matchOver') {
    const won = s.matchWinner === 'you'
    drawOverlay(ctx, W, H, won ? '比赛胜利' : '比赛失利', '比分 ' + s.roundWinsYou + ' - ' + s.roundWinsAi + ' · R 重开', won ? THEME.good : THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续 · R 重开', THEME.text)
  }
}
