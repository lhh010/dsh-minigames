/**
 * 贤贤 KenKen 画布渲染：笼粗边框 + 左上角目标标注（如 '12×'）、格子数
 * 字、行/列重复与笼运算错误的红色高亮、铅笔候选小标、选中格光圈、
 * 关卡 HUD 与暂停/过关遮罩。纯函数无自有状态，全部状态由调用方持有；
 * 视觉走共享主题（../theme.ts）。
 */
import type { KenkenPuzzle } from './logic.ts'
import { KENKEN_SIZE, cageLabel } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const CELL = 88
export const PAD = 16
export const HUD_H = 34
export const FOOT_H = 20
export const BOARD = KENKEN_SIZE * CELL
export const logicalW = PAD * 2 + BOARD
export const logicalH = HUD_H + BOARD + PAD + FOOT_H

/** 格子 (r, c) 左上角的逻辑坐标。 */
export function cellOrigin(r: number, c: number): { x: number; y: number } {
  return { x: PAD + c * CELL, y: HUD_H + r * CELL }
}

/** 逻辑坐标落在哪个格子；盘外返回 null。 */
export function cellAt(x: number, y: number): { r: number; c: number } | null {
  const c = Math.floor((x - PAD) / CELL)
  const r = Math.floor((y - HUD_H) / CELL)
  if (r < 0 || r >= KENKEN_SIZE || c < 0 || c >= KENKEN_SIZE) return null
  if (x - PAD - c * CELL > CELL || y - HUD_H - r * CELL > CELL) return null
  return { r, c }
}

/** 格子中心（粒子迸发定位）。 */
export function cellCenter(r: number, c: number): { x: number; y: number } {
  const { x, y } = cellOrigin(r, c)
  return { x: x + CELL / 2, y: y + CELL / 2 }
}

/** 一帧的玩家视图状态（均由 index.ts 持有）。 */
export interface KenkenView {
  /** 玩家填数（0 = 空）。 */
  grid: readonly (readonly number[])[]
  /** 铅笔候选位掩码：bit (d-1) 置位表示候选 d。 */
  notes: readonly (readonly number[])[]
  /** 选中的格子，或 null。 */
  selected: { r: number; c: number } | null
  /** 错误格标记（logic.cellErrors 的产物）。 */
  errors: readonly (readonly boolean[])[]
}

/**
 * 绘制一帧：底格 + 细网格线 + 笼粗边框与标注 + 数字/候选 + 错误红显
 * + HUD；paused / winText 非空时盖遮罩。
 */
export function renderKenken(
  ctx: CanvasRenderingContext2D,
  puzzle: KenkenPuzzle,
  view: KenkenView,
  elapsed: string,
  paused: boolean,
  winText: string | null,
): void {
  const w = logicalW
  const h = logicalH
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  let filled = 0
  for (let r = 0; r < KENKEN_SIZE; r += 1) {
    for (let c = 0; c < KENKEN_SIZE; c += 1) if (view.grid[r]![c]! > 0) filled += 1
  }
  hudPair(ctx, PAD, 22, '关卡 ', String(puzzle.level) + '/5')
  hudPair(ctx, w / 2, 22, '已填 ', filled + '/36', 'center')
  hudPair(ctx, w - PAD, 22, '用时 ', elapsed, 'right')

  roundRectPath(ctx, PAD, HUD_H, BOARD, BOARD, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()

  ctx.textBaseline = 'middle'
  for (let r = 0; r < KENKEN_SIZE; r += 1) {
    for (let c = 0; c < KENKEN_SIZE; c += 1) {
      const { x, y } = cellOrigin(r, c)
      const bad = view.errors[r]![c]!
      if (bad) {
        ctx.fillStyle = 'rgba(247,118,142,0.16)'
        ctx.fillRect(x, y, CELL, CELL)
      }
      const v = view.grid[r]![c]!
      if (v > 0) {
        ctx.font = '700 38px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = bad ? THEME.bad : THEME.text
        ctx.fillText(String(v), x + CELL / 2, y + CELL / 2 + 2)
      } else {
        // 铅笔候选：3 列 × 2 行小字网格，按数字 1-6 位置排布。
        ctx.font = '600 13px system-ui, sans-serif'
        ctx.fillStyle = THEME.textMuted
        ctx.textAlign = 'center'
        const mask = view.notes[r]![c]!
        for (let d = 1; d <= 6; d += 1) {
          if ((mask & (1 << (d - 1))) === 0) continue
          const col = (d - 1) % 3
          const row = Math.floor((d - 1) / 3)
          ctx.fillText(String(d), x + CELL * (0.25 + col * 0.25), y + CELL * (0.3 + row * 0.4))
        }
      }
    }
  }

  // 细网格线（笼内格界）。
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i < KENKEN_SIZE; i += 1) {
    ctx.moveTo(PAD + i * CELL, HUD_H)
    ctx.lineTo(PAD + i * CELL, HUD_H + BOARD)
    ctx.moveTo(PAD, HUD_H + i * CELL)
    ctx.lineTo(PAD + BOARD, HUD_H + i * CELL)
  }
  ctx.stroke()

  // 笼粗边框：与相邻格异笼的每条边描粗线，外框整圈描粗。
  ctx.strokeStyle = 'rgba(170,182,222,0.9)'
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let r = 0; r < KENKEN_SIZE; r += 1) {
    for (let c = 0; c < KENKEN_SIZE; c += 1) {
      const id = puzzle.cageOf[r]![c]!
      const x = PAD + c * CELL
      const y = HUD_H + r * CELL
      if (c === 0 || puzzle.cageOf[r]![c - 1]! !== id) {
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + CELL)
      }
      if (r === 0 || puzzle.cageOf[r - 1]![c]! !== id) {
        ctx.moveTo(x, y)
        ctx.lineTo(x + CELL, y)
      }
      if (c === KENKEN_SIZE - 1 || puzzle.cageOf[r]![c + 1]! !== id) {
        ctx.moveTo(x + CELL, y)
        ctx.lineTo(x + CELL, y + CELL)
      }
      if (r === KENKEN_SIZE - 1 || puzzle.cageOf[r + 1]![c]! !== id) {
        ctx.moveTo(x, y + CELL)
        ctx.lineTo(x + CELL, y + CELL)
      }
    }
  }
  ctx.stroke()

  // 笼目标标注：每笼最左最上格的左上角。
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.gold
  for (const cage of puzzle.cages) {
    let top = cage.cells[0]!
    for (const p of cage.cells) {
      if (p.r < top.r || (p.r === top.r && p.c < top.c)) top = p
    }
    const { x, y } = cellOrigin(top.r, top.c)
    ctx.fillText(cageLabel(cage), x + 5, y + 11)
  }

  // 选中格光圈。
  if (view.selected !== null) {
    const { r, c } = view.selected
    const { x, y } = cellOrigin(r, c)
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 2.5
    glow(ctx, THEME.text, 8)
    roundRectPath(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 6)
    ctx.stroke()
    noGlow(ctx)
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
