/**
 * 点灯 (Akari) canvas 渲染器：暖纸色盘面，墙格深色、数字墙大数字，
 * 灯泡发光 (glow) 且其照亮范围铺淡黄覆盖；互相看见的灯红圈警示；
 * 仍未照亮的白格铺微暗色提示；顶部 HUD（关卡 / 灯数 / 未照亮数）；
 * 过关与暂停遮罩。无状态 —— 状态由调用方持有；使用共享视觉件
 * (../theme.ts)。
 */
import type { AkariBoard } from './logic.ts'
import { conflictingLights, litCells, numberViolations } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 顶部 HUD 高度（逻辑 px）。 */
export const HUD_H = 32
/** 盘面四周留白（逻辑 px）。 */
const PAD = 8
/** 纸面白格底色。 */
const PAPER = '#e7e2d3'
/** 未照亮白格的微暗覆盖。 */
const DIM = 'rgba(60,60,90,0.22)'
/** 墙格底色。 */
const WALL_FILL = '#23232f'
/** 照亮范围的淡黄覆盖。 */
const LIT_TINT = 'rgba(255,214,110,0.30)'
/** 灯泡发光色。 */
const BULB = '#ffd35c'

/** 格边长随盘面增大而缩小（7→48, 8→44, 9-10→38）。 */
export function cellSize(size: number): number {
  return size <= 7 ? 48 : size <= 8 ? 44 : 38
}

/** 盘面边长（逻辑 px）。 */
export function boardW(size: number): number {
  return size * cellSize(size)
}

/** 画布逻辑宽。 */
export function logicalW(size: number): number {
  return boardW(size) + PAD * 2
}

/** 画布逻辑高：HUD + 盘面 + 底部留白。 */
export function logicalH(size: number): number {
  return HUD_H + PAD + boardW(size) + PAD + 16
}

/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export function cellOrigin(size: number, r: number, c: number): { x: number; y: number } {
  const cell = cellSize(size)
  return { x: PAD + c * cell, y: HUD_H + PAD + r * cell }
}

/** 逻辑坐标点命中的格，盘外返回 null。 */
export function cellAt(size: number, x: number, y: number): { r: number; c: number } | null {
  const cell = cellSize(size)
  const origin = cellOrigin(size, 0, 0)
  const c = Math.floor((x - origin.x) / cell)
  const r = Math.floor((y - origin.y) / cell)
  if (r < 0 || r >= size || c < 0 || c >= size) return null
  return { r, c }
}

/** 格中心在逻辑坐标中的位置（粒子爆发用）。 */
export function cellCenter(size: number, r: number, c: number): { x: number; y: number } {
  const { x, y } = cellOrigin(size, r, c)
  const cell = cellSize(size)
  return { x: x + cell / 2, y: y + cell / 2 }
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param board - 当前盘面。
 * @param lights - 玩家灯位集合。
 * @param level - 1 基关卡号（HUD 显示）。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标（未照亮格），-1 隐藏。
 */
export function renderAkari(
  ctx: CanvasRenderingContext2D, board: AkariBoard, lights: ReadonlySet<number>,
  level: number, paused: boolean, winText: string | null, hintCell: number = -1,
): void {
  const size = board.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  const boardPx = boardW(size)
  const origin = cellOrigin(size, 0, 0)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  const lit = litCells(board, lights)
  const conflicts = conflictingLights(board, lights)
  const badWalls = numberViolations(board, lights)
  let unlit = 0

  // 盘面底：白格纸色、墙格深色。
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const { x, y } = cellOrigin(size, r, c)
      ctx.fillStyle = board.walls[r * size + c] === -1 ? PAPER : WALL_FILL
      ctx.fillRect(x, y, cell, cell)
    }
  }
  // 照亮淡黄覆盖（画在格上、内容之下）。
  ctx.fillStyle = LIT_TINT
  for (const cellIdx of lit) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    ctx.fillRect(x, y, cell, cell)
  }
  // 未照亮白格微暗覆盖 + 计数。
  ctx.fillStyle = DIM
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    if (board.walls[cellIdx] !== -1 || lit.has(cellIdx)) continue
    unlit += 1
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    ctx.fillRect(x, y, cell, cell)
  }

  // 细格线 + 盘外沿。
  ctx.strokeStyle = 'rgba(90,96,130,0.30)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let r = 0; r <= size; r += 1) {
    const { x, y } = cellOrigin(size, r, 0)
    ctx.moveTo(x, y)
    ctx.lineTo(x + boardPx, y)
  }
  for (let c = 0; c <= size; c += 1) {
    const { x, y } = cellOrigin(size, 0, c)
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + boardPx)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(70,76,110,0.9)'
  ctx.lineWidth = 2
  roundRectPath(ctx, origin.x, origin.y, boardPx, boardPx, 4)
  ctx.stroke()

  // 数字墙：大数字，违约墙红字警示。
  ctx.font = '700 ' + Math.floor(cell * 0.52) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const digit = board.walls[cellIdx]!
    if (digit < 0) continue
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const center = cellCenter(size, r, c)
    ctx.fillStyle = badWalls.has(cellIdx) ? THEME.bad : THEME.text
    ctx.fillText(String(digit), center.x, center.y + 1)
  }

  // 灯泡：暖黄圆 + 发光；互视冲突的灯加红圈。
  for (const light of lights) {
    if (board.walls[light] !== -1) continue
    const r = Math.floor(light / size)
    const c = light % size
    const center = cellCenter(size, r, c)
    glow(ctx, BULB, 12)
    ctx.fillStyle = BULB
    ctx.beginPath()
    ctx.arc(center.x, center.y, cell * 0.26, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    if (conflicts.has(light)) {
      ctx.strokeStyle = THEME.bad
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(center.x, center.y, cell * 0.36, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // 提示金环（一个未照亮格）。
  if (hintCell >= 0 && board.walls[hintCell] === -1) {
    const r = Math.floor(hintCell / size)
    const c = hintCell % size
    const { x, y } = cellOrigin(size, r, c)
    glow(ctx, THEME.gold, 10)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2.5
    roundRectPath(ctx, x + 3, y + 3, cell - 6, cell - 6, 6)
    ctx.stroke()
    noGlow(ctx)
  }

  hudPair(ctx, PAD, 21, '关卡', String(level))
  hudPair(ctx, PAD + 90, 21, '灯', String(lights.size))
  hudPair(ctx, w - PAD, 21, '未照亮', String(unlit), 'right', unlit === 0 ? THEME.good : THEME.text)

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
