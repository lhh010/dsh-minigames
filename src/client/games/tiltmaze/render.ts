/**
 * 旋转迷宫渲染层：圆形木盘（径向渐变 + 环向刻痕纹理）、随盘角旋转的
 * 环墙 / 辐墙（弧与径向线精确绘制）、尖刺陷阱、终点孔（发光脉冲）、
 * 金属小球（高光 + 运动拖尾）、盘角指示标记与屏幕系重力箭头、关卡 /
 * 时间 / 分数 HUD、暂停 / 过关 / 失败遮罩与过关粒子。渲染为无状态纯
 * 绘制（拖尾与粒子由 index 层持有）。
 */
import { W, H, CX, CY, BALL_R, TRAP_R, HUB_R, type TiltMazeState, type Vec } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

/** 渲染选项。 */
export interface TiltMazeRenderOpts {
  /** 是否暂停遮罩。 */
  paused: boolean
  /** 当前时间 ms（终点孔脉冲相位）。 */
  nowMs: number
  /** 帧间隔 ms（粒子推进）。 */
  dtMs: number
  /** 小球拖尾（屏幕系相对盘心坐标，旧在前）。 */
  trail: Vec[]
}

// 渲染层自有的粒子系统（过关庆祝；每个画布一个实例）。
const particles = createParticles()

/**
 * 过关粒子爆发（在小球当前屏幕位置）。
 * @param x - 画布 x px。
 * @param y - 画布 y px。
 */
export function burstWin(x: number, y: number): void {
  particles.burst(x, y, THEME.gold, 26, 190)
}

/**
 * 画一个尖刺陷阱：三齿朝外（盘面局部系）。齿长沿径向、齿底沿切向。
 * @param ctx - 画布上下文（已平移到盘心并旋转盘角）。
 * @param t - 陷阱位置（盘面系）。
 */
function drawTrap(ctx: CanvasRenderingContext2D, t: Vec): void {
  const ang = Math.atan2(t.y, t.x)
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  glow(ctx, THEME.bad, 8)
  ctx.fillStyle = THEME.bad
  ctx.beginPath()
  // 底座圆 + 三枚径向三角齿。
  ctx.arc(t.x, t.y, 5, 0, Math.PI * 2)
  for (let k = -1; k <= 1; k += 1) {
    const off = k * 4.5
    const bx = t.x - s * off
    const by = t.y + c * off
    ctx.moveTo(bx - s * 3.5, by + c * 3.5)
    ctx.lineTo(bx + s * 3.5, by - c * 3.5)
    ctx.lineTo(bx + c * 13, by + s * 13)
    ctx.closePath()
  }
  ctx.fill()
  noGlow(ctx)
}

/**
 * 主渲染入口：背景、木盘、墙、陷阱、终点孔、盘角标记、拖尾、小球、
 * 重力箭头、HUD、粒子与遮罩。
 * @param ctx - 画布上下文（已施加逻辑坐标变换）。
 * @param state - 当前状态。
 * @param opts - 渲染选项（暂停、时间、拖尾）。
 */
export function renderTiltMaze(ctx: CanvasRenderingContext2D, state: TiltMazeState, opts: TiltMazeRenderOpts): void {
  drawBackground(ctx, W, H)
  const m = state.maze
  const step = Math.PI * 2 / m.spokes

  // ---- 盘面（局部系：平移到盘心并旋转盘角） ----
  ctx.save()
  ctx.translate(CX, CY)
  ctx.rotate(state.boardAngle)

  // 木盘底：径向渐变 + 环向刻痕纹理。
  const wood = ctx.createRadialGradient(0, 0, HUB_R, 0, 0, m.outerR)
  wood.addColorStop(0, '#43352a')
  wood.addColorStop(0.6, '#382c22')
  wood.addColorStop(1, '#241c15')
  glow(ctx, 'rgba(0,0,0,0.55)', 22)
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.arc(0, 0, m.outerR, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  for (let i = 1; i <= m.rings; i += 1) {
    ctx.beginPath()
    ctx.arc(0, 0, HUB_R + i * m.ringGap, 0, Math.PI * 2)
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,0,0,0.28)' : 'rgba(255,225,180,0.06)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // 墙：外环描粗（盘缘），内环与辐墙统一金色圆头线。
  ctx.lineCap = 'round'
  glow(ctx, THEME.gold, 5)
  ctx.strokeStyle = THEME.gold
  for (let i = 1; i <= m.rings; i += 1) {
    const isRim = i === m.rings
    ctx.lineWidth = isRim ? 7 : 5
    for (let s = 0; s < m.spokes; s += 1) {
      if (!m.ringWalls[i]![s]) continue
      ctx.beginPath()
      ctx.arc(0, 0, HUB_R + i * m.ringGap, s * step, (s + 1) * step)
      ctx.stroke()
    }
  }
  ctx.lineWidth = 5
  for (let i = 1; i <= m.rings; i += 1) {
    const inner = HUB_R + (i - 1) * m.ringGap
    for (let s = 0; s < m.spokes; s += 1) {
      if (!m.spokeWalls[i]![s]) continue
      const a = s * step
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner)
      ctx.lineTo(Math.cos(a) * (HUB_R + i * m.ringGap), Math.sin(a) * (HUB_R + i * m.ringGap))
      ctx.stroke()
    }
  }
  noGlow(ctx)

  // 中心轮毂。
  ctx.fillStyle = 'rgba(255,225,180,0.10)'
  ctx.beginPath()
  ctx.arc(0, 0, HUB_R, 0, Math.PI * 2)
  ctx.fill()

  for (const t of m.traps) drawTrap(ctx, t)

  // 终点孔：暗孔 + 金色脉冲光环（缺口本身即无墙区）。
  const gx = Math.cos(m.goalAngle) * (m.outerR - 10)
  const gy = Math.sin(m.goalAngle) * (m.outerR - 10)
  const pulse = 0.5 + 0.5 * Math.sin(opts.nowMs / 280)
  glow(ctx, THEME.gold, 7 + 9 * pulse)
  ctx.fillStyle = '#0a0a10'
  ctx.beginPath()
  ctx.arc(gx, gy, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(224,175,104,' + (0.55 + 0.45 * pulse).toFixed(3) + ')'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(gx, gy, 11 + 3 * pulse, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)

  // 盘角指示：盘缘顶部的青色小三角（随盘旋转，读盘面朝向）。
  ctx.fillStyle = accent(5)
  ctx.beginPath()
  ctx.moveTo(0, -m.outerR - 12)
  ctx.lineTo(-7, -m.outerR - 1)
  ctx.lineTo(7, -m.outerR - 1)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // ---- 屏幕系：拖尾 + 金属小球 ----
  for (let i = 0; i < opts.trail.length; i += 1) {
    const p = opts.trail[i]!
    const f = (i + 1) / (opts.trail.length + 1)
    ctx.globalAlpha = 0.05 + 0.16 * f
    ctx.fillStyle = accent(1)
    ctx.beginPath()
    ctx.arc(CX + p.x, CY + p.y, BALL_R * (0.35 + 0.45 * f), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  const bx = CX + state.bx
  const by = CY + state.by
  const metal = ctx.createRadialGradient(bx - 3, by - 3.5, 1, bx, by, BALL_R)
  metal.addColorStop(0, '#f7f7fc')
  metal.addColorStop(0.55, '#b9bac8')
  metal.addColorStop(1, '#545560')
  glow(ctx, 'rgba(185,186,200,0.8)', 7)
  ctx.fillStyle = metal
  ctx.beginPath()
  ctx.arc(bx, by, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(13,13,20,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(bx, by, BALL_R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(bx - 2.5, by - 3, 1.8, 0, Math.PI * 2)
  ctx.fill()

  // 重力箭头（屏幕固定，右侧竖直向下）：提示恒定重力方向。
  ctx.strokeStyle = THEME.textMuted
  ctx.fillStyle = THEME.textMuted
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(W - 22, CY - 26)
  ctx.lineTo(W - 22, CY - 8)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(W - 22, CY - 2)
  ctx.lineTo(W - 27, CY - 11)
  ctx.lineTo(W - 17, CY - 11)
  ctx.closePath()
  ctx.fill()

  // ---- HUD ----
  hudPair(ctx, 16, 24, '关卡', state.level + '/5')
  const timeColor = state.timeLeft < 6 ? THEME.bad : state.timeLeft < 15 ? THEME.gold : THEME.text
  hudPair(ctx, W / 2, 24, '时间', Math.ceil(state.timeLeft) + 's', 'center', timeColor)
  hudPair(ctx, W - 16, 24, '分数', String(state.score), 'right', THEME.gold)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('← → / A D 旋转盘面 · 躲开尖刺 · 把球送进金孔', W / 2, H - 10)

  particles.tick(ctx, opts.dtMs)

  if (state.status === 'won') {
    drawOverlay(ctx, W, H, '过关', '按 空格 进入下一关 · R 重开本关', THEME.good)
  } else if (state.status === 'lost') {
    const why = state.loseReason === 'trap' ? '扎到尖刺了' : '时间耗尽'
    drawOverlay(ctx, W, H, '失败', why + ' · R 重开本关', THEME.bad)
  } else if (opts.paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续 · R 重开本关')
  }
}
