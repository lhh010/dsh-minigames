/**
 * 洞穴飞行渲染层：岩洞质感的上下壁（折线填充 + 段内确定性锯齿钟乳石
 * + 边缘高光）、直升机（旋翼旋转动画、机身随垂直速度俯仰、尾桨）、
 * 随深入渐暗的光照（机体周围径向灯光渐变）、坠毁爆炸粒子、距离 /
 * 最佳 HUD 与结束 / 暂停遮罩。
 */
import {
  W,
  H,
  SEG_W,
  SUB_MS,
  ceilingAt,
  floorAt,
  mulberry32,
  speedOf,
  type CopterState,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 机体在屏幕上的固定横坐标（世界卷动，机体不动）。 */
const PLAYER_X = 120

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 岩壁填充色与边缘高光色。 */
const ROCK = '#232330'
const ROCK_EDGE = '#4a4a62'

/**
 * 世界横坐标 → 屏幕横坐标。
 * @param worldX - 机体当前世界横坐标。
 * @param x - 待变换的世界横坐标。
 * @returns 屏幕横坐标 px。
 */
function toScreenX(worldX: number, x: number): number {
  return x - worldX + PLAYER_X
}

/**
 * 画上下岩壁：段边界折线整体填充，段内画确定性锯齿钟乳石/石笋，
 * 沿边缘描一条高光。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawCave(ctx: CanvasRenderingContext2D, state: CopterState): void {
  const seed = state.seed
  const i0 = Math.max(0, Math.floor((state.worldX - PLAYER_X) / SEG_W) - 1)
  const i1 = i0 + Math.ceil(W / SEG_W) + 3

  // 折线顶点（屏幕坐标）。
  const xs: number[] = []
  const cs: number[] = []
  const fs: number[] = []
  for (let i = i0; i <= i1; i += 1) {
    const wx = i * SEG_W
    xs.push(toScreenX(state.worldX, wx))
    cs.push(ceilingAt(seed, wx))
    fs.push(floorAt(seed, wx))
  }

  ctx.fillStyle = ROCK
  // 上壁：折线以上到画布顶。
  ctx.beginPath()
  ctx.moveTo(xs[0]!, 0)
  for (let i = 0; i < xs.length; i += 1) ctx.lineTo(xs[i]!, cs[i]!)
  ctx.lineTo(xs[xs.length - 1]!, 0)
  ctx.closePath()
  ctx.fill()
  // 下壁：折线以下到画布底。
  ctx.beginPath()
  ctx.moveTo(xs[0]!, H)
  for (let i = 0; i < xs.length; i += 1) ctx.lineTo(xs[i]!, fs[i]!)
  ctx.lineTo(xs[xs.length - 1]!, H)
  ctx.closePath()
  ctx.fill()

  // 锯齿钟乳石（上壁向下）与石笋（下壁向上）：每段 3 颗，段号确定性。
  ctx.fillStyle = ROCK
  for (let i = i0; i < i1; i += 1) {
    const rng = mulberry32((Math.floor(seed) * 31 + i * 97) >>> 0)
    for (let k = 0; k < 3; k += 1) {
      const fx = i * SEG_W + rng() * SEG_W
      const len = 5 + rng() * 13
      const base = rng() * 4
      const sx = toScreenX(state.worldX, fx)
      // 上壁钟乳石。
      ctx.beginPath()
      ctx.moveTo(sx - base - 2, ceilingAt(seed, fx))
      ctx.lineTo(sx, ceilingAt(seed, fx) + len)
      ctx.lineTo(sx + base + 2, ceilingAt(seed, fx))
      ctx.closePath()
      ctx.fill()
      // 下壁石笋。
      ctx.beginPath()
      ctx.moveTo(sx - base - 2, floorAt(seed, fx))
      ctx.lineTo(sx, floorAt(seed, fx) - len)
      ctx.lineTo(sx + base + 2, floorAt(seed, fx))
      ctx.closePath()
      ctx.fill()
    }
  }

  // 边缘高光：沿上下折线各描一条亮线。
  ctx.strokeStyle = ROCK_EDGE
  ctx.lineWidth = 2
  for (const ys of [cs, fs]) {
    ctx.beginPath()
    ctx.moveTo(xs[0]!, ys[0]!)
    for (let i = 1; i < xs.length; i += 1) ctx.lineTo(xs[i]!, ys[i]!)
    ctx.stroke()
  }
}

/**
 * 画洞穴深处渐暗 + 机体周围灯光：整幅盖一层以机体为透明中心的径向
 * 黑色渐变，越深入（距离越大）整体越暗。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawLight(ctx: CanvasRenderingContext2D, state: CopterState): void {
  const depth = Math.min(1, state.worldX / 15000)
  const maxDark = 0.22 + depth * 0.5
  const py = Math.max(24, Math.min(H - 24, state.y))
  const grad = ctx.createRadialGradient(PLAYER_X, py, 46, PLAYER_X, py, 250)
  grad.addColorStop(0, 'rgba(10,10,16,0)')
  grad.addColorStop(1, 'rgba(10,10,16,' + maxDark.toFixed(3) + ')')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
}

/**
 * 画直升机：机身随垂直速度俯仰，主旋翼高速旋转（残影盘 + 转叶），
 * 尾梁与尾桨、滑橇。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawCopter(ctx: CanvasRenderingContext2D, state: CopterState): void {
  const pitch = Math.max(-0.3, Math.min(0.3, state.vy * 0.0007))
  ctx.save()
  ctx.translate(PLAYER_X, state.y)
  ctx.rotate(pitch)

  // 尾梁。
  ctx.strokeStyle = '#8a94aa'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-8, 0)
  ctx.lineTo(-24, -1)
  ctx.stroke()
  // 尾桨：随时间旋转的短线。
  const tailA = state.t / 40
  ctx.strokeStyle = '#aeb8cc'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-24, -1 - Math.sin(tailA) * 5)
  ctx.lineTo(-24, -1 + Math.sin(tailA) * 5)
  ctx.stroke()

  // 机身：圆角胶囊 + 舷窗。
  glow(ctx, accent(5), 10)
  ctx.fillStyle = '#9db2d6'
  roundRectPath(ctx, -12, -7, 24, 14, 6)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#1e2a44'
  ctx.beginPath()
  ctx.arc(4, -1, 3.4, 0, Math.PI * 2)
  ctx.fill()

  // 主旋翼：旋转叶 + 高速残影盘。
  const rotorA = (state.t / SUB_MS) * 0.9
  ctx.strokeStyle = 'rgba(226,226,238,0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(0, -10, 20, 3.2, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = THEME.text
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-20 * Math.cos(rotorA), -10 - 3 * Math.sin(rotorA))
  ctx.lineTo(20 * Math.cos(rotorA), -10 + 3 * Math.sin(rotorA))
  ctx.stroke()
  // 桨毂立柱。
  ctx.strokeStyle = '#8a94aa'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -7)
  ctx.lineTo(0, -10)
  ctx.stroke()

  // 滑橇。
  ctx.strokeStyle = '#8a94aa'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-9, 8)
  ctx.lineTo(11, 8)
  ctx.moveTo(-7, 7)
  ctx.lineTo(-7, 10)
  ctx.moveTo(9, 7)
  ctx.lineTo(9, 10)
  ctx.stroke()
  ctx.restore()
}

/**
 * 画 HUD：距离（左）、前进速度（中）、本会话最佳（右）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param best - 本会话最佳距离 m。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: CopterState, best: number): void {
  hudPair(ctx, 10, 18, '距离', state.score + ' m')
  hudPair(ctx, W / 2, 18, '速度', Math.round(speedOf(state.worldX) / 10) + '', 'center')
  hudPair(ctx, W - 10, 18, '最佳', best + ' m', 'right')
}

/**
 * 渲染一帧：背景、岩洞、光照、直升机、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param best - 本会话最佳距离 m（结束遮罩展示用）。
 */
export function renderCopter(ctx: CanvasRenderingContext2D, state: CopterState, paused: boolean, best: number): void {
  drawBackground(ctx, W, H)
  drawCave(ctx, state)
  drawLight(ctx, state)
  if (state.phase === 'flying') drawCopter(ctx, state)

  // 消费逻辑层事件：坠毁迸发红橙爆炸粒子。
  for (const ev of state.events) {
    const sx = toScreenX(state.worldX, ev.x)
    particles.burst(sx, ev.y, THEME.bad, 26, 240)
    particles.burst(sx, ev.y, '#ff9e64', 18, 180)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHud(ctx, state, best)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'crashed') {
    drawOverlay(ctx, W, H, '坠 毁', '飞行 ' + state.score + ' m · 最佳 ' + best + ' m · 按 R 重开', THEME.bad)
  }
}
