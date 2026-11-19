/**
 * 残局挑战渲染：经典木纹棋盘（坐标标注）、Unicode 棋子（白描边 / 黑
 * 填充）、选中与合法落点提示、将军红圈、目标 / PAR / 步数 HUD 与过关
 * overlay。纯绘制函数，无 DOM、无状态。
 */
import {
  THEME, accent, glow, noGlow, drawBackground, drawOverlay, hudPair, roundRectPath,
} from '../theme.ts'
import { findKing, inCheck, type ChessEndState, type ChessMove } from './logic.ts'

/** 单格边长与棋盘原点（逻辑像素）。 */
export const CELL = 60
export const BOARD = CELL * 8
export const BOARD_X = 40
export const BOARD_Y = 116
/** 逻辑画布尺寸。 */
export const W = BOARD + BOARD_X * 2
export const H = BOARD_Y + BOARD + 44

/** 浅格 / 深格的木纹色。 */
const LIGHT = '#ecd6ae'
const DARK = '#b08052'

/** 棋子 Unicode 字形（黑白共用，靠填充色区分）。 */
const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }

/**
 * 绘制完整对局画面（每帧全量重绘）。
 * @param ctx - 逻辑坐标系已就位的 2d 上下文。
 * @param state - 对局状态。
 * @param selected - 选中格索引（-1 为无）。
 * @param targets - 选中棋子的合法落点。
 * @param hint - 提示走法（null 为无）。
 * @param paused - 暂停遮罩。
 */
export function renderChessEnd(
  ctx: CanvasRenderingContext2D,
  state: ChessEndState,
  selected: number,
  targets: readonly number[],
  hint: ChessMove | null,
  paused: boolean,
): void {
  drawBackground(ctx, W, H)
  drawHud(ctx, state)
  drawBoard(ctx, state, selected, targets, hint)
  drawMessage(ctx, state)
  if (paused) drawOverlay(ctx, W, H, '已暂停', '按 P 继续', THEME.text)
  else if (state.status === 'won') {
    drawOverlay(ctx, W, H, '过关', '步数 ' + state.moveCount + ' / PAR ' + state.puzzle.par + ' · 得分 ' + state.score, THEME.gold)
  } else if (state.status === 'draw') {
    drawOverlay(ctx, W, H, '逼和', '按 R 重开再战', THEME.textMuted)
  } else if (state.status === 'lost') {
    drawOverlay(ctx, W, H, '被将杀', '按 R 重开再战', THEME.bad)
  }
}

/** 顶部 HUD：题号标题 / 目标 / 步数 / PAR / 提示余量。 */
function drawHud(ctx: CanvasRenderingContext2D, state: ChessEndState): void {
  const idx = state.puzzleIndex + 1
  ctx.textAlign = 'left'
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(idx + '. ' + state.puzzle.title, BOARD_X, 34)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('目标：' + state.puzzle.goalText, BOARD_X, 58)
  hudPair(ctx, W - BOARD_X, 34, '步数', state.moveCount + ' / ' + state.puzzle.par, 'right')
  hudPair(ctx, W - BOARD_X, 58, '提示', String(state.hintsLeft), 'right', state.hintsLeft > 0 ? accent(2) : THEME.textMuted)
}

/** 底栏消息（非法走法 / 将军 / 结果）。 */
function drawMessage(ctx: CanvasRenderingContext2D, state: ChessEndState): void {
  if (state.message === '') return
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = state.status === 'won' ? THEME.gold : THEME.text
  ctx.fillText(state.message, W / 2, H - 18)
}

/** 格索引 → 棋盘左上角坐标。 */
const cellRect = (sq: number): { x: number, y: number } => ({
  x: BOARD_X + (sq & 7) * CELL,
  y: BOARD_Y + (sq >> 3) * CELL,
})

/** 棋盘主体：木纹格、坐标、高亮、棋子、将军红圈。 */
function drawBoard(
  ctx: CanvasRenderingContext2D,
  state: ChessEndState,
  selected: number,
  targets: readonly number[],
  hint: ChessMove | null,
): void {
  // 外框
  roundRectPath(ctx, BOARD_X - 8, BOARD_Y - 8, BOARD + 16, BOARD + 16, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  for (let sq = 0; sq < 64; sq += 1) {
    const { x, y } = cellRect(sq)
    ctx.fillStyle = ((sq >> 3) + (sq & 7)) % 2 === 0 ? LIGHT : DARK
    ctx.fillRect(x, y, CELL, CELL)
  }

  // 最近走子与引擎应手的高亮
  const mark = (move: ChessMove, color: string): void => {
    for (const sq of [move.from, move.to]) {
      const { x, y } = cellRect(sq)
      ctx.fillStyle = color
      ctx.fillRect(x, y, CELL, CELL)
    }
  }
  if (state.lastPlayer !== null) mark(state.lastPlayer, 'rgba(122,162,247,0.24)')
  if (state.lastReply !== null) mark(state.lastReply, 'rgba(247,118,142,0.20)')

  // 选中格与提示格
  if (selected >= 0) {
    const { x, y } = cellRect(selected)
    ctx.fillStyle = 'rgba(122,162,247,0.38)'
    ctx.fillRect(x, y, CELL, CELL)
    ctx.strokeStyle = accent(0)
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2)
  }
  if (hint !== null) {
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2.5
    for (const sq of [hint.from, hint.to]) {
      const { x, y } = cellRect(sq)
      ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6)
    }
  }

  // 合法落点：空格圆点、吃子格圆环
  ctx.fillStyle = 'rgba(226,226,238,0.85)'
  for (const sq of targets) {
    const { x, y } = cellRect(sq)
    ctx.beginPath()
    ctx.arc(x + CELL / 2, y + CELL / 2, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  // 坐标标注
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let f = 0; f < 8; f += 1) {
    ctx.fillText('abcdefgh'[f]!, BOARD_X + f * CELL + CELL / 2, BOARD_Y + BOARD + 14)
  }
  for (let r = 0; r < 8; r += 1) {
    ctx.fillText(String(8 - r), BOARD_X - 14, BOARD_Y + r * CELL + CELL / 2)
  }

  // 棋子：白方浅色填充 + 深描边，黑方深色填充 + 浅描边
  ctx.font = '42px "Segoe UI Symbol", serif'
  for (let sq = 0; sq < 64; sq += 1) {
    const p = state.board[sq]!
    if (p === '.') continue
    const { x, y } = cellRect(sq)
    const white = p >= 'A' && p <= 'Z'
    ctx.lineWidth = white ? 1.6 : 1.2
    ctx.strokeStyle = white ? '#23232e' : '#d8d8e6'
    ctx.fillStyle = white ? '#f2ede0' : '#26262f'
    glow(ctx, white ? '#ffffff' : '#000000', 4)
    ctx.strokeText(GLYPH[p.toUpperCase()]!, x + CELL / 2, y + CELL / 2 + 2)
    ctx.fillText(GLYPH[p.toUpperCase()]!, x + CELL / 2, y + CELL / 2 + 2)
    noGlow(ctx)
  }
  ctx.textBaseline = 'alphabetic'

  // 将军红圈：被将军的王（过关时标黑王）
  let ringSq = -1
  if (state.status === 'won') {
    const bk = findKing(state.board, 'b')
    if (bk >= 0 && inCheck(state.board, 'b')) ringSq = bk
  } else if (inCheck(state.board, 'w')) {
    ringSq = findKing(state.board, 'w')
  }
  if (ringSq >= 0) {
    const { x, y } = cellRect(ringSq)
    ctx.strokeStyle = THEME.bad
    ctx.lineWidth = 3
    glow(ctx, THEME.bad, 10)
    ctx.beginPath()
    ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.42, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
  }
}
