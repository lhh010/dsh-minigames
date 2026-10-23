/**
 * Mastermind 画布渲染：历史行（色钉 + 绿/黄反馈钉标记）、调色盘与操作键
 * （可点击命中检测）、当前行光标、胜负/暂停覆盖层。共享 theme 视觉件；无状态。
 */
import type { LevelConfig } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 620
export const HUD_H = 30

const GRID_Y0 = 44
const ROW_H = 42
const CELL = 34
const CELL_GAP = 6
const MARKER_GAP = 12
const MARKER_W = 28
const PIN_R = 4.5

const PALETTE_Y = 492
const PALETTE_R = 17
const PALETTE_STEP = 56
/** 6 色调色盘的整体宽度（两端各留半个步距）。 */
const PALETTE_W = (6 - 1) * PALETTE_STEP
const PALETTE_X0 = (LOGICAL_W - PALETTE_W) / 2

const ACTION_Y = 560
const ACTION_H = 40
const ACTION_W = 96
const ACTION_GAP = 16
const ACTION_X0 = (LOGICAL_W - ACTION_W * 2 - ACTION_GAP) / 2

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface MastermindView {
  /** 本关难度。 */
  level: LevelConfig
  /** 关卡下标（HUD 显示）。 */
  levelIdx: number
  /** 已提交的行：色号 + 绿/黄反馈钉数（绿=位置对，黄=颜色对位置不对）。 */
  rows: Array<{ guess: number[]; black: number; white: number }>
  /** 当前行已填的色号。 */
  current: number[]
  status: 'playing' | 'won' | 'lost'
  /** 密码（仅失败展示时使用）。 */
  secret: number[]
  streak: number
  /** 临时提示文本（如「未填满」），空串表示无。 */
  toast: string
  paused: boolean
}

/** 某关一行（色钉 + 钉标记）的整体宽度，用于水平居中。 */
function rowWidth(pegs: number): number {
  return pegs * CELL + (pegs - 1) * CELL_GAP + MARKER_GAP + MARKER_W
}

/**
 * 调色盘 / 操作键命中检测。
 * @returns 色号 0..5，或 'BACK' / 'ENTER'，未命中返回 null。
 */
export function paletteAt(x: number, y: number): number | 'BACK' | 'ENTER' | null {
  for (let c = 0; c < 6; c += 1) {
    const cx = PALETTE_X0 + c * PALETTE_STEP
    if ((x - cx) ** 2 + (y - PALETTE_Y) ** 2 <= (PALETTE_R + 6) ** 2) return c
  }
  const rects: Array<{ key: 'BACK' | 'ENTER'; x: number }> = [
    { key: 'BACK', x: ACTION_X0 },
    { key: 'ENTER', x: ACTION_X0 + ACTION_W + ACTION_GAP },
  ]
  for (const rect of rects) {
    if (x >= rect.x && x <= rect.x + ACTION_W && y >= ACTION_Y && y <= ACTION_Y + ACTION_H) return rect.key
  }
  return null
}

/** 色钉圆点：fill 为 null 画空位描边，否则填充颜色并高光描边。 */
function drawDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string | null): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  if (fill === null) {
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else {
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

/** 一行的反馈钉标记：绿钉（颜色与位置都对）在前、黄钉（颜色对位置
 * 不对）补后，最多两列小圆——配色与 wordle 的绿/黄一致。 */
function drawMarkers(ctx: CanvasRenderingContext2D, x0: number, cy: number, black: number, white: number): void {
  for (let i = 0; i < black + white; i += 1) {
    const col = Math.floor(i / 3)
    const row = i % 3
    const cx = x0 + col * (PIN_R * 2 + 4) + PIN_R
    const cyy = cy - (3 - 1) * (PIN_R + 3) / 2 + row * (PIN_R * 2 + 3)
    const exact = i < black
    ctx.beginPath()
    ctx.arc(cx, cyy, PIN_R, 0, Math.PI * 2)
    ctx.fillStyle = exact ? '#3ecf6e' : '#e7c94f'
    ctx.fill()
    ctx.strokeStyle = exact ? '#1d7a3f' : '#8a7222'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, view: MastermindView): void {
  const pegs = view.level.pegs
  const pegsW = pegs * CELL + (pegs - 1) * CELL_GAP
  const x0 = (LOGICAL_W - rowWidth(pegs)) / 2
  for (let r = 0; r < view.level.tries; r += 1) {
    const cy = GRID_Y0 + r * ROW_H + ROW_H / 2
    const done = view.rows[r]
    if (done !== undefined) {
      for (let c = 0; c < pegs; c += 1) {
        drawDot(ctx, x0 + c * (CELL + CELL_GAP) + CELL / 2, cy, CELL / 2, accent(done.guess[c] ?? 0))
      }
      drawMarkers(ctx, x0 + pegsW + MARKER_GAP, cy, done.black, done.white)
    } else if (r === view.rows.length && view.status === 'playing') {
      // 当前行：已填色钉高亮，光标落在下一个空位。
      for (let c = 0; c < pegs; c += 1) {
        const cx = x0 + c * (CELL + CELL_GAP) + CELL / 2
        const color = view.current[c]
        if (color !== undefined) {
          glow(ctx, accent(color), 8)
          drawDot(ctx, cx, cy, CELL / 2, accent(color))
          noGlow(ctx)
        } else if (c === view.current.length) {
          drawDot(ctx, cx, cy, CELL / 2, null)
          ctx.beginPath()
          ctx.arc(cx, cy, CELL / 2 + 3, 0, Math.PI * 2)
          ctx.strokeStyle = THEME.accents[1]
          ctx.lineWidth = 2
          ctx.stroke()
        } else {
          drawDot(ctx, cx, cy, CELL / 2, null)
        }
      }
    } else {
      for (let c = 0; c < pegs; c += 1) {
        drawDot(ctx, x0 + c * (CELL + CELL_GAP) + CELL / 2, cy, CELL / 2, null)
      }
    }
  }
}

function drawPalette(ctx: CanvasRenderingContext2D): void {
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let c = 0; c < 6; c += 1) {
    const cx = PALETTE_X0 + c * PALETTE_STEP
    glow(ctx, accent(c), 6)
    drawDot(ctx, cx, PALETTE_Y, PALETTE_R, accent(c))
    noGlow(ctx)
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(c + 1), cx, PALETTE_Y + PALETTE_R + 12)
  }
  const buttons: Array<{ label: string; x: number; edge: string }> = [
    { label: '⌫', x: ACTION_X0, edge: THEME.panelEdge },
    { label: '提交', x: ACTION_X0 + ACTION_W + ACTION_GAP, edge: THEME.accents[1] },
  ]
  ctx.font = '600 15px system-ui, sans-serif'
  for (const btn of buttons) {
    roundRectPath(ctx, btn.x, ACTION_Y, ACTION_W, ACTION_H, 8)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = btn.edge
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = THEME.text
    ctx.fillText(btn.label, btn.x + ACTION_W / 2, ACTION_Y + ACTION_H / 2)
  }
  ctx.textBaseline = 'alphabetic'
}

/** 失败覆盖层：揭示密码的彩色圆点（drawOverlay 之外的本地变体）。 */
function drawRevealOverlay(ctx: CanvasRenderingContext2D, view: MastermindView): void {
  ctx.fillStyle = 'rgba(13,13,20,0.74)'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.textAlign = 'center'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.fillStyle = THEME.bad
  ctx.fillText(spaced('答案是'), LOGICAL_W / 2, LOGICAL_H / 2 - 30)
  const pegs = view.secret.length
  const step = 46
  const x0 = LOGICAL_W / 2 - ((pegs - 1) * step) / 2
  for (let c = 0; c < pegs; c += 1) {
    glow(ctx, accent(view.secret[c] ?? 0), 8)
    drawDot(ctx, x0 + c * step, LOGICAL_H / 2 + 4, 16, accent(view.secret[c] ?? 0))
    noGlow(ctx)
  }
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('空格 / 点击再来一局', LOGICAL_W / 2, LOGICAL_H / 2 + 44)
}

/**
 * 绘制一帧。
 * @param shakeDx - 无效输入的水平抖动偏移（px）。
 */
export function renderMastermind(ctx: CanvasRenderingContext2D, view: MastermindView, shakeDx = 0): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD 条：连胜 / 关卡与行数。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  hudPair(ctx, 10, 20, '连胜 ', String(view.streak), 'left', view.streak > 0 ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W - 10, 20, `${view.level.label} `, `${Math.min(view.rows.length + 1, view.level.tries)}/${view.level.tries}`, 'right')

  ctx.save()
  ctx.translate(shakeDx, 0)
  drawGrid(ctx, view)
  ctx.restore()

  drawPalette(ctx)

  if (view.toast !== '') {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, THEME.bad, 8)
    ctx.fillStyle = THEME.bad
    ctx.fillText(view.toast, LOGICAL_W / 2, PALETTE_Y - 26)
    noGlow(ctx)
  }

  if (view.status === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '破解！', `${view.rows.length}/${view.level.tries} · 空格 / 点击再来一局`, THEME.good)
  } else if (view.status === 'lost') {
    drawRevealOverlay(ctx, view)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板恢复后继续', THEME.text)
  }
}
