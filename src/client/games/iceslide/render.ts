/**
 * 冰面滑行渲染层：冰面格子（淡蓝渐变 + 高光）、雪块墙壁、闪光宝石、
 * 尖刺、出口、企鹅玩家（按滑行方向倾斜 + 拖尾）、HUD 与过关/失败遮罩。
 * 纯 canvas 绘制，无 DOM、无游戏状态；动画进度由 index 层通过 view 传入。
 */
import {
  THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
  type ParticleSystem,
} from '../theme.ts'
import { CELL_GEM, CELL_SPIKE, CELL_WALL, LEVEL_COUNT, iceScore, type IceState, type SlideDir } from './logic.ts'

/** 逻辑画布尺寸（fitCanvas 的坐标系）。 */
export const LOGICAL_W = 640
export const LOGICAL_H = 520

/** 顶部 HUD 高度与棋盘外边距。 */
const HUD_H = 56
const BOARD_PAD = 16

/** 滑行动画进行中的一帧描述。 */
export interface IceSlideAnim {
  /** 出发格。 */
  from: number
  /** 途经格（含终点）。 */
  path: number[]
  /** 方向。 */
  dir: SlideDir
  /** 进度 0..1。 */
  t: number
}

/** 渲染一帧所需的视图参数。 */
export interface IceSlideView {
  paused: boolean
  /** 全部通关（遮罩用）。 */
  finished: boolean
  /** 单调时钟（ms），驱动宝石闪光与出口脉冲。 */
  timeMs: number
  /** 正在播放的滑行动画；null 表示静止。 */
  slide: IceSlideAnim | null
  /** 玩家朝向（倾斜姿态）。 */
  facing: SlideDir
}

/** 棋盘几何：格边长与左上原点（逻辑坐标）。 */
export interface BoardMetrics {
  cell: number
  ox: number
  oy: number
}

/**
 * 计算某关的棋盘几何：格子等比缩放并水平垂直居中。
 * @param level 关卡
 */
export function boardMetrics(level: IceState['level']): BoardMetrics {
  const cell = Math.floor(Math.min(
    (LOGICAL_W - BOARD_PAD * 2) / level.w,
    (LOGICAL_H - HUD_H - BOARD_PAD * 2) / level.h,
  ))
  const bw = cell * level.w
  const bh = cell * level.h
  return {
    cell,
    ox: Math.floor((LOGICAL_W - bw) / 2),
    oy: Math.floor(HUD_H + (LOGICAL_H - HUD_H - bh) / 2),
  }
}

/** 格中心的逻辑像素坐标。 */
function cellCenter(m: BoardMetrics, level: IceState['level'], i: number): { x: number; y: number } {
  return {
    x: m.ox + (i % level.w) * m.cell + m.cell / 2,
    y: m.oy + Math.floor(i / level.w) * m.cell + m.cell / 2,
  }
}

/** 冰面底板：淡蓝纵向渐变 + 左上高光 + 对角光带。 */
function drawIceField(ctx: CanvasRenderingContext2D, m: BoardMetrics, level: IceState['level']): void {
  const w = m.cell * level.w
  const h = m.cell * level.h
  const grad = ctx.createLinearGradient(m.ox, m.oy, m.ox, m.oy + h)
  grad.addColorStop(0, '#a8d4ef')
  grad.addColorStop(1, '#6fa8cf')
  roundRectPath(ctx, m.ox, m.oy, w, h, 10)
  ctx.fillStyle = grad
  ctx.fill()
  // 对角高光带（裁剪到冰面内）。
  ctx.save()
  roundRectPath(ctx, m.ox, m.oy, w, h, 10)
  ctx.clip()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < 3; k += 1) {
    ctx.beginPath()
    const off = k * (w / 3)
    ctx.moveTo(m.ox + off, m.oy)
    ctx.lineTo(m.ox + off + h * 0.5, m.oy + h)
    ctx.lineTo(m.ox + off + h * 0.5 + 18, m.oy + h)
    ctx.lineTo(m.ox + off + 18, m.oy)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.globalAlpha = 1
  // 格线。
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 1; x < level.w; x += 1) {
    ctx.moveTo(m.ox + x * m.cell + 0.5, m.oy)
    ctx.lineTo(m.ox + x * m.cell + 0.5, m.oy + h)
  }
  for (let y = 1; y < level.h; y += 1) {
    ctx.moveTo(m.ox, m.oy + y * m.cell + 0.5)
    ctx.lineTo(m.ox + w, m.oy + y * m.cell + 0.5)
  }
  ctx.stroke()
}

/** 雪块墙：白顶 + 灰蓝底影。 */
function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const pad = Math.max(2, s * 0.08)
  roundRectPath(ctx, x + pad, y + pad, s - pad * 2, s - pad * 2, Math.max(3, s * 0.16))
  const grad = ctx.createLinearGradient(x, y, x, y + s)
  grad.addColorStop(0, '#f2f5fb')
  grad.addColorStop(1, '#b9c4dd')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,105,140,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/** 尖刺格：暗底 + 三枚红尖刺。 */
function drawSpikes(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(60,40,60,0.28)'
  ctx.fillRect(x + 2, y + 2, s - 4, s - 4)
  ctx.fillStyle = THEME.bad
  for (let k = 0; k < 3; k += 1) {
    const cx = x + s * (0.25 + k * 0.25)
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.1, y + s * 0.82)
    ctx.lineTo(cx, y + s * 0.22)
    ctx.lineTo(cx + s * 0.1, y + s * 0.82)
    ctx.closePath()
    ctx.fill()
  }
}

/** 宝石：旋转菱形 + 呼吸光晕 + 十字闪光。 */
function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, timeMs: number, seedIdx: number): void {
  const r = s * 0.26
  const tw = 0.5 + 0.5 * Math.sin(timeMs / 260 + seedIdx * 1.7)
  glow(ctx, THEME.gold, 8 + tw * 8)
  const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
  grad.addColorStop(0, '#ffe9b8')
  grad.addColorStop(0.5, THEME.gold)
  grad.addColorStop(1, '#b87830')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.75, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.75, y)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // 十字闪光。
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + tw * 0.5).toFixed(3) + ')'
  ctx.lineWidth = 1.5
  const l = r * (0.7 + tw * 0.7)
  ctx.beginPath()
  ctx.moveTo(x - l, y)
  ctx.lineTo(x + l, y)
  ctx.moveTo(x, y - l)
  ctx.lineTo(x, y + l)
  ctx.stroke()
}

/** 出口：深洞 + 呼吸光环 + 小旗。 */
function drawExit(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, timeMs: number, open: boolean): void {
  const r = s * 0.34
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 380)
  const ring = open ? THEME.good : THEME.textMuted
  glow(ctx, ring, open ? 10 + pulse * 10 : 4)
  ctx.strokeStyle = ring
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(x, y, r + 2, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  const grad = ctx.createRadialGradient(x, y, 1, x, y, r)
  grad.addColorStop(0, '#0c1826')
  grad.addColorStop(1, '#1d3448')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  // 小旗。
  ctx.strokeStyle = '#d8dee9'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + r * 0.5, y - r * 0.4)
  ctx.lineTo(x + r * 0.5, y - r * 1.5)
  ctx.stroke()
  ctx.fillStyle = open ? THEME.good : '#7f89a0'
  ctx.beginPath()
  ctx.moveTo(x + r * 0.5, y - r * 1.5)
  ctx.lineTo(x + r * 1.5, y - r * 1.15)
  ctx.lineTo(x + r * 0.5, y - r * 0.8)
  ctx.closePath()
  ctx.fill()
}

/** 起点标记：淡色圆环。 */
function drawStart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, s * 0.3, 0, Math.PI * 2)
  ctx.stroke()
}

/** 企鹅玩家：按方向倾斜，白肚橙喙。 */
function drawPenguin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, facing: SlideDir): void {
  const r = s * 0.32
  const lean = facing === 'left' ? -0.22 : facing === 'right' ? 0.22 : 0
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean)
  // 身体。
  glow(ctx, '#7dcfff', 8)
  const body = ctx.createLinearGradient(0, -r, 0, r)
  body.addColorStop(0, '#3b4256')
  body.addColorStop(1, '#20242f')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.82, r, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 白肚。
  ctx.fillStyle = '#eef1f8'
  ctx.beginPath()
  ctx.ellipse(0, r * 0.22, r * 0.5, r * 0.66, 0, 0, Math.PI * 2)
  ctx.fill()
  // 喙。
  const beakDir = facing === 'left' ? -1 : facing === 'right' ? 1 : 0
  const bx = beakDir !== 0 ? beakDir * r * 0.85 : 0
  const by = beakDir !== 0 ? -r * 0.15 : -r * 0.45
  ctx.fillStyle = '#ff9e64'
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.lineTo(bx + (beakDir !== 0 ? beakDir * r * 0.45 : r * 0.22), by + r * 0.1)
  ctx.lineTo(bx, by + r * 0.24)
  ctx.closePath()
  ctx.fill()
  // 眼睛。
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(bx !== 0 ? bx * 0.55 : -r * 0.22, by + r * 0.05, r * 0.16, 0, Math.PI * 2)
  ctx.arc(bx !== 0 ? bx * 0.55 + r * 0.2 : r * 0.22, by + r * 0.05, r * 0.16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#16181f'
  ctx.beginPath()
  ctx.arc(bx !== 0 ? bx * 0.6 : -r * 0.2, by + r * 0.06, r * 0.08, 0, Math.PI * 2)
  ctx.arc(bx !== 0 ? bx * 0.6 + r * 0.2 : r * 0.24, by + r * 0.06, r * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 滑行拖尾：途经格上的渐隐白色圆点。 */
function drawTrail(ctx: CanvasRenderingContext2D, m: BoardMetrics, level: IceState['level'], anim: IceSlideAnim): void {
  const total = anim.path.length
  if (total === 0) return
  const done = anim.t * total
  for (let i = 0; i < total; i += 1) {
    if (i + 1 > done) break
    const c = cellCenter(m, level, anim.path[i]!)
    const fade = Math.max(0.08, 0.5 * (1 - (done - i - 1) / Math.max(total, 1)))
    ctx.fillStyle = 'rgba(255,255,255,' + fade.toFixed(3) + ')'
    ctx.beginPath()
    ctx.arc(c.x, c.y, m.cell * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 渲染一帧：背景 → 棋盘 → 实体 → 拖尾/玩家 → 粒子 → HUD → 遮罩。
 * @param ctx 逻辑坐标系上下文（fitCanvas 已变换）
 * @param state 游戏状态
 * @param view 视图参数（动画进度、暂停等）
 * @param fx 可选粒子系统（吃宝石/过关时由 index 层 burst）
 * @param dtMs 距上一渲染帧的毫秒（驱动粒子；默认 0 冻结）
 */
export function renderIceSlide(
  ctx: CanvasRenderingContext2D,
  state: IceState,
  view: IceSlideView,
  fx?: ParticleSystem,
  dtMs = 0,
): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const level = state.level
  const m = boardMetrics(level)

  // 面板底 + 冰面。
  roundRectPath(ctx, m.ox - 8, m.oy - 8, m.cell * level.w + 16, m.cell * level.h + 16, 14)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  drawIceField(ctx, m, level)

  const startC = cellCenter(m, level, level.start)
  drawStart(ctx, startC.x, startC.y, m.cell)

  const open = state.collected.size === level.gemTotal
  const exitC = cellCenter(m, level, level.exit)
  drawExit(ctx, exitC.x, exitC.y, m.cell, view.timeMs, open)

  // 墙 / 尖刺 / 宝石。
  let gemIdx = 0
  for (let i = 0; i < level.cells.length; i += 1) {
    const bits = level.cells[i]!
    if (bits === 0) continue
    const x = m.ox + (i % level.w) * m.cell
    const y = m.oy + Math.floor(i / level.w) * m.cell
    if ((bits & CELL_WALL) !== 0) drawWall(ctx, x, y, m.cell)
    if ((bits & CELL_SPIKE) !== 0) drawSpikes(ctx, x, y, m.cell)
    if ((bits & CELL_GEM) !== 0 && !state.collected.has(i)) {
      const c = cellCenter(m, level, i)
      drawGem(ctx, c.x, c.y, m.cell, view.timeMs, gemIdx)
      gemIdx += 1
    }
  }

  // 拖尾 + 玩家（滑行动画期间插值，否则停在 state.pos）。
  if (view.slide !== null) drawTrail(ctx, m, level, view.slide)
  let px: number
  let py: number
  if (view.slide !== null && view.slide.path.length > 0) {
    const total = view.slide.path.length
    const prog = Math.min(1, Math.max(0, view.slide.t)) * total
    const idx = Math.min(total - 1, Math.floor(prog))
    const frac = prog - idx
    const aIdx = idx === 0 ? view.slide.from : view.slide.path[idx - 1]!
    const bIdx = view.slide.path[idx]!
    const a = cellCenter(m, level, aIdx)
    const b = cellCenter(m, level, bIdx)
    px = a.x + (b.x - a.x) * frac
    py = a.y + (b.y - a.y) * frac
  } else {
    const c = cellCenter(m, level, state.pos)
    px = c.x
    py = c.y
  }
  if (state.status !== 'cleared' || view.slide !== null) {
    drawPenguin(ctx, px, py, m.cell, view.facing)
  }

  if (fx !== undefined) {
    // 粒子使用逻辑坐标（burst 的调用方按同一坐标系喂点）。
    fx.tick(ctx, dtMs)
  }

  // HUD。
  ctx.textBaseline = 'alphabetic'
  hudPair(ctx, 16, 26, '关卡', String(state.levelIndex + 1) + '/' + String(LEVEL_COUNT))
  hudPair(ctx, 110, 26, '步数', String(state.moves))
  hudPair(ctx, 190, 26, '宝石', state.collected.size + '/' + level.gemTotal, 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W - 16, 26, '分数', String(iceScore(state)), 'right', accent(6))
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('方向键滑行 · U 撤回 · R 重开 · P 暂停', LOGICAL_W / 2, 44)

  // 遮罩。
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停中', '按 P 继续', THEME.text)
  } else if (state.finished) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关！', '按 R 重新开始 · 总分 ' + String(state.score), THEME.gold)
  } else if (state.status === 'cleared') {
    const par = level.solution.length
    drawOverlay(
      ctx,
      LOGICAL_W,
      LOGICAL_H,
      '过关！',
      '步数 ' + String(state.moves) + '（最优 ' + String(par) + '）· 按 N 进入下一关',
      THEME.good,
    )
  } else if (state.status === 'dead') {
    const cause = state.deathCause === 'spike' ? '踩到尖刺' : '滑出了冰面'
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '哎呀！', cause + ' · 按 R 或方向键重来本关', THEME.bad)
  }
}
