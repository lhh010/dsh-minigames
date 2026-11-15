/**
 * 猜拳心理战渲染：对峙舞台（左玩家右 AI）、出拳大图标、轮次预测复盘
 * 气泡、提示气泡、底部三个出拳按钮（含命中检测）、比分/轮次/连击
 * HUD 与结束 overlay（含被读心统计）。纯 canvas 绘制，无 DOM 状态。
 */
import { THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair, spaced } from '../theme.ts'
import { HAND_LABELS, TOTAL_ROUNDS, type Hand, type RpsState } from './logic.ts'

/** 逻辑坐标系宽。 */
export const LOGICAL_W = 720
/** 逻辑坐标系高。 */
export const LOGICAL_H = 480

/** 拳种大图标（渲染emoji，逻辑层不用）。 */
export const HAND_ICONS: readonly string[] = ['✊', '✌️', '✋']

/** 出拳按钮的命中区域与外观参数。 */
interface ButtonSpec { x: number; y: number; r: number; hand: Hand }

const BUTTON_Y = 420
const BUTTON_R = 34
const BUTTONS: readonly ButtonSpec[] = [
  { x: LOGICAL_W / 2 - 130, y: BUTTON_Y, r: BUTTON_R, hand: 0 },
  { x: LOGICAL_W / 2, y: BUTTON_Y, r: BUTTON_R, hand: 1 },
  { x: LOGICAL_W / 2 + 130, y: BUTTON_Y, r: BUTTON_R, hand: 2 },
]

/** 渲染需要的对局视图（state 快照 + 暂停标志）。 */
export interface RpsView {
  state: RpsState
  paused: boolean
}

/**
 * 命中检测：点击坐标落在哪个出拳按钮内。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 拳种编号，未命中返回 null。
 */
export function buttonAt(x: number, y: number): Hand | null {
  for (const b of BUTTONS) {
    const dx = x - b.x
    const dy = y - b.y
    if (dx * dx + dy * dy <= b.r * b.r) return b.hand
  }
  return null
}

/** 舞台一侧的出拳大图标 + 名字 + 光环。 */
function drawSide(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, hand: Hand | null,
  label: string, color: string, flash: string | null,
): void {
  ctx.textAlign = 'center'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(label, cx, cy - 74)
  if (flash !== null) {
    glow(ctx, flash, 26)
    ctx.strokeStyle = flash
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, 70, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
  }
  ctx.font = '72px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(hand === null ? '❔' : HAND_ICONS[hand]!, cx, cy + 26)
  if (hand !== null) {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = color
    ctx.fillText(HAND_LABELS[hand]!, cx, cy + 58)
  }
}

/** 圆角气泡（AI 台词：预测复盘 / 说漏嘴提示）。 */
function bubble(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, text: string, color: string,
): void {
  ctx.fillStyle = THEME.panel
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  glow(ctx, color, 8)
  roundRectPath(ctx, x, y, w, 46, 12)
  ctx.fill()
  noGlow(ctx)
  ctx.stroke()
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText(text, x + w / 2, y + 28, w - 20)
}

/**
 * 整帧绘制。
 * @param ctx - 已应用 fit 变换的 2d 上下文。
 * @param view - 对局视图。
 */
export function renderRps(ctx: CanvasRenderingContext2D, view: RpsView): void {
  const s = view.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：左比分/连击，右轮次。
  hudPair(ctx, 16, 26, '得分', String(s.score), 'left', accent(0))
  hudPair(ctx, 16, 46, '连击', 'x' + String(s.streak), 'left', s.streak > 0 ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W - 16, 26, '轮次', String(Math.min(s.round + 1, TOTAL_ROUNDS)) + ' / ' + String(TOTAL_ROUNDS), 'right')
  hudPair(ctx, LOGICAL_W - 16, 46, '被读', String(s.readCount) + ' 次', 'right', s.readCount > 0 ? THEME.bad : THEME.text)

  // 舞台中线与 VS。
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.setLineDash([6, 8])
  ctx.beginPath()
  ctx.moveTo(LOGICAL_W / 2, 96)
  ctx.lineTo(LOGICAL_W / 2, 330)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('VS', LOGICAL_W / 2, 200)

  const last = s.last
  const lastHand = last === null ? null : last.player
  const aiHand = last === null ? null : last.ai
  const flashColor = last === null ? null : last.outcome === 'win' ? THEME.good : last.outcome === 'draw' ? THEME.gold : THEME.bad
  drawSide(ctx, LOGICAL_W / 2 - 150, 190, lastHand, '你', accent(0), flashColor)
  drawSide(ctx, LOGICAL_W / 2 + 150, 190, aiHand, 'AI · 会记套路', accent(1), last !== null && last.wasRead ? THEME.bad : null)

  // 复盘 / 提示气泡。
  if (last !== null) {
    const verdict = last.wasRead ? '它读中你了' : '你没被读中'
    const outcomeText = last.outcome === 'win' ? '你赢 +' + String(last.gained) : last.outcome === 'draw' ? '平局 +20' : '你输 +0'
    bubble(ctx, LOGICAL_W / 2 - 250, 270, 236, '它猜你出' + HAND_LABELS[last.predicted]! + ' · ' + verdict + ' · ' + outcomeText, last.wasRead ? THEME.bad : THEME.good)
  }
  if (s.lastHint !== null && last !== null) {
    bubble(ctx, LOGICAL_W / 2 + 14, 270, 236, s.lastHint.text, accent(4))
  } else if (s.lastHint !== null) {
    bubble(ctx, LOGICAL_W / 2 - 118, 270, 236, s.lastHint.text, accent(4))
  }

  // 出拳按钮。
  for (let i = 0; i < BUTTONS.length; i += 1) {
    const b = BUTTONS[i]!
    const color = accent(i + 2)
    glow(ctx, color, 10)
    ctx.fillStyle = THEME.panel
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.stroke()
    ctx.font = '28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText(HAND_ICONS[b.hand]!, b.x, b.y + 4)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(HAND_LABELS[b.hand]! + ' ' + String(b.hand + 1), b.x, b.y + b.r + 16)
  }

  if (s.over) {
    drawOverlay(
      ctx, LOGICAL_W, LOGICAL_H,
      '对 局 结 束',
      '得分 ' + String(s.score) + ' · 胜' + String(s.wins) + ' 平' + String(s.draws) + ' 负' + String(s.losses) +
        ' · 被读心 ' + String(s.readCount) + '/' + String(TOTAL_ROUNDS) + ' 次 · 最长连击 x' + String(s.bestStreak),
      s.readCount >= 8 ? THEME.bad : THEME.text,
    )
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('按 R 或点击重开一局', LOGICAL_W / 2, LOGICAL_H / 2 + 46)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, spaced('已暂停'), '按 P 继续 · 按 R 重开', THEME.gold)
  } else {
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('出拳制胜：赢 +100（连击加成） · 平 +20 · 它会记住你的套路', LOGICAL_W / 2, 342)
  }
}
