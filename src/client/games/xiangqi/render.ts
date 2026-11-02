/**
 * 中国象棋渲染器：木纹棋盘、楚河汉界、九宫斜线、兵炮位标记、
 * 圆形红黑字棋子、选中/可走位提示、将军红字、吃子粒子（由 index 层
 * 的粒子系统叠加）、HUD（回合/难度/思考中/悔棋按钮）与胜负遮罩。
 * 使用共享视觉组件（../theme.ts）。棋盘为 9x10 交叉点，row 0 在上（黑方）。
 */
import { colorOf, colOf, idx, rowOf, type Move, type Piece, type Position } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const MARGIN = 26
const HUD_H = 42
const CELL = 52
export const LOGICAL_W = MARGIN * 2 + CELL * 8
export const LOGICAL_H = HUD_H + MARGIN * 2 + CELL * 9

/** 棋盘木质色系。 */
const WOOD_TOP = '#c9a06a'
const WOOD_BOTTOM = '#b58851'
const WOOD_EDGE = '#7a5230'
const LINE = '#5b3d1e'

/** 红黑双方棋子用字（传统写法：红 帥仕相傌俥炮兵 / 黑 將士象馬車砲卒）。 */
const GLYPH: Record<Piece, string> = {
  K: '帥', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', P: '兵',
  k: '將', a: '士', e: '象', h: '馬', r: '車', c: '砲', p: '卒',
}

/** 交叉点逻辑坐标 -> 画布 x。 */
export function pointX(col: number): number {
  return MARGIN + col * CELL
}

/** 交叉点逻辑坐标 -> 画布 y。 */
export function pointY(row: number): number {
  return HUD_H + MARGIN + row * CELL
}

/** 画布坐标 -> 交叉点索引，容差半格；棋盘外返回 -1。 */
export function pointAt(x: number, y: number): number {
  const col = Math.round((x - MARGIN) / CELL)
  const row = Math.round((y - HUD_H - MARGIN) / CELL)
  if (col < 0 || col > 8 || row < 0 || row > 9) return -1
  const dx = Math.abs(x - pointX(col))
  const dy = Math.abs(y - pointY(row))
  if (dx > CELL * 0.45 || dy > CELL * 0.45) return -1
  return idx(row, col)
}

/** 悔棋按钮区域（HUD 右侧），命中返回 true。 */
export function undoHit(x: number, y: number): boolean {
  return x >= LOGICAL_W - MARGIN - 72 && x <= LOGICAL_W - MARGIN && y >= 10 && y <= 32
}

export interface XiangqiView {
  pos: Position
  /** 选中的交叉点索引，-1 为未选。 */
  selected: number
  /** 选中棋子的合法落点索引集合。 */
  targets: ReadonlySet<number>
  /** 最近一步着法。 */
  lastMove: Move | null
  /** 被将军的将/帅位置，-1 为无。 */
  checkSquare: number
  /** 难度标签（如 "难度 2·深度 3"）。 */
  difficultyLabel: string
  /** AI 是否思考中。 */
  thinking: boolean
  /** 终局标题，对局中为 null。 */
  statusText: string | null
  statusSub: string
  statusColor: string
  paused: boolean
  /** 是否可悔棋（控制按钮亮/灰）。 */
  canUndo: boolean
}

/** 在交叉点四角画炮/兵位小角标（贴边侧自动省略）。 */
function drawPointMark(ctx: CanvasRenderingContext2D, row: number, col: number): void {
  const x = pointX(col)
  const y = pointY(row)
  const g = 4
  const l = 6
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    if ((col === 0 && sx < 0) || (col === 8 && sx > 0)) continue
    const cx = x + sx * g
    const cy = y + sy * g
    ctx.beginPath()
    ctx.moveTo(cx, cy + sy * l)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + sx * l, cy)
    ctx.stroke()
  }
}

function drawBoard(ctx: CanvasRenderingContext2D): void {
  // 木质底盘。
  roundRectPath(ctx, MARGIN - 14, HUD_H + MARGIN - 14, CELL * 8 + 28, CELL * 9 + 28, 10)
  const grad = ctx.createLinearGradient(0, HUD_H, 0, LOGICAL_H)
  grad.addColorStop(0, WOOD_TOP)
  grad.addColorStop(1, WOOD_BOTTOM)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = WOOD_EDGE
  ctx.lineWidth = 2.5
  ctx.stroke()

  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.2
  // 十条横线。
  for (let row = 0; row <= 9; row += 1) {
    ctx.beginPath()
    ctx.moveTo(pointX(0), pointY(row))
    ctx.lineTo(pointX(8), pointY(row))
    ctx.stroke()
  }
  // 竖线：边线贯通，中间线在楚河汉界断开。
  for (let col = 0; col <= 8; col += 1) {
    if (col === 0 || col === 8) {
      ctx.beginPath()
      ctx.moveTo(pointX(col), pointY(0))
      ctx.lineTo(pointX(col), pointY(9))
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(pointX(col), pointY(0))
      ctx.lineTo(pointX(col), pointY(4))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pointX(col), pointY(5))
      ctx.lineTo(pointX(col), pointY(9))
      ctx.stroke()
    }
  }
  // 九宫斜线。
  for (const top of [0, 7]) {
    ctx.beginPath()
    ctx.moveTo(pointX(3), pointY(top))
    ctx.lineTo(pointX(5), pointY(top + 2))
    ctx.moveTo(pointX(5), pointY(top))
    ctx.lineTo(pointX(3), pointY(top + 2))
    ctx.stroke()
  }
  // 炮位与兵位角标。
  for (const col of [1, 7]) {
    drawPointMark(ctx, 2, col)
    drawPointMark(ctx, 7, col)
  }
  for (const col of [0, 2, 4, 6, 8]) {
    drawPointMark(ctx, 3, col)
    drawPointMark(ctx, 6, col)
  }
  // 楚河汉界。
  ctx.font = 'bold 26px "KaiTi", "STKaiti", "SimSun", serif'
  ctx.fillStyle = 'rgba(74,44,16,0.8)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const riverY = (pointY(4) + pointY(5)) / 2
  ctx.fillText('楚  河', pointX(2), riverY)
  ctx.fillText('漢  界', pointX(6), riverY)
  ctx.textBaseline = 'alphabetic'
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, radius: number): void {
  const red = colorOf(p) === 'r'
  const ring = red ? '#c23b2e' : '#26262e'
  const ink = red ? '#b52d24' : '#1e1e26'
  glow(ctx, 'rgba(0,0,0,0.35)', 5)
  ctx.beginPath()
  ctx.arc(cx, cy + 1.5, radius, 0, Math.PI * 2)
  ctx.fillStyle = '#efe3c6'
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = ring
  ctx.lineWidth = 2.4
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy + 1.5, radius - 4, 0, Math.PI * 2)
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = 'bold ' + Math.round(radius * 1.15) + 'px "KaiTi", "STKaiti", "SimSun", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = ink
  ctx.fillText(GLYPH[p], cx, cy + 2)
  ctx.textBaseline = 'alphabetic'
}

function drawUndoButton(ctx: CanvasRenderingContext2D, enabled: boolean): void {
  const x = LOGICAL_W - MARGIN - 72
  roundRectPath(ctx, x, 10, 72, 22, 6)
  ctx.fillStyle = enabled ? THEME.panel : 'rgba(30,30,42,0.5)'
  ctx.fill()
  ctx.strokeStyle = enabled ? THEME.panelEdge : 'rgba(52,52,74,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = enabled ? THEME.text : THEME.textMuted
  ctx.fillText('悔棋 U', x + 36, 25)
}

/** 渲染一帧象棋视图（粒子由调用方随后叠加）。 */
export function renderXiangqi(ctx: CanvasRenderingContext2D, view: XiangqiView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawBoard(ctx)

  // 最近一步着法标记。
  if (view.lastMove !== null) {
    const m = view.lastMove
    ctx.fillStyle = 'rgba(224,175,104,0.35)'
    for (const [r, c] of [[m[0], m[1]], [m[2], m[3]]] as const) {
      ctx.beginPath()
      ctx.arc(pointX(c), pointY(r), 9, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 选中与可走位提示。
  if (view.selected >= 0) {
    glow(ctx, THEME.accents[0]!, 12)
    ctx.strokeStyle = THEME.accents[0]!
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(pointX(colOf(view.selected)), pointY(rowOf(view.selected)), CELL * 0.46, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
  }
  for (const t of view.targets) {
    const cx = pointX(colOf(t))
    const cy = pointY(rowOf(t))
    if (view.pos.board[t] !== '') {
      ctx.strokeStyle = 'rgba(159,206,106,0.95)'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(159,206,106,0.75)'
      ctx.fill()
    }
  }

  // 棋子。
  for (let i = 0; i < 90; i += 1) {
    const p = view.pos.board[i] as Piece | ''
    if (p === '') continue
    drawPiece(ctx, p, pointX(colOf(i)), pointY(rowOf(i)), CELL * 0.43)
  }

  // 将军红圈 + 红字。
  if (view.checkSquare >= 0) {
    glow(ctx, THEME.bad, 14)
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(pointX(colOf(view.checkSquare)), pointY(rowOf(view.checkSquare)), CELL * 0.46, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.bad
    ctx.fillText('将 军 ！', LOGICAL_W / 2, LOGICAL_H - 7)
  }

  // HUD。
  const sideText = view.pos.turn === 'r' ? '红方行棋' : '黑方行棋'
  hudPair(ctx, MARGIN, 26, '回合', sideText)
  hudPair(ctx, 160, 26, '难度', view.difficultyLabel, 'left', THEME.gold)
  drawUndoButton(ctx, view.canUndo)
  if (view.thinking) {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.gold
    ctx.fillText('思考中…', LOGICAL_W - MARGIN - 72 - 70, 25)
  }

  if (view.statusText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, view.statusText, view.statusSub, view.statusColor)
  }
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
