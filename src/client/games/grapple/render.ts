/**
 * 钩荡忍者渲染层：夜晚都市剪影背景（确定性楼群 + 星点）、深渊、发光
 * 圆锚点（半径 = 吸附半径）、微下垂的钩索绳（二次贝塞尔）、忍者与拖尾、
 * 尖刺墙、终点旗、死亡碎裂粒子、距离 HUD 与各阶段遮罩。摄像机横跟
 * 玩家（向前偏移），世界元素按摄像机平移绘制。
 */
import {
  W,
  H,
  ANCHOR_R,
  HOOK_RANGE,
  SEG_LEN,
  LEVELS,
  grappleScore,
  mulberry32,
  type GrappleState,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

// 忍者拖尾（渲染层自持，最近 22 个位置）。
const trail: { x: number, y: number }[] = []

// 夜空星点与城市剪影：挂载时确定性生成一次，纯视觉。
const stars: { x: number, y: number, r: number, tw: number }[] = (() => {
  const rng = mulberry32(20261104)
  const list: { x: number, y: number, r: number, tw: number }[] = []
  for (let i = 0; i < 60; i += 1) {
    list.push({ x: rng() * W, y: rng() * H * 0.7, r: 0.5 + rng() * 1.2, tw: rng() * 6.28 })
  }
  return list
})()

/** 一栋剪影楼：世界 x、宽、高、亮窗相位。 */
interface Tower {
  x: number
  w: number
  h: number
  ph: number
}

const towers: Tower[] = (() => {
  const rng = mulberry32(20261105)
  const list: Tower[] = []
  for (let x = -80; x < 12000; x += 60 + rng() * 70) {
    list.push({ x, w: 46 + rng() * 54, h: 60 + rng() * 150, ph: rng() * 6.28 })
  }
  return list
})()

/**
 * 画星点：按各自相位缓慢闪烁。
 * @param ctx - 画布上下文。
 * @param t - 回合内毫秒钟。
 */
function drawStars(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = THEME.text
  for (const s of stars) {
    const k = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t / 1100 + s.tw))
    ctx.globalAlpha = k * 0.7
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画夜晚都市剪影：两排视差楼群 + 零星亮窗，底部深渊渐隐。
 * @param ctx - 画布上下文。
 * @param camX - 摄像机 x。
 */
function drawCity(ctx: CanvasRenderingContext2D, camX: number): void {
  for (const tw of towers) {
    // 视差 0.4：远景楼群移动更慢。
    const sx = tw.x - camX * 0.4
    if (sx + tw.w < -20 || sx > W + 20) continue
    ctx.fillStyle = '#1c1c28'
    ctx.fillRect(sx, H - tw.h, tw.w, tw.h)
    ctx.fillStyle = 'rgba(226,226,238,0.10)'
    for (let wy = H - tw.h + 10; wy < H - 12; wy += 16) {
      for (let wx = sx + 7; wx < sx + tw.w - 6; wx += 13) {
        if (((wx * 7 + wy * 13 + tw.ph * 100) | 0) % 5 === 0) ctx.fillRect(wx, wy, 3, 4)
      }
    }
  }
  // 深渊：底部向下渐暗的雾。
  const g = ctx.createLinearGradient(0, H - 40, 0, H)
  g.addColorStop(0, 'rgba(16,16,26,0)')
  g.addColorStop(1, 'rgba(16,16,26,0.9)')
  ctx.fillStyle = g
  ctx.fillRect(0, H - 40, W, 40)
}

/**
 * 画锚点：发光圆（蓝紫），半径 = 吸附半径；当前吸附的锚点高亮金色，
 * 钩索可达（<= HOOK_RANGE）的最近锚点淡淡描边提示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 摄像机 x。
 */
function drawAnchors(ctx: CanvasRenderingContext2D, state: GrappleState, camX: number): void {
  for (let i = 0; i < state.world.anchors.length; i += 1) {
    const a = state.world.anchors[i]!
    const sx = a.x - camX
    if (sx < -30 || sx > W + 30) continue
    const active = state.anchorIdx === i
    const color = active ? THEME.gold : accent(1)
    glow(ctx, color, active ? 16 : 9)
    ctx.strokeStyle = color
    ctx.lineWidth = active ? 2.5 : 1.5
    ctx.globalAlpha = active ? 0.95 : 0.6
    ctx.beginPath()
    ctx.arc(sx, a.y, ANCHOR_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(sx, a.y, active ? 5 : 3.5, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.globalAlpha = 1
  }
}

/**
 * 画钩索绳：锚点到忍者，中点向下微垂（二次贝塞尔）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 摄像机 x。
 */
function drawRope(ctx: CanvasRenderingContext2D, state: GrappleState, camX: number): void {
  if (state.anchorIdx === -1 || state.phase !== 'flying') return
  const ax = state.anchorX - camX
  const ay = state.anchorY
  const px = state.x - camX
  const py = state.y
  const mx = (ax + px) / 2
  const my = (ay + py) / 2 + 10
  glow(ctx, THEME.gold, 6)
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.quadraticCurveTo(mx, my, px, py)
  ctx.stroke()
  noGlow(ctx)
}

/**
 * 画忍者：小方块身体 + 眼睛，速度方向拉伸；死亡阶段不画（粒子代替）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 摄像机 x。
 */
function drawNinja(ctx: CanvasRenderingContext2D, state: GrappleState, camX: number): void {
  if (state.phase === 'dead') return
  const sx = state.x - camX
  ctx.save()
  ctx.translate(sx, state.y)
  const v = Math.hypot(state.vx, state.vy)
  const k = Math.min(0.35, v / 2400)
  ctx.rotate(Math.atan2(state.vy, state.vx))
  ctx.scale(1 + k, 1 - k * 0.6)
  glow(ctx, accent(0), 8)
  ctx.fillStyle = '#c8d0e8'
  ctx.fillRect(-9, -9, 18, 18)
  noGlow(ctx)
  ctx.fillStyle = '#1c2030'
  ctx.fillRect(1, -5, 4, 4)
  ctx.fillRect(6, -5, 2, 4)
  ctx.restore()
}

/**
 * 画忍者拖尾：历史位置渐隐小方块。
 * @param ctx - 画布上下文。
 * @param camX - 摄像机 x。
 */
function drawTrail(ctx: CanvasRenderingContext2D, camX: number): void {
  for (let i = 0; i < trail.length; i += 1) {
    const p = trail[i]!
    const a = (i + 1) / trail.length
    ctx.globalAlpha = a * 0.3
    ctx.fillStyle = accent(0)
    ctx.fillRect(p.x - camX - 3, p.y - 3, 6, 6)
  }
  ctx.globalAlpha = 1
}

/**
 * 画尖刺墙：底部立起的红色尖刺矩形 + 顶端三角齿。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 摄像机 x。
 */
function drawSpikes(ctx: CanvasRenderingContext2D, state: GrappleState, camX: number): void {
  for (const s of state.world.spikes) {
    const sx = s.x - camX
    if (sx + s.w < -30 || sx > W + 30) continue
    glow(ctx, THEME.bad, 8)
    ctx.fillStyle = THEME.bad
    ctx.fillRect(sx, s.y + 10, s.w, s.h - 10)
    // 顶部三枚尖齿。
    for (let k = 0; k < 3; k += 1) {
      const bx = sx + (s.w / 3) * k
      ctx.beginPath()
      ctx.moveTo(bx, s.y + 12)
      ctx.lineTo(bx + s.w / 6, s.y - 4)
      ctx.lineTo(bx + s.w / 3, s.y + 12)
      ctx.closePath()
      ctx.fill()
    }
    noGlow(ctx)
  }
}

/**
 * 画终点旗：杆 + 发光旗面 + 「终」字；各段首画淡淡的检查点亮线。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 摄像机 x。
 */
function drawGoal(ctx: CanvasRenderingContext2D, state: GrappleState, camX: number): void {
  // 检查点（段首）提示线。
  for (let x = 0; x <= state.world.goalX; x += SEG_LEN) {
    const sx = x - camX
    if (sx < -10 || sx > W + 10) continue
    ctx.strokeStyle = 'rgba(122,162,247,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, H)
    ctx.stroke()
  }
  const sx = state.world.goalX - camX
  if (sx < -40 || sx > W + 40) return
  ctx.strokeStyle = THEME.text
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(sx, H - 10)
  ctx.lineTo(sx, H - 120)
  ctx.stroke()
  glow(ctx, THEME.good, 12)
  ctx.fillStyle = THEME.good
  ctx.beginPath()
  ctx.moveTo(sx, H - 120)
  ctx.lineTo(sx + 44, H - 106)
  ctx.lineTo(sx, H - 92)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画 HUD：关卡 / 距离（米）/ 死亡数 / 当前钩索可达提示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: GrappleState): void {
  hudPair(ctx, 10, 20, '关卡', state.level + ' / ' + LEVELS)
  hudPair(ctx, 100, 20, '距离', grappleScore(state) + ' m')
  hudPair(ctx, W - 10, 20, '坠落', String(state.deaths), 'right', state.deaths === 0 ? THEME.text : THEME.bad)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('按住发射钩索 · 松开惯性飞行 · 钩索范围 ' + HOOK_RANGE, W / 2, 40)
}

/**
 * 渲染一帧：背景 → 世界元素 → 忍者 → 粒子 → HUD → 遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderGrapple(ctx: CanvasRenderingContext2D, state: GrappleState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawStars(ctx, state.t)
  const camX = Math.max(0, state.x - W * 0.35)
  drawCity(ctx, camX)

  // 拖尾更新：飞行中每帧记录，死亡清空。
  if (state.phase === 'flying') {
    trail.push({ x: state.x, y: state.y })
    if (trail.length > 22) trail.shift()
  } else if (trail.length > 0) {
    trail.shift()
  }

  drawTrail(ctx, camX)
  drawAnchors(ctx, state, camX)
  drawRope(ctx, state, camX)
  drawSpikes(ctx, state, camX)
  drawGoal(ctx, state, camX)
  drawNinja(ctx, state, camX)

  // 消费逻辑层事件：吸附迸发小粒子，死亡碎裂迸发大粒子，过关金色庆祝。
  for (const ev of state.events) {
    if (ev.type === 'attach') particles.burst(ev.x - camX, ev.y, THEME.gold, 6, 90)
    else if (ev.type === 'death') {
      trail.length = 0
      particles.burst(ev.x - camX, Math.min(ev.y, H - 6), THEME.bad, 26, 240)
    } else particles.burst(ev.x - camX, ev.y - 40, THEME.good, 24, 200)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'dead') {
    drawOverlay(ctx, W, H, '坠 落', '回到段首重试 · R：重开 · P：暂停', THEME.bad)
  } else if (state.phase === 'clear') {
    drawOverlay(ctx, W, H, '过关', '第 ' + state.level + ' 关完成 · 继续前进', THEME.good)
  } else if (state.phase === 'win') {
    drawOverlay(ctx, W, H, '全通关', '总距离 ' + grappleScore(state) + ' m · 坠落 ' + state.deaths + ' 次 · 按 R 重开', THEME.gold)
  }
}
