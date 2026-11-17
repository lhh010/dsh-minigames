/**
 * 手电迷宫渲染器：纯黑战场 + 扇形光锥渐变照亮，记忆格暗淡重显，
 * 金币闪烁、陷阱尖刺、电池补光、出口微光塔（始终隐约可见的方向感）、
 * 生命 / 金币 / 步数 HUD 与过关 / 暂停 overlay。只用共享视觉套件。
 */
import {
  DE, DN, DS, DW, HALF_CONE,
  effectiveRadius, visibleCells, type DarkItem, type DarkMazeState,
} from './logic.ts'
import { THEME, accent, createParticles, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 单格逻辑像素。 */
export const CELL = 24
/** 顶部 HUD 高度。 */
export const HUD_H = 44
/** 最大关卡尺寸（25×25）决定固定逻辑画布。 */
export const MAX_SIZE = 25
export const LOGICAL_W = MAX_SIZE * CELL
export const LOGICAL_H = HUD_H + MAX_SIZE * CELL

const LIGHT_COLOR = '#7aa2f7'
const WALL_BRIGHT = accent(5)
const WALL_DIM = 'rgba(125,207,255,0.16)'
const FLOOR_BRIGHT = '#232334'
const FLOOR_DIM = 'rgba(35,35,52,0.35)'
const EXIT_COLOR = THEME.gold
const SPIKE_COLOR = THEME.bad

/** 渲染附加选项。 */
export interface DarkRenderOptions {
  /** 显示暂停 overlay。 */
  paused: boolean
  /** 五关全部通关（显示最终通关 overlay 而非单关过关）。 */
  finished: boolean
}

/** 任意迷宫格的中心像素坐标（居中布局）。 */
export function darkCellCenter(maze: DarkMazeState['maze'], x: number, y: number): { px: number; py: number } {
  const ox = (LOGICAL_W - maze.w * CELL) / 2
  const oy = HUD_H + (LOGICAL_H - HUD_H - maze.h * CELL) / 2
  return { px: ox + x * CELL + CELL / 2, py: oy + y * CELL + CELL / 2 }
}

/** 画一格地板。 */
function drawFloor(ctx: CanvasRenderingContext2D, maze: DarkMazeState['maze'], x: number, y: number, color: string): void {
  const c = darkCellCenter(maze, x, y)
  ctx.fillStyle = color
  ctx.fillRect(c.px - CELL / 2, c.py - CELL / 2, CELL, CELL)
}

/** 画一格的封闭墙（亮 / 暗两种描边）。 */
function drawWalls(ctx: CanvasRenderingContext2D, maze: DarkMazeState['maze'], x: number, y: number, color: string, lineWidth: number): void {
  const c = darkCellCenter(maze, x, y)
  const mask = maze.walls[y * maze.w + x]!
  const closed = (DN | DE | DS | DW) & ~mask // 四向全开位取反 = 封闭墙位
  const left = c.px - CELL / 2
  const top = c.py - CELL / 2
  const right = c.px + CELL / 2
  const bottom = c.py + CELL / 2
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.beginPath()
  if ((closed & DN) !== 0) { ctx.moveTo(left, top); ctx.lineTo(right, top) }
  if ((closed & DS) !== 0) { ctx.moveTo(left, bottom); ctx.lineTo(right, bottom) }
  if ((closed & DW) !== 0) { ctx.moveTo(left, top); ctx.lineTo(left, bottom) }
  if ((closed & DE) !== 0) { ctx.moveTo(right, top); ctx.lineTo(right, bottom) }
  ctx.stroke()
}

/** 画一枚金币（可见亮 / 记忆暗，随时间闪烁）。 */
function drawCoin(ctx: CanvasRenderingContext2D, maze: DarkMazeState['maze'], item: DarkItem, now: number, bright: boolean): void {
  const c = darkCellCenter(maze, item.x, item.y)
  const twinkle = 0.55 + 0.45 * Math.sin(now / 280 + item.x * 1.7 + item.y * 2.3)
  ctx.globalAlpha = bright ? 0.55 + 0.45 * twinkle : 0.22
  ctx.fillStyle = THEME.gold
  glow(ctx, THEME.gold, bright ? 8 : 3)
  ctx.beginPath()
  ctx.arc(c.px, c.py, 5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/** 画一个陷阱尖刺（三枚红刺）。 */
function drawTrap(ctx: CanvasRenderingContext2D, maze: DarkMazeState['maze'], item: DarkItem, bright: boolean): void {
  const c = darkCellCenter(maze, item.x, item.y)
  ctx.globalAlpha = bright ? 1 : 0.3
  ctx.fillStyle = SPIKE_COLOR
  if (bright) glow(ctx, SPIKE_COLOR, 5)
  for (let k = -1; k <= 1; k += 1) {
    const sx = c.px + k * 6
    ctx.beginPath()
    ctx.moveTo(sx - 2.5, c.py + 5)
    ctx.lineTo(sx, c.py - 5)
    ctx.lineTo(sx + 2.5, c.py + 5)
    ctx.closePath()
    ctx.fill()
  }
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/** 画一枚电池（绿色圆角块 + 加号）。 */
function drawBattery(ctx: CanvasRenderingContext2D, maze: DarkMazeState['maze'], item: DarkItem, bright: boolean): void {
  const c = darkCellCenter(maze, item.x, item.y)
  ctx.globalAlpha = bright ? 1 : 0.3
  ctx.fillStyle = THEME.good
  if (bright) glow(ctx, THEME.good, 7)
  roundRectPath(ctx, c.px - 6, c.py - 8, 12, 16, 3)
  ctx.fill()
  ctx.fillStyle = '#15151b'
  ctx.fillRect(c.px - 4, c.py - 2.5, 8, 1.6)
  ctx.fillRect(c.px - 0.8, c.py - 5, 1.6, 7)
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/** 出口微光塔：无论迷雾与否始终隐约可见（方向感）。 */
function drawExitBeacon(ctx: CanvasRenderingContext2D, state: DarkMazeState, now: number): void {
  const c = darkCellCenter(state.maze, state.exit.x, state.exit.y)
  const pulse = 0.5 + 0.5 * Math.sin(now / 420)
  const radius = CELL * (1.1 + pulse * 0.5)
  const grad = ctx.createRadialGradient(c.px, c.py, 2, c.px, c.py, radius)
  grad.addColorStop(0, 'rgba(224,175,104,0.30)')
  grad.addColorStop(1, 'rgba(224,175,104,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(c.px, c.py, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = EXIT_COLOR
  ctx.globalAlpha = 0.45 + 0.3 * pulse
  ctx.lineWidth = 2
  glow(ctx, EXIT_COLOR, 6)
  ctx.beginPath()
  ctx.moveTo(c.px - 5, c.py + 7)
  ctx.lineTo(c.px, c.py - 8)
  ctx.lineTo(c.px + 5, c.py + 7)
  ctx.closePath()
  ctx.stroke()
  noGlow(ctx)
  ctx.globalAlpha = 1
}

// 渲染侧粒子池：金币拾取与过关各触发一次爆发。
const particles = createParticles()
let prevCoins = -1
let prevCleared = false

/** 渲染一帧（连续模式每帧调用）。
 * @param ctx 已按逻辑坐标变换的 2d 上下文
 * @param state 当前游戏状态
 * @param options 暂停 / 终局标记
 */
export function renderDarkMaze(ctx: CanvasRenderingContext2D, state: DarkMazeState, options: DarkRenderOptions): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const flashing = state.flashMs > 0
  const visible = flashing
    ? new Set<number>(Array.from({ length: state.maze.w * state.maze.h }, (_, i) => i))
    : visibleCells(state.maze, state.player, state.facing, effectiveRadius(state))

  // 纯黑底：迷雾之外一无所有。
  ctx.fillStyle = '#050509'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  drawExitBeacon(ctx, state, now)

  // 记忆格暗淡重显（不在当前光锥内的已探索格）。
  for (const idx of state.memory) {
    if (visible.has(idx)) continue
    const x = idx % state.maze.w
    const y = (idx / state.maze.w) | 0
    drawFloor(ctx, state.maze, x, y, FLOOR_DIM)
    drawWalls(ctx, state.maze, x, y, WALL_DIM, 1)
  }

  // 光锥格全亮。
  for (const idx of visible) {
    const x = idx % state.maze.w
    const y = (idx / state.maze.w) | 0
    drawFloor(ctx, state.maze, x, y, flashing ? FLOOR_DIM : FLOOR_BRIGHT)
    drawWalls(ctx, state.maze, x, y, flashing ? WALL_DIM : WALL_BRIGHT, flashing ? 1 : 2)
  }

  // 道具：只见可见 / 记忆格上的。
  const drawItems = (items: DarkItem[], kind: 'coin' | 'trap' | 'battery'): void => {
    for (const item of items) {
      if (item.taken) continue
      const idx = item.y * state.maze.w + item.x
      if (!visible.has(idx) && !state.memory.has(idx)) continue
      const bright = visible.has(idx)
      if (kind === 'coin') drawCoin(ctx, state.maze, item, now, bright)
      else if (kind === 'trap') drawTrap(ctx, state.maze, item, bright)
      else drawBattery(ctx, state.maze, item, bright)
    }
  }
  drawItems(state.coins, 'coin')
  drawItems(state.traps, 'trap')
  drawItems(state.batteries, 'battery')

  // 手电扇形渐变（闪现期间整屏泛蓝替代）。
  if (flashing) {
    ctx.fillStyle = 'rgba(125,207,255,0.10)'
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  } else {
    const p = darkCellCenter(state.maze, state.player.x, state.player.y)
    const rad = effectiveRadius(state) * CELL
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    ctx.moveTo(p.px, p.py)
    ctx.arc(p.px, p.py, rad, state.facing - HALF_CONE, state.facing + HALF_CONE)
    ctx.closePath()
    ctx.clip()
    const grad = ctx.createRadialGradient(p.px, p.py, CELL * 0.3, p.px, p.py, rad)
    grad.addColorStop(0, 'rgba(255,244,214,0.26)')
    grad.addColorStop(1, 'rgba(255,244,214,0)')
    ctx.fillStyle = grad
    ctx.fillRect(p.px - rad, p.py - rad, rad * 2, rad * 2)
    ctx.restore()
  }

  // 玩家：亮点 + 朝向指示。
  const p = darkCellCenter(state.maze, state.player.x, state.player.y)
  glow(ctx, LIGHT_COLOR, 14)
  ctx.fillStyle = LIGHT_COLOR
  ctx.beginPath()
  ctx.arc(p.px, p.py, 7, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(p.px + Math.cos(state.facing) * 5, p.py + Math.sin(state.facing) * 5)
  ctx.lineTo(p.px + Math.cos(state.facing) * 12, p.py + Math.sin(state.facing) * 12)
  ctx.stroke()

  // HUD。
  const livesText = state.lives > 0 ? '❤ ×' + state.lives : '—'
  hudPair(ctx, 12, 18, '生命 ', livesText, 'left', state.lives <= 1 ? THEME.bad : THEME.text)
  hudPair(ctx, 84, 18, '金币 ', String(state.coinsCollected))
  hudPair(ctx, 160, 18, '步数 ', String(state.steps))
  hudPair(ctx, LOGICAL_W - 12, 18, '关卡 ', state.level + '/5', 'right')
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('WASD/方向键 移动 · 鼠标/Q·E 转手电 · R 重开 · P 暂停', 12, 36)

  // 粒子事件：金币 +1 与过关瞬间。
  if (prevCoins >= 0 && state.coinsCollected > prevCoins) {
    particles.burst(p.px, p.py, THEME.gold, 10, 120)
  }
  prevCoins = state.coinsCollected
  if (state.status === 'cleared' && !prevCleared) {
    const e = darkCellCenter(state.maze, state.exit.x, state.exit.y)
    particles.burst(e.px, e.py, THEME.good, 26, 180)
  }
  prevCleared = state.status === 'cleared'
  particles.tick(ctx, 16)

  // Overlay：终局 > 过关 > 暂停。
  if (state.status === 'gameover') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', '按 R 从第 1 关重新开始', THEME.bad)
  } else if (state.status === 'cleared' && options.finished) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关', '手电照亮了每一寸黑暗 · 按 R 再来一轮', THEME.good)
  } else if (state.status === 'cleared') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关', '第 ' + state.level + ' 关完成 · 金币 ' + state.coinsCollected, THEME.good)
  } else if (options.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
