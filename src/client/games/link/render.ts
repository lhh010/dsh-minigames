/**
 * 连连看 Link 渲染层：牌面网格（选中高亮、消除连线动画）、关卡/剩余对数/
 * 分数 HUD、倒计时条、洗牌按钮与剩余次数、过关/通关/失败/暂停 overlay 与
 * 消除粒子。使用共享视觉 kit（../theme.ts）与 logic.ts 的纯状态。
 */
import type { LinkState, Pos } from './logic.ts'
import { LEVELS, currentScore } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

/** 逻辑画布尺寸（网格在其中自适应居中）。 */
export const LOGICAL_W = 840
export const LOGICAL_H = 720
/** 顶部 HUD（关卡/对数/分数 + 计时条）高度。 */
export const HUD_H = 56
/** 底部操作带（洗牌按钮/死局提示）高度。 */
export const BOTTOM_H = 64

/** 图案池：面 id 0..19 对应的 emoji（数量与 logic.POOL_SIZE 一致）。 */
export const FACE_EMOJI = [
  '🍎', '🍌', '🍇', '🍓', '🍊', '🍋', '🍉', '🥝', '🍑', '🍍',
  '🥑', '🌶️', '🌽', '🥕', '🍄', '🧀', '🐟', '🐙', '🦀', '🐚',
]

/** 连线动画时长（ms）。 */
export const PATH_MS = 420

/** 洗牌按钮矩形（逻辑坐标，index.ts 命中测试共用）。 */
export const SHUFFLE_BTN = {
  x: (LOGICAL_W - 230) / 2,
  y: LOGICAL_H - BOTTOM_H + 14,
  w: 230,
  h: 38,
}

/** index.ts 持有的动画视图状态。 */
export interface LinkView {
  /** 最近一次消除连线的动画起始时刻（performance.now()，ms）。 */
  pathAt: number
}

/** 建立初始视图。 */
export function createLinkView(): LinkView {
  return { pathAt: 0 }
}

/** 网格自适应布局：格边与棋盘左上角（随关卡尺寸在逻辑画布内居中）。 */
export interface BoardLayout { cell: number; x: number; y: number }

/** 计算当前关卡的网格布局（render 与 index 命中测试共用）。 */
export function boardLayout(state: LinkState): BoardLayout {
  const availW = LOGICAL_W - 24
  const availH = LOGICAL_H - HUD_H - BOTTOM_H - 24
  const cell = Math.max(24, Math.min(56, Math.floor(availW / state.cols), Math.floor(availH / state.rows)))
  return {
    cell,
    x: Math.floor((LOGICAL_W - state.cols * cell) / 2),
    y: Math.floor(HUD_H + (availH - state.rows * cell) / 2),
  }
}

/** 路径坐标（含 -1 / rows / cols 场外圈）转画布像素中心。 */
function pathPoint(lay: BoardLayout, rows: number, cols: number, r: number, c: number): { x: number; y: number } {
  const x = c === -1 ? lay.x - 10 : c === cols ? lay.x + cols * lay.cell + 10 : lay.x + c * lay.cell + lay.cell / 2
  const y = r === -1 ? lay.y - 10 : r === rows ? lay.y + rows * lay.cell + 10 : lay.y + r * lay.cell + lay.cell / 2
  return { x, y }
}

/** 连线动画是否仍在播放。 */
export function pathAnimActive(state: LinkState, view: LinkView, now: number): boolean {
  return state.lastPath !== null && now - view.pathAt < PATH_MS && now >= view.pathAt
}

// 渲染侧事件观察：两格变空即在那两格中心放消除粒子（逻辑层无感知）。
const particles = createParticles()
let prevGrid: (number | null)[][] = []

/** 按已用时长比例绘制消除连线（发光折线，动画结束后不画）。 */
function drawPath(ctx: CanvasRenderingContext2D, state: LinkState, view: LinkView, now: number): void {
  const path = state.lastPath
  if (path === null || now - view.pathAt >= PATH_MS || now < view.pathAt) return
  const lay = boardLayout(state)
  const pts = path.map(p => pathPoint(lay, state.rows, state.cols, p.r, p.c))
  const total = (() => {
    let len = 0
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!
      const b = pts[i]!
      len += Math.hypot(b.x - a.x, b.y - a.y)
    }
    return len
  })()
  const t = Math.min(1, (now - view.pathAt) / PATH_MS)
  let remain = total * t
  ctx.strokeStyle = THEME.accents[1]!
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  glow(ctx, THEME.accents[1]!, 12)
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length && remain > 0; i += 1) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (remain >= seg) {
      ctx.lineTo(b.x, b.y)
      remain -= seg
    } else {
      const k = remain / seg
      ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)
      remain = 0
    }
  }
  ctx.stroke()
  noGlow(ctx)
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文（已应用逻辑坐标变换）。
 * @param state - 逻辑状态。
 * @param view - 动画视图。
 * @param paused - 是否显示暂停遮罩。
 * @param now - 当前时刻（performance.now()，ms）。
 * @param dtMs - 距上一帧的毫秒数（粒子推进用）。
 * @returns 是否仍有动画进行（index.ts 据此继续 markDirty）。
 */
export function renderLink(
  ctx: CanvasRenderingContext2D, state: LinkState, view: LinkView, paused: boolean, now: number, dtMs: number,
): boolean {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 顶部 HUD：关卡 / 剩余对数 / 分数。
  hudPair(ctx, 12, 22, '关卡 ', state.level + '/' + LEVELS.length)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('剩余', LOGICAL_W / 2 - 14, 22)
  ctx.fillStyle = THEME.good
  ctx.fillText(state.pairsLeft + ' 对', LOGICAL_W / 2 + 22, 22)
  hudPair(ctx, LOGICAL_W - 12, 22, '分数 ', String(currentScore(state)), 'right', THEME.gold)

  // 计时条：比例条 + 剩余秒数。
  const barW = LOGICAL_W - 24
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 12, 32, barW, 8, 4)
  ctx.fill()
  const frac = state.timeLimit > 0 ? state.timeLeft / state.timeLimit : 0
  if (frac > 0) {
    ctx.fillStyle = frac > 0.5 ? THEME.good : frac > 0.25 ? THEME.gold : THEME.bad
    roundRectPath(ctx, 12, 32, Math.max(6, barW * frac), 8, 4)
    ctx.fill()
  }
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = frac > 0.25 ? THEME.textMuted : THEME.bad
  ctx.fillText('⏱ ' + Math.ceil(state.timeLeft) + 's', LOGICAL_W - 12, 56)

  // 牌面网格。
  const lay = boardLayout(state)
  const selected = state.selected === null ? null : { r: Math.floor(state.selected / state.cols), c: state.selected % state.cols }
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const face = state.grid[r]![c] ?? null
      if (face === null) continue
      const x = lay.x + c * lay.cell
      const y = lay.y + r * lay.cell
      const isSelected = selected !== null && selected.r === r && selected.c === c
      if (isSelected) {
        glow(ctx, accent(face), 12)
        ctx.fillStyle = THEME.panel
        roundRectPath(ctx, x + 2, y + 2, lay.cell - 4, lay.cell - 4, 8)
        ctx.fill()
        noGlow(ctx)
        ctx.strokeStyle = accent(face)
        ctx.lineWidth = 2.5
        ctx.stroke()
      } else {
        ctx.fillStyle = THEME.panel
        roundRectPath(ctx, x + 2, y + 2, lay.cell - 4, lay.cell - 4, 8)
        ctx.fill()
        ctx.strokeStyle = THEME.panelEdge
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      ctx.font = (isSelected ? '30px' : '26px') + ' serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(FACE_EMOJI[face] ?? '?', x + lay.cell / 2, y + lay.cell / 2 + 1)
    }
  }
  ctx.textBaseline = 'alphabetic'

  // 消除连线动画。
  drawPath(ctx, state, view, now)

  // 消除粒子（观察两格变空）。
  if (prevGrid.length === state.rows && (prevGrid[0]?.length ?? 0) === state.cols) {
    for (let r = 0; r < state.rows; r += 1) {
      for (let c = 0; c < state.cols; c += 1) {
        const before = prevGrid[r]![c] ?? null
        if (before === null && state.grid[r]![c] === null) continue
        if (before !== null && state.grid[r]![c] === null) {
          const cx = lay.x + c * lay.cell + lay.cell / 2
          const cy = lay.y + r * lay.cell + lay.cell / 2
          particles.burst(cx, cy, accent(before), 12, 120)
        }
      }
    }
  }
  prevGrid = state.grid.map(row => [...row])
  particles.tick(ctx, dtMs)

  // 底部操作带：洗牌按钮 + 次数 + 死局提示。
  const canShuffle = state.status === 'playing' && state.shufflesLeft > 0
  ctx.globalAlpha = canShuffle ? 1 : 0.45
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, SHUFFLE_BTN.x, SHUFFLE_BTN.y, SHUFFLE_BTN.w, SHUFFLE_BTN.h, 10)
  ctx.fill()
  ctx.strokeStyle = canShuffle ? THEME.accents[0]! : THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText('🔀 洗牌 (S)  × ' + state.shufflesLeft, SHUFFLE_BTN.x + SHUFFLE_BTN.w / 2, SHUFFLE_BTN.y + 25)
  ctx.globalAlpha = 1
  if (state.deadlock && state.status === 'playing') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.bad
    ctx.fillText('⚠ 无可连对，按 S 洗牌', 16, SHUFFLE_BTN.y + 25)
    ctx.textAlign = 'right'
    ctx.fillText('洗牌用尽则失败', LOGICAL_W - 16, SHUFFLE_BTN.y + 25)
  }

  // 遮罩：过关 / 通关 / 失败 / 暂停。
  if (state.status === 'cleared') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', '按 空格 进入下一关', THEME.good)
  } else if (state.status === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关！', '总分 ' + currentScore(state) + ' · 按 R 再来一局', THEME.gold)
  } else if (state.status === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '时间到', '按 R 重开 · 分数 ' + currentScore(state), THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }

  return pathAnimActive(state, view, now) || particles.size() > 0
}
