/**
 * 密码算式渲染：黑板风竖式（大字母 + 已填数字下标）、0-9 数字池（已用灰掉）、
 * 冲突列红显、提示按钮、关卡/用时 HUD、过关 overlay（完整数字算式）。
 * 纯 canvas 绘制 + 布局命中测试，状态由 index.ts 持有。
 */
import { THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair } from '../theme.ts'
import type { CryptarPuzzle, DigitMap, CheckResult } from './logic.ts'

export const LOGICAL_W = 720
export const LOGICAL_H = 540

/** 渲染所需的一帧快照。 */
export interface CryptarView {
  puzzle: CryptarPuzzle
  mapping: DigitMap
  /** 提示揭示的字母（金色显示）。 */
  revealed: string[]
  /** 当前选中的字母（高亮框）。 */
  selected: string | null
  check: CheckResult
  /** 0 起关卡下标。 */
  levelIdx: number
  totalLevels: number
  elapsedMs: number
  score: number
  hintsLeft: number
  status: 'playing' | 'paused' | 'won'
  /** 已打满 5 关。 */
  finishedAll: boolean
}

/** 竖式里一个字母格。 */
interface Cell { letter: string; x: number; y: number; col: number }

/** 一次布局的全部可命中区域。 */
export interface CryptarLayout {
  cells: Cell[]
  digits: Array<{ digit: number; x: number; y: number }>
  hintRect: { x: number; y: number; w: number; h: number }
  cellW: number
  cellH: number
}

const CELL_W = 46
const CELL_H = 62
const ROW_H = 66
const BOARD_RIGHT = 500
const BOARD_TOP = 96
const POOL_Y = 452
const POOL_CELL = 52
const HINT_BOX = { x: 560, y: POOL_Y - 4, w: 120, h: 44 }

/**
 * 计算某题的静态布局（字母格、数字池、提示按钮）。
 * @param puzzle - 谜题。
 */
export function cryptarLayout(puzzle: CryptarPuzzle): CryptarLayout {
  const words = [...puzzle.addends, puzzle.result]
  const cols = Math.max(...words.map(w => w.length))
  const cells: Cell[] = []
  words.forEach((w, row) => {
    const rowY = BOARD_TOP + row * ROW_H
    ;[...w].forEach((letter, i) => {
      const pos = w.length - 1 - i
      cells.push({
        letter,
        x: BOARD_RIGHT - (pos + 1) * CELL_W + CELL_W / 2,
        y: rowY + CELL_H / 2,
        col: pos,
      })
    })
  })
  const digits: Array<{ digit: number; x: number; y: number }> = []
  const poolW = 10 * POOL_CELL
  for (let d = 0; d <= 9; d += 1) {
    digits.push({
      digit: d,
      x: (LOGICAL_W - poolW) / 2 + d * POOL_CELL + POOL_CELL / 2,
      y: POOL_Y + 22,
    })
  }
  return { cells, digits, hintRect: { ...HINT_BOX }, cellW: CELL_W, cellH: CELL_H }
}

/** 命中测试：坐标落在哪个字母格（返回该字母）。 */
export function letterAt(layout: CryptarLayout, x: number, y: number): string | null {
  for (const cell of layout.cells) {
    if (
      x >= cell.x - CELL_W / 2 - 2 && x <= cell.x + CELL_W / 2 + 2 &&
      y >= cell.y - CELL_H / 2 && y <= cell.y + CELL_H / 2
    ) return cell.letter
  }
  return null
}

/** 命中测试：数字池里点到的数字。 */
export function digitAt(layout: CryptarLayout, x: number, y: number): number | null {
  for (const d of layout.digits) {
    if (x >= d.x - POOL_CELL / 2 && x <= d.x + POOL_CELL / 2 && y >= d.y - 22 && y <= d.y + 22) {
      return d.digit
    }
  }
  return null
}

/** 命中测试：是否点在提示按钮上。 */
export function hintHit(layout: CryptarLayout, x: number, y: number): boolean {
  const r = layout.hintRect
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** 秒表文案 m:ss。 */
function clock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m + ':' + (s < 10 ? '0' : '') + String(s)
}

/** 画一列红色冲突背景带。 */
function conflictBand(ctx: CanvasRenderingContext2D, xCenter: number, top: number, bottom: number): void {
  ctx.fillStyle = 'rgba(247,118,142,0.14)'
  ctx.fillRect(xCenter - CELL_W / 2 - 3, top, CELL_W + 6, bottom - top)
}

/**
 * 整帧渲染（黑板风竖式 + 数字池 + HUD + overlay）。
 * @param ctx - 画布上下文（逻辑坐标）。
 * @param view - 当前帧快照。
 */
export function renderCryptar(ctx: CanvasRenderingContext2D, view: CryptarView): void {
  const { puzzle, mapping, check } = view
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const layout = cryptarLayout(puzzle)
  const words = [...puzzle.addends, puzzle.result]
  const rows = words.length
  const boardBottom = BOARD_TOP + rows * ROW_H + 8

  // HUD。
  hudPair(ctx, 16, 26, '关卡', (view.levelIdx + 1) + '/' + view.totalLevels)
  hudPair(ctx, 130, 26, '得分', String(view.score))
  hudPair(ctx, LOGICAL_W - 16, 26, '用时', clock(view.elapsedMs), 'right')
  hudPair(ctx, LOGICAL_W - 150, 26, '提示', String(view.hintsLeft), 'right', view.hintsLeft > 0 ? THEME.gold : THEME.textMuted)

  // 黑板面板。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 40, 46, LOGICAL_W - 80, boardBottom - 40, 14)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()

  // 冲突列背景带。
  for (let c = 0; c < check.columns.length; c += 1) {
    if (!check.columns[c]) continue
    conflictBand(ctx, BOARD_RIGHT - (c + 1) * CELL_W + CELL_W / 2, BOARD_TOP - 6, BOARD_TOP + rows * ROW_H)
  }

  // 字母格：大字母 + 已填数字下标。
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const cell of layout.cells) {
    const filled = mapping[cell.letter]
    const isRevealed = view.revealed.includes(cell.letter)
    const isSel = view.selected === cell.letter
    if (isSel) {
      ctx.strokeStyle = accent(0)
      ctx.lineWidth = 2
      roundRectPath(ctx, cell.x - CELL_W / 2 + 3, cell.y - CELL_H / 2 + 4, CELL_W - 6, CELL_H - 8, 8)
      ctx.stroke()
      ctx.lineWidth = 1
    }
    ctx.font = 'bold 38px Consolas, "Courier New", monospace'
    glow(ctx, isRevealed ? THEME.gold : THEME.text, 8)
    ctx.fillStyle = isRevealed ? THEME.gold : THEME.text
    ctx.fillText(cell.letter, cell.x, cell.y - 4)
    noGlow(ctx)
    if (filled !== undefined) {
      ctx.font = 'bold 17px system-ui, sans-serif'
      ctx.fillStyle = accent(2)
      ctx.fillText(String(filled), cell.x + CELL_W / 2 - 10, cell.y + CELL_H / 2 - 6)
    }
  }

  // 加号与横线。
  ctx.font = 'bold 30px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const plusRow = BOARD_TOP + (puzzle.addends.length - 1) * ROW_H + CELL_H / 2
  ctx.fillText('+', BOARD_RIGHT - Math.max(...words.map(w => w.length)) * CELL_W - 20, plusRow)
  const ruleY = BOARD_TOP + puzzle.addends.length * ROW_H - 4
  ctx.strokeStyle = THEME.textMuted
  ctx.beginPath()
  ctx.moveTo(BOARD_RIGHT - Math.max(...words.map(w => w.length)) * CELL_W - 40, ruleY)
  ctx.lineTo(BOARD_RIGHT + 6, ruleY)
  ctx.stroke()

  // 冲突/状态一行小字。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  if (check.solved) {
    ctx.fillStyle = THEME.good
    ctx.fillText('算式成立！', 56, boardBottom + 8)
  } else if (check.duplicateDigits) {
    ctx.fillStyle = THEME.bad
    ctx.fillText('不同字母不能同数字', 56, boardBottom + 8)
  } else if (check.leadingZero) {
    ctx.fillStyle = THEME.bad
    ctx.fillText('首字母不能为 0', 56, boardBottom + 8)
  } else if (check.conflict) {
    ctx.fillStyle = THEME.bad
    ctx.fillText('红色列在当前填数下不可能成立', 56, boardBottom + 8)
  } else {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('点击字母再点数字；不同字母不同数字，首字母非 0', 56, boardBottom + 8)
  }

  // 数字池：已用灰掉。
  const used = new Set<number>(Object.values(mapping))
  for (const d of layout.digits) {
    const isUsed = used.has(d.digit)
    const isSel = view.selected !== null && mapping[view.selected] === d.digit
    ctx.fillStyle = isUsed ? 'rgba(34,34,48,0.9)' : 'rgba(30,30,44,1)'
    roundRectPath(ctx, d.x - POOL_CELL / 2 + 3, d.y - 20, POOL_CELL - 6, 40, 8)
    ctx.fill()
    ctx.strokeStyle = isUsed ? THEME.panelEdge : (isSel ? accent(2) : THEME.panelEdge)
    ctx.stroke()
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillStyle = isUsed ? THEME.textMuted : THEME.text
    ctx.fillText(String(d.digit), d.x, d.y)
  }

  // 提示按钮。
  const hintLabel = view.hintsLeft > 0 ? 'H 提示 ' + view.hintsLeft : 'H 已用完'
  ctx.fillStyle = view.hintsLeft > 0 ? THEME.panel : 'rgba(30,30,44,0.6)'
  roundRectPath(ctx, HINT_BOX.x, HINT_BOX.y, HINT_BOX.w, HINT_BOX.h, 10)
  ctx.fill()
  ctx.strokeStyle = view.hintsLeft > 0 ? THEME.gold : THEME.panelEdge
  ctx.stroke()
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.fillStyle = view.hintsLeft > 0 ? THEME.gold : THEME.textMuted
  ctx.fillText(hintLabel, HINT_BOX.x + HINT_BOX.w / 2, HINT_BOX.y + HINT_BOX.h / 2)

  if (view.status === 'paused') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂 停', '按 P 继续解题', THEME.text)
    return
  }
  if (view.status === 'won') {
    drawOverlay(
      ctx, LOGICAL_W, LOGICAL_H,
      view.finishedAll ? '全 部 通 关' : '解 开',
      view.finishedAll ? '点击再玩一局（新题目）' : '点击进入下一关',
      THEME.gold,
    )
    // 完整数字算式：把字母版替换成数字版逐词显现。
    const nums: string[] = []
    puzzle.addends.forEach(w => {
      nums.push([...w].map(ch => String(mapping[ch])).join(''))
    })
    nums.push([...puzzle.result].map(ch => String(mapping[ch])).join(''))
    ctx.font = 'bold 24px Consolas, "Courier New", monospace'
    ctx.fillStyle = THEME.text
    ctx.fillText(nums.join(' + '), LOGICAL_W / 2, LOGICAL_H / 2 + 58)
  }
}