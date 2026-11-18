/**
 * 消防救火渲染：俯视街区（建筑屋顶纹理/草地/道路）、火苗橙红渐层与
 * 烟、弧线水柱粒子、焦黑废墟、戴帽持水枪的消防员（喷向随朝向），
 * 以及剩余火点/损失/冷却 HUD 与过关 overlay。纯 canvas 绘制，由逻辑
 * 状态驱动；逻辑画布固定为最大关卡盘面并居中较小盘面。
 */
import {
  LEVELS, fireCount, fuelOf, sprayCells,
  type FirefighterState,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

export const TILE = 46
export const HUD_H = 44
const MAX_W = 13
const MAX_H = 9
export const LOGICAL_W = MAX_W * TILE + 42
export const LOGICAL_H = HUD_H + MAX_H * TILE + 16

/** 当前关卡盘面在逻辑画布上的左上角（居中）。 */
function boardOrigin(state: FirefighterState): { bx: number; by: number } {
  const cfg = LEVELS[state.level - 1]!
  return {
    bx: (LOGICAL_W - cfg.w * TILE) / 2,
    by: HUD_H + (MAX_H * TILE - cfg.h * TILE) / 2,
  }
}

/** 逻辑坐标 (x, y) 所在格，盘面外返回 null。 */
export function cellAt(state: FirefighterState, x: number, y: number): { tx: number; ty: number } | null {
  const { bx, by } = boardOrigin(state)
  const tx = Math.floor((x - bx) / TILE)
  const ty = Math.floor((y - by) / TILE)
  const cfg = LEVELS[state.level - 1]!
  if (tx < 0 || tx >= cfg.w || ty < 0 || ty >= cfg.h) return null
  return { tx, ty }
}

export interface FirefighterView {
  state: FirefighterState
  paused: boolean
}

const GRASS_FILL = '#25402c'
const ROAD_FILL = '#262633'
const ROAD_EDGE = 'rgba(122,162,247,0.10)'
const ROOF_A = '#3b3b56'
const ROOF_B = '#32324a'
const BURNT_FILL = '#15151a'

/** 每格确定的相位偏移（火苗/烟的动画错开，不依赖运行期随机）。 */
function phaseOf(tx: number, ty: number): number {
  return ((tx * 73 + ty * 131) % 17) / 17 * Math.PI * 2
}

function drawTile(ctx: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number, state: FirefighterState): void {
  const cell = state.grid[ty]![tx]!
  if (cell.burnt) {
    ctx.fillStyle = BURNT_FILL
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2)
    ctx.strokeStyle = 'rgba(224,175,104,0.16)'
    ctx.beginPath()
    ctx.moveTo(px + 8, py + TILE - 10)
    ctx.lineTo(px + TILE / 2, py + 12)
    ctx.lineTo(px + TILE - 9, py + TILE - 8)
    ctx.stroke()
    return
  }
  if (cell.kind === 'grass') {
    ctx.fillStyle = GRASS_FILL
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2)
    ctx.strokeStyle = 'rgba(158,206,106,0.28)'
    ctx.beginPath()
    for (let i = 0; i < 4; i += 1) {
      const gx = px + 8 + ((tx * 5 + ty * 3 + i * 11) % (TILE - 14))
      const gy = py + 8 + ((ty * 7 + tx * 2 + i * 13) % (TILE - 14))
      ctx.moveTo(gx, gy)
      ctx.lineTo(gx + 2, gy - 4)
    }
    ctx.stroke()
    return
  }
  if (cell.kind === 'empty') {
    ctx.fillStyle = ROAD_FILL
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2)
    ctx.strokeStyle = ROAD_EDGE
    ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3)
    return
  }
  // 建筑：屋顶双色人字纹 + 屋脊线 + 窗点。
  ctx.fillStyle = ROOF_A
  ctx.fillRect(px + 2, py + 2, TILE - 4, TILE / 2 - 3)
  ctx.fillStyle = ROOF_B
  ctx.fillRect(px + 2, py + TILE / 2 + 1, TILE - 4, TILE / 2 - 3)
  ctx.strokeStyle = 'rgba(226,226,238,0.22)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(px + 4, py + TILE / 2 - 1)
  ctx.lineTo(px + TILE - 4, py + TILE / 2 - 1)
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(122,162,247,0.5)'
  const wx = px + 8
  ctx.fillRect(wx, py + 8, 5, 5)
  ctx.fillRect(px + TILE - 13, py + 8, 5, 5)
  ctx.fillRect(wx, py + TILE - 13, 5, 5)
  ctx.fillRect(px + TILE - 13, py + TILE - 13, 5, 5)
}

/** 火苗：按强度画 2-3 层橙红黄渐层圆 + 上方灰色烟团，动画仅依赖 t。 */
function drawFire(ctx: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number, state: FirefighterState): void {
  const cell = state.grid[ty]![tx]!
  if (cell.fire <= 0) return
  const cx = px + TILE / 2
  const cy = py + TILE / 2
  const fuel = fuelOf(cell.kind)
  const strength = cell.fire / fuel
  const ph = phaseOf(tx, ty)
  const flick = 0.82 + 0.18 * Math.sin(state.t * 9 + ph)
  const layers = ['rgba(249,87,28,0.85)', 'rgba(255,158,100,0.9)', 'rgba(255,212,84,0.95)']
  for (let i = 0; i < layers.length; i += 1) {
    const r = (13 - i * 3.6) * (0.55 + 0.45 * strength) * flick
    ctx.fillStyle = layers[i]!
    glow(ctx, i === 0 ? '#f9571c' : '#ffd454', 10)
    ctx.beginPath()
    ctx.arc(cx + Math.sin(state.t * 7 + ph + i) * 1.6, cy + (2 - i) * 2.5, Math.max(2, r), 0, Math.PI * 2)
    ctx.fill()
  }
  noGlow(ctx)
  // 烟：强度越高烟团越大越高。
  ctx.fillStyle = 'rgba(120,120,134,' + (0.14 + 0.18 * strength).toFixed(3) + ')'
  for (let i = 0; i < 2; i += 1) {
    const drift = Math.sin(state.t * 1.6 + ph + i * 2) * 4 + LEVELS[state.level - 1]!.wind[0] * 6
    const rise = ((state.t * 14 + i * 16 + ty * 7) % 22)
    ctx.beginPath()
    ctx.arc(cx + drift, cy - 16 - rise - i * 5, 5 + strength * 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 弧线水柱：从消防员水枪口沿朝向抛出一串蓝色水珠。 */
function drawWater(ctx: CanvasRenderingContext2D, state: FirefighterState, bx: number, by: number): void {
  if (!state.spraying || state.cooldown > 0 || state.phase !== 'play') return
  const ox = bx + state.px * TILE + TILE / 2
  const oy = by + state.py * TILE + TILE / 2
  const cells = sprayCells(state.px, state.py, state.facing)
  const water = accent(5)
  for (let i = 0; i < cells.length; i += 1) {
    const c = cells[i]!
    const wx = bx + c.x * TILE + TILE / 2
    const wy = by + c.y * TILE + TILE / 2
    const dist = Math.hypot(wx - ox, wy - oy) / TILE
    const prog = ((state.t * 3.2 + i * 0.31) % 1)
    const px = ox + (wx - ox) * prog
    const arc = Math.sin(prog * Math.PI) * 10 * Math.min(1, dist / SPRAY_MAX)
    ctx.fillStyle = water
    ctx.globalAlpha = 0.75 - prog * 0.3
    ctx.beginPath()
    ctx.arc(px, oy + (wy - oy) * prog - arc, 3.1 - dist * 0.25, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

const SPRAY_MAX = 4

/** 消防员：红色身体 + 金色头盔 + 朝向水枪；冷却中闪烁半透明。 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: FirefighterState, bx: number, by: number): void {
  const cx = bx + state.px * TILE + TILE / 2
  const cy = by + state.py * TILE + TILE / 2
  const hurt = state.cooldown > 0
  ctx.globalAlpha = hurt ? 0.45 + 0.35 * Math.sin(state.t * 16) : 1
  // 朝向水枪喷嘴。
  const angle = state.facing === 'up' ? -Math.PI / 2 : state.facing === 'down' ? Math.PI / 2 : state.facing === 'left' ? Math.PI : 0
  const nx = Math.cos(angle)
  const ny = Math.sin(angle)
  ctx.strokeStyle = THEME.text
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + nx * 15, cy + ny * 15)
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.fillStyle = waterGunColor()
  ctx.beginPath()
  ctx.arc(cx + nx * 16, cy + ny * 16, 3.5, 0, Math.PI * 2)
  ctx.fill()
  // 身体。
  glow(ctx, '#f7768e', 8)
  ctx.fillStyle = '#f7768e'
  ctx.beginPath()
  ctx.arc(cx, cy, 10, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 头盔。
  ctx.fillStyle = THEME.gold
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f7768e'
  ctx.beginPath()
  ctx.arc(cx, cy, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

function waterGunColor(): string {
  return accent(5)
}

/** 主渲染入口：背景 → 盘面 → 火 → 水柱 → 消防员 → HUD → overlay。 */
export function renderFirefighter(ctx: CanvasRenderingContext2D, view: FirefighterView): void {
  const { state, paused } = view
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const cfg = LEVELS[state.level - 1]!
  const { bx, by } = boardOrigin(state)
  for (let ty = 0; ty < cfg.h; ty += 1) {
    for (let tx = 0; tx < cfg.w; tx += 1) {
      drawTile(ctx, bx + tx * TILE, by + ty * TILE, tx, ty, state)
    }
  }
  for (let ty = 0; ty < cfg.h; ty += 1) {
    for (let tx = 0; tx < cfg.w; tx += 1) {
      drawFire(ctx, bx + tx * TILE, by + ty * TILE, tx, ty, state)
    }
  }
  // 风向指示（HUD 右侧小箭头随关卡风向旋转）。
  drawWater(ctx, state, bx, by)
  drawPlayer(ctx, state, bx, by)

  // HUD。
  ctx.textAlign = 'left'
  hudPair(ctx, 14, 26, '火点', String(fireCount(state)), 'left', THEME.bad)
  hudPair(ctx, 96, 26, '损失', String(state.totalLoss) + ' 栋', 'left', THEME.gold)
  hudPair(ctx, 196, 26, '关卡', state.level + '/' + LEVELS.length)
  const cd = state.cooldown > 0 ? '冷却 ' + state.cooldown.toFixed(1) + 's' : '水枪就绪'
  hudPair(ctx, LOGICAL_W - 14, 26, cd, ' ', 'right', state.cooldown > 0 ? THEME.bad : THEME.good)
  ctx.textAlign = 'left'

  if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · R 重开本关')
    return
  }
  if (state.phase === 'clear') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '火势扑灭', '损失 ' + state.levelLoss + ' 栋 · 得分 +' + Math.max(100, 900 - state.levelLoss * 150), THEME.good)
    return
  }
  if (state.phase === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '街区保卫成功', '五关全部通关 · Enter 再来一局', THEME.gold)
  }
}
