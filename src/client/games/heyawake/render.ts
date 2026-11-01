/**
 * 别府涂黑 canvas 渲染器：网格按房间划分 —— 房间内部 1px 细线格、房间之间
 * 2.5px 粗边界，格间无缝；玩家涂黑格深色；房间数字画在房间中心（该格被
 * 涂黑则不画）；光标环；与主白区断连的白格红框警示；过关/暂停遮罩。
 * 无状态 —— 状态由调用方持有；使用共享视觉件 (../theme.ts)。
 */
import type { HeyaPuzzle } from './logic.ts'
import { roomCovers } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 顶部 HUD 高度（逻辑 px）。 */
export const HUD_H = 32
/** 格间无缝：房间用粗边界分隔，比格间隙更清晰。 */
export const GAP = 0
/** 盘面四周留白（逻辑 px）。 */
const PAD = 8
/** 房间边界线宽。 */
const ROOM_LINE = 2.5
/** 房间内部格线线宽。 */
const CELL_LINE = 1
/** 玩家涂黑格颜色。 */
const BLACK_FILL = '#26263a'

/** 格边长随盘面增大而缩小（6→50, 8→42, 10→36）。 */
export function cellSize(size: number): number {
  return size <= 6 ? 50 : size <= 8 ? 42 : 36
}

/** 盘面边长（逻辑 px，无缝网格）。 */
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
 * 与主白区（白格连通块之一）不连通的白格集合——孤立白格警示用。
 * 规则要求白格整体连通，被黑格围死的白格用红框提示玩家。
 */
function isolatedWhites(size: number, blacks: ReadonlySet<number>): Set<number> {
  const whites: number[] = []
  for (let i = 0; i < size * size; i += 1) if (!blacks.has(i)) whites.push(i)
  if (whites.length === 0) return new Set()
  // BFS from the first white; any white it cannot reach is isolated.
  const seen = new Set<number>([whites[0]!])
  const stack = [whites[0]!]
  while (stack.length > 0) {
    const cur = stack.pop()!
    const r = Math.floor(cur / size)
    const c = cur % size
    const around: number[] = []
    if (r > 0) around.push(cur - size)
    if (r < size - 1) around.push(cur + size)
    if (c > 0) around.push(cur - 1)
    if (c < size - 1) around.push(cur + 1)
    for (const n of around) {
      if (!blacks.has(n) && !seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return new Set(whites.filter(cell => !seen.has(cell)))
}

/**
 * 每格所属房间下标（rooms 覆盖全盘，假定完整划分）。
 */
function roomIndexMap(puzzle: HeyaPuzzle): number[] {
  const size = puzzle.size
  const map: number[] = []
  for (let cell = 0; cell < size * size; cell += 1) {
    const r = Math.floor(cell / size)
    const c = cell % size
    let idx = -1
    for (let i = 0; i < puzzle.rooms.length; i += 1) {
      if (roomCovers(puzzle.rooms[i]!.rect, r, c)) { idx = i; break }
    }
    map.push(idx)
  }
  return map
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡盘面。
 * @param blacks - 玩家已涂黑格集合。
 * @param cursor - 光标格下标，-1 隐藏光标环。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCells - 提示覆盖：应涂黑格的金色描边，空数组为无提示。
 */
export function renderHeya(
  ctx: CanvasRenderingContext2D, puzzle: HeyaPuzzle, blacks: ReadonlySet<number>,
  cursor: number, paused: boolean, winText: string | null, hintCells: readonly number[] = [],
): void {
  const size = puzzle.size
  const w = logicalW(size)
  const h = logicalH(size)
  const cell = cellSize(size)
  const board = boardW(size)
  const origin = cellOrigin(size, 0, 0)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, PAD, 21, '已涂 ', String(blacks.size))
  hudPair(ctx, w - PAD, 21, '规则', '白格连通', 'right')

  const roomOf = roomIndexMap(puzzle)
  const isolated = isolatedWhites(size, blacks)

  // 盘面底：整块白底，涂黑格单独覆盖。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(origin.x, origin.y, board, board)
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    if (!blacks.has(cellIdx)) continue
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    ctx.fillStyle = BLACK_FILL
    ctx.fillRect(x, y, cell, cell)
  }

  // 房间内部细格线：相邻格同房间时才画。
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = CELL_LINE
  ctx.beginPath()
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      if (roomOf[r * size + c] === roomOf[r * size + c + 1]) {
        const { x, y } = cellOrigin(size, r, c + 1)
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + cell)
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    for (let r = 0; r < size - 1; r += 1) {
      if (roomOf[r * size + c] === roomOf[(r + 1) * size + c]) {
        const { x, y } = cellOrigin(size, r + 1, c)
        ctx.moveTo(x, y)
        ctx.lineTo(x + cell, y)
      }
    }
  }
  ctx.stroke()

  // 房间粗边界：相邻格不同房间的接缝 + 盘外沿一圈。
  ctx.strokeStyle = 'rgba(226,226,238,0.6)'
  ctx.lineWidth = ROOM_LINE
  ctx.beginPath()
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      if (roomOf[r * size + c] !== roomOf[r * size + c + 1]) {
        const { x, y } = cellOrigin(size, r, c + 1)
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + cell)
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    for (let r = 0; r < size - 1; r += 1) {
      if (roomOf[r * size + c] !== roomOf[(r + 1) * size + c]) {
        const { x, y } = cellOrigin(size, r + 1, c)
        ctx.moveTo(x, y)
        ctx.lineTo(x + cell, y)
      }
    }
  }
  ctx.stroke()
  roundRectPath(ctx, origin.x, origin.y, board, board, 4)
  ctx.stroke()

  // 孤立白格红框：白格连通规则被局部破坏的警示。
  for (const cellIdx of isolated) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 2
    roundRectPath(ctx, x + 3, y + 3, cell - 6, cell - 6, 6)
    ctx.stroke()
  }

  // 房间数字：画在房间中心格，半透明大号；该格被涂黑则不画。
  ctx.font = '700 ' + Math.floor(cell * 0.5) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(226,226,238,0.55)'
  for (const room of puzzle.rooms) {
    if (room.count === undefined) continue
    const r = Math.floor((room.rect[0] + room.rect[2]) / 2)
    const c = Math.floor((room.rect[1] + room.rect[3]) / 2)
    const cellIdx = r * size + c
    if (blacks.has(cellIdx)) continue
    const center = cellCenter(size, r, c)
    ctx.fillText(String(room.count), center.x, center.y + 1)
  }

  // 光标环与提示金环。
  const hintSet = new Set(hintCells)
  for (let cellIdx = 0; cellIdx < size * size; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    if (cursor === cellIdx) {
      glow(ctx, THEME.text, 8)
      ctx.strokeStyle = THEME.text
      ctx.lineWidth = 2.5
      roundRectPath(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, 6)
      ctx.stroke()
      noGlow(ctx)
    }
    if (hintSet.has(cellIdx)) {
      glow(ctx, THEME.gold, 10)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2.5
      roundRectPath(ctx, x + 3, y + 3, cell - 6, cell - 6, 6)
      ctx.stroke()
      noGlow(ctx)
    }
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
