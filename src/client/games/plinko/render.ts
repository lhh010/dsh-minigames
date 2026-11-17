/**
 * 弹珠瀑布 Plinko 渲染：赌场霓虹风。发光钉阵、带拖尾的弹珠、金色脉冲的
 * 高倍槽、HUD（得分/轮次/弹珠余量/底注）、瞄准列直方图预览（第 1 轮后
 * 解锁）与暂停/结束 overlay。纯 canvas 绘制，无 DOM、无状态（粒子与
 * 浮字由 index.ts 持有）。
 */
import {
  BALL_R, BALLS_PER_ROUND, BASE_BET, BOARD_H, BOARD_W, DROP_COLS, DROP_Y,
  PEGS, PEG_R, ROUNDS, SLOT_COUNT, SLOT_H, SLOT_MULTIPLIERS, SLOT_W, SLOT_Y,
  WALL_L, WALL_R, dropColX, previewUnlocked,
} from './logic.ts'
import type { PlinkoState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = BOARD_W
export const LOGICAL_H = BOARD_H

/** 槽倍率对应的强调色：高倍金色，向两侧过渡到冷色。 */
function slotColor(mult: number): string {
  if (mult >= 10) return THEME.gold
  if (mult >= 5) return '#ffd28a'
  if (mult >= 2) return accent(6)
  if (mult >= 1) return accent(0)
  return '#8f9ac9'
}

/** 浮动文字（+分 / 轮次提示）。 */
export interface Floaters {
  /** 添加一条从 (x,y) 上浮渐隐的文字。 */
  add(x: number, y: number, text: string, color: string): void
  /** 按帧推进寿命。 */
  tick(dtMs: number): void
  /** 绘制在当前场景之上。 */
  draw(ctx: CanvasRenderingContext2D): void
}

/** 创建浮字系统。 */
export function createFloaters(): Floaters {
  const items: { x: number, y: number, text: string, color: string, life: number, max: number }[] = []
  return {
    add(x, y, text, color): void {
      if (items.length >= 12) items.shift()
      items.push({ x, y, text, color, life: 0, max: 1100 })
    },
    tick(dtMs): void {
      for (let i = items.length - 1; i >= 0; i -= 1) {
        items[i]!.life += dtMs
        if (items[i]!.life >= items[i]!.max) items.splice(i, 1)
      }
    },
    draw(ctx): void {
      for (const it of items) {
        const t = it.life / it.max
        ctx.globalAlpha = 1 - t
        ctx.font = 'bold 15px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = it.color
        glow(ctx, it.color, 8)
        ctx.fillText(it.text, it.x, it.y - t * 34)
        noGlow(ctx)
      }
      ctx.globalAlpha = 1
    },
  }
}

/** 渲染入参。 */
export interface RenderPlinkoOptions {
  state: PlinkoState
  paused: boolean
  /** 直方图预览开关（解锁后仍需玩家按 H 打开）。 */
  preview: boolean
  /** 模拟时间（毫秒），驱动高倍槽金脉冲。 */
  timeMs: number
  /** 浮字系统（可省略）。 */
  floaters?: Floaters
}

/**
 * 整帧绘制弹珠瀑布盘面。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param opts - 渲染入参（状态、暂停、预览、时间、浮字）。
 */
export function renderPlinko(ctx: CanvasRenderingContext2D, opts: RenderPlinkoOptions): void {
  const s = opts.state
  const time = opts.timeMs
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 两侧霓虹墙
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 3
  ctx.shadowColor = accent(0)
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.moveTo(WALL_L, DROP_Y - 14)
  ctx.lineTo(WALL_L, SLOT_Y)
  ctx.moveTo(WALL_R, DROP_Y - 14)
  ctx.lineTo(WALL_R, SLOT_Y)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  // 顶部投放区：各列小三角标记 + 瞄准列高亮与虚线引导
  const aimX = dropColX(s.aimCol)
  for (let c = 0; c < DROP_COLS; c += 1) {
    const x = dropColX(c)
    const active = c === s.aimCol && s.phase === 'playing'
    ctx.fillStyle = active ? THEME.gold : THEME.textMuted
    if (active) glow(ctx, THEME.gold, 12)
    ctx.beginPath()
    ctx.moveTo(x, DROP_Y - 22)
    ctx.lineTo(x - 7, DROP_Y - 10)
    ctx.lineTo(x + 7, DROP_Y - 10)
    ctx.closePath()
    ctx.fill()
    if (active) noGlow(ctx)
  }
  if (s.phase === 'playing') {
    ctx.strokeStyle = 'rgba(224,175,104,0.4)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(aimX, DROP_Y)
    ctx.lineTo(aimX, SLOT_Y - 10)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 钉阵：发光圆点，行间微调色
  for (const peg of PEGS) {
    const color = accent(peg.row % THEME.accents.length)
    ctx.fillStyle = color
    glow(ctx, color, 6)
    ctx.beginPath()
    ctx.arc(peg.x, peg.y, PEG_R, 0, Math.PI * 2)
    ctx.fill()
  }
  noGlow(ctx)

  // 弹珠：拖尾渐隐 + 发光珠体
  for (const ball of s.balls) {
    const t = ball.trail
    for (let i = 0; i < t.length; i += 1) {
      const a = (i + 1) / t.length
      ctx.globalAlpha = a * 0.35
      ctx.fillStyle = accent(5)
      ctx.beginPath()
      ctx.arc(t[i]!.x, t[i]!.y, BALL_R * a * 0.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = '#f3f6ff'
    glow(ctx, accent(5), 14)
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }

  // 倍率槽：高倍金色脉冲
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const x = WALL_L + i * SLOT_W
    const mult = SLOT_MULTIPLIERS[i]!
    const color = slotColor(mult)
    roundRectPath(ctx, x + 2, SLOT_Y, SLOT_W - 4, SLOT_H, 6)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    const hot = mult >= 5
    const pulse = hot ? 0.5 + 0.5 * Math.sin(time / 260 + i) : 0
    ctx.strokeStyle = color
    ctx.globalAlpha = hot ? 0.55 + 0.45 * pulse : 0.85
    ctx.lineWidth = hot ? 2 : 1.5
    if (hot) glow(ctx, color, 6 + 8 * pulse)
    ctx.stroke()
    noGlow(ctx)
    ctx.globalAlpha = 1
    ctx.font = mult >= 2 ? 'bold 13px system-ui, sans-serif' : '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText('×' + mult, x + SLOT_W / 2, SLOT_Y + SLOT_H / 2 + 5)
  }

  // 直方图预览：当前瞄准列的历史落槽分布（第 1 轮后解锁）
  if (opts.preview && previewUnlocked(s)) {
    const dist = s.histogram[s.aimCol]!
    let max = 0
    for (const n of dist) if (n > max) max = n
    const barMaxH = 44
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const n = dist[i]!
      if (n <= 0 || max <= 0) continue
      const x = WALL_L + i * SLOT_W + 5
      const h = Math.max(3, (n / max) * barMaxH)
      ctx.fillStyle = 'rgba(224,175,104,0.55)'
      glow(ctx, THEME.gold, 5)
      ctx.fillRect(x, SLOT_Y - 4 - h, SLOT_W - 10, h)
      noGlow(ctx)
    }
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('预览：第 ' + (s.aimCol + 1) + ' 列历史分布（共 ' + dist.reduce((a, b) => a + b, 0) + ' 珠）', WALL_L, 464)
  }

  // HUD
  hudPair(ctx, 24, 30, '得分', String(s.score), 'left', THEME.gold)
  hudPair(ctx, 150, 30, '轮次', s.round + '/' + ROUNDS)
  hudPair(ctx, 240, 30, '弹珠', String(s.ballsLeft) + '/' + String(BALLS_PER_ROUND))
  hudPair(ctx, LOGICAL_W - 24, 30, '底注', String(BASE_BET), 'right')

  opts.floaters?.draw(ctx)

  if (s.phase === 'ended') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', '总分 ' + s.score + ' · 按 R 再来一局', THEME.gold)
  } else if (opts.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · R 重开', THEME.text)
  }
}
