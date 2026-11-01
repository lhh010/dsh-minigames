/**
 * 丢纸团渲染层：办公室简约背景（墙裙、窗户、地板、盆栽）、立于地板的
 * 纸篓（口沿发光）、旋转的皱纸团、弹弓式瞄准虚线（含按当前风力预演的
 * 点状轨迹）、风力 HUD（箭头长度 = 强度、方向 = 风向）、命中溅射粒子与
 * 飘字、脱手/结束遮罩。
 */
import {
  W,
  H,
  FLOOR_Y,
  BALL_R,
  ORIGIN,
  BIN_W,
  BIN_H,
  WIND_MAX,
  MAX_MISSES,
  COMBO_CAP,
  GRAVITY,
  FLOAT_MS,
  binMouthY,
  dragToVelocity,
  type PaperTossState,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 办公室墙裙色。 */
const WALL_LOWER = '#1c1c28'
/** 地板色。 */
const FLOOR_COLOR = '#262632'
/** 纸篓主体色与口沿色。 */
const BIN_BODY = '#2e2e3e'
const BIN_EDGE = '#5a5a74'
/** 纸团色与折痕色。 */
const PAPER = '#e8e8f0'
const PAPER_CREASE = 'rgba(21,21,27,0.35)'

/**
 * 画办公室背景：上墙、墙裙分界、地板、一扇窗户与一盆绿植（纯装饰）。
 * @param ctx - 画布上下文。
 */
function drawOffice(ctx: CanvasRenderingContext2D): void {
  // 墙裙分界线。
  ctx.strokeStyle = 'rgba(52,52,74,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, FLOOR_Y)
  ctx.lineTo(W, FLOOR_Y)
  ctx.stroke()
  // 地板。
  ctx.fillStyle = FLOOR_COLOR
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)
  ctx.strokeStyle = 'rgba(52,52,74,0.5)'
  ctx.lineWidth = 1
  for (let i = 1; i < 6; i += 1) {
    const x = (W / 6) * i
    ctx.beginPath()
    ctx.moveTo(x, FLOOR_Y)
    ctx.lineTo(x - 14, H)
    ctx.stroke()
  }
  // 窗户：边框 + 十字格 + 微光。
  const wx = W * 0.34
  const wy = 54
  const ww = 150
  const wh = 96
  ctx.fillStyle = 'rgba(122,162,247,0.10)'
  ctx.fillRect(wx, wy, ww, wh)
  ctx.strokeStyle = BIN_EDGE
  ctx.lineWidth = 2
  ctx.strokeRect(wx, wy, ww, wh)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(wx + ww / 2, wy)
  ctx.lineTo(wx + ww / 2, wy + wh)
  ctx.moveTo(wx, wy + wh / 2)
  ctx.lineTo(wx + ww, wy + wh / 2)
  ctx.stroke()
  // 盆栽：花盆 + 两片叶。
  const px = W - 40
  const py = FLOOR_Y
  ctx.fillStyle = '#7a5a44'
  ctx.fillRect(px - 9, py - 16, 18, 16)
  ctx.fillStyle = '#5faa6a'
  ctx.beginPath()
  ctx.ellipse(px - 6, py - 26, 6, 12, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(px + 6, py - 26, 6, 12, 0.5, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画纸篓：梯形篓身 + 发光口沿（命中段展示期口沿更亮）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBin(ctx: CanvasRenderingContext2D, state: PaperTossState): void {
  const mouthY = binMouthY()
  const bottomHalf = BIN_W / 2 - 7
  const cx = state.binX + BIN_W / 2
  // 篓身梯形。
  ctx.fillStyle = BIN_BODY
  ctx.beginPath()
  ctx.moveTo(cx - BIN_W / 2, mouthY)
  ctx.lineTo(cx + BIN_W / 2, mouthY)
  ctx.lineTo(cx + bottomHalf, FLOOR_Y)
  ctx.lineTo(cx - bottomHalf, FLOOR_Y)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = BIN_EDGE
  ctx.lineWidth = 2
  ctx.stroke()
  // 篓身竖条纹。
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(90,90,116,0.5)'
  for (let i = 1; i < 4; i += 1) {
    const k = i / 4
    const xTop = cx - BIN_W / 2 + BIN_W * k
    const xBot = cx - bottomHalf + bottomHalf * 2 * k
    ctx.beginPath()
    ctx.moveTo(xTop, mouthY)
    ctx.lineTo(xBot, FLOOR_Y)
    ctx.stroke()
  }
  // 口沿：椭圆发光线。
  const rimColor = state.phase === 'result' && state.combo >= 1 ? THEME.gold : THEME.accents[0]!
  glow(ctx, rimColor, 10)
  ctx.strokeStyle = rimColor
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(cx, mouthY, BIN_W / 2, 5, 0, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
}

/**
 * 画纸团：白圆 + 数条随自转的皱折痕。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBall(ctx: CanvasRenderingContext2D, state: PaperTossState): void {
  const b = state.ball
  // 瞄准阶段纸团停在抛出点；result 阶段不再画（已入篓或落地结算）。
  if (state.phase === 'result' || state.phase === 'over') return
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.rotate(b.rot)
  glow(ctx, PAPER, 8)
  ctx.fillStyle = PAPER
  ctx.beginPath()
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = PAPER_CREASE
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-BALL_R * 0.7, -BALL_R * 0.2)
  ctx.lineTo(0, BALL_R * 0.4)
  ctx.lineTo(BALL_R * 0.7, -BALL_R * 0.1)
  ctx.moveTo(-BALL_R * 0.3, -BALL_R * 0.8)
  ctx.lineTo(0, 0)
  ctx.lineTo(BALL_R * 0.4, BALL_R * 0.8)
  ctx.stroke()
  ctx.restore()
}

/**
 * 画瞄准反馈：纸团到指针的弹弓拉线 + 按当前风向预演的点状轨迹
 * （与 logic.dragToVelocity 同一初速与物理，所见即所抛）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawAim(ctx: CanvasRenderingContext2D, state: PaperTossState): void {
  if (state.phase !== 'aim' || !state.aiming) return
  const v = dragToVelocity(state.aimFrom.x - state.aimTo.x, state.aimFrom.y - state.aimTo.y)
  // 拉线：按下点到当前指针的淡虚线。
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = 'rgba(226,226,238,0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(state.aimFrom.x, state.aimFrom.y)
  ctx.lineTo(state.aimTo.x, state.aimTo.y)
  ctx.stroke()
  ctx.setLineDash([])
  if (v === null) return
  // 预演轨迹：与 stepPaperToss 相同的积分（固定步长，纯视觉）。
  const dt = 0.045
  let x = ORIGIN.x
  let y = ORIGIN.y
  let vx = v.vx
  let vy = v.vy
  ctx.fillStyle = THEME.accents[6]!
  for (let i = 0; i < 22; i += 1) {
    vy += GRAVITY * dt
    vx += state.wind * dt
    x += vx * dt
    y += vy * dt
    if (y > FLOOR_Y || x > W || x < 0) break
    ctx.globalAlpha = 0.9 - i * 0.035
    ctx.beginPath()
    ctx.arc(x, y, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画风力 HUD：顶栏中央的水平箭头，长度 = 强度比例、指向 = 风向。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawWind(ctx: CanvasRenderingContext2D, state: PaperTossState): void {
  const cx = W / 2
  const y = 24
  const k = Math.abs(state.wind) / WIND_MAX
  const len = 14 + k * 46
  const dir = state.wind >= 0 ? 1 : -1
  const color = k > 0.66 ? THEME.bad : THEME.accents[0]!
  glow(ctx, color, 8)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - dir * len / 2, y)
  ctx.lineTo(cx + dir * (len / 2 - 6), y)
  ctx.stroke()
  // 箭头尖。
  const tipX = cx + dir * len / 2
  ctx.beginPath()
  ctx.moveTo(tipX, y)
  ctx.lineTo(tipX - dir * 8, y - 5)
  ctx.lineTo(tipX - dir * 8, y + 5)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('风力 ' + Math.round(k * 100) + '%', cx, y + 18)
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: PaperTossState): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = 'bold 18px system-ui, sans-serif'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / FLOAT_MS))
    ctx.globalAlpha = k
    ctx.fillStyle = THEME.gold
    ctx.fillText(fl.text, Math.max(40, Math.min(W - 40, fl.x)), Math.max(40, fl.y))
  }
  ctx.restore()
}

/**
 * 画 HUD：分数 / 连击 / 脱手次数与风力箭头。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: PaperTossState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  if (state.combo >= 2) {
    hudPair(ctx, 110, hudY, '连击', 'x' + state.combo + '/' + COMBO_CAP, 'left', THEME.gold)
  }
  hudPair(ctx, W - 10, hudY, '脱手', state.misses + '/' + MAX_MISSES, 'right', state.misses >= MAX_MISSES - 1 ? THEME.bad : THEME.text)
  drawWind(ctx, state)
}

/**
 * 渲染一帧：背景、纸篓、瞄准、纸团、粒子、飘字、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderPaperToss(ctx: CanvasRenderingContext2D, state: PaperTossState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawOffice(ctx)
  drawBin(ctx, state)
  drawAim(ctx, state)
  drawBall(ctx, state)

  // 消费逻辑层事件：命中迸发金色粒子，脱手迸发灰色纸屑。
  for (const ev of state.events) {
    if (ev.type === 'hit') particles.burst(ev.x, ev.y, THEME.gold, 22, 190)
    else particles.burst(ev.x, ev.y, '#8a8a9a', 12, 120)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawFloats(ctx, state)
  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 按 R 重开', THEME.bad)
  }
}
