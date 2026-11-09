/**
 * 吹气球渲染层：居中大气球随充气量渐大（椭圆体 + 表面高光 + 底部
 * 结节与摆动气线），充气量逼近阈值时抖动预警；顶部 HUD（分数 / 第
 * n 只 / 潜在分）、底部 10 个存入进度点、存入金粒与爆裂红粒、暂停与
 * 结束遮罩。
 */
import type { BalloonState } from './logic.ts'
import { BALLOON_COUNT, W, H } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

/** 未充气 / 满气时的气球半径 px。 */
const R_MIN = 30
const R_MAX = 130
/** 气球中心。 */
const CX = W / 2
const CY = H / 2 + 26

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/**
 * 近爆抖动幅度：充气量占阈值比例超过 0.7 后随比例增长，其余为 0。
 * @param state - 当前状态。
 * @returns 抖动幅度 px。
 */
function wobble(state: BalloonState): number {
  const ratio = state.threshold > 0 ? state.inflate / state.threshold : 0
  if (ratio <= 0.7) return 0
  return (ratio - 0.7) * 26
}

/**
 * 画气球本体：气线、椭圆体、轮廓、结节与表面高光。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBalloon(ctx: CanvasRenderingContext2D, state: BalloonState): void {
  const color = accent(state.balloonIndex + 2)
  const r = R_MIN + Math.min(1.35, state.inflate) * (R_MAX - R_MIN)
  const amp = wobble(state)
  const jx = Math.sin(state.t / 37) * amp + Math.sin(state.t / 61) * amp * 0.5
  const jy = Math.cos(state.t / 43) * amp * 0.7
  const x = CX + jx, y = CY + jy
  const danger = amp > 0

  // 气线：从结节向下的摆动二次曲线。
  ctx.strokeStyle = 'rgba(226,226,238,0.4)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y + r * 1.08 + 7)
  ctx.quadraticCurveTo(x + 14 + Math.sin(state.t / 300) * 8, y + r * 1.08 + 34, x - 6 + Math.sin(state.t / 220) * 10, y + r * 1.08 + 62)
  ctx.stroke()

  // 椭圆本体（近爆转警示光晕）。
  glow(ctx, danger ? THEME.bad : color, danger ? 26 : 16)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 1.08, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 轮廓加深。
  ctx.strokeStyle = 'rgba(13,13,20,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 1.08, 0, 0, Math.PI * 2)
  ctx.stroke()
  // 底部结节。
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x - 6, y + r * 1.08 + 1)
  ctx.lineTo(x + 6, y + r * 1.08 + 1)
  ctx.lineTo(x, y + r * 1.08 - 7)
  ctx.closePath()
  ctx.fill()
  // 表面高光：左上白色椭圆斑 + 细长次高光。
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.38, y - r * 0.44, r * 0.22, r * 0.32, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.16, y - r * 0.62, r * 0.09, r * 0.15, -0.4, 0, Math.PI * 2)
  ctx.fill()

  // 潜在分随球显示。
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = THEME.text
  ctx.fillText(String(Math.floor(state.inflate * 100)), x, y)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 底部 10 个存入进度点：已存金色并标分、当前呼吸描边、未到暗点。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawDots(ctx: CanvasRenderingContext2D, state: BalloonState): void {
  const gap = 34
  const x0 = W / 2 - ((BALLOON_COUNT - 1) * gap) / 2
  const y = H - 22
  for (let i = 0; i < BALLOON_COUNT; i += 1) {
    const x = x0 + i * gap
    if (i < state.banked.length) {
      glow(ctx, THEME.gold, 8)
      ctx.fillStyle = THEME.gold
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
      ctx.font = '600 10px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText(String(state.banked[i]), x, y - 10)
    } else if (i === state.balloonIndex - 1 && !state.over) {
      const breathe = 1 + Math.sin(state.t / 240) * 0.2
      ctx.strokeStyle = accent(i + 2)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 5 * breathe, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = 'rgba(226,226,238,0.18)'
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/**
 * 渲染一帧：背景、气球、粒子、HUD、进度点、遮罩与待机提示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderBalloon(ctx: CanvasRenderingContext2D, state: BalloonState, paused: boolean): void {
  drawBackground(ctx, W, H)

  // 消费逻辑事件：存入金粒、爆裂红粒、结算礼花。
  for (const ev of state.events) {
    if (ev.type === 'bank') {
      particles.burst(CX, CY, THEME.gold, 18, 200)
    } else if (ev.type === 'pop') {
      particles.burst(CX, CY, THEME.bad, 34, 300)
      particles.burst(CX, CY, THEME.gold, 14, 200)
    } else {
      particles.burst(CX, CY, THEME.good, 40, 320)
    }
  }

  if (!state.over || !state.popped) drawBalloon(ctx, state)
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：分数 / 第 n 只 / 潜在分。
  const hudY = 20
  hudPair(ctx, 12, hudY, '分数', String(state.runScore), 'left', state.popped ? THEME.bad : THEME.text)
  hudPair(ctx, W / 2, hudY, '第', state.balloonIndex + ' / ' + BALLOON_COUNT + ' 只', 'center')
  hudPair(ctx, W - 12, hudY, '潜在', String(Math.floor(state.inflate * 100)), 'right', accent(state.balloonIndex + 2))

  drawDots(ctx, state)

  // 待机提示：未按住且未充气时居中提示。
  if (!state.over && !state.holding && state.inflate === 0 && !paused) {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('按住充气 · 松手存分 · 越大越值钱也越接近爆炸', W / 2, CY - R_MAX - 34)
  }

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over && state.popped) {
    drawOverlay(ctx, W, H, '砰！爆了', '第 ' + state.balloonIndex + ' 只爆掉 · 本局清零 · 按 R 重开', THEME.bad)
  } else if (state.over && state.complete) {
    drawOverlay(ctx, W, H, '回合完成', state.runScore + ' 分 · 10 只全部存入 · 按 R 重开', THEME.good)
  }
}
