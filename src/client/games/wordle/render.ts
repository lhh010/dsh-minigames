/**
 * Wordle 画布渲染：6x5 猜测格子、屏幕 QWERTY 键盘（可点击命中检测）、
 * HUD（连胜 / 行）、无效猜测提示与胜负覆盖层。共享 theme 视觉件；无状态。
 */
import type { KeyHints, LetterVerdict } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 620
export const HUD_H = 30

/** 屏幕键盘布局；ENTER/BACK 为宽键。 */
const KEY_ROWS: string[][] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
]

const TILE = 56
const TILE_GAP = 8
const GRID_X0 = (LOGICAL_W - (5 * TILE + 4 * TILE_GAP)) / 2
const GRID_Y0 = 48

const KB_MARGIN = 10
const KB_GAP = 6
const KEY_H = 44
const KB_Y0 = 448
const WIDE_KEY_WEIGHT = 1.5

interface KeyRect { key: string; x: number; y: number; w: number; h: number }

/** 键盘按键矩形，按行布局；宽键（ENTER/BACK）占 1.5 个字母位。 */
const KEY_RECTS: KeyRect[] = KEY_ROWS.map((row, rowIdx) => {
  const totalWeight = row.reduce((sum, key) => sum + (key.length > 1 ? WIDE_KEY_WEIGHT : 1), 0)
  const unit = (LOGICAL_W - KB_MARGIN * 2 - (row.length - 1) * KB_GAP) / totalWeight
  const y = KB_Y0 + rowIdx * (KEY_H + KB_GAP)
  let x = KB_MARGIN
  return row.map(key => {
    const w = unit * (key.length > 1 ? WIDE_KEY_WEIGHT : 1)
    const rect: KeyRect = { key, x, y, w, h: KEY_H }
    x += w + KB_GAP
    return rect
  })
}).flat()

/**
 * 屏幕键盘命中检测。
 * @returns 按键名（字母 / 'ENTER' / 'BACK'），未命中返回 null。
 */
export function keyAt(x: number, y: number): string | null {
  for (const rect of KEY_RECTS) {
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return rect.key
  }
  return null
}

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface WordleView {
  /** 已提交的行：猜测词 + 判定。 */
  rows: Array<{ guess: string; verdicts: LetterVerdict[] }>
  /** 当前行已输入的字母（最多 5 个）。 */
  current: string
  keyHints: KeyHints
  status: 'playing' | 'won' | 'lost'
  answer: string
  streak: number
  /** 临时提示文本（如「不在词表」），空串表示无。 */
  toast: string
  paused: boolean
}

const TILE_FONT = 'bold 28px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const KEY_FONT = '600 14px system-ui, sans-serif'

/** 判定 → 格子填充色；灰格用暗块。 */
const VERDICT_FILL: Record<LetterVerdict, string> = {
  green: THEME.good,
  yellow: THEME.gold,
  gray: '#3c3c50',
}

function drawTile(
  ctx: CanvasRenderingContext2D, x: number, y: number, letter: string, fill: string | null,
): void {
  roundRectPath(ctx, x, y, TILE, TILE, 8)
  if (fill === null) {
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (letter !== '') {
    ctx.fillStyle = THEME.text
    ctx.font = TILE_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(letter, x + TILE / 2, y + TILE / 2 + 2)
  }
}

function drawKeyboard(ctx: CanvasRenderingContext2D, view: WordleView): void {
  ctx.font = KEY_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const rect of KEY_RECTS) {
    const hint = view.keyHints[rect.key]
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 7)
    ctx.fillStyle = hint === undefined ? THEME.panel : VERDICT_FILL[hint]
    ctx.fill()
    ctx.strokeStyle = rect.key.length > 1 ? THEME.accents[1] : THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = THEME.text
    ctx.fillText(rect.key === 'BACK' ? '⌫' : rect.key === 'ENTER' ? 'ENTER' : rect.key, rect.x + rect.w / 2, rect.y + rect.h / 2)
  }
  ctx.textBaseline = 'alphabetic'
}

/**
 * 绘制一帧。
 * @param shakeDx - 无效猜测的水平抖动偏移（px）。
 */
export function renderWordle(ctx: CanvasRenderingContext2D, view: WordleView, shakeDx = 0): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD 条：连胜 / 行。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  hudPair(ctx, 10, 20, '连胜 ', String(view.streak), 'left', view.streak > 0 ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W - 10, 20, '行 ', `${Math.min(view.rows.length + 1, 6)}/6`, 'right')

  ctx.save()
  ctx.translate(shakeDx, 0)

  // 猜测格子：已判定行着色，当前行显示已输入字母，其余为空框。
  for (let r = 0; r < 6; r += 1) {
    const y = GRID_Y0 + r * (TILE + TILE_GAP)
    const done = view.rows[r]
    if (done !== undefined) {
      for (let c = 0; c < 5; c += 1) {
        const x = GRID_X0 + c * (TILE + TILE_GAP)
        drawTile(ctx, x, y, done.guess[c] ?? '', VERDICT_FILL[done.verdicts[c] ?? 'gray'])
      }
    } else if (r === view.rows.length && view.status === 'playing') {
      for (let c = 0; c < 5; c += 1) {
        const x = GRID_X0 + c * (TILE + TILE_GAP)
        const ch = view.current[c] ?? ''
        if (ch !== '') {
          glow(ctx, THEME.accents[1], 8)
          drawTile(ctx, x, y, ch, THEME.panel)
          noGlow(ctx)
        } else {
          drawTile(ctx, x, y, '', null)
        }
      }
    } else {
      for (let c = 0; c < 5; c += 1) {
        drawTile(ctx, GRID_X0 + c * (TILE + TILE_GAP), y, '', null)
      }
    }
  }
  ctx.restore()

  drawKeyboard(ctx, view)

  // 无效猜测提示（覆盖在键盘上方）。
  if (view.toast !== '') {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, THEME.bad, 8)
    ctx.fillStyle = THEME.bad
    ctx.fillText(view.toast, LOGICAL_W / 2, KB_Y0 - 14)
    noGlow(ctx)
  }

  if (view.status === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '猜对了！', `${view.rows.length}/6 · 空格 / 点击再来一局`, THEME.good)
  } else if (view.status === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, `答案是 ${view.answer}`, '空格 / 点击再来一局', THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
