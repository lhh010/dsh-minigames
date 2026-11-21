/**
 * 潜行渗透渲染器：谍战深色房间（棋盘地板格 + 厚墙）、守卫身体与朝向
 * 视野锥半透明扇形（逐射线步进，遇墙自动截断，警觉满转红加宽）、特工
 * 玩家小圆、钻石闪光、守卫头顶警觉条、生命/关卡/钻石/分数 HUD、被抓
 * 红闪与过关/暂停 overlay。只用共享视觉套件；纯函数无状态。
 */
import {
  ALERT_MAX, CAUGHT_FLASH_MS, effectiveHalfRad, effectiveRange, isWall,
  type GuardState, type StealthState,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

/** 单格逻辑像素。 */
export const CELL = 30
/** 顶部 HUD 高度。 */
export const HUD_H = 44
/** 底部常驻速览行高。 */
export const HINT_H = 26
/** 最大关卡尺寸（17×13）决定固定逻辑画布。 */
export const MAX_COLS = 17
export const MAX_ROWS = 13
export const LOGICAL_W = MAX_COLS * CELL
export const LOGICAL_H = HUD_H + MAX_ROWS * CELL + HINT_H

const FLOOR_A = '#1b1b28'
const FLOOR_B = '#20202e'
const WALL_FILL = '#2e2e42'
const WALL_EDGE = '#454560'
const SAFE_COLOR = THEME.gold
const PLAYER_COLOR = '#7dcfff'
const GUARD_COLOR = '#bb9af7'
const ALERT_CONE = 'rgba(247,118,142,0.17)'
const HINT_TEXT = '方向键/WASD 移动 · 躲开视野锥 · 钻石加分 · 抵达保险柜过关'

/** 渲染附加选项。 */
export interface StealthRenderOptions {
  /** 显示暂停 overlay。 */
  paused: boolean
  /** 五关全部通关（显示最终通关 overlay 而非单关过关）。 */
  finished: boolean
  /** 时间基准（毫秒），驱动钻石闪烁。 */
  nowMs: number
}

/** 任意格的中心像素坐标（盘面在剩余空间中居中，含 HUD 与速览行边距）。 */
export function stealthCellCenter(state: StealthState, x: number, y: number): { px: number; py: number } {
  const ox = (LOGICAL_W - state.cols * CELL) / 2
  const oy = HUD_H + (LOGICAL_H - HUD_H - HINT_H - state.rows * CELL) / 2
  return { px: ox + x * CELL + CELL / 2, py: oy + y * CELL + CELL / 2 }
}

/** 盘面左上角原点。 */
function boardOrigin(state: StealthState): { ox: number; oy: number } {
  return {
    ox: (LOGICAL_W - state.cols * CELL) / 2,
    oy: HUD_H + (LOGICAL_H - HUD_H - HINT_H - state.rows * CELL) / 2,
  }
}

/** 画地板棋盘格与墙块（墙带顶缘高亮）。 */
function drawRoom(ctx: CanvasRenderingContext2D, state: StealthState): void {
  const { ox, oy } = boardOrigin(state)
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const px = ox + x * CELL
      const py = oy + y * CELL
      if (isWall(state, x, y)) {
        ctx.fillStyle = WALL_FILL
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = WALL_EDGE
        ctx.fillRect(px, py, CELL, 2)
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B
        ctx.fillRect(px, py, CELL, CELL)
      }
    }
  }
  ctx.strokeStyle = WALL_EDGE
  ctx.lineWidth = 2
  ctx.strokeRect(ox - 1, oy - 1, state.cols * CELL + 2, state.rows * CELL + 2)
}

/** 画保险柜：金色圆角柜体 + 表盘 + 微光。 */
function drawSafe(ctx: CanvasRenderingContext2D, state: StealthState): void {
  const c = stealthCellCenter(state, state.safe.x, state.safe.y)
  ctx.fillStyle = SAFE_COLOR
  glow(ctx, SAFE_COLOR, 10)
  ctx.beginPath()
  ctx.roundRect(c.px - 10, c.py - 11, 20, 22, 4)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = '#1e1e2a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(c.px, c.py - 2, 5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(c.px, c.py - 2)
  ctx.lineTo(c.px + 3, c.py - 5)
  ctx.stroke()
}

/** 画一颗钻石：旋转菱形 + 随时间闪烁。 */
function drawDiamond(ctx: CanvasRenderingContext2D, state: StealthState, x: number, y: number, nowMs: number): void {
  const c = stealthCellCenter(state, x, y)
  const twinkle = 0.55 + 0.45 * Math.sin(nowMs / 260 + x * 1.7 + y * 2.3)
  ctx.globalAlpha = 0.5 + 0.5 * twinkle
  ctx.fillStyle = '#7dcfff'
  glow(ctx, '#7dcfff', 8)
  ctx.beginPath()
  ctx.moveTo(c.px, c.py - 7)
  ctx.lineTo(c.px + 6, c.py)
  ctx.lineTo(c.px, c.py + 7)
  ctx.lineTo(c.px - 6, c.py)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#e2e2ee'
  ctx.lineWidth = 1
  ctx.stroke()
}

/** 画守卫视野锥：半锥角内逐射线步进，遇墙截断，拼多边形填充。 */
function drawCone(ctx: CanvasRenderingContext2D, state: StealthState, guard: GuardState, alerted: boolean): void {
  const c = stealthCellCenter(state, guard.x, guard.y)
  const half = effectiveHalfRad(state, guard)
  const range = effectiveRange(state, guard)
  const base = Math.atan2(guard.facing.dy, guard.facing.dx)
  const rays = 24
  ctx.beginPath()
  ctx.moveTo(c.px, c.py)
  for (let i = 0; i <= rays; i += 1) {
    const ang = base - half + ((2 * half) * i) / rays
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    let dist = 0
    const step = 0.15
    let px = c.px
    let py = c.py
    while (dist < range) {
      dist += step
      const nx = c.px + cos * CELL * dist
      const ny = c.py + sin * CELL * dist
      const gx = Math.floor((nx - boardOrigin(state).ox) / CELL)
      const gy = Math.floor((ny - boardOrigin(state).oy) / CELL)
      if (isWall(state, gx, gy)) break
      px = nx
      py = ny
    }
    ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = alerted ? ALERT_CONE : 'rgba(187,154,247,0.13)'
  ctx.fill()
}

/** 画守卫身体、朝向短线与头顶警觉条。 */
function drawGuard(ctx: CanvasRenderingContext2D, state: StealthState, guard: GuardState, index: number, alerted: boolean): void {
  const c = stealthCellCenter(state, guard.x, guard.y)
  ctx.fillStyle = alerted ? THEME.bad : GUARD_COLOR
  glow(ctx, alerted ? THEME.bad : GUARD_COLOR, 8)
  ctx.beginPath()
  ctx.arc(c.px, c.py, 8, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = '#15151b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(c.px, c.py)
  ctx.lineTo(c.px + guard.facing.dx * 11, c.py + guard.facing.dy * 11)
  ctx.stroke()
  // 警觉条：/alertMax 比例的底槽 + 填充。
  const bw = 18
  const bx = c.px - bw / 2
  const by = c.py - 17
  ctx.fillStyle = 'rgba(21,21,27,0.8)'
  ctx.fillRect(bx, by, bw, 3)
  ctx.fillStyle = alerted ? THEME.bad : accent(index + 2)
  ctx.fillRect(bx, by, (bw * guard.alert) / ALERT_MAX, 3)
}

/** 画特工玩家小圆（红闪期间染红）。 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: StealthState): void {
  const c = stealthCellCenter(state, state.player.x, state.player.y)
  const color = state.caughtFlashMs > 0 ? THEME.bad : PLAYER_COLOR
  ctx.fillStyle = color
  glow(ctx, color, 10)
  ctx.beginPath()
  ctx.arc(c.px, c.py, 7, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#15151b'
  ctx.beginPath()
  ctx.arc(c.px + 1, c.py - 1, 2, 0, Math.PI * 2)
  ctx.fill()
}

/** 画顶部 HUD 四列与底部常驻速览行。 */
function drawHud(ctx: CanvasRenderingContext2D, state: StealthState): void {
  const y = 26
  hudPair(ctx, 16, y, '关卡', String(state.level) + '/' + '5')
  hudPair(ctx, 130, y, '生命', '♥'.repeat(Math.max(0, state.lives)) || '—', 'left',
    state.lives <= 1 ? THEME.bad : THEME.text)
  const got = state.diamonds.filter(d => d.taken).length
  hudPair(ctx, 262, y, '钻石', String(got) + '/' + String(state.diamonds.length))
  hudPair(ctx, LOGICAL_W - 16, y, '分数', String(state.score), 'right', THEME.gold)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(HINT_TEXT, LOGICAL_W / 2, LOGICAL_H - 9)
}

/** 渲染整帧。
 * @param ctx 画布上下文（逻辑坐标系）
 * @param state 完整状态
 * @param options 渲染附加选项
 */
export function renderStealth(ctx: CanvasRenderingContext2D, state: StealthState, options: StealthRenderOptions): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawRoom(ctx, state)
  drawSafe(ctx, state)
  for (const d of state.diamonds) if (!d.taken) drawDiamond(ctx, state, d.x, d.y, options.nowMs)
  state.guards.forEach((g, i) => {
    const alerted = state.beats < g.alertedUntilBeat
    drawCone(ctx, state, g, alerted)
    drawGuard(ctx, state, g, i, alerted)
  })
  if (state.status !== 'gameover') drawPlayer(ctx, state)
  drawHud(ctx, state)
  if (state.caughtFlashMs > 0) {
    ctx.fillStyle = 'rgba(247,118,142,' + String(0.35 * (state.caughtFlashMs / CAUGHT_FLASH_MS)) + ')'
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  }
  if (options.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续')
  } else if (state.status === 'cleared') {
    if (options.finished) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '完美潜行', '五关全部得手 · R 重新开始', THEME.gold)
    else drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '渗透成功', '保险柜已打开 · 即将进入下一关', THEME.good)
  } else if (state.status === 'gameover') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '任务失败', '生命耗尽 · 按 R 从本关重来', THEME.bad)
  }
}
