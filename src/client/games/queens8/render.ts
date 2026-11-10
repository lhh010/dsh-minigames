/**
 * 八皇后画布渲染器：居中棋盘（双色格）、皇后 ♛ 字形（冲突皇后红色辉光）、
 * 悬停格的行/列/两对角线攻击范围提示（悬停皇后时红色连线指向被攻击者）、
 * 档位/皇后数/步数/计时 HUD 与暂停/过关 overlay。渲染器无自有状态；命中
 * 检测辅助函数供 index.ts 把指针坐标换算成格子。
 */
import type { Pos, QueensState } from './logic.ts'
import { attacks, conflictingQueens } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 460
/** HUD 高度（档位/皇后数/步数/计时行）。 */
export const HUD_H = 30
/** 底部提示条高度。 */
export const HINT_H = 26
/** 棋盘左右留白。 */
const BOARD_PAD = 16
/** 单格边长上限（4×4 档不至过大）。 */
const MAX_CELL = 46
/** 最大档位（8×8）下的总逻辑高度。 */
export const LOGICAL_H = HUD_H + 12 + 8 * MAX_CELL + HINT_H + 12

/** 某档位下的格子边长与棋盘原点（棋盘水平居中，纵向自 HUD 下方起）。 */
export function boardLayout(size: number): { x0: number, y0: number, cell: number } {
  const cell = Math.min(MAX_CELL, Math.floor((LOGICAL_W - BOARD_PAD * 2) / size))
  const boardW = cell * size
  return { x0: (LOGICAL_W - boardW) / 2, y0: HUD_H + 12, cell }
}

/**
 * 命中检测：逻辑坐标落在哪个格子。
 * @param x - 逻辑 x 坐标。
 * @param y - 逻辑 y 坐标。
 * @param size - 棋盘边长。
 * @returns 行列格；棋盘外返回 null。
 */
export function cellAt(x: number, y: number, size: number): Pos | null {
  const { x0, y0, cell } = boardLayout(size)
  const col = Math.floor((x - x0) / cell)
  const row = Math.floor((y - y0) / cell)
  if (row < 0 || row >= size || col < 0 || col >= size) return null
  return { row, col }
}

/** 某格中心坐标。 */
export function cellCenter(row: number, col: number, size: number): { x: number, y: number } {
  const { x0, y0, cell } = boardLayout(size)
  return { x: x0 + col * cell + cell / 2, y: y0 + row * cell + cell / 2 }
}

/** 与 (row, col) 同行/列/两对角线的所有格（不含自身）——攻击范围提示。 */
function attackCells(size: number, row: number, col: number): Pos[] {
  const cells: Pos[] = []
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (r === row && c === col) continue
      if (attacks({ row, col }, { row: r, col: c })) cells.push({ row: r, col: c })
    }
  }
  return cells
}

/** 渲染选项（见 index.ts 的调用方持有状态）。 */
export interface RenderOptions {
  /** 悬停格（攻击范围提示），或 null。 */
  hover: Pos | null
  /** 本局已流逝毫秒（计时 HUD）。 */
  elapsedMs: number
  /** 暂停 overlay。 */
  paused: boolean
  /** 过关 overlay 副标题文案，或 null。 */
  winText: string | null
}

/** 秒数格式化为 m:ss。 */
function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return String(m) + ':' + (s < 10 ? '0' : '') + String(s)
}

/**
 * 绘制一帧完整画面。
 * @param ctx - 逻辑坐标系下的 2d 上下文。
 * @param w - 逻辑宽度（LOGICAL_W）。
 * @param h - 逻辑高度（LOGICAL_H）。
 * @param state - 当前局面。
 * @param opts - 渲染选项（悬停、计时、overlay）。
 */
export function renderQueens(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: QueensState, opts: RenderOptions,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)
  const { x0, y0, cell } = boardLayout(state.size)
  const boardW = cell * state.size

  // HUD：档位、皇后数、步数、计时。
  hudPair(ctx, 10, 21, '档位 ', String(state.size) + '×' + String(state.size))
  hudPair(ctx, w / 2 - 30, 21, '皇后 ', String(state.queens.length) + '/' + String(state.size), 'left', THEME.gold)
  hudPair(ctx, w / 2 + 40, 21, '步数 ', String(state.moves))
  hudPair(ctx, w - 10, 21, '计时 ', formatClock(opts.elapsedMs), 'right')

  // 悬停攻击范围提示：同行/列/两对角线的格淡蓝覆盖；悬停皇后时与被攻击皇后红色连线。
  if (opts.hover !== null && !state.won && !opts.paused) {
    const lineColor = 'rgba(122,162,247,0.10)'
    ctx.fillStyle = lineColor
    for (const c of attackCells(state.size, opts.hover.row, opts.hover.col)) {
      ctx.fillRect(x0 + c.col * cell, y0 + c.row * cell, cell, cell)
    }
    const hovered = state.queens.find(q => q.row === opts.hover!.row && q.col === opts.hover!.col)
    if (hovered !== undefined) {
      const from = cellCenter(hovered.row, hovered.col, state.size)
      ctx.strokeStyle = 'rgba(247,118,142,0.55)'
      ctx.lineWidth = 2
      for (const q of state.queens) {
        if (q === hovered || !attacks(q, hovered)) continue
        const to = cellCenter(q.row, q.col, state.size)
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }
    }
  }

  // 棋盘：双色格 + 外框。
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#262636' : '#1c1c29'
      ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell)
    }
  }
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  roundRectPath(ctx, x0 - 1, y0 - 1, boardW + 2, boardW + 2, 6)
  ctx.stroke()

  // 皇后：冲突者红色辉光，安全者金色。
  const flags = conflictingQueens(state.queens)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < state.queens.length; i += 1) {
    const q = state.queens[i]!
    const { x, y } = cellCenter(q.row, q.col, state.size)
    const color = flags[i] ? THEME.bad : THEME.gold
    ctx.font = 'bold ' + String(Math.floor(cell * 0.62)) + 'px system-ui, sans-serif'
    ctx.fillStyle = color
    if (flags[i]) glow(ctx, color, 12)
    ctx.fillText('♛', x, y + 1)
    noGlow(ctx)
  }
  ctx.textBaseline = 'alphabetic'

  // 底部提示条。
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  if (state.won) {
    ctx.fillStyle = THEME.good
    glow(ctx, THEME.good, 8)
    ctx.fillText('完美收官 · [ ] 切换档位 · R 再来一局', w / 2, h - 10)
    noGlow(ctx)
  } else {
    ctx.fillText('点击格子放/取皇后 · 悬停查看行、列、斜线攻击范围', w / 2, h - 10)
  }

  if (opts.winText !== null) {
    drawOverlay(ctx, w, h, '过关', opts.winText, THEME.good)
  } else if (opts.paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续 · R 重开 · [ ] 切换档位')
  }
}
