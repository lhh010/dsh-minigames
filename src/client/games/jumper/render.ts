/**
 * 蹦蹦跳渲染层：竖直卷轴（摄像机跟随）、随高度加深的渐变天空与
 * 渐现星点、四色平台（蓝普通 / 青移动 / 金易碎 / 红尖刺）、小家伙
 * 挤压拉伸弹跳动画、碎裂与弹跳粒子、高度 HUD、暂停 / 结束遮罩。
 */
import {
  W,
  H,
  GAP,
  BASE_Y,
  SQUASH_MS,
  BOUNCE_VY,
  PLAYER_HALF,
  platformAt,
  platformX,
  indexRangeFor,
  heightScore,
  mulberry32,
  type JumperState,
  type Platform,
} from './logic.ts'
import { THEME, createParticles, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 天空色带：从地面暖蓝到高空深空，按攀升高度插值。 */
const SKY_STOPS: { h: number, top: string, bottom: string }[] = [
  { h: 0, top: '#2a3a5e', bottom: '#1c2440' },
  { h: 1500, top: '#1e2a4a', bottom: '#141c33' },
  { h: 3500, top: '#131a30', bottom: '#0d1224' },
  { h: 6500, top: '#0a0e1e', bottom: '#070a16' },
]

/** 解析 '#rrggbb' 为 [r,g,b]。 */
function parseColor(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** 按 k ∈ [0,1] 插值两色，返回 'rgb(...)'。 */
function lerpColor(a: string, b: string, k: number): string {
  const ca = parseColor(a)
  const cb = parseColor(b)
  const r = Math.round(ca[0]! + (cb[0]! - ca[0]!) * k)
  const g = Math.round(ca[1]! + (cb[1]! - ca[1]!) * k)
  const bl = Math.round(ca[2]! + (cb[2]! - ca[2]!) * k)
  return 'rgb(' + r + ',' + g + ',' + bl + ')'
}

/**
 * 画渐变天空：按小家伙当前攀升高度在色带间插值，越高越深。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSky(ctx: CanvasRenderingContext2D, state: JumperState): void {
  const climb = Math.max(0, BASE_Y - state.y)
  let band = SKY_STOPS[0]!
  for (let i = 1; i < SKY_STOPS.length; i += 1) {
    if (climb >= SKY_STOPS[i]!.h) band = SKY_STOPS[i]!
  }
  const next = SKY_STOPS[Math.min(SKY_STOPS.length - 1, SKY_STOPS.indexOf(band) + 1)]!
  const span = Math.max(1, next.h - band.h)
  const k = Math.max(0, Math.min(1, (climb - band.h) / span))
  const gradient = ctx.createLinearGradient(0, 0, 0, H)
  gradient.addColorStop(0, lerpColor(band.top, next.top, k))
  gradient.addColorStop(1, lerpColor(band.bottom, next.bottom, k))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)
}

/**
 * 画星点：按世界高度分带（每带 2×GAP 高），seed+带号确定性生成，
 * 越高的带越密，随卷轴进入视野。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawStars(ctx: CanvasRenderingContext2D, state: JumperState): void {
  const density = Math.min(1, Math.max(0, (BASE_Y - state.cameraY - 400) / 4000))
  if (density <= 0) return
  const bandH = GAP * 2
  const firstBand = Math.floor((BASE_Y - (state.cameraY + H)) / bandH)
  const lastBand = Math.floor((BASE_Y - state.cameraY) / bandH)
  ctx.fillStyle = THEME.text
  for (let band = Math.max(1, firstBand); band <= lastBand; band += 1) {
    const rng = mulberry32((state.seed * 17 + band * 233) >>> 0)
    const count = Math.round(4 + density * 8)
    for (let i = 0; i < count; i += 1) {
      const sx = rng() * W
      const syWorld = BASE_Y - band * bandH - rng() * bandH
      const sy = syWorld - state.cameraY
      if (sy < -4 || sy > H + 4) continue
      ctx.globalAlpha = 0.25 + density * 0.45 * rng()
      ctx.beginPath()
      ctx.arc(sx, sy, 0.6 + rng() * 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

/** 平台配色：普通蓝 / 移动青 / 易碎金 / 尖刺红。 */
const KIND_COLOR: Record<Platform['kind'], string> = {
  normal: THEME.accents[0]!,
  moving: THEME.accents[7]!,
  crumbly: THEME.gold,
  spiky: THEME.bad,
}

/**
 * 画一块平台：圆角板身发光；移动板画双向箭头，易碎板画裂纹，
 * 尖刺板顶面画三角刺。
 * @param ctx - 画布上下文。
 * @param platform - 平台数据。
 * @param x - 当前左边缘（世界系，已含移动相位）。
 * @param sy - 屏幕系顶面 y。
 */
function drawPlatform(ctx: CanvasRenderingContext2D, platform: Platform, x: number, sy: number): void {
  const color = KIND_COLOR[platform.kind]
  const h = 10
  glow(ctx, color, 8)
  ctx.fillStyle = platform.kind === 'crumbly' ? 'rgba(224,175,104,0.55)' : 'rgba(30,30,42,0.9)'
  roundRectPath(ctx, x, sy, platform.w, h, 5)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  roundRectPath(ctx, x, sy, platform.w, h, 5)
  ctx.stroke()
  if (platform.kind === 'moving') {
    // 双向小箭头提示横移。
    ctx.fillStyle = color
    const cy = sy + h / 2
    ctx.beginPath()
    ctx.moveTo(x + 8, cy - 4)
    ctx.lineTo(x + 8, cy + 4)
    ctx.lineTo(x + 3, cy)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + platform.w - 8, cy - 4)
    ctx.lineTo(x + platform.w - 8, cy + 4)
    ctx.lineTo(x + platform.w - 3, cy)
    ctx.closePath()
    ctx.fill()
  } else if (platform.kind === 'crumbly') {
    // 中缝裂纹。
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x + platform.w / 2 - 4, sy + 2)
    ctx.lineTo(x + platform.w / 2, sy + h / 2)
    ctx.lineTo(x + platform.w / 2 - 3, sy + h - 2)
    ctx.stroke()
  } else if (platform.kind === 'spiky') {
    // 顶面三角刺。
    ctx.fillStyle = color
    const n = Math.max(3, Math.floor(platform.w / 14))
    const step = platform.w / n
    ctx.beginPath()
    for (let i = 0; i < n; i += 1) {
      ctx.moveTo(x + i * step, sy + 1)
      ctx.lineTo(x + (i + 0.5) * step, sy - 6)
      ctx.lineTo(x + (i + 1) * step, sy + 1)
    }
    ctx.fill()
  }
}

/**
 * 画小家伙：下落后按速度纵向拉伸，触板后 SQUASH_MS 内横向压扁；
 * 圆角方块 + 双眼，青色描边发光。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: JumperState): void {
  const sy = state.y - state.cameraY
  let sx = 1
  let syScale = 1
  const sinceBounce = state.t - state.lastBounceT
  if (sinceBounce < SQUASH_MS) {
    // 触板挤压：横向变宽纵向压扁，随时间回弹。
    const k = 1 - sinceBounce / SQUASH_MS
    sx = 1 + 0.30 * k
    syScale = 1 - 0.30 * k
  } else {
    // 空中拉伸：垂直速度越大越细长。
    const k = Math.min(1, Math.abs(state.vy) / (BOUNCE_VY * 1.1))
    sx = 1 - 0.18 * k
    syScale = 1 + 0.22 * k
  }
  ctx.save()
  ctx.translate(state.x, sy)
  ctx.scale(sx, syScale)
  glow(ctx, THEME.accents[5]!, 10)
  ctx.fillStyle = THEME.accents[5]!
  roundRectPath(ctx, -PLAYER_HALF, -PLAYER_HALF, PLAYER_HALF * 2, PLAYER_HALF * 2, 7)
  ctx.fill()
  noGlow(ctx)
  // 双眼（朝水平速度方向微偏）。
  const look = Math.max(-2, Math.min(2, state.vx / 140))
  ctx.fillStyle = '#10101a'
  ctx.beginPath()
  ctx.arc(-4 + look, -3, 2.2, 0, Math.PI * 2)
  ctx.arc(4 + look, -3, 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画高度 HUD：左上高度（分数），右上剩余命（1 命）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: JumperState): void {
  hudPair(ctx, 10, 20, '高度', heightScore(state) + ' m')
  hudPair(ctx, W - 10, 20, '生命', '❤', 'right')
}

/**
 * 渲染一帧：天空、星点、视野内平台（碎裂板跳过）、小家伙、粒子、
 * HUD、暂停 / 结束遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderJumper(ctx: CanvasRenderingContext2D, state: JumperState, paused: boolean): void {
  drawSky(ctx, state)
  drawStars(ctx, state)

  // 视野内平台。
  const [lo, hi] = indexRangeFor(state.cameraY - GAP, state.cameraY + H + GAP)
  for (let i = lo; i <= hi; i += 1) {
    if (state.broken.has(i)) continue
    const platform = platformAt(state.seed, i)
    const sy = platform.y - state.cameraY
    if (sy < -20 || sy > H + 20) continue
    drawPlatform(ctx, platform, platformX(platform, state.t), sy)
  }

  drawPlayer(ctx, state)

  // 消费逻辑层事件：弹跳迸发平台色粒子，碎裂迸发金色碎片，触刺 / 坠落红色。
  for (const ev of state.events) {
    if (ev.type === 'bounce') {
      particles.burst(ev.x, ev.y - state.cameraY, KIND_COLOR[ev.kind], 8, 120)
    } else if (ev.type === 'break') {
      particles.burst(ev.x, ev.y - state.cameraY, THEME.gold, 18, 200)
    } else if (ev.type === 'spike') {
      particles.burst(ev.x, ev.y - state.cameraY, THEME.bad, 26, 240)
    } else if (ev.type === 'fall') {
      particles.burst(ev.x, H - 6, THEME.bad, 16, 180)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'dead') {
    drawOverlay(ctx, W, H, '游戏结束', '高度 ' + heightScore(state) + ' m · 按 R 重开', THEME.bad)
  }
}
