/**
 * 传送带分拣渲染层：仓库夜景背景、三条滚动传送带（滚轮随带速转动的
 * 行进动画）、彩色包裹（辉光 + 色环）、分流口的转向挡板（挡板楔形 +
 * 当前颜色 + 色键提示）、底部四节颜色车厢（装载数进度）、分拣成功 /
 * 失误的粒子迸发、上浮渐隐飘字、HUD（分数 / 失误 / 连击 / 档位）、暂停
 * 与结算遮罩。HUD 覆在半透明深色条上保持共享主题文字可读性。
 */
import type { SorterState, Package, Belt } from './logic.ts'
import {
  W, H, BELT_LEFT, BELT_H, DIVERT_X, PACKAGE_SIZE, MAX_MISSES, FLOAT_MS,
  PACKAGE_COLORS, beltSpeed, levelOf, laneY,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const BELT_BODY = '#262636'
const BELT_EDGE = '#3a3a52'
const ROLLER = '#4a4a66'
const WAGON_Y = 430
const WAGON_W = 100
const WAGON_H = 88
const WAGON_GAP = 16
const HUD_BAND = 'rgba(13,13,20,0.42)'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/**
 * 车厢 i 的左上角 x。
 * @param i - 车厢（颜色）索引 0-3。
 * @returns 车厢左上角逻辑 x。
 */
function wagonX(i: number): number {
  const total = PACKAGE_COLORS.length * WAGON_W + (PACKAGE_COLORS.length - 1) * WAGON_GAP
  return (W - total) / 2 + i * (WAGON_W + WAGON_GAP)
}

/**
 * 画一条滚动传送带：带体、随带速行进转动的滚轮与前进条纹。
 * @param ctx - 画布上下文。
 * @param belt - 传送带状态。
 * @param speed - 当前带速 px/s。
 * @param t - 回合钟 ms。
 */
function drawBelt(ctx: CanvasRenderingContext2D, belt: Belt, speed: number, t: number): void {
  const y = laneY(belt.lane)
  const bandY = y - BELT_H / 2 - PACKAGE_SIZE / 2 + PACKAGE_SIZE / 2
  const beltY = y + PACKAGE_SIZE / 2
  // 带体。
  ctx.fillStyle = BELT_BODY
  roundRectPath(ctx, BELT_LEFT, beltY, DIVERT_X - BELT_LEFT, BELT_H, 8)
  ctx.fill()
  ctx.strokeStyle = BELT_EDGE
  ctx.lineWidth = 2
  ctx.stroke()
  // 滚轮：相位随带速推进，每个滚轮画一条旋转辐条。
  const spacing = 26
  const travel = (t / 1000) * speed
  const phase = travel % spacing
  const roll = Math.floor(bandY)
  ctx.save()
  ctx.beginPath()
  ctx.rect(BELT_LEFT + 2, beltY + 2, DIVERT_X - BELT_LEFT - 4, BELT_H - 4)
  ctx.clip()
  for (let x = BELT_LEFT + spacing - phase; x < DIVERT_X; x += spacing) {
    const cy = beltY + BELT_H / 2
    ctx.fillStyle = ROLLER
    ctx.beginPath()
    ctx.arc(x, cy, 6, 0, Math.PI * 2)
    ctx.fill()
    const ang = (travel / 6) + x * 0.05
    ctx.strokeStyle = 'rgba(226,226,238,0.4)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(ang) * 4, cy - Math.sin(ang) * 4)
    ctx.lineTo(x + Math.cos(ang) * 4, cy + Math.sin(ang) * 4)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * 画一件彩色包裹：辉光方块 + 色环 + 颜色字母标。
 * @param ctx - 画布上下文。
 * @param pkg - 包裹实体。
 * @param y - 包裹中心逻辑 y。
 */
function drawPackage(ctx: CanvasRenderingContext2D, pkg: Package, y: number): void {
  const color = PACKAGE_COLORS[pkg.color]
  glow(ctx, color, 10)
  ctx.fillStyle = color
  roundRectPath(ctx, pkg.x - PACKAGE_SIZE / 2, y - PACKAGE_SIZE / 2, PACKAGE_SIZE, PACKAGE_SIZE, 6)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(13,13,20,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
  // 捆扎胶带十字，强调“包裹”。
  ctx.strokeStyle = 'rgba(13,13,20,0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(pkg.x - PACKAGE_SIZE / 2 + 4, y)
  ctx.lineTo(pkg.x + PACKAGE_SIZE / 2 - 4, y)
  ctx.stroke()
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#15151b'
  ctx.fillText(String(pkg.color + 1), pkg.x, y - PACKAGE_SIZE / 2 - 5)
}

/**
 * 画一条带的分流挡板：末端楔形板指向挡板颜色，附色键提示。
 * @param ctx - 画布上下文。
 * @param belt - 传送带状态。
 */
function drawFlap(ctx: CanvasRenderingContext2D, belt: Belt): void {
  const y = laneY(belt.lane)
  const color = PACKAGE_COLORS[belt.flap]
  glow(ctx, color, 12)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(DIVERT_X + 4, y - PACKAGE_SIZE)
  ctx.lineTo(DIVERT_X + 4, y + PACKAGE_SIZE / 2 + 6)
  ctx.lineTo(DIVERT_X + 22, y + PACKAGE_SIZE / 2 + 6)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.text
  ctx.fillText(String(belt.flap + 1), DIVERT_X + 28, y - 4)
}

/**
 * 画四节颜色车厢：色框 + 装载数 + 键位提示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawWagons(ctx: CanvasRenderingContext2D, state: SorterState): void {
  for (let i = 0; i < PACKAGE_COLORS.length; i += 1) {
    const color = PACKAGE_COLORS[i]!
    const x = wagonX(i)
    const count = state.wagons[i]!
    ctx.fillStyle = 'rgba(30,30,42,0.85)'
    roundRectPath(ctx, x, WAGON_Y, WAGON_W, WAGON_H, 10)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.stroke()
    // 装载刻度：每 5 件一格的横向小格。
    const cells = Math.min(20, count)
    for (let c = 0; c < cells; c += 1) {
      ctx.fillStyle = color
      const cw = (WAGON_W - 16) / 20
      ctx.fillRect(x + 8 + c * cw, WAGON_Y + 8, Math.max(2, cw - 2), 8)
    }
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText(String(count), x + WAGON_W / 2, WAGON_Y + 52)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('键 ' + (i + 1), x + WAGON_W / 2, WAGON_Y + 74)
  }
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: SorterState): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = 'bold 15px system-ui, sans-serif'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / FLOAT_MS))
    ctx.globalAlpha = k
    ctx.fillStyle = fl.text === '失误' ? THEME.bad : THEME.gold
    ctx.fillText(fl.text, Math.max(36, Math.min(W - 36, fl.x)), Math.max(44, fl.y))
  }
  ctx.restore()
}

/**
 * 渲染一帧：背景、传送带、包裹、挡板、车厢、飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderSorter(ctx: CanvasRenderingContext2D, state: SorterState, paused: boolean): void {
  drawBackground(ctx, W, H)
  const level = levelOf(state.t)
  const speed = beltSpeed(level)
  for (const belt of state.belts) drawBelt(ctx, belt, speed, state.t)
  for (const belt of state.belts) {
    const y = laneY(belt.lane)
    for (const pkg of belt.packages) drawPackage(ctx, pkg, y)
    drawFlap(ctx, belt)
  }
  drawWagons(ctx, state)
  drawFloats(ctx, state)

  // 消费逻辑层事件：分拣成功迸发包裹色粒子、失误红色。
  for (const ev of state.events) {
    const color = ev.type === 'miss' ? THEME.bad : PACKAGE_COLORS[ev.color]
    particles.burst(ev.x, ev.y, color, 12, 150)
  }
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：半透明深色条 + 分数 / 失误 / 连击 / 档位速度。
  ctx.fillStyle = HUD_BAND
  roundRectPath(ctx, 4, 4, W - 8, 24, 8)
  ctx.fill()
  const hudY = 20
  hudPair(ctx, 14, hudY, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = state.misses >= MAX_MISSES - 1 ? THEME.bad : THEME.text
  ctx.fillText('失误 ' + state.misses + '/' + MAX_MISSES, W / 2, hudY)
  if (state.combo >= 2 && state.comboExpire > state.t) {
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = THEME.gold
    ctx.fillText('x' + state.combo + ' 连击', W - 60, hudY)
  }
  hudPair(ctx, W - 14, hudY, '速度', 'L' + level + ' ' + Math.round(speed), 'right', THEME.textMuted)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 装车 ' + state.wagons.reduce((a, b) => a + b, 0) + ' 件 · 按 R 重开', THEME.bad)
  }
}
