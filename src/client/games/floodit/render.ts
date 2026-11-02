/**
 * Flood It 渲染器：圆角色块网格、左上连通片流光提示、底部六色大按钮
 * 色板、步数条（低步数/超步变红）、HUD、提示高亮与过关/失败/暂停 overlay。
 * 纯 canvas 绘制，使用共享视觉组件（../theme.ts）。
 */
import { COLOR_COUNT } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const HUD_H = 36
const MARGIN = 18
const CELL = 44
const PALETTE_H = 58
const GAP = 16
const BAR_H = 8

/** 渲染视图（由 index.ts 组装，render 不持有状态）。 */
export interface FloodItView {
  size: number
  board: number[]
  /** 左上连通片标记（length = size*size）。 */
  inFlood: boolean[]
  movesLeft: number
  maxSteps: number
  levelLabel: string
  /** 单调秒，驱动连通片流光呼吸。 */
  timeSec: number
  /** H 提示的贪心下一步色索引，-1 无。 */
  hint: number
  /** 色板悬停索引，-1 无。 */
  hover: number
  won: boolean
  lost: boolean
  paused: boolean
  /** 过关 overlay 副标题（含得分）。 */
  subtitle: string
}

export function logicalW(size: number): number {
  return MARGIN * 2 + size * CELL
}

export function logicalH(size: number): number {
  return HUD_H + MARGIN + size * CELL + GAP + PALETTE_H + MARGIN
}

function boardTop(): number {
  return HUD_H + MARGIN
}

function paletteTop(size: number): number {
  return boardTop() + size * CELL + GAP
}

function paletteButtonW(w: number): number {
  return (w - MARGIN * 2 - (COLOR_COUNT - 1) * 10) / COLOR_COUNT
}

/**
 * 色板命中检测：返回指针下的颜色索引，不在色板区域返回 -1。
 * @param size - 盘面边长（决定逻辑高度布局）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export function paletteColorAt(size: number, x: number, y: number): number {
  const top = paletteTop(size)
  if (y < top || y > top + PALETTE_H) return -1
  const w = logicalW(size)
  const bw = paletteButtonW(w)
  if (x < MARGIN || x > w - MARGIN) return -1
  const rel = x - MARGIN
  const idx = Math.floor(rel / (bw + 10))
  if (idx < 0 || idx >= COLOR_COUNT) return -1
  if (x - MARGIN - idx * (bw + 10) > bw) return -1 // 按钮间隙
  return idx
}

/** 绘制整帧。 */
export function renderFloodIt(ctx: CanvasRenderingContext2D, view: FloodItView): void {
  const { size, board } = view
  const w = logicalW(size)
  const h = logicalH(size)
  drawBackground(ctx, w, h)

  // HUD：关卡 + 剩余步数。
  const low = view.movesLeft <= Math.ceil(view.maxSteps * 0.25) || view.lost
  hudPair(ctx, MARGIN, 22, view.levelLabel + ' ', String(view.movesLeft) + ' / ' + String(view.maxSteps) + ' 步', 'left', low ? THEME.bad : THEME.text)

  // 步数条：剩余比例填充，低于 25% 或超步变红。
  const barW = w - MARGIN * 2
  roundRectPath(ctx, MARGIN, HUD_H - 10, barW, BAR_H, BAR_H / 2)
  ctx.fillStyle = THEME.panelEdge
  ctx.fill()
  const fill = Math.max(0, Math.min(1, view.movesLeft / view.maxSteps))
  if (fill > 0) {
    roundRectPath(ctx, MARGIN, HUD_H - 10, barW * fill, BAR_H, BAR_H / 2)
    ctx.fillStyle = low ? THEME.bad : THEME.good
    glow(ctx, low ? THEME.bad : THEME.good, 4)
    ctx.fill()
    noGlow(ctx)
  }

  // 色块网格：连通片呼吸流光（当前 flood 片微光）。
  const pulse = 0.5 + 0.5 * Math.sin(view.timeSec * 3)
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const idx = r * size + c
      const x = MARGIN + c * CELL
      const y = boardTop() + r * CELL
      const color = accent(board[idx]!)
      if (view.inFlood[idx]) {
        glow(ctx, color, 8 + 10 * pulse)
      }
      roundRectPath(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 6)
      ctx.fillStyle = color
      ctx.fill()
      if (view.inFlood[idx]) {
        // 连通片描边流光。
        ctx.strokeStyle = 'rgba(255,255,255,' + String(0.35 + 0.35 * pulse) + ')'
        ctx.lineWidth = 1.5
        ctx.stroke()
        noGlow(ctx)
      }
    }
  }

  // 底部六色大按钮。
  const bw = paletteButtonW(w)
  for (let i = 0; i < COLOR_COUNT; i += 1) {
    const x = MARGIN + i * (bw + 10)
    const y = paletteTop(size)
    const color = accent(i)
    if (i === view.hover || i === view.hint) glow(ctx, color, 12)
    roundRectPath(ctx, x, y, bw, PALETTE_H, 10)
    ctx.fillStyle = color
    ctx.fill()
    noGlow(ctx)
    if (i === view.hint) {
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2.5
      roundRectPath(ctx, x + 1, y + 1, bw - 2, PALETTE_H - 2, 9)
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '700 11px system-ui, sans-serif'
      ctx.fillStyle = '#15151b'
      ctx.fillText('提示', x + bw / 2, y + PALETTE_H / 2 + 1)
    }
  }

  if (view.won) {
    drawOverlay(ctx, w, h, '过关！', view.subtitle, THEME.good)
  } else if (view.lost) {
    drawOverlay(ctx, w, h, '步数用尽', 'R 重开本关', THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, w, h, '已暂停', '面板继续', THEME.text)
  }
}
