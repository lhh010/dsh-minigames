/**
 * 弹球大师 Pinball 渲染层：只画 {@link Pinball2State}，无任何 DOM 或状态。
 * 外墙描边、bumper 呼吸圆、立柱小球、水滴挡板、金属光泽球体、顶部 HUD
 * （比分 / 剩余球 / 连击倍率）与暂停、结束、待发球遮罩。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'
import {
  BALL_R, TABLE_H, TABLE_W, comboMult, flipper2Tip,
  type Flipper2, type Pinball2State,
} from './logic.ts'

/** 渲染逻辑尺寸（与 logic 的台面一致）。 */
export const LOGICAL_W = TABLE_W
export const LOGICAL_H = TABLE_H

/** 单块挡板：枢轴圆 + 到末端的胶囊杆，按住时高亮。 */
function drawFlipper(ctx: CanvasRenderingContext2D, f: Flipper2): void {
  const tip = flipper2Tip(f)
  const color = f.held ? accent(2) : accent(0)
  ctx.lineCap = 'round'
  ctx.lineWidth = 18
  ctx.strokeStyle = color
  glow(ctx, color, f.held ? 14 : 8)
  ctx.beginPath()
  ctx.moveTo(f.px, f.py)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = THEME.text
  ctx.beginPath()
  ctx.arc(f.px, f.py, 4, 0, Math.PI * 2)
  ctx.fill()
}

/** 一帧完整绘制。
 * @param ctx - 已应用逻辑坐标变换的 2d 上下文。
 * @param view - 状态与遮罩标志（暂停遮罩由粘合层单独请求）。
 */
export function renderPinball2(
  ctx: CanvasRenderingContext2D,
  view: { state: Pinball2State; paused: boolean },
): void {
  const s = view.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 台面外墙：按折线一笔描出，出球道开口在底部。
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(70, 48)
  ctx.lineTo(350, 48)
  ctx.moveTo(70, 48)
  ctx.lineTo(14, 112)
  ctx.lineTo(14, 520)
  ctx.lineTo(128, 596)
  ctx.moveTo(350, 48)
  ctx.lineTo(406, 112)
  ctx.lineTo(406, 520)
  ctx.lineTo(292, 596)
  ctx.stroke()

  // 底部出球道警示条。
  ctx.fillStyle = 'rgba(247,118,142,0.25)'
  ctx.fillRect(96, 620, LOGICAL_W - 192, 6)

  // bumper / 立柱：冷却时一圈亮环表示刚被打中。
  for (let i = 0; i < s.bumpers.length; i += 1) {
    const b = s.bumpers[i]!
    const color = b.points >= 100 ? accent(i) : THEME.textMuted
    const pulse = 1 + (b.cd > 0 ? b.cd * 2.2 : 0)
    glow(ctx, color, b.cd > 0 ? 18 : 9)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r * pulse, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = THEME.panel
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2)
    ctx.fill()
    if (b.cd > 0) {
      ctx.strokeStyle = THEME.text
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  drawFlipper(ctx, s.flippers.left)
  drawFlipper(ctx, s.flippers.right)

  // 球体：白芯 + 金色光晕；serving 阶段在发球点呼吸提示。
  if (s.result !== 'over') {
    const rest = s.result === 'serving'
    const r = rest ? BALL_R + Math.sin(s.time * 5) * 1.5 : BALL_R
    glow(ctx, THEME.gold, 12)
    ctx.fillStyle = '#f5f5fa'
    ctx.beginPath()
    ctx.arc(s.ball.x, s.ball.y, Math.max(4, r), 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }

  // HUD：左侧比分，中间连击，右侧剩余球。
  ctx.save()
  ctx.fillStyle = 'rgba(13,13,20,0.5)'
  roundRectPath(ctx, 10, 10, LOGICAL_W - 20, 34, 10)
  ctx.fill()
  ctx.restore()
  hudPair(ctx, 24, 32, '得分', String(Math.floor(s.score)))
  if (s.combo > 1) {
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = accent(4)
    glow(ctx, accent(4), 8)
    ctx.fillText('x' + comboMult(s.combo) + ' 连击', LOGICAL_W / 2, 33)
    noGlow(ctx)
  }
  const balls = '●'.repeat(Math.max(0, s.ballsLeft))
  hudPair(ctx, LOGICAL_W - 24, 32, '球 ' + balls, String(s.ballsLeft), 'right')

  // 中央浮动消息。
  if (s.msgTimer > 0 && s.msg !== '') {
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.globalAlpha = Math.min(1, s.msgTimer)
    ctx.fillText(s.msg, LOGICAL_W / 2, 120)
    ctx.globalAlpha = 1
  }

  // 遮罩：暂停由粘合层请求；待发球与结束由阶段决定。
  if (view.paused && s.result !== 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂 停', 'P 继续 · R 重开')
  } else if (s.result === 'serving') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, spaced('弹球大师'), '空格发球 · A/D 或 ←/→ 挡板')
  } else if (s.result === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, spaced('游戏结束'), '最终 ' + Math.floor(s.score) + ' 分 · R 重开', THEME.bad)
  }
}
