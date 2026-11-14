/**
 * 磁极迷宫渲染层：共享渐变背景、金属钢球（拖尾）、N 红 / S 蓝磁铁
 * （活动磁铁带翻转脉冲与虚线环）、磁力弧线与钢球受力箭头、尖刺球、
 * 发光终点槽、关卡 HUD 与极性按钮、过关 / 失败 / 通关 / 暂停遮罩。
 */
import {
  W,
  H,
  BALL_R,
  MAGNET_R,
  LEVEL_COUNT,
  forceAt,
  levelAt,
  type MagnetState,
} from './logic.ts'
import {
  THEME,
  accent,
  createParticles,
  drawBackground,
  drawOverlay,
  glow,
  hudPair,
  noGlow,
  roundRectPath,
} from '../theme.ts'

/** N 极红。 */
const N_COLOR = '#f7768e'
/** S 极蓝。 */
const S_COLOR = '#7aa2f7'

/**
 * 极性对应主色。
 * @param pol - 极性（N / S）。
 * @returns 该极性的显示色。
 */
function polColor(pol: string): string {
  return pol === 'N' ? N_COLOR : S_COLOR
}

// 渲染层自有的粒子系统与钢球拖尾（每个画布一个实例）。
const particles = createParticles()
const trail: { x: number, y: number }[] = []
const TRAIL_MAX = 22

/**
 * 画一枚磁铁：极性主色圆 + N/S 字母 + 呼吸外环；活动磁铁另加虚线
 * 环与翻转脉冲（flipFlash > 0 时放大高亮）。
 * @param ctx - 画布上下文。
 * @param x - 圆心横坐标。
 * @param y - 圆心纵坐标。
 * @param pol - 极性。
 * @param isPlayer - 是否活动磁铁。
 * @param t - 回合内毫秒钟。
 * @param flipFlash - 翻转脉冲剩余 ms。
 */
function drawMagnet(
  ctx: CanvasRenderingContext2D, x: number, y: number, pol: string, isPlayer: boolean, t: number, flipFlash: number,
): void {
  const color = polColor(pol)
  const breathe = 0.5 + 0.5 * Math.sin(t / 420 + (isPlayer ? 1.6 : 0))
  if (isPlayer) {
    // 活动磁铁：虚线外环标出「可翻转」身份，翻转时脉冲放大。
    const pulse = flipFlash > 0 ? 1 + 0.55 * (flipFlash / 320) : 1
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.55 + 0.35 * breathe
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.arc(x, y, (MAGNET_R + 9) * pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
  glow(ctx, color, 10 + (isPlayer ? 8 : 4) * breathe)
  ctx.fillStyle = THEME.panel
  ctx.beginPath()
  ctx.arc(x, y, MAGNET_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.stroke()
  noGlow(ctx)
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(pol, x, y + 1)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 画磁力弧线：每块磁铁外两圈渐隐半弧，弧口朝向按其对钢球的当前
 * 吸 / 斥关系旋转（吸引朝钢球内收，排斥背向钢球外张），提示力场。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFieldArcs(ctx: CanvasRenderingContext2D, state: MagnetState): void {
  const level = levelAt(state.level)
  const all = [...level.fixed, level.player]
  ctx.lineWidth = 1.5
  for (let mi = 0; mi < all.length; mi += 1) {
    const m = all[mi]!
    const color = polColor(mi === all.length - 1 ? state.polarity : m.polarity)
    const attract = m.polarity !== state.polarity
    const baseRot = Math.atan2(state.y - m.y, state.x - m.x)
    for (let ring = 1; ring <= 2; ring += 1) {
      const rr = MAGNET_R + 8 + ring * 11
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.28 - ring * 0.09
      // 吸引：弧口朝向钢球（内收）；排斥：弧背朝向钢球（外张）。
      const rot = attract ? baseRot : baseRot + Math.PI
      for (let seg = 0; seg < 3; seg += 1) {
        const a0 = rot + (seg * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.arc(m.x, m.y, rr, a0, a0 + 1.15)
        ctx.stroke()
      }
    }
  }
  ctx.globalAlpha = 1
}

/**
 * 画钢球受力箭头：从球心沿当前合力方向的发光箭头，长度按合力大小
 * 封顶，直观提示当前受力方向。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawForceArrow(ctx: CanvasRenderingContext2D, state: MagnetState): void {
  if (state.phase !== 'flying') return
  const level = levelAt(state.level)
  const f = forceAt(level, state.x, state.y, state.polarity)
  const mag = Math.hypot(f.fx, f.fy)
  if (mag < 1) return
  const len = Math.min(46, 10 + mag * 0.08)
  const ux = f.fx / mag
  const uy = f.fy / mag
  const x1 = state.x + ux * (BALL_R + 3)
  const y1 = state.y + uy * (BALL_R + 3)
  const x2 = state.x + ux * (BALL_R + 3 + len)
  const y2 = state.y + uy * (BALL_R + 3 + len)
  ctx.strokeStyle = accent(6)
  ctx.lineWidth = 2.5
  ctx.globalAlpha = 0.9
  glow(ctx, accent(6), 6)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  // 箭头头部。
  const hx = x2 + ux * 7
  const hy = y2 + uy * 7
  const px = -uy
  const py = ux
  ctx.beginPath()
  ctx.moveTo(hx, hy)
  ctx.lineTo(x2 - px * 4, y2 - py * 4)
  ctx.lineTo(x2 + px * 4, y2 + py * 4)
  ctx.closePath()
  ctx.fillStyle = accent(6)
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/**
 * 画一枚尖刺球：深色放射三角刺 + 红色圆核。
 * @param ctx - 画布上下文。
 * @param x - 圆心横坐标。
 * @param y - 圆心纵坐标。
 * @param r - 判定半径。
 */
function drawSpike(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const spikes = 8
  glow(ctx, THEME.bad, 8)
  ctx.fillStyle = '#3a3a4c'
  ctx.beginPath()
  for (let i = 0; i < spikes; i += 1) {
    const a = (i / spikes) * Math.PI * 2 - Math.PI / 2
    const ax = x + Math.cos(a) * r
    const ay = y + Math.sin(a) * r
    const a1 = a + Math.PI / spikes
    const a2 = a - Math.PI / spikes
    ctx.moveTo(ax, ay)
    ctx.lineTo(x + Math.cos(a1) * r * 0.45, y + Math.sin(a1) * r * 0.45)
    ctx.lineTo(x + Math.cos(a2) * r * 0.45, y + Math.sin(a2) * r * 0.45)
    ctx.closePath()
  }
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = THEME.bad
  ctx.beginPath()
  ctx.arc(x, y, r * 0.3, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画发光终点槽：金色脉冲圆环 + 中心渐变孔 + 「终」字。
 * @param ctx - 画布上下文。
 * @param x - 圆心横坐标。
 * @param y - 圆心纵坐标。
 * @param r - 捕获半径。
 * @param t - 回合内毫秒钟。
 */
function drawGoal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  const pulse = 0.6 + 0.4 * Math.sin(t / 320)
  glow(ctx, THEME.gold, 16 * pulse)
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  const grad = ctx.createRadialGradient(x, y, 1, x, y, r)
  grad.addColorStop(0, 'rgba(224,175,104,0.5)')
  grad.addColorStop(1, 'rgba(224,175,104,0.05)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = THEME.gold
  ctx.fillText('终', x, y + 1)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 画金属钢球与拖尾：渐亮拖尾折线 + 径向渐变球体高光。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBall(ctx: CanvasRenderingContext2D, state: MagnetState): void {
  // 拖尾：越旧越透明。
  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1]!
    const b = trail[i]!
    ctx.strokeStyle = accent(5)
    ctx.globalAlpha = (i / trail.length) * 0.5
    ctx.lineWidth = (i / trail.length) * BALL_R
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const grad = ctx.createRadialGradient(
    state.x - BALL_R * 0.35, state.y - BALL_R * 0.35, 1,
    state.x, state.y, BALL_R,
  )
  grad.addColorStop(0, '#f4f6ff')
  grad.addColorStop(0.45, '#aab4cc')
  grad.addColorStop(1, '#5a647e')
  glow(ctx, accent(5), 8)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(state.x, state.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画底部极性按钮：当前极性主色胶囊 + 「空格 翻转」提示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawPolarityButton(ctx: CanvasRenderingContext2D, state: MagnetState): void {
  const bw = 148
  const bh = 30
  const bx = (W - bw) / 2
  const by = H - 42
  const color = polColor(state.polarity)
  glow(ctx, color, 10)
  roundRectPath(ctx, bx, by, bw, bh, 15)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(state.polarity + ' 极 · 空格 翻转', W / 2, by + bh / 2 + 1)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 渲染一帧完整画面（含事件粒子爆发与拖尾维护）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否暂停（暂停时叠加遮罩）。
 */
export function renderMagnet(ctx: CanvasRenderingContext2D, state: MagnetState, paused: boolean): void {
  drawBackground(ctx, W, H)
  const level = levelAt(state.level)

  // 事件 → 粒子爆发（渲染层副作用，逻辑层保持纯数据）。
  for (const ev of state.events) {
    if (ev.type === 'dead') particles.burst(ev.x, ev.y, THEME.bad, 16, 160)
    else if (ev.type === 'won') particles.burst(ev.x, ev.y, THEME.gold, 18, 150)
    else if (ev.type === 'flip') particles.burst(ev.x, ev.y, polColor(state.polarity), 5, 90)
    else if (ev.type === 'cleared') particles.burst(W / 2, H / 2, THEME.gold, 24, 200)
  }

  // 拖尾维护：飞行中记录，其余阶段渐缩清空。
  if (state.phase === 'flying') {
    trail.push({ x: state.x, y: state.y })
    if (trail.length > TRAIL_MAX) trail.shift()
  } else if (trail.length > 0) {
    trail.shift()
  }

  drawFieldArcs(ctx, state)
  drawGoal(ctx, level.goal.x, level.goal.y, level.goal.r, state.t)
  for (const sp of level.spikes) drawSpike(ctx, sp.x, sp.y, sp.r)
  for (const m of level.fixed) drawMagnet(ctx, m.x, m.y, m.polarity, false, state.t, 0)
  drawMagnet(ctx, level.player.x, level.player.y, state.polarity, true, state.t, state.flipFlash)
  if (state.phase !== 'dead') {
    drawBall(ctx, state)
    drawForceArrow(ctx, state)
  }

  // HUD。
  hudPair(ctx, 14, 24, '关卡', state.level + '/' + LEVEL_COUNT)
  hudPair(ctx, 14, 44, '分数', String(state.score))
  hudPair(ctx, W - 14, 24, '生命', '♥'.repeat(Math.max(0, state.lives)), 'right', state.lives > 0 ? THEME.bad : THEME.textMuted)
  hudPair(ctx, W - 14, 44, '极性', state.polarity + '（红 N / 蓝 S）', 'right', polColor(state.polarity))
  drawPolarityButton(ctx, state)

  particles.tick(ctx, 16)

  // 阶段遮罩。
  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'dead') {
    drawOverlay(ctx, W, H, '撞上尖刺', '剩余 ' + state.lives + ' 命，稍后重来', THEME.bad)
  } else if (state.phase === 'won') {
    drawOverlay(ctx, W, H, '过关', '+' + state.lastPoints + ' 分 · 进入下一关', THEME.good)
  } else if (state.phase === 'cleared') {
    drawOverlay(ctx, W, H, '全部通关', '总分 ' + state.score + ' · R 再来一局', THEME.gold)
  } else if (state.phase === 'gameover') {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · R 重开', THEME.bad)
  }
}
