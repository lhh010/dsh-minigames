/**
 * 诺诺旋转 canvas 渲染：共享主题套件上的非ograms 盘面——四周行列线索随朝向
 * 重新布局（旋转后线索区重排并高亮未满足线）、指南针指示当前朝向、顶部 HUD
 * （关卡 / 剩余校验 / 最近错格数 / 得分）、校验按钮、以及过关时图案显形的
 * overlay。纯绘制，无输入处理。
 */
import type { Cell, Clues, NonospinState } from './logic.ts'
import { displayClues } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 单元格逻辑边长。 */
export const CELL = 36
/** 顶部 HUD 行高。 */
export const HUD_H = 36
/** 线索区：列线索在顶部（纵向堆叠），行线索在左侧（横向排列）。 */
export const CLUE_W = 104
export const CLUE_H = 86
/** 最大盘面（10x10）。 */
export const MAX_SIZE = 10
export const BOARD_MAX = MAX_SIZE * CELL
export const LOGICAL_W = CLUE_W + BOARD_MAX + 14
export const LOGICAL_H = HUD_H + CLUE_H + BOARD_MAX + 14

/** 盘面左上角（所有关卡固定，右侧随 size 留白）。 */
export const OX = CLUE_W
export const OY = HUD_H + CLUE_H

const FILL = accent(1)
const GOLD = THEME.gold

/** 校验按钮区域（HUD 行右侧，index 做点击命中）。 */
export function verifyButtonRect(): { x: number, y: number, w: number, h: number } {
  return { x: LOGICAL_W - 118, y: 6, w: 110, h: 24 }
}

/** 指南针中心（按钮左侧）。 */
const COMPASS_X = LOGICAL_W - 148
const COMPASS_Y = 18

/** 逻辑坐标落在哪个格（当前朝向坐标）；盘外返回 null。 */
export function cellAt(x: number, y: number, size: number): { r: number, c: number } | null {
  const c = Math.floor((x - OX) / CELL)
  const r = Math.floor((y - OY) / CELL)
  if (r < 0 || r >= size || c < 0 || c >= size) return null
  return { r, c }
}

/** 玩家标记换算回线索线后是否已满足该线线索（用于线索变暗）。 */
function lineSatisfied(cells: Cell[][], size: number, index: number, vertical: boolean, clue: number[]): boolean {
  const line: boolean[] = []
  for (let i = 0; i < size; i += 1) {
    const cell = vertical ? cells[i]![index]! : cells[index]![i]!
    line.push(cell === 1)
  }
  const runs: number[] = []
  let run = 0
  for (const v of line) {
    if (v) run += 1
    else if (run > 0) { runs.push(run); run = 0 }
  }
  if (run > 0) runs.push(run)
  const got = runs.length === 0 ? [0] : runs
  return got.length === clue.length && got.every((v, i) => v === clue[i])
}

/** 渲染选项：悬停格 / 暂停 / 全通关 / 当前累计得分。 */
export interface RenderOptions {
  hover: { r: number, c: number } | null
  paused: boolean
  allClear: boolean
  score: number
}

// 渲染侧特效状态：过关粒子爆发 + 逐帧粒子推进。
const particles = createParticles()
let prevWon = false
let lastFrame = 0

/** 朝向文字（rotation 0..3 对应角度）。 */
const ROT_LABEL = ['0deg', '90deg', '180deg', '270deg']

/** 画指南针：圆盘 + 按当前朝向旋转的箭头，旋转过的朝向金色高亮。 */
function drawCompass(ctx: CanvasRenderingContext2D, rotation: number): void {
  const r = 11
  ctx.fillStyle = THEME.panel
  ctx.strokeStyle = rotation === 0 ? THEME.panelEdge : GOLD
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(COMPASS_X, COMPASS_Y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  const color = rotation === 0 ? accent(0) : GOLD
  ctx.save()
  ctx.translate(COMPASS_X, COMPASS_Y)
  ctx.rotate((rotation * Math.PI) / 2)
  ctx.fillStyle = color
  glow(ctx, color, 6)
  ctx.beginPath()
  ctx.moveTo(0, -r + 3)
  ctx.lineTo(4.5, 3)
  ctx.lineTo(0, 0.5)
  ctx.lineTo(-4.5, 3)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.restore()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = rotation === 0 ? THEME.textMuted : GOLD
  ctx.fillText(ROT_LABEL[rotation] ?? '0deg', COMPASS_X, COMPASS_Y + r + 12)
}

/** 一帧完整绘制。 */
export function renderNonospin(
  ctx: CanvasRenderingContext2D,
  state: NonospinState,
  opts: RenderOptions,
): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const size = state.size
  const board = size * CELL
  const clues: Clues = displayClues(state)

  // 盘面底板。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, OX + 2, OY + 2, board - 4, board - 4, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // HUD 行：关卡 / 剩余校验 / 最近错格 / 得分。
  hudPair(ctx, 10, 24, '关卡', state.level + 1 + '/5')
  hudPair(ctx, 86, 24, '校验', state.checksLeft + '/' + state.checksTotal, 'left',
    state.checksLeft === 0 ? THEME.bad : THEME.text)
  hudPair(ctx, 170, 24, '错格', state.lastErrors === null ? '?' : String(state.lastErrors), 'left',
    state.lastErrors === null || state.lastErrors === 0 ? THEME.good : THEME.bad)
  hudPair(ctx, 250, 24, '得分', String(opts.score))

  drawCompass(ctx, state.rotation)

  // 校验按钮。
  const btn = verifyButtonRect()
  const enabled = state.phase === 'playing' && state.checksLeft > 0 && !opts.paused
  ctx.fillStyle = enabled ? FILL : THEME.panel
  roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = enabled ? '#15151b' : THEME.textMuted
  ctx.fillText('校验+旋转 Space', btn.x + btn.w / 2, btn.y + 16)

  // 悬停高亮。
  if (opts.hover !== null && state.phase === 'playing' && !opts.paused) {
    ctx.fillStyle = 'rgba(187,154,247,0.16)'
    roundRectPath(ctx, OX + opts.hover.c * CELL + 2, OY + opts.hover.r * CELL + 2, CELL - 4, CELL - 4, 8)
    ctx.fill()
  }

  // 格子：填黑方块 / 打叉。
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const cell = state.cells[r]![c]!
      if (cell === 0) continue
      const x = OX + c * CELL
      const y = OY + r * CELL
      if (cell === 1) {
        ctx.fillStyle = FILL
        glow(ctx, FILL, 5)
        roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 6)
        ctx.fill()
        noGlow(ctx)
      } else {
        ctx.strokeStyle = THEME.bad
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(x + 9, y + 9)
        ctx.lineTo(x + CELL - 9, y + CELL - 9)
        ctx.moveTo(x + CELL - 9, y + 9)
        ctx.lineTo(x + 9, y + CELL - 9)
        ctx.stroke()
      }
    }
  }

  // 网格线：细线每格，金色每 5 格。
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  for (let i = 0; i <= size; i += 1) {
    if (i % 5 === 0) continue
    ctx.beginPath()
    ctx.moveTo(OX + i * CELL, OY)
    ctx.lineTo(OX + i * CELL, OY + board)
    ctx.moveTo(OX, OY + i * CELL)
    ctx.lineTo(OX + board, OY + i * CELL)
    ctx.stroke()
  }
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1.5
  for (let i = 0; i <= size; i += 5) {
    ctx.beginPath()
    ctx.moveTo(OX + i * CELL, OY)
    ctx.lineTo(OX + i * CELL, OY + board)
    ctx.moveTo(OX, OY + i * CELL)
    ctx.lineTo(OX + board, OY + i * CELL)
    ctx.stroke()
  }

  // 列线索（顶部，纵向堆叠；已满足变暗）。旋转后线索重新对应即重排于此。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  for (let c = 0; c < size; c += 1) {
    const clue = clues.cols[c]!
    const ok = lineSatisfied(state.cells, size, c, true, clue)
    ctx.fillStyle = ok ? THEME.textMuted : accent(0)
    const n = clue.length
    for (let i = 0; i < n; i += 1) {
      ctx.fillText(String(clue[i]), OX + c * CELL + CELL / 2, OY - 6 - (n - 1 - i) * 14)
    }
  }
  // 行线索（左侧，横向排列）。
  ctx.textAlign = 'right'
  for (let r = 0; r < size; r += 1) {
    const clue = clues.rows[r]!
    const ok = lineSatisfied(state.cells, size, r, false, clue)
    ctx.fillStyle = ok ? THEME.textMuted : accent(0)
    const n = clue.length
    for (let i = 0; i < n; i += 1) {
      ctx.fillText(String(clue[i]), OX - 8 - (n - 1 - i) * 18, OY + r * CELL + CELL / 2 + 4)
    }
  }

  // 过关特效：中心粒子爆发一次。
  if (state.phase === 'won' && !prevWon) {
    particles.burst(OX + board / 2, OY + board / 2, GOLD, 26, 170)
  }
  prevWon = state.phase === 'won'
  particles.tick(ctx, dt)

  // 阶段遮罩：全通关优先。
  if (opts.allClear) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关', '按 R 重来一局', GOLD)
    return
  }
  if (state.phase === 'won') {
    // 图案显形：金框描出目标图案。
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!state.pattern[r]![c]!) continue
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 2
        roundRectPath(ctx, OX + c * CELL + 6, OY + r * CELL + 6, CELL - 12, CELL - 12, 6)
        ctx.stroke()
      }
    }
    const lastLevel = state.level === 4
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关',
      lastLevel ? '最终关完成' : '空格 下一关 / R 重玩本关', THEME.good)
    return
  }
  if (state.phase === 'failed') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '校验耗尽', 'R 重开本关', THEME.bad)
    return
  }
  if (opts.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', 'P 继续', THEME.text)
  }
}

