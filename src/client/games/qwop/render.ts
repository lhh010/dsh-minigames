/**
 * 手忙脚乱 QWOP 渲染层：侧面跑道选手（躯干/大腿/小腿线段关节）、每
 * 10 米标尺与 50 米终点旗、QWOP 四键提示（按下高亮 + 各自驱动哪个关
 * 节）、距离/最佳 HUD 与 0→50 m 进度条、踏步尘土与摔倒粒子、暂停/
 * 摔倒/过线遮罩。纯绘制，无状态（粒子系统实例除外）。
 */
import {
  W, H, GOAL_M, qwopJoints, distanceScore,
  type QwopState, type QwopInput, type QwopFallReason,
} from './logic.ts'
import { THEME, accent, createParticles, drawOverlay, drawBackground, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 米 → 像素比例。 */
const M_PX = 110
/** 跑道地面在画布上的 y。 */
const GROUND_Y = H - 76
/** 选手在画布上的锚点 x（摄像机跟随髋部）。 */
const ANCHOR_X = Math.round(W * 0.34)
/** 左腿配色（蓝）/ 右腿配色（红）。 */
const COLOR_L = accent(0)
const COLOR_R = accent(4)

/** 世界米坐标 → 画布 x。 */
function wx(m: number, hipX: number): number {
  return ANCHOR_X + (m - hipX) * M_PX
}
/** 世界高度米 → 画布 y。 */
function wy(h: number): number {
  return GROUND_Y - h * M_PX
}

/** 渲染层自有的粒子系统（每个画布一个实例）。 */
const particles = createParticles()

/** 摔倒原因文案。 */
const FALL_TEXT: Record<QwopFallReason, string> = {
  torso: '躯干趴地',
  knee: '膝盖着地',
  head: '头着地',
}

/**
 * 画跑道：地面带、每米刻度、每 10 米标尺柱（带米数）、起点线与 50 米
 * 终点方格旗。
 * @param ctx - 画布上下文。
 * @param hipX - 选手当前髋 x（米，摄像机跟随）。
 */
function drawTrack(ctx: CanvasRenderingContext2D, hipX: number): void {
  // 地面带。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, GROUND_Y)
  ctx.lineTo(W, GROUND_Y)
  ctx.stroke()

  // 可见米范围（画布外一圈）。
  const firstM = Math.floor((hipX - ANCHOR_X / M_PX) - 1)
  const lastM = Math.ceil(hipX + (W - ANCHOR_X) / M_PX + 1)
  ctx.textAlign = 'center'
  for (let m = Math.max(0, firstM); m <= lastM; m += 1) {
    const x = wx(m, hipX)
    const isTen = m % 10 === 0
    // 每米小刻度，每 10 米长刻度 + 标尺柱 + 米数。
    ctx.strokeStyle = isTen ? THEME.textMuted : 'rgba(226,226,238,0.22)'
    ctx.lineWidth = isTen ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(x, GROUND_Y)
    ctx.lineTo(x, GROUND_Y + (isTen ? 14 : 7))
    ctx.stroke()
    if (isTen) {
      ctx.strokeStyle = 'rgba(226,226,238,0.28)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, GROUND_Y)
      ctx.lineTo(x, GROUND_Y - 30)
      ctx.stroke()
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText(m + 'm', x, GROUND_Y - 36)
    }
  }

  // 起点线。
  const sx = wx(0, hipX)
  if (sx > -20 && sx < W + 20) {
    ctx.strokeStyle = THEME.textMuted
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(sx, GROUND_Y)
    ctx.lineTo(sx, GROUND_Y - 64)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 50 米终点方格旗柱。
  const fx = wx(GOAL_M, hipX)
  if (fx > -30 && fx < W + 30) {
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(fx, GROUND_Y)
    ctx.lineTo(fx, GROUND_Y - 84)
    ctx.stroke()
    const cell = 7
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        ctx.fillStyle = (row + col) % 2 === 0 ? THEME.text : THEME.panel
        ctx.fillRect(fx + 1 + col * cell, GROUND_Y - 84 + row * cell, cell, cell)
      }
    }
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText('50m 冲线', fx + 8, GROUND_Y - 60)
  }
}

/**
 * 画选手：躯干（髋→头粗线 + 头圆）、左右大腿/小腿线段关节、脚圆点；
 * 触地脚加亮；摔倒后保持瘫地姿态（物理沉降后的最终位形）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawRunner(ctx: CanvasRenderingContext2D, state: QwopState): void {
  const j = qwopJoints(state)
  const hip = { x: wx(j.hipX, state.hipX), y: wy(j.hipY) }
  const head = { x: wx(j.headX, state.hipX), y: wy(j.headY) }
  const kneeL = { x: wx(j.kneeLX, state.hipX), y: wy(j.kneeLY) }
  const footL = { x: wx(j.footLX, state.hipX), y: wy(Math.max(0, j.footLY)) }
  const kneeR = { x: wx(j.kneeRX, state.hipX), y: wy(j.kneeRY) }
  const footR = { x: wx(j.footRX, state.hipX), y: wy(Math.max(0, j.footRY)) }

  ctx.lineCap = 'round'

  // 左腿（先画，被右腿半遮）。
  drawLimb(ctx, hip, kneeL, footL, COLOR_L, state.groundedL)

  // 躯干。
  glow(ctx, THEME.text, 6)
  ctx.strokeStyle = THEME.text
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(hip.x, hip.y)
  ctx.lineTo(head.x, head.y)
  ctx.stroke()
  noGlow(ctx)

  // 头。
  glow(ctx, THEME.text, 8)
  ctx.fillStyle = THEME.text
  ctx.beginPath()
  ctx.arc(head.x, head.y - 6, 9, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)

  // 右腿（后画，在前）。
  drawLimb(ctx, hip, kneeR, footR, COLOR_R, state.groundedR)

  // 髋关节点。
  ctx.fillStyle = THEME.panel
  ctx.strokeStyle = THEME.text
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(hip.x, hip.y, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

/**
 * 画一条腿：大腿 + 小腿线段与脚圆点；触地时整条提亮发光。
 * @param ctx - 画布上下文。
 * @param hip - 髋画布坐标。
 * @param knee - 膝画布坐标。
 * @param foot - 脚画布坐标（y 已夹到地面）。
 * @param color - 该腿配色。
 * @param grounded - 是否触地。
 */
function drawLimb(
  ctx: CanvasRenderingContext2D,
  hip: { x: number, y: number },
  knee: { x: number, y: number },
  foot: { x: number, y: number },
  color: string,
  grounded: boolean,
): void {
  if (grounded) glow(ctx, color, 10)
  ctx.strokeStyle = grounded ? color : 'rgba(226,226,238,0.5)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(hip.x, hip.y)
  ctx.lineTo(knee.x, knee.y)
  ctx.lineTo(foot.x, foot.y)
  ctx.stroke()
  noGlow(ctx)
  // 脚圆点（触地更亮更大）。
  ctx.fillStyle = grounded ? color : 'rgba(226,226,238,0.45)'
  ctx.beginPath()
  ctx.arc(foot.x, foot.y, grounded ? 5 : 3.5, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画 HUD：左上距离、右上本次会话最佳、顶部 0→50 m 进度条。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param best - 本次会话最佳距离（米）。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: QwopState, best: number): void {
  hudPair(ctx, 12, 24, '距离', distanceScore(state) + ' m')
  hudPair(ctx, W - 12, 24, '最佳', Math.floor(best) + ' m', 'right', THEME.gold)

  // 进度条：0 → 50 m。
  const barX = 12
  const barW = W - 24
  const barY = 34
  ctx.fillStyle = 'rgba(30,30,42,0.9)'
  roundRectPath(ctx, barX, barY, barW, 8, 4)
  ctx.fill()
  const k = Math.max(0, Math.min(1, state.dist / GOAL_M))
  if (k > 0) {
    glow(ctx, THEME.good, 6)
    ctx.fillStyle = THEME.good
    roundRectPath(ctx, barX, barY, Math.max(6, barW * k), 8, 4)
    ctx.fill()
    noGlow(ctx)
  }
}

/**
 * 画 QWOP 四键提示：按下高亮，并标注各键驱动的关节。
 * @param ctx - 画布上下文。
 * @param input - 当前输入。
 */
function drawKeys(ctx: CanvasRenderingContext2D, input: QwopInput): void {
  const keys: { label: string, hint: string, on: boolean, color: string }[] = [
    { label: 'Q', hint: '左大腿', on: input.q, color: COLOR_L },
    { label: 'W', hint: '右大腿', on: input.w, color: COLOR_R },
    { label: 'O', hint: '左小腿', on: input.o, color: COLOR_L },
    { label: 'P', hint: '右小腿', on: input.p, color: COLOR_R },
  ]
  const bw = 64
  const bh = 34
  const gap = 14
  const total = keys.length * bw + (keys.length - 1) * gap
  const x0 = (W - total) / 2
  const y0 = H - 46
  ctx.textAlign = 'center'
  keys.forEach((k, i): void => {
    const x = x0 + i * (bw + gap)
    if (k.on) glow(ctx, k.color, 12)
    ctx.fillStyle = k.on ? k.color : 'rgba(30,30,42,0.9)'
    roundRectPath(ctx, x, y0, bw, bh, 8)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = k.on ? k.color : THEME.panelEdge
    ctx.lineWidth = 1.5
    roundRectPath(ctx, x, y0, bw, bh, 8)
    ctx.stroke()
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillStyle = k.on ? '#10101a' : THEME.text
    ctx.fillText(k.label, x + bw / 2, y0 + 16)
    ctx.font = '600 9px system-ui, sans-serif'
    ctx.fillStyle = k.on ? 'rgba(16,16,26,0.8)' : THEME.textMuted
    ctx.fillText(k.hint, x + bw / 2, y0 + 28)
  })
}

/**
 * 渲染一帧：背景、跑道、选手、事件粒子、HUD、按键提示、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param input - 当前输入（按键高亮）。
 * @param paused - 是否显示暂停遮罩。
 * @param best - 本次会话最佳距离（米）。
 */
export function renderQwop(
  ctx: CanvasRenderingContext2D, state: QwopState, input: QwopInput, paused: boolean, best: number,
): void {
  drawBackground(ctx, W, H)
  drawTrack(ctx, state.hipX)
  drawRunner(ctx, state)

  // 消费逻辑层事件：踏步尘土、摔倒迸发、过线庆祝。
  for (const ev of state.events) {
    if (ev.type === 'step') {
      particles.burst(wx(ev.x, state.hipX), GROUND_Y - 2, ev.side === 'left' ? COLOR_L : COLOR_R, 5, 90)
    } else if (ev.type === 'fall') {
      particles.burst(wx(ev.x, state.hipX), GROUND_Y - 26, THEME.bad, 30, 260)
    } else if (ev.type === 'finish') {
      particles.burst(wx(ev.x, state.hipX), GROUND_Y - 60, THEME.gold, 40, 300)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHud(ctx, state, best)
  drawKeys(ctx, input)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'fallen') {
    const why = state.fallReason === null ? '' : FALL_TEXT[state.fallReason]
    drawOverlay(ctx, W, H, '摔倒了', why + ' · 跑了 ' + distanceScore(state) + ' m · 按 R 重开', THEME.bad)
  } else if (state.phase === 'finished') {
    drawOverlay(ctx, W, H, '冲线成功', '跑完 50 m · 按 R 再来一局', THEME.good)
  }
}
