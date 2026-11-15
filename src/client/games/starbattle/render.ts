/**
 * 星之战 canvas 渲染器：连续格子盘（无格缝），区域按 accent 轮换淡色
 * 底 + 跨区域粗边界描边；星为金色五角（放置弹跳 easeOutBack），✗ 为
 * 双斜线标记；冲突星红显（红光 + 红星 + 红格底）；行/列计数徽标在左/
 * 上留白带（当前/目标），区域计数徽标在各区左上角；HUD（关卡/星数/
 * 提示/计时）与过关/暂停遮罩。无状态 —— 状态由调用方持有；使用共享
 * 视觉件 (../theme.ts)。
 */
import type { StarPuzzle } from './logic.ts'
import { findConflicts } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 30
export const TOP_GUTTER = 18
export const LEFT_GUTTER = 24
export const PAD = 12

/** 格边长随盘面增大而缩小。 */
export function cellSize(size: number): number {
  return size <= 6 ? 56 : size <= 8 ? 48 : size <= 9 ? 44 : 40
}

/** 盘面左上角在逻辑坐标中的位置。 */
export function boardOrigin(size: number): { x: number; y: number } {
  return { x: PAD + LEFT_GUTTER, y: HUD_H + TOP_GUTTER }
}

export function boardW(size: number): number {
  return size * cellSize(size)
}

export function logicalW(size: number): number {
  return PAD + LEFT_GUTTER + boardW(size) + PAD
}

export function logicalH(size: number): number {
  return HUD_H + TOP_GUTTER + boardW(size) + PAD + 14
}

/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export function cellOrigin(size: number, r: number, c: number): { x: number; y: number } {
  const cell = cellSize(size)
  const origin = boardOrigin(size)
  return { x: origin.x + c * cell, y: origin.y + r * cell }
}

/** 逻辑坐标点命中的格，盘外返回 null。 */
export function cellAt(size: number, x: number, y: number): { r: number; c: number } | null {
  const cell = cellSize(size)
  const origin = boardOrigin(size)
  const c = Math.floor((x - origin.x) / cell)
  const r = Math.floor((y - origin.y) / cell)
  if (r < 0 || r >= size || c < 0 || c >= size) return null
  return { r, c }
}

/** 格中心（粒子爆发用）。 */
export function cellCenter(size: number, r: number, c: number): { x: number; y: number } {
  const { x, y } = cellOrigin(size, r, c)
  const cell = cellSize(size)
  return { x: x + cell / 2, y: y + cell / 2 }
}

/** 一帧所需的玩家视图状态。 */
export interface StarView {
  /** 格标记数组（0 空 / 1 星 / 2 ✗），长度 size×size。 */
  marks: readonly number[]
  /** 展示关卡号（1 基）。 */
  level: number
  /** 已放星数。 */
  placed: number
  /** 提示剩余次数。 */
  hintsLeft: number
  /** 计时文本 'm:ss'。 */
  elapsed: string
  /** 悬停格下标，-1 无。 */
  hover: number
  /** 放星时刻（格下标 → ms），弹跳动画用。 */
  bornAt: ReadonlyMap<number, number>
  /** 当前时刻 ms（与 bornAt 同源）。 */
  nowMs: number
  /** 显示暂停遮罩。 */
  paused: boolean
  /** 过关遮罩副标题，游玩中为 null。 */
  winText: string | null
}

/** 区域间边界线宽。 */
const REGION_EDGE = 3
/** 同区域格间细线宽。 */
const CELL_EDGE = 1
/** 放星弹跳时长 ms。 */
const POP_MS = 220

/** 放置弹跳缓动（easeOutBack：过冲回弹到 1）。 */
export function popScale(ageMs: number): number {
  const t = Math.min(1, Math.max(0, ageMs / POP_MS))
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

/** 五角星路径（外接圆半径 outer，内陷半径 inner）。 */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, rot: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = rot + (i * Math.PI) / 5
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** 区域锚定格（成员中行列最小者 = 下标最小者），计数徽标挂点。 */
function regionAnchors(puzzle: StarPuzzle): number[] {
  return puzzle.regionCells.map(members => members.reduce((a, b) => Math.min(a, b)))
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡。
 * @param view - 玩家视图状态。
 */
export function renderStarBattle(ctx: CanvasRenderingContext2D, puzzle: StarPuzzle, view: StarView): void {
  const size = puzzle.size
  const k = puzzle.k
  const cell = cellSize(size)
  const origin = boardOrigin(size)
  const w = logicalW(size)
  const h = logicalH(size)
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  const total = size * size
  const marks = view.marks
  const stars: number[] = []
  for (let i = 0; i < total; i += 1) if (marks[i] === 1) stars.push(i)
  const conflicts = new Set(findConflicts(puzzle, stars))

  // 行/列/区域当前计数。
  const rowCount = new Array<number>(size).fill(0)
  const colCount = new Array<number>(size).fill(0)
  const regionCount = new Array<number>(size).fill(0)
  for (const s of stars) {
    rowCount[Math.floor(s / size)]! += 1
    colCount[s % size]! += 1
    regionCount[puzzle.region[s]!]! += 1
  }

  // HUD：关卡 / 星数 / 提示 / 计时。
  hudPair(ctx, PAD, 20, '关卡 ', String(view.level))
  hudPair(ctx, PAD + 84, 20, '星 ', view.placed + '/' + k * size)
  hudPair(ctx, PAD + 168, 20, '提示 ', String(view.hintsLeft))
  hudPair(ctx, w - PAD, 20, '时间', view.elapsed, 'right')
  if (!puzzle.unique) {
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = THEME.gold
    ctx.fillText('多解', w - PAD - 62, 20)
  }

  // 区域淡色底。
  for (let cellIdx = 0; cellIdx < total; cellIdx += 1) {
    const { x, y } = cellOrigin(size, Math.floor(cellIdx / size), cellIdx % size)
    ctx.fillStyle = accent(puzzle.region[cellIdx]! % 8)
    ctx.globalAlpha = 0.26
    ctx.fillRect(x, y, cell, cell)
    ctx.globalAlpha = 1
  }
  // 冲突格红底。
  for (const s of conflicts) {
    const { x, y } = cellOrigin(size, Math.floor(s / size), s % size)
    ctx.fillStyle = 'rgba(247,118,142,0.22)'
    ctx.fillRect(x, y, cell, cell)
  }
  // 悬停格亮底。
  if (view.hover >= 0 && !conflicts.has(view.hover)) {
    const { x, y } = cellOrigin(size, Math.floor(view.hover / size), view.hover % size)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fillRect(x, y, cell, cell)
  }

  // 网格线：同区域细线，跨区域粗亮线。
  for (let cellIdx = 0; cellIdx < total; cellIdx += 1) {
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const { x, y } = cellOrigin(size, r, c)
    const id = puzzle.region[cellIdx]!
    const rightId = c + 1 < size ? puzzle.region[cellIdx + 1]! : -1
    const downId = r + 1 < size ? puzzle.region[cellIdx + size]! : -1
    ctx.lineWidth = CELL_EDGE
    ctx.strokeStyle = 'rgba(226,226,238,0.14)'
    ctx.beginPath()
    ctx.moveTo(x, y + cell)
    ctx.lineTo(x + cell, y + cell)
    ctx.moveTo(x + cell, y)
    ctx.lineTo(x + cell, y + cell)
    ctx.stroke()
    ctx.lineWidth = REGION_EDGE
    ctx.strokeStyle = 'rgba(226,226,238,0.75)'
    ctx.beginPath()
    if (rightId !== id) {
      ctx.moveTo(x + cell - REGION_EDGE / 2, y)
      ctx.lineTo(x + cell - REGION_EDGE / 2, y + cell)
    }
    if (downId !== id) {
      ctx.moveTo(x, y + cell - REGION_EDGE / 2)
      ctx.lineTo(x + cell, y + cell - REGION_EDGE / 2)
    }
    ctx.stroke()
  }
  ctx.lineWidth = REGION_EDGE
  ctx.strokeStyle = 'rgba(226,226,238,0.85)'
  roundRectPath(ctx, origin.x + REGION_EDGE / 2, origin.y + REGION_EDGE / 2,
    boardW(size) - REGION_EDGE, boardW(size) - REGION_EDGE, 4)
  ctx.stroke()

  // 计数徽标：行（左白带右对齐）、列（上白带居中）、区域（区左上角）。
  const badgeColor = (cur: number): string => cur > k ? THEME.bad : cur === k ? THEME.good : THEME.textMuted
  ctx.font = '700 10px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  for (let r = 0; r < size; r += 1) {
    const { y } = cellOrigin(size, r, 0)
    ctx.textAlign = 'right'
    ctx.fillStyle = badgeColor(rowCount[r]!)
    ctx.fillText(String(rowCount[r]) + '/' + String(k), origin.x - 5, y + cell / 2)
  }
  ctx.textAlign = 'center'
  for (let c = 0; c < size; c += 1) {
    const { x } = cellOrigin(size, 0, c)
    ctx.fillStyle = badgeColor(colCount[c]!)
    ctx.fillText(String(colCount[c]) + '/' + String(k), x + cell / 2, origin.y - 8)
  }
  ctx.textAlign = 'left'
  const anchors = regionAnchors(puzzle)
  for (let id = 0; id < size; id += 1) {
    const a = anchors[id]!
    const { x, y } = cellOrigin(size, Math.floor(a / size), a % size)
    ctx.fillStyle = badgeColor(regionCount[id]!)
    ctx.globalAlpha = 0.9
    ctx.fillText(String(regionCount[id]) + '/' + String(k), x + 4, y + 9)
    ctx.globalAlpha = 1
  }

  // ✗ 标记（双斜线）。
  ctx.lineCap = 'round'
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(226,226,238,0.5)'
  for (let cellIdx = 0; cellIdx < total; cellIdx += 1) {
    if (marks[cellIdx] !== 2) continue
    const { x, y } = cellOrigin(size, Math.floor(cellIdx / size), cellIdx % size)
    const m = cell * 0.26
    ctx.beginPath()
    ctx.moveTo(x + m, y + m)
    ctx.lineTo(x + cell - m, y + cell - m)
    ctx.moveTo(x + cell - m, y + m)
    ctx.lineTo(x + m, y + cell - m)
    ctx.stroke()
  }

  // 星：金色五角 + 放置弹跳；冲突星红显。
  const outer = cell * 0.33
  for (const s of stars) {
    const born = view.bornAt.get(s)
    const scale = born === undefined ? 1 : Math.max(0.05, popScale(view.nowMs - born))
    const { x, y } = cellCenter(size, Math.floor(s / size), s % size)
    const bad = conflicts.has(s)
    const color = bad ? THEME.bad : THEME.gold
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    glow(ctx, color, bad ? 16 : 12)
    starPath(ctx, 0, 0, outer, outer * 0.45, -Math.PI / 2)
    ctx.fillStyle = color
    ctx.fill()
    noGlow(ctx)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = bad ? '#ffd7de' : '#fff3d6'
    ctx.stroke()
    ctx.restore()
  }
  ctx.lineCap = 'butt'

  if (view.winText !== null) drawOverlay(ctx, w, h, '过关', view.winText, THEME.gold)
  else if (view.paused) drawOverlay(ctx, w, h, '已暂停', '按 P 继续')
}
