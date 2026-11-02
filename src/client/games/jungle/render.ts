/**
 * 斗兽棋渲染器：绘制 7x9 棋盘（草地、两块河流、双方陷阱与兽穴）、
 * 带等级角标的动物棋子、选中高亮与可走提示点、上一步标记、兽穴告急
 * 红色脉冲、HUD（回合/难度/思考中）与胜负/暂停 overlay。全部为纯
 * canvas 绘制（../theme.ts 共享视觉件），不含 DOM 状态。
 */
import {
  COLS, ROWS, idx, rowOf, colOf, isWater, BLACK_DEN, RED_DEN,
  BLACK_TRAPS, RED_TRAPS, RANK, colorOf,
  type Piece, type Position, type Move,
} from './logic.ts'
import {
  THEME, drawBackground, glow, noGlow, roundRectPath, hudPair, drawOverlay,
} from '../theme.ts'

const MARGIN = 20
const HUD_H = 44
const CELL = 50
export const LOGICAL_W = MARGIN * 2 + CELL * COLS
export const LOGICAL_H = HUD_H + MARGIN * 2 + CELL * ROWS

/** 棋子显示名（八兽汉字，双方同字不同色）。 */
const NAME: Record<Piece, string> = {
  E: '象', L: '狮', T: '虎', P: '豹', W: '狼', D: '狗', C: '猫', M: '鼠',
  e: '象', l: '狮', t: '虎', p: '豹', w: '狼', d: '狗', c: '猫', m: '鼠',
}

/** 一次渲染所需的全部视图状态（index.ts 每帧组装）。 */
export interface JungleView {
  /** 当前局面。 */
  pos: Position
  /** 选中的己方棋子格索引；未选中为 -1。 */
  selected: number
  /** 选中棋子的合法着法（可走提示点）。 */
  hints: readonly Move[]
  /** 最近一步着法（高亮环）。 */
  lastMove: Move | null
  /** 兽穴告急的一方（该方兽穴邻格有敌子）；null 为无。 */
  denThreat: 'r' | 'b' | null
  /** AI 是否正在思考（HUD 动画）。 */
  thinking: boolean
  /** 难度档（1-3）。 */
  level: number
  /** 动画时钟（performance.now()）。 */
  timeMs: number
  /** 终局/暂停态。 */
  result: 'playing' | 'win' | 'lose' | 'paused'
}

/** 列中心 x。 */
export function centerX(col: number): number {
  return MARGIN + col * CELL + CELL / 2
}

/** 行中心 y。 */
export function centerY(row: number): number {
  return HUD_H + MARGIN + row * CELL + CELL / 2
}

/** 命中测试：逻辑坐标 → 格索引；棋盘外返回 -1。 */
export function cellAt(x: number, y: number): number {
  const col = Math.floor((x - MARGIN) / CELL)
  const row = Math.floor((y - HUD_H - MARGIN) / CELL)
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1
  return idx(row, col)
}

/** 格索引中心坐标（吃子粒子出生点）。 */
export function centerOfIndex(i: number): [number, number] {
  return [centerX(colOf(i)), centerY(rowOf(i))]
}

/** 单格地形底色与纹样。 */
function drawTerrain(ctx: CanvasRenderingContext2D, i: number): void {
  const row = rowOf(i)
  const col = colOf(i)
  const x = MARGIN + col * CELL
  const y = HUD_H + MARGIN + row * CELL
  if (isWater(i)) {
    ctx.fillStyle = '#1b3a5c'
    ctx.fillRect(x, y, CELL, CELL)
    ctx.strokeStyle = 'rgba(125,207,255,0.22)'
    ctx.lineWidth = 1.5
    for (const off of [14, 30]) {
      ctx.beginPath()
      ctx.moveTo(x + 8, y + off)
      ctx.quadraticCurveTo(x + CELL / 2, y + off - 5, x + CELL - 8, y + off)
      ctx.stroke()
    }
    return
  }
  const dark = (row + col) % 2 === 0
  ctx.fillStyle = dark ? '#243528' : '#293b2e'
  ctx.fillRect(x, y, CELL, CELL)
  if (i === RED_DEN || i === BLACK_DEN) {
    const side = i === RED_DEN ? '#f7768e' : '#7dcfff'
    glow(ctx, side, 12)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(x, y, CELL, CELL)
    noGlow(ctx)
    ctx.strokeStyle = side
    ctx.lineWidth = 2
    ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4)
    ctx.font = 'bold ' + (CELL / 2.4) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = side
    ctx.fillText('穴', x + CELL / 2, y + CELL / 2 + 1)
    return
  }
  if (RED_TRAPS.includes(i) || BLACK_TRAPS.includes(i)) {
    const side = RED_TRAPS.includes(i) ? '#f7768e' : '#7dcfff'
    ctx.strokeStyle = side
    ctx.globalAlpha = 0.75
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 12, y + 12)
    ctx.lineTo(x + CELL - 12, y + CELL - 12)
    ctx.moveTo(x + CELL - 12, y + 12)
    ctx.lineTo(x + 12, y + CELL - 12)
    ctx.stroke()
    ctx.globalAlpha = 1
    return
  }
  // 普通草地：淡格线。
  ctx.strokeStyle = 'rgba(158,206,106,0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)
}

/** 一枚动物棋子：圆片 + 兽名 + 右上等级角标。 */
function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, i: number, selected: boolean): void {
  const cx = centerX(colOf(i))
  const cy = centerY(rowOf(i))
  const red = colorOf(p) === 'r'
  const color = red ? '#f7768e' : '#7dcfff'
  glow(ctx, color, selected ? 16 : 8)
  ctx.beginPath()
  ctx.arc(cx, cy, CELL * 0.38, 0, Math.PI * 2)
  ctx.fillStyle = red ? '#3a2230' : '#1f2f3e'
  ctx.fill()
  ctx.lineWidth = selected ? 3 : 2
  ctx.strokeStyle = color
  ctx.stroke()
  noGlow(ctx)
  ctx.font = 'bold ' + (CELL / 2.2) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = THEME.text
  ctx.fillText(NAME[p], cx, cy + 1)
  // 等级角标。
  const bx = cx + CELL * 0.26
  const by = cy - CELL * 0.26
  ctx.beginPath()
  ctx.arc(bx, by, 8, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.font = 'bold 10px system-ui, sans-serif'
  ctx.fillStyle = '#10101a'
  ctx.fillText(String(RANK[p]), bx, by + 0.5)
}

/** 主渲染入口：整帧绘制棋盘、棋子、提示与 HUD/overlay。 */
export function renderJungle(ctx: CanvasRenderingContext2D, view: JungleView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 棋盘外框。
  roundRectPath(ctx, MARGIN - 6, HUD_H + MARGIN - 6, CELL * COLS + 12, CELL * ROWS + 12, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()

  for (let i = 0; i < ROWS * COLS; i += 1) drawTerrain(ctx, i)

  // 兽穴告急脉冲。
  if (view.denThreat !== null && view.result === 'playing') {
    const den = view.denThreat === 'r' ? RED_DEN : BLACK_DEN
    const x = MARGIN + colOf(den) * CELL
    const y = HUD_H + MARGIN + rowOf(den) * CELL
    const alpha = 0.45 + 0.4 * Math.sin(view.timeMs / 160)
    ctx.strokeStyle = 'rgba(247,118,142,' + alpha.toFixed(3) + ')'
    ctx.lineWidth = 4
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2)
  }

  // 选中棋子的可走提示点（吃子目标为红点，空格为亮点）。
  for (const m of view.hints) {
    const t = view.pos.board[idx(m[2], m[3])]
    const cx = centerX(m[3])
    const cy = centerY(m[2])
    ctx.beginPath()
    ctx.arc(cx, cy, t === '' ? 6 : 9, 0, Math.PI * 2)
    ctx.fillStyle = t === '' ? 'rgba(226,226,238,0.55)' : '#f7768e'
    glow(ctx, t === '' ? '#e2e2ee' : '#f7768e', 8)
    ctx.fill()
    noGlow(ctx)
  }

  // 棋子（选中的最后画，压住提示）。
  for (let i = 0; i < ROWS * COLS; i += 1) {
    const p = view.pos.board[i] as Piece | ''
    if (p !== '') drawPiece(ctx, p, i, i === view.selected)
  }

  // 上一步标记环。
  if (view.lastMove !== null) {
    const [, , tr, tc] = view.lastMove
    const cx = centerX(tc)
    const cy = centerY(tr)
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 0.46, 0, Math.PI * 2)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // HUD：回合 / 难度 / 思考中。
  const turnLabel = view.pos.turn === 'r' ? '红方（你）' : '黑方（AI）'
  hudPair(ctx, MARGIN, 24, '回合', turnLabel)
  hudPair(ctx, LOGICAL_W / 2, 24, '难度', 'L' + view.level, 'left', THEME.gold)
  if (view.thinking && view.result === 'playing') {
    const dots = '.'.repeat(1 + Math.floor(view.timeMs / 350) % 3)
    hudPair(ctx, LOGICAL_W - MARGIN, 24, 'AI', '思考中' + dots, 'right', '#7dcfff')
  } else {
    hudPair(ctx, LOGICAL_W - MARGIN, 24, '操作', '点击走子', 'right')
  }

  if (view.result === 'win') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '兽穴告破！', '你赢了 · U 悔棋 · R 重开', THEME.good)
  else if (view.result === 'lose') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '兽穴失守', '你输了 · U 悔棋 · R 重开', THEME.bad)
  else if (view.result === 'paused') drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · R 重开', THEME.text)
}
