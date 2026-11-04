/**
 * 重力翻转渲染层：科幻走廊（上下发光轨道 + 滚动刻度网格）、角色（翻转
 * 时 180° 旋转动画 + 残影）、尖刺三角阵、屏障墙与窗口光边、激光（预警
 * 虚线 → 发射光束）、距离 / 速度 HUD、死亡粒子与结束遮罩。
 */
import {
  W, H, TRACK, CEIL_BOT, FLOOR_TOP, PLAYER_X, PLAYER_HW, PLAYER_HH,
  SPIKE_W, SPIKE_H, BARRIER_W, LASER_W, LASER_H, FLIP_ANIM_MS, SEG_LEN,
  speedOf, laserFiring, laserWarn,
  type GravFlipState, type Obstacle,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 走廊滚动刻度间距 px。 */
const TICK = 60

/**
 * 画上下发光轨道与滚动刻度（营造前进速度感）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawCorridor(ctx: CanvasRenderingContext2D, state: GravFlipState): void {
  const railColor = accent(0)
  for (const [y, h] of [[0, TRACK], [FLOOR_TOP, TRACK]] as const) {
    ctx.fillStyle = '#22222e'
    ctx.fillRect(0, y, W, h)
    glow(ctx, railColor, 10)
    ctx.strokeStyle = railColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y === 0 ? CEIL_BOT : FLOOR_TOP)
    ctx.lineTo(W, y === 0 ? CEIL_BOT : FLOOR_TOP)
    ctx.stroke()
    noGlow(ctx)
  }
  // 滚动刻度：按 dist 取模平移，速度感来源。
  ctx.strokeStyle = 'rgba(122,162,247,0.16)'
  ctx.lineWidth = 1
  const offset = state.dist % TICK
  ctx.beginPath()
  for (let x = -offset; x < W + TICK; x += TICK) {
    ctx.moveTo(x, CEIL_BOT + 4)
    ctx.lineTo(x, CEIL_BOT + 10)
    ctx.moveTo(x, FLOOR_TOP - 10)
    ctx.lineTo(x, FLOOR_TOP - 4)
  }
  ctx.stroke()
}

/**
 * 世界 x → 屏幕 x。
 * @param state - 当前状态。
 * @param wx - 世界坐标。
 */
function sx(state: GravFlipState, wx: number): number {
  return wx - state.dist
}

/**
 * 画一段尖刺带（等宽内向三角阵）。
 * @param ctx - 画布上下文。
 * @param ob - 尖刺障碍。
 */
function drawSpikes(ctx: CanvasRenderingContext2D, ob: Extract<Obstacle, { type: 'spikes' }>): void {
  const color = THEME.bad
  glow(ctx, color, 8)
  ctx.fillStyle = color
  ctx.beginPath()
  for (let x = ob.x1; x + SPIKE_W <= ob.x2 + 0.01; x += SPIKE_W) {
    const a = x
    const b = Math.min(x + SPIKE_W, ob.x2)
    if (ob.side === 'bottom') {
      ctx.moveTo(a, FLOOR_TOP)
      ctx.lineTo((a + b) / 2, FLOOR_TOP - SPIKE_H)
      ctx.lineTo(b, FLOOR_TOP)
    } else {
      ctx.moveTo(a, CEIL_BOT)
      ctx.lineTo((a + b) / 2, CEIL_BOT + SPIKE_H)
      ctx.lineTo(b, CEIL_BOT)
    }
  }
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画屏障墙：走廊色墙体 + 窗口发光边。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param ob - 屏障障碍。
 */
function drawBarrier(ctx: CanvasRenderingContext2D, state: GravFlipState, ob: Extract<Obstacle, { type: 'barrier' }>): void {
  const x = sx(state, ob.x)
  ctx.fillStyle = '#2e2e3e'
  ctx.fillRect(x, CEIL_BOT, BARRIER_W, ob.oy1 - CEIL_BOT)
  ctx.fillRect(x, ob.oy2, BARRIER_W, FLOOR_TOP - ob.oy2)
  const color = accent(1)
  glow(ctx, color, 10)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.strokeRect(x, CEIL_BOT, BARRIER_W, ob.oy1 - CEIL_BOT)
  ctx.strokeRect(x, ob.oy2, BARRIER_W, FLOOR_TOP - ob.oy2)
  noGlow(ctx)
}

/**
 * 画激光：预警态画侧向虚线 + 箭头，发射态画全亮光束。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param ob - 激光障碍。
 */
function drawLaser(ctx: CanvasRenderingContext2D, state: GravFlipState, ob: Extract<Obstacle, { type: 'laser' }>): void {
  const x = sx(state, ob.x) + LASER_W / 2
  const firing = laserFiring(state.t, ob.phase)
  const warn = laserWarn(state.t, ob.phase)
  const y1 = ob.side === 'bottom' ? FLOOR_TOP - LASER_H : CEIL_BOT
  const y2 = ob.side === 'bottom' ? FLOOR_TOP : CEIL_BOT + LASER_H
  if (firing) {
    glow(ctx, THEME.bad, 18)
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = LASER_W
    ctx.beginPath()
    ctx.moveTo(x, y1)
    ctx.lineTo(x, y2)
    ctx.stroke()
    noGlow(ctx)
    return
  }
  if (warn) {
    // 预警：闪烁虚线。
    const blink = Math.floor(state.t / 90) % 2 === 0
    if (blink) {
      ctx.strokeStyle = 'rgba(247,118,142,0.7)'
      ctx.setLineDash([5, 6])
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, y1)
      ctx.lineTo(x, y2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  } else {
    // 待机：暗淡安装轨。
    ctx.strokeStyle = 'rgba(226,226,238,0.18)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y1)
    ctx.lineTo(x, y2)
    ctx.stroke()
  }
  // 发射器底座。
  ctx.fillStyle = '#3a3a4c'
  ctx.fillRect(x - 6, ob.side === 'bottom' ? FLOOR_TOP - 4 : CEIL_BOT, 12, 4)
}

/**
 * 画角色：残影队列 + 翻转 180° 旋转动画的发光胶囊。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: GravFlipState): void {
  // 残影：越旧越小越透明（时间倒序，最末是当前位置的前一采样）。
  for (let i = 0; i < state.trail.length; i += 1) {
    const p = state.trail[i]!
    const k = (i + 1) / (state.trail.length + 1)
    ctx.globalAlpha = 0.05 + k * 0.16
    ctx.fillStyle = accent(6)
    const back = (state.trail.length - i) * 7
    ctx.fillRect(PLAYER_X - back - PLAYER_HW, p.y - PLAYER_HH, PLAYER_HW * 2, PLAYER_HH * 2)
  }
  ctx.globalAlpha = 1

  const p = Math.min(1, state.flipT / FLIP_ANIM_MS)
  const eased = 1 - (1 - p) * (1 - p)
  // 目标姿态：dir=1 直立（角 0），dir=-1 倒挂（角 π）；翻转期间补间。
  const angle = state.dir === 1 ? Math.PI * (1 - eased) : Math.PI * eased
  ctx.save()
  ctx.translate(PLAYER_X, state.y)
  ctx.rotate(angle)
  const color = accent(6)
  glow(ctx, color, 14)
  ctx.fillStyle = '#ff9e64'
  ctx.beginPath()
  ctx.moveTo(0, -PLAYER_HH - 3)
  ctx.lineTo(PLAYER_HW, PLAYER_HH)
  ctx.lineTo(-PLAYER_HW, PLAYER_HH)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // 朝向重力侧的指示点。
  ctx.fillStyle = '#ffd23f'
  ctx.beginPath()
  ctx.arc(0, PLAYER_HH - 4, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画 HUD：距离（分）、速度、当前重力侧指示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: GravFlipState): void {
  hudPair(ctx, 10, 18, '距离', String(state.score) + ' m')
  const v = Math.round(speedOf(state.dist))
  hudPair(ctx, 120, 18, '速度', String(Math.round(v / 10)) + ' m/s')
  const side = state.dir === 1 ? '▼ 地板' : '▲ 天花板'
  hudPair(ctx, W - 10, 18, '重力', side, 'right', state.dir === 1 ? THEME.text : accent(1))
  // 段落标记：下一屏障碍距离提示线。
  const nextSeg = (Math.floor(state.dist / SEG_LEN) + 1) * SEG_LEN
  const ahead = nextSeg - state.dist
  if (ahead < 200) {
    ctx.globalAlpha = 0.25 * (1 - ahead / 200)
    ctx.fillStyle = accent(1)
    ctx.fillRect(PLAYER_X + 90, CEIL_BOT, 2, FLOOR_TOP - CEIL_BOT)
    ctx.globalAlpha = 1
  }
}

/**
 * 渲染一帧：走廊、障碍、角色、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderGravFlip(ctx: CanvasRenderingContext2D, state: GravFlipState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawCorridor(ctx, state)
  for (const ob of state.obstacles) {
    const x = sx(state, ob.type === 'spikes' ? ob.x1 : ob.x)
    if (x > -80 && x < W + 80) {
      if (ob.type === 'spikes') drawSpikes(ctx, ob)
      else if (ob.type === 'barrier') drawBarrier(ctx, state, ob)
      else drawLaser(ctx, state, ob)
    }
  }
  if (state.phase !== 'dead') drawPlayer(ctx, state)

  // 消费逻辑层事件：死亡迸发红橙粒子。
  for (const ev of state.events) {
    if (ev.type === 'die') particles.burst(ev.x, ev.y, THEME.bad, 34, 260)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'dead') {
    const causeText = state.cause === 'laser' ? '被激光击中' : state.cause === 'barrier' ? '撞上屏障' : '踩到尖刺'
    drawOverlay(ctx, W, H, '坠 毁', causeText + ' · 距离 ' + state.score + ' m · 按 R 重开', THEME.bad)
  }
}
