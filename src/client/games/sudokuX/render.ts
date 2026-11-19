/**
 * 对角数独渲染：经典 9×9 盘（宫粗线 + 对角线格淡色底 + 斜纹示意）、
 * 大号数字、小号笔记、冲突红显、HUD（关卡/错误/用时）、笔记开关按钮、
 * 暂停与过关 overlay。全部为纯 canvas 绘制。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'
import type { SudokuXState } from './logic.ts'
import { SIZE, MAX_ERRORS } from './logic.ts'

/** 逻辑画布宽。 */
export const LOGICAL_W = 544
/** 逻辑画布高。 */
export const LOGICAL_H = 632
/** 顶部 HUD 高度。 */
export const HUD_H = 46
/** 单元格边长。 */
export const CELL = 56
/** 盘面左边距（上下留白对称）。 */
export const BOARD_X = 20
/** 盘面上边距。 */
export const BOARD_Y = HUD_H
/** 底部按钮条高度。 */
export const FOOT_H = 46

/** 笔记开关按钮的命中矩形。 */
export interface Rect { x: number, y: number, w: number, h: number }

/** 笔记开关按钮矩形（index 做点击命中用）。 */
export const NOTE_BTN: Rect = { x: LOGICAL_W / 2 - 76, y: LOGICAL_H - FOOT_H + 8, w: 152, h: 30 }

/** 是否落在笔记开关按钮内。 */
export function inNoteButton(x: number, y: number): boolean {
  return x >= NOTE_BTN.x && x <= NOTE_BTN.x + NOTE_BTN.w && y >= NOTE_BTN.y && y <= NOTE_BTN.y + NOTE_BTN.h
}

/** 是否落在盘面内；是则返回 { r, c }。 */
export function cellAt(x: number, y: number): { r: number, c: number } | null {
  const c = Math.floor((x - BOARD_X) / CELL)
  const r = Math.floor((y - BOARD_Y) / CELL)
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null
  return { r, c }
}

const DIAG_TINT = 'rgba(122,162,247,0.10)'

/**
 * 绘制一帧完整的对角数独画面。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param state - 游戏状态。
 * @param cursor - 当前选中格。
 * @param noteMode - 是否处于笔记模式。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param diagHighlight - 是否高亮对角线格。
 */
export function renderSudokuX(
  ctx: CanvasRenderingContext2D,
  state: SudokuXState,
  cursor: { r: number, c: number },
  noteMode: boolean,
  paused: boolean,
  diagHighlight: boolean,
): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const boardAccent = accent(0)

  // HUD：关卡 / 错误 / 用时
  hudPair(ctx, 20, 28, '关卡', String(state.level + 1) + '/5', 'left', boardAccent)
  hudPair(ctx, LOGICAL_W / 2, 28, '错误', state.errors + '/' + MAX_ERRORS, 'left',
    state.errors >= MAX_ERRORS - 1 ? THEME.bad : THEME.text)
  hudPair(ctx, LOGICAL_W - 20, 28, '用时', String(Math.floor(state.elapsed)) + 's', 'right')

  // 盘面底板
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, BOARD_X - 8, BOARD_Y - 8, SIZE * CELL + 16, SIZE * CELL + 16, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // 对角线格淡色底（可切换更强的提示色）
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const onDiag = r === c || r + c === SIZE - 1
      if (!onDiag) continue
      ctx.fillStyle = diagHighlight ? 'rgba(122,162,247,0.22)' : DIAG_TINT
      ctx.fillRect(BOARD_X + c * CELL, BOARD_Y + r * CELL, CELL, CELL)
    }
  }

  // 选中格
  ctx.fillStyle = 'rgba(122,162,247,0.25)'
  ctx.fillRect(BOARD_X + cursor.c * CELL, BOARD_Y + cursor.r * CELL, CELL, CELL)

  // 冲突格红显
  const conflicted: boolean[][] = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false))
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const g = state.grid
      const n = g[r]![c]
      if (n === null) continue
      let dup = false
      for (let i = 0; i < SIZE && !dup; i += 1) {
        if (i !== c && g[r]![i] === n) dup = true
        if (i !== r && g[i]![c] === n) dup = true
        if (r === c && i !== r && g[i]![i] === n) dup = true
        if (r + c === SIZE - 1 && i !== r && g[i]![SIZE - 1 - i] === n) dup = true
      }
      const br = Math.floor(r / 3) * 3
      const bc = Math.floor(c / 3) * 3
      for (let dr = 0; dr < 3 && !dup; dr += 1) {
        for (let dc = 0; dc < 3 && !dup; dc += 1) {
          if ((br + dr !== r || bc + dc !== c) && g[br + dr]![bc + dc] === n) dup = true
        }
      }
      conflicted[r]![c] = dup
    }
  }
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!conflicted[r]![c]) continue
      ctx.fillStyle = 'rgba(247,118,142,0.22)'
      ctx.fillRect(BOARD_X + c * CELL, BOARD_Y + r * CELL, CELL, CELL)
    }
  }

  // 网格线：细线每格，粗线每宫
  for (let i = 0; i <= SIZE; i += 1) {
    const heavy = i % 3 === 0
    ctx.strokeStyle = heavy ? THEME.panelEdge : 'rgba(52,52,74,0.8)'
    ctx.lineWidth = heavy ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(BOARD_X + i * CELL, BOARD_Y)
    ctx.lineTo(BOARD_X + i * CELL, BOARD_Y + SIZE * CELL)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(BOARD_X, BOARD_Y + i * CELL)
    ctx.lineTo(BOARD_X + SIZE * CELL, BOARD_Y + i * CELL)
    ctx.stroke()
  }

  // 数字与笔记
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const cx = BOARD_X + c * CELL + CELL / 2
      const cy = BOARD_Y + r * CELL + CELL / 2
      const v = state.grid[r]![c]
      if (v !== null) {
        const isClue = state.puzzle[r]![c] !== null
        ctx.font = 'bold 26px system-ui, sans-serif'
        if (conflicted[r]![c]) {
          ctx.fillStyle = THEME.bad
          glow(ctx, THEME.bad, 8)
        } else if (isClue) {
          ctx.fillStyle = THEME.text
        } else {
          ctx.fillStyle = boardAccent
        }
        ctx.fillText(String(v), cx, cy)
        noGlow(ctx)
      } else {
        const cellNotes = state.notes[r]![c]!
        let any = false
        for (let n = 1; n <= 9; n += 1) if (cellNotes[n - 1]) any = true
        if (any) {
          ctx.font = '600 12px system-ui, sans-serif'
          ctx.fillStyle = THEME.textMuted
          for (let n = 1; n <= 9; n += 1) {
            if (!cellNotes[n - 1]) continue
            const ncx = BOARD_X + c * CELL + 12 + ((n - 1) % 3) * 16
            const ncy = BOARD_Y + r * CELL + 14 + Math.floor((n - 1) / 3) * 16
            ctx.fillText(String(n), ncx, ncy)
          }
        }
      }
    }
  }

  // 底部笔记开关按钮
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = noteMode ? boardAccent : THEME.panel
  roundRectPath(ctx, NOTE_BTN.x, NOTE_BTN.y, NOTE_BTN.w, NOTE_BTN.h, 8)
  ctx.fill()
  if (noteMode) glow(ctx, boardAccent, 8)
  ctx.strokeStyle = noteMode ? boardAccent : THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = noteMode ? '#15151b' : THEME.textMuted
  ctx.fillText('✎ 笔记 ' + (noteMode ? '开' : '关'), NOTE_BTN.x + NOTE_BTN.w / 2, NOTE_BTN.y + NOTE_BTN.h / 2 + 1)

  // overlay：过关 / 失败 / 暂停
  if (state.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', '用时 ' + Math.floor(state.elapsed) + 's · 点击进入下一关', THEME.good)
  } else if (state.failed) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '错误已满', '按 R 重开本关', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续', THEME.gold)
  }
}
