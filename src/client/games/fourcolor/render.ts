/**
 * 四色地图画布渲染：政区地图风——网格单元按区域色填充，区域间画深色
 * 边界；选中区域白边高亮、冲突区域红边闪烁、提示区域金边暂留；底部色
 * 板（4/3 色按钮）与 HUD（关卡 / 已涂 / 换色 / 提示）；过关时全图渐变
 * 亮起后叠加过关 overlay。渲染为无状态纯函数，随机与动画时钟均由调用
 * 方注入。
 */
import { GRID_COLS, GRID_ROWS, conflicts, type FourColorState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** HUD 高度（顶部）。 */
export const HUD_H = 30
/** 色板区高度（底部）。 */
export const PALETTE_H = 54
/** 盘面外留白。 */
export const MARGIN = 12
/** 单元边长（逻辑像素）。 */
export const CELL = 18
/** 盘面宽。 */
export const BOARD_W = GRID_COLS * CELL
/** 盘面高。 */
export const BOARD_H = GRID_ROWS * CELL
/** 逻辑画布宽。 */
export const LOGICAL_W = BOARD_W + MARGIN * 2
/** 逻辑画布高。 */
export const LOGICAL_H = HUD_H + BOARD_H + 10 + PALETTE_H + MARGIN

/** 色板按钮尺寸。 */
const BUTTON_W = 46
const BUTTON_H = 34
const BUTTON_GAP = 12

/** 渲染所需的界面状态（index 层持有）。 */
export interface FourColorUi {
  /** 当前选中色（色板高亮 + 区域点击涂色用）。 */
  activeColor: number
  /** 选中的区域，或 null。 */
  selected: number | null
  /** 是否暂停。 */
  paused: boolean
  /** 当前关卡号（HUD 显示）。 */
  level: number
  /** 动画时钟（performance.now()），冲突闪烁用。 */
  nowMs: number
  /** 过关动画进度 0-1；null 表示未过关。 */
  winProgress: number | null
  /** 过关 overlay 副标题；null 表示尚未显示。 */
  winText: string | null
  /** 提示闪示：区域 + 失效时刻；null 表示无。 */
  hintFlash: { region: number; untilMs: number } | null
}

/** 区域色号 → 主题色（4 色取主题梯度中的 4 个，3 色用前 3 个）。 */
function regionColor(color: number): string {
  const picks = [0, 1, 2, 4]
  return color < 0 ? THEME.panel : accent(picks[Math.min(color, picks.length - 1)]!)
}

/**
 * 逻辑坐标 → 区域下标（盘面外返回 null）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 区域下标或 null。
 */
export function regionAt(x: number, y: number): number | null {
  const cx = Math.floor((x - MARGIN) / CELL)
  const cy = Math.floor((y - HUD_H) / CELL)
  if (cx < 0 || cy < 0 || cx >= GRID_COLS || cy >= GRID_ROWS) return null
  // cellRegion 与 render 同源（state.map），由调用方保证有效；这里只做
  // 几何换算，具体归属由 index 层查 state。
  return cy * GRID_COLS + cx
}

/**
 * 逻辑坐标 → 色板按钮的颜色号（按钮外返回 null）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param paletteSize - 色板按钮个数。
 * @returns 颜色号或 null。
 */
export function paletteAt(x: number, y: number, paletteSize: number): number | null {
  const totalW = paletteSize * BUTTON_W + (paletteSize - 1) * BUTTON_GAP
  const x0 = (LOGICAL_W - totalW) / 2
  const y0 = HUD_H + BOARD_H + 10 + (PALETTE_H - BUTTON_H) / 2
  if (y < y0 || y > y0 + BUTTON_H) return null
  for (let i = 0; i < paletteSize; i += 1) {
    const bx = x0 + i * (BUTTON_W + BUTTON_GAP)
    if (x >= bx && x <= bx + BUTTON_W) return i
  }
  return null
}

/** 收集一个区域的全部外边界线段（相邻不同区域或网格边缘的单元边）。 */
function regionOutlineSegments(map: FourColorState['map'], region: number): Array<[number, number, number, number]> {
  const segs: Array<[number, number, number, number]> = []
  for (let cy = 0; cy < GRID_ROWS; cy += 1) {
    for (let cx = 0; cx < GRID_COLS; cx += 1) {
      if (map.cellRegion[cy * GRID_COLS + cx] !== region) continue
      const x = MARGIN + cx * CELL
      const y = HUD_H + cy * CELL
      const diff = (nx: number, ny: number): boolean =>
        nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS
        || map.cellRegion[ny * GRID_COLS + nx] !== region
      if (diff(cx, cy - 1)) segs.push([x, y, x + CELL, y])
      if (diff(cx, cy + 1)) segs.push([x, y + CELL, x + CELL, y + CELL])
      if (diff(cx - 1, cy)) segs.push([x, y, x, y + CELL])
      if (diff(cx + 1, cy)) segs.push([x + CELL, y, x + CELL, y + CELL])
    }
  }
  return segs
}

/** 描一组线段（单一路径一次 stroke）。 */
function strokeSegments(
  ctx: CanvasRenderingContext2D, segs: Array<[number, number, number, number]>, color: string, width: number,
): void {
  if (segs.length === 0) return
  ctx.beginPath()
  for (const [x1, y1, x2, y2] of segs) {
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

/**
 * 绘制一帧完整画面。
 * @param ctx - 画布上下文。
 * @param w - 逻辑宽。
 * @param h - 逻辑高。
 * @param state - 游戏状态。
 * @param ui - 界面状态（选中 / 动画时钟 / 过关等）。
 */
export function renderFourColor(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: FourColorState, ui: FourColorUi,
): void {
  const { map, colors } = state
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  const painted = colors.filter((c) => c >= 0).length
  hudPair(ctx, MARGIN, 20, '关卡 ', ui.level + (map.paletteSize === 3 ? '（3色）' : ''))
  hudPair(ctx, MARGIN + 130, 20, '换色 ', String(state.repaints), 'left', THEME.gold)
  hudPair(ctx, w - MARGIN - 90, 20, '提示 ', state.hintsUsed + '/2')
  hudPair(ctx, w - MARGIN, 20, '已涂 ', painted + '/' + map.regionCount, 'right')

  // 盘面：单元按区域色填充，未涂用面板底色。
  for (let cy = 0; cy < GRID_ROWS; cy += 1) {
    for (let cx = 0; cx < GRID_COLS; cx += 1) {
      const region = map.cellRegion[cy * GRID_COLS + cx]!
      ctx.fillStyle = regionColor(colors[region]!)
      ctx.fillRect(MARGIN + cx * CELL, HUD_H + cy * CELL, CELL, CELL)
    }
  }
  // 区域边界：相邻单元归属不同处描深色边（政区界线）。
  const border: Array<[number, number, number, number]> = []
  for (let cy = 0; cy < GRID_ROWS; cy += 1) {
    for (let cx = 0; cx < GRID_COLS; cx += 1) {
      const a = map.cellRegion[cy * GRID_COLS + cx]!
      const x = MARGIN + cx * CELL
      const y = HUD_H + cy * CELL
      if (cx + 1 < GRID_COLS && map.cellRegion[cy * GRID_COLS + cx + 1] !== a) border.push([x + CELL, y, x + CELL, y + CELL])
      if (cy + 1 < GRID_ROWS && map.cellRegion[(cy + 1) * GRID_COLS + cx] !== a) border.push([x, y + CELL, x + CELL, y + CELL])
    }
  }
  ctx.strokeStyle = '#0b0b12'
  ctx.lineWidth = 2
  ctx.strokeRect(MARGIN, HUD_H, BOARD_W, BOARD_H)
  strokeSegments(ctx, border, '#0b0b12', 2)

  // 冲突区域：红边闪烁（正弦脉动透明度）。
  const flags = conflicts(state)
  const blink = 0.45 + 0.45 * Math.sin(ui.nowMs / 140)
  for (let r = 0; r < map.regionCount; r += 1) {
    if (!flags[r]!) continue
    ctx.globalAlpha = blink
    glow(ctx, THEME.bad, 8)
    strokeSegments(ctx, regionOutlineSegments(map, r), THEME.bad, 3)
    noGlow(ctx)
    ctx.globalAlpha = 1
  }
  // 提示闪示：金色边暂留到失效时刻。
  if (ui.hintFlash !== null && ui.nowMs < ui.hintFlash.untilMs) {
    glow(ctx, THEME.gold, 10)
    strokeSegments(ctx, regionOutlineSegments(map, ui.hintFlash.region), THEME.gold, 3)
    noGlow(ctx)
  }
  // 选中区域：白边高亮。
  if (ui.selected !== null && ui.selected < map.regionCount) {
    glow(ctx, THEME.text, 8)
    strokeSegments(ctx, regionOutlineSegments(map, ui.selected), THEME.text, 2.5)
    noGlow(ctx)
  }

  // 过关动画：全图渐变亮起（整体提亮 + 一条扫过的光带）。
  if (ui.winProgress !== null) {
    const p = Math.min(1, Math.max(0, ui.winProgress))
    ctx.fillStyle = 'rgba(255,255,240,' + (p * 0.18).toFixed(3) + ')'
    ctx.fillRect(MARGIN, HUD_H, BOARD_W, BOARD_H)
    const bandX = MARGIN + p * (BOARD_W + 200) - 100
    const grad = ctx.createLinearGradient(bandX - 90, 0, bandX + 90, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.30)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(MARGIN, HUD_H, BOARD_W, BOARD_H)
  }

  // 色板按钮。
  const y0 = HUD_H + BOARD_H + 10 + (PALETTE_H - BUTTON_H) / 2
  const totalW = map.paletteSize * BUTTON_W + (map.paletteSize - 1) * BUTTON_GAP
  const x0 = (LOGICAL_W - totalW) / 2
  for (let i = 0; i < map.paletteSize; i += 1) {
    const bx = x0 + i * (BUTTON_W + BUTTON_GAP)
    const active = i === ui.activeColor
    ctx.fillStyle = regionColor(i)
    if (active) glow(ctx, regionColor(i), 14)
    roundRectPath(ctx, bx, y0, BUTTON_W, BUTTON_H, 8)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = active ? THEME.text : THEME.panelEdge
    ctx.lineWidth = active ? 2.5 : 1
    ctx.stroke()
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(13,13,20,0.85)'
    ctx.fillText(String(i + 1), bx + BUTTON_W - 10, y0 + 14)
  }

  if (ui.winText !== null) {
    drawOverlay(ctx, w, h, '过关', ui.winText, THEME.good)
  } else if (ui.paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
