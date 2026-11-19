/**
 * 阴阳双色 (YinYang) canvas 渲染器：水墨风盘面——黑格墨块、白格留白带
 * 边框；预标格金色描边；同色 2×2 违例红框整块框出；双色已填区域各自
 * 连通时盘面外沿发光（连通指示）；顶部 HUD（关卡 / 步数 / 空格）；
 * 过关时太极图案显现 + 遮罩；暂停遮罩。无状态——状态由调用方持有；
 * 使用共享视觉件 (../theme.ts)。
 */
import type { YinYangBoard } from './logic.ts'
import { EMPTY, conflictCells, filledConnected, monoSquares } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 顶部 HUD 高度（逻辑 px）。 */
export const HUD_H = 32
/** 盘面四周留白（逻辑 px）。 */
const PAD = 8
/** 空格底色（宣纸暗面）。 */
const EMPTY_FILL = '#262636'
/** 白格底色（留白宣纸）。 */
const PAPER = '#e8e4d6'
/** 黑格底色（墨块）。 */
const INK = '#191926'

/** 格边长随盘面增大而缩小（6→52, 7→46, 8→42, 9-10→38）。 */
export function cellSize(size: number): number {
  return size <= 6 ? 52 : size <= 7 ? 46 : size <= 8 ? 42 : 38
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

/** 太极图案：外圆 + S 曲线 + 双鱼眼（过关遮罩前显现）。 */
function drawTaiji(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = PAPER
  ctx.beginPath()
  ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  ctx.fill()
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(0, 0, radius, Math.PI / 2, -Math.PI / 2, false)
  ctx.arc(0, -radius / 2, radius / 2, -Math.PI / 2, Math.PI / 2, false)
  ctx.arc(0, radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2, true)
  ctx.fill()
  ctx.fillStyle = PAPER
  ctx.beginPath()
  ctx.arc(0, radius / 2, radius * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(0, -radius / 2, radius * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(226,226,238,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param board - 当前盘面（线索 + 生成解）。
 * @param grid - 玩家盘（线索 + 已填格）。
 * @param level - 1 基关卡号（HUD 显示）。
 * @param steps - 玩家步数（HUD 显示）。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标，-1 隐藏。
 */
export function renderYinYang(
  ctx: CanvasRenderingContext2D, board: YinYangBoard, grid: Int8Array,
  level: number, steps: number, paused: boolean, winText: string | null, hintCell: number = -1,
): void {
  const size = board.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  const boardPx = boardW(size)
  const origin = cellOrigin(size, 0, 0)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  const bad = conflictCells(grid, size)
  const bothConnected = filledConnected(grid, size)
  let empties = 0

  // 盘面格：空格暗色、白格留白带边框、黑格墨块；预标格金色描边。
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const idx = r * size + c
      const { x, y } = cellOrigin(size, r, c)
      const v = grid[idx]!
      if (v === EMPTY) {
        empties += 1
        ctx.fillStyle = EMPTY_FILL
        ctx.fillRect(x, y, cell, cell)
      } else if (v === 0) {
        ctx.fillStyle = PAPER
        ctx.fillRect(x, y, cell, cell)
        ctx.strokeStyle = 'rgba(90,96,130,0.45)'
        ctx.lineWidth = 1
        roundRectPath(ctx, x + 3, y + 3, cell - 6, cell - 6, 5)
        ctx.stroke()
      } else {
        ctx.fillStyle = INK
        roundRectPath(ctx, x + 2, y + 2, cell - 4, cell - 4, 6)
        ctx.fill()
      }
      if (board.clues[idx] !== EMPTY) {
        ctx.strokeStyle = THEME.gold
        ctx.lineWidth = 2
        roundRectPath(ctx, x + 2.5, y + 2.5, cell - 5, cell - 5, 6)
        ctx.stroke()
      }
    }
  }

  // 同色 2×2 违例：红框整块框出。
  for (const t of monoSquares(grid, size)) {
    const r = Math.floor(t / size)
    const c = t % size
    const { x, y } = cellOrigin(size, r, c)
    glow(ctx, THEME.bad, 8)
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 2.5
    roundRectPath(ctx, x + 2, y + 2, cell * 2 - 4, cell * 2 - 4, 8)
    ctx.stroke()
    noGlow(ctx)
  }

  // 细格线 + 盘面外沿：双色各自连通时外沿发光（连通指示）。
  ctx.strokeStyle = 'rgba(90,96,130,0.25)'
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
  if (bothConnected && winText === null) glow(ctx, THEME.good, 12)
  ctx.strokeStyle = bothConnected && winText === null ? THEME.good : 'rgba(70,76,110,0.9)'
  ctx.lineWidth = 2
  roundRectPath(ctx, origin.x, origin.y, boardPx, boardPx, 4)
  ctx.stroke()
  noGlow(ctx)

  // 提示金环。
  if (hintCell >= 0 && grid[hintCell] === EMPTY) {
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
  hudPair(ctx, PAD + 90, 21, '步数', String(steps))
  hudPair(ctx, w - PAD, 21, '空', String(empties), 'right', empties === 0 ? THEME.good : THEME.text)

  if (winText !== null) {
    drawTaiji(ctx, w / 2, h / 2 - 34, 34)
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
