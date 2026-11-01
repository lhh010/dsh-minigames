/**
 * 街头投篮渲染层：街头球场背景（地面、墙面、涂鸦感线条与球场弧线）、
 * 带支架的篮板 + 橙色筐 + 网（进球时网摆动用简单纵向缩放）、棕色篮球带
 * 纹路随自转、弹弓式瞄准拉线与预演轨迹 + 力度指示、进球金色粒子与空心
 * 球浮字「Swish!」、HUD 分数/连击/剩余时间与投数、暂停/结束遮罩。
 */
import {
  W,
  H,
  FLOOR_Y,
  BALL_R,
  ORIGIN,
  MAX_DRAG,
  RIM_R,
  BOARD_T,
  MAX_SHOTS,
  COMBO_CAP,
  GRAVITY,
  FLOAT_MS,
  boardOf,
  dragToVelocity,
  type HoopShotState,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 网摆动强度（0-1，进球置 1，逐帧衰减；纵向缩放表现摆动）。 */
let netKick = 0

/** 墙面下部色与地面沥青色。 */
const WALL_LOWER = '#1d1d29'
const FLOOR_COLOR = '#2a2a36'
/** 篮板色与描边色。 */
const BOARD_FILL = '#cfd6e4'
const BOARD_EDGE = '#34344a'
/** 篮筐橙色与篮网色。 */
const RIM_COLOR = '#f7768e'
const RIM_HOT = '#ff9e64'
const NET_COLOR = 'rgba(226,226,238,0.75)'
/** 篮球棕色与纹路色。 */
const BALL_COLOR = '#c7742f'
const BALL_SEAM = 'rgba(21,21,27,0.55)'
/** 涂鸦线色。 */
const GRAFFITI = 'rgba(122,162,247,0.18)'

/**
 * 画街头球场背景：墙面分界、沥青地面、球场罚球弧与几条涂鸦感曲线
 * （位置固定，纯装饰）。
 * @param ctx - 画布上下文。
 */
function drawStreet(ctx: CanvasRenderingContext2D): void {
  // 墙面下部色带与分界线。
  ctx.fillStyle = WALL_LOWER
  ctx.fillRect(0, FLOOR_Y - 120, W, 120)
  ctx.strokeStyle = 'rgba(52,52,74,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, FLOOR_Y - 120)
  ctx.lineTo(W, FLOOR_Y - 120)
  ctx.moveTo(0, FLOOR_Y)
  ctx.lineTo(W, FLOOR_Y)
  ctx.stroke()
  // 地面。
  ctx.fillStyle = FLOOR_COLOR
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)
  // 球场罚球弧（地面上的白线，透视压扁的椭圆）。
  ctx.strokeStyle = 'rgba(226,226,238,0.22)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(ORIGIN.x + 20, FLOOR_Y + 14, 90, 12, 0, 0, Math.PI * 2)
  ctx.stroke()
  // 涂鸦感曲线：几条固定的彩色弧线挂在墙上。
  ctx.lineWidth = 4
  ctx.strokeStyle = GRAFFITI
  ctx.beginPath()
  ctx.moveTo(70, 80)
  ctx.quadraticCurveTo(150, 40, 230, 96)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(300, 70)
  ctx.quadraticCurveTo(380, 130, 470, 64)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(187,154,247,0.14)'
  ctx.beginPath()
  ctx.moveTo(140, 150)
  ctx.quadraticCurveTo(240, 190, 340, 140)
  ctx.stroke()
  // 地面方格缝。
  ctx.strokeStyle = 'rgba(52,52,74,0.5)'
  ctx.lineWidth = 1
  for (let i = 1; i < 7; i += 1) {
    const x = (W / 7) * i
    ctx.beginPath()
    ctx.moveTo(x, FLOOR_Y)
    ctx.lineTo(x - 16, H)
    ctx.stroke()
  }
}

/**
 * 画篮架：地面立柱、篮板（含内框）、橙色筐口椭圆与网（进球瞬间网纵向
 * 拉伸回弹表现摆动）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHoop(ctx: CanvasRenderingContext2D, state: HoopShotState): void {
  const { rimX, rimY } = state.hoop
  const { boardX, topY, bottomY } = boardOf(state.hoop)
  // 立柱：从地面到篮板背后的弯杆。
  ctx.strokeStyle = BOARD_EDGE
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(boardX + BOARD_T + 8, FLOOR_Y)
  ctx.lineTo(boardX + BOARD_T + 8, bottomY)
  ctx.lineTo(boardX + BOARD_T, rimY)
  ctx.stroke()
  // 篮板：白色板面 + 描边 + 内框（瞄准参考）。
  ctx.fillStyle = BOARD_FILL
  ctx.fillRect(boardX, topY, BOARD_T, bottomY - topY)
  ctx.strokeStyle = BOARD_EDGE
  ctx.lineWidth = 2
  ctx.strokeRect(boardX, topY, BOARD_T, bottomY - topY)
  // 筐口：橙色椭圆口沿（result 期进球则更亮）。
  const rimColor = state.phase === 'result' && state.combo >= 1 ? RIM_HOT : RIM_COLOR
  glow(ctx, rimColor, 10)
  ctx.strokeStyle = rimColor
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.ellipse(rimX, rimY, RIM_R, 5, 0, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  // 网：从筐口向下的梯形网格线，纵向按 netKick 拉伸。
  const netH = (1 + netKick * 0.6) * 26
  const netBottomHalf = RIM_R * 0.55
  ctx.strokeStyle = NET_COLOR
  ctx.lineWidth = 1.5
  for (let i = 0; i <= 4; i += 1) {
    const k = i / 4
    const xTop = rimX - RIM_R + RIM_R * 2 * k
    const xBot = rimX - netBottomHalf + netBottomHalf * 2 * k
    ctx.beginPath()
    ctx.moveTo(xTop, rimY)
    ctx.lineTo(xBot, rimY + netH)
    ctx.stroke()
  }
  for (let j = 1; j <= 2; j += 1) {
    const ky = j / 3
    const half = RIM_R + (netBottomHalf - RIM_R) * ky
    ctx.beginPath()
    ctx.ellipse(rimX, rimY + netH * ky, half, 4, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/**
 * 画篮球：棕色圆 + 十字与弧线纹路，随自转旋转。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBall(ctx: CanvasRenderingContext2D, state: HoopShotState): void {
  const b = state.ball
  // result 阶段不再画（已入筐或落地结算）。
  if (state.phase === 'result' || state.phase === 'over') return
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.rotate(b.rot)
  glow(ctx, BALL_COLOR, 8)
  ctx.fillStyle = BALL_COLOR
  ctx.beginPath()
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = BALL_SEAM
  ctx.lineWidth = 1.5
  // 十字纹路 + 两侧弧线。
  ctx.beginPath()
  ctx.moveTo(-BALL_R, 0)
  ctx.lineTo(BALL_R, 0)
  ctx.moveTo(0, -BALL_R)
  ctx.lineTo(0, BALL_R)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, 0, BALL_R * 0.55, BALL_R, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, 0, BALL_R, BALL_R * 0.55, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * 画瞄准反馈：球到指针的弹弓拉线、按当前拖拽预演的点状轨迹（仅重力，
 * 所见即所投）与出手点旁的力度指示条。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawAim(ctx: CanvasRenderingContext2D, state: HoopShotState): void {
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
  // 预演轨迹：与 stepHoopShot 相同的积分（固定步长，纯视觉）。
  const dt = 0.045
  let x = ORIGIN.x
  let y = ORIGIN.y
  let vx = v.vx
  let vy = v.vy
  ctx.fillStyle = THEME.accents[6]!
  for (let i = 0; i < 24; i += 1) {
    vy += GRAVITY * dt
    x += vx * dt
    y += vy * dt
    if (y > FLOOR_Y || x > W || x < 0) break
    ctx.globalAlpha = 0.9 - i * 0.032
    ctx.beginPath()
    ctx.arc(x, y, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  // 力度指示：出手点左侧的竖条，比例 = 拖拽长度 / 上限。
  const len = Math.hypot(state.aimFrom.x - state.aimTo.x, state.aimFrom.y - state.aimTo.y)
  const power = Math.min(len, MAX_DRAG) / MAX_DRAG
  const barX = ORIGIN.x - 26
  const barH = 44
  ctx.fillStyle = 'rgba(52,52,74,0.9)'
  ctx.fillRect(barX, ORIGIN.y - barH / 2, 6, barH)
  const color = power > 0.8 ? THEME.bad : power > 0.4 ? THEME.gold : THEME.good
  ctx.fillStyle = color
  ctx.fillRect(barX, ORIGIN.y + barH / 2 - barH * power, 6, barH * power)
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: HoopShotState): void {
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
 * 画 HUD：分数 / 连击 / 剩余时间 / 投数。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: HoopShotState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  if (state.combo >= 2) {
    hudPair(ctx, 110, hudY, '连击', 'x' + state.combo + '/' + COMBO_CAP, 'left', THEME.gold)
  }
  hudPair(ctx, W - 90, hudY, '投数', state.shots + '/' + MAX_SHOTS, 'right')
  const sec = Math.ceil(state.timeMs / 1000)
  hudPair(ctx, W - 10, hudY, '时间', sec + 's', 'right', sec <= 10 ? THEME.bad : THEME.text)
}

/**
 * 渲染一帧：背景、篮架、瞄准、篮球、粒子、飘字、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderHoopShot(ctx: CanvasRenderingContext2D, state: HoopShotState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawStreet(ctx)
  drawHoop(ctx, state)
  drawAim(ctx, state)
  drawBall(ctx, state)

  // 消费逻辑层事件：进球迸发金色粒子并触发网摆动，碰板/碰筐迸小火花，
  // 脱手迸发灰色尘土。
  for (const ev of state.events) {
    if (ev.type === 'score') {
      particles.burst(ev.x, ev.y, THEME.gold, ev.swish ? 30 : 20, 190)
      netKick = 1
    } else if (ev.type === 'board') {
      particles.burst(ev.x, ev.y, THEME.accents[0]!, 6, 100)
    } else if (ev.type === 'rim') {
      particles.burst(ev.x, ev.y, RIM_COLOR, 6, 100)
    } else {
      particles.burst(ev.x, ev.y, '#8a8a9a', 12, 120)
    }
  }
  netKick = Math.max(0, netKick - 0.04)
  particles.tick(ctx, paused ? 0 : 16)

  drawFloats(ctx, state)
  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 按 R 重开', THEME.bad)
  }
}
