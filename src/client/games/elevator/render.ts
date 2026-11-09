/**
 * 电梯调度渲染：楼层剖面图（楼层线 + 等待乘客小点与方向箭头）、电梯井与
 * 轿厢（连续位置 + 载客数）、目标层与当前层指示、满意度心形、等待时间条
 * （临近超时转红）、顶部 HUD 与结束/暂停 overlay。纯 canvas 绘制，状态
 * 全部来自 {@link ElevatorState}。
 */
import { THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair } from '../theme.ts'
import { CAPACITY, FLOORS, WAIT_TIMEOUT_S, dirOf, type ElevatorState, type Passenger } from './logic.ts'

/** 逻辑画布宽度。 */
export const VIEW_W = 560
/** 逻辑画布高度。 */
export const VIEW_H = 520

/** 顶部 HUD 高度。 */
const HUD_H = 56
/** 楼层区域左右边距。 */
const MARGIN_X = 18
/** 楼层区域顶部与 HUD 的间距。 */
const MARGIN_TOP = 14
/** 电梯井宽度。 */
export const SHAFT_W = 84
/** 电梯井左边缘 x（楼层数字右侧）。 */
export const SHAFT_X = VIEW_W - MARGIN_X - SHAFT_W

/** 单层高度（像素）。 */
export const FLOOR_H = (VIEW_H - HUD_H - MARGIN_TOP - 10) / FLOORS
/** 某楼层中心线 y（1 层在最下）。 */
export function floorY(floor: number): number {
  return HUD_H + MARGIN_TOP + (FLOORS - floor + 0.5) * FLOOR_H
}
/** 轿厢中心（送达粒子迸发点）。 */
export function carCenter(state: ElevatorState): { x: number; y: number } {
  return { x: SHAFT_X + SHAFT_W / 2, y: floorY(state.pos) }
}

/** 楼层剖面：楼板线 + 楼层号 + 等待乘客。 */
function drawFloors(ctx: CanvasRenderingContext2D, state: ElevatorState): void {
  ctx.font = '600 12px system-ui, sans-serif'
  for (let floor = 1; floor <= FLOORS; floor += 1) {
    const y = floorY(floor)
    // 楼板线。
    ctx.strokeStyle = floor === Math.round(state.pos) && state.phase !== 'moving'
      ? accent(0)
      : THEME.panelEdge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(MARGIN_X, y)
    ctx.lineTo(SHAFT_X, y)
    ctx.stroke()
    // 楼层号。
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(floor) + 'F', MARGIN_X, y + 4)
    drawWaiting(ctx, state, floor, y)
  }
}

/** 一层楼的等待乘客：按序小点 + 方向箭头 + 等待时间条（快超时变红）。 */
function drawWaiting(ctx: CanvasRenderingContext2D, state: ElevatorState, floor: number, y: number): void {
  const waiting = state.waiting.filter((p) => p.from === floor)
  const perRow = 8
  const r = 4
  ctx.font = '600 9px system-ui, sans-serif'
  for (let i = 0; i < waiting.length; i += 1) {
    const p = waiting[i]!
    const row = Math.floor(i / perRow)
    const col = i % perRow
    const px = MARGIN_X + 32 + col * 12
    const py = y - 6 - row * 12
    const color = accent(p.id)
    // 乘客小点。
    glow(ctx, color, 5)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    // 目标层：箭头+楼层数（乘客要去哪层一眼可辨）。
    ctx.fillStyle = THEME.textMuted
    ctx.fillText((dirOf(p.from, p.to) === 'up' ? '\u2191' : '\u2193') + String(p.to), px + 5, py - 5)
    // 等待时间条：越接近超时越长并转红。
    const frac = Math.min(1, p.waited / WAIT_TIMEOUT_S)
    const urgent = p.waited > WAIT_TIMEOUT_S * 0.66
    ctx.fillStyle = urgent ? THEME.bad : THEME.panelEdge
    ctx.fillRect(px - r, py + r + 1, 2 * r * frac, 2)
  }
}

/** 电梯井 + 轿厢（连续位置、载客数、目标层指示灯）。 */
function drawShaft(ctx: CanvasRenderingContext2D, state: ElevatorState): void {
  const top = floorY(FLOORS) - FLOOR_H / 2
  const bottom = floorY(1) + FLOOR_H / 2
  // 井道背景。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, SHAFT_X, top, SHAFT_W, bottom - top, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  // 轿厢（按连续 pos 定位）。
  const carH = FLOOR_H - 8
  const carW = SHAFT_W - 14
  const cy = floorY(state.pos) - carH / 2
  const color = state.phase === 'doors' ? THEME.good : accent(0)
  glow(ctx, color, 9)
  ctx.fillStyle = state.phase === 'doors' ? 'rgba(158,206,106,0.28)' : 'rgba(122,162,247,0.22)'
  roundRectPath(ctx, SHAFT_X + 7, cy, carW, carH, 6)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = color
  ctx.stroke()
  // 载客数。
  ctx.textAlign = 'center'
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(state.inside.length + '/' + CAPACITY, SHAFT_X + SHAFT_W / 2, floorY(state.pos) + 5)
  // 轿厢内乘客目标层：一行小字（停靠决策依据——去哪层的都在里面）。
  if (state.inside.length > 0) {
    ctx.font = '600 8px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(
      state.inside.map((p) => String(p.to)).join(' '),
      SHAFT_X + SHAFT_W / 2,
      floorY(state.pos) + 16,
    )
  }
}

/** 顶部 HUD：送达数、满意度心形、轿厢人数、当前/目标层。 */
function drawHud(ctx: CanvasRenderingContext2D, state: ElevatorState): void {
  hudPair(ctx, MARGIN_X, 26, '送达', String(state.delivered))
  // 满意度心形（最多显示 10 颗，每颗代表 2 点）。
  const hearts = Math.ceil(state.satisfaction / 2)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  for (let i = 0; i < 10; i += 1) {
    const filled = i < hearts
    ctx.fillStyle = filled ? THEME.bad : THEME.panelEdge
    ctx.fillText('\u2764', 150 + i * 16, 26)
  }
  hudPair(ctx, VIEW_W / 2 + 60, 26, '轿厢', state.inside.length + '/' + CAPACITY)
  hudPair(ctx, VIEW_W - MARGIN_X, 26, '当前', Math.round(state.pos) + 'F', 'right', accent(0))
  hudPair(ctx, VIEW_W - MARGIN_X, 46, '目标', (state.target === null ? '--' : state.target + 'F'), 'right',
    state.target === null ? THEME.textMuted : THEME.gold)
  // 等待人数。
  hudPair(ctx, VIEW_W / 2 + 60, 46, '等待', String(state.waiting.length))
  hudPair(ctx, MARGIN_X, 46, '弃乘', String(state.lost), 'left', THEME.textMuted)
}

/**
 * 整帧绘制：背景 + 楼层 + 井道 + HUD + overlay。
 * @param ctx - 画布上下文（已套用逻辑坐标变换）。
 * @param state - 游戏状态。
 * @param particles - 粒子系统（在 overlay 前推进绘制）。
 * @param paused - 暂停标志（绘制暂停 overlay）。
 */
export function renderElevator(
  ctx: CanvasRenderingContext2D, state: ElevatorState,
  particles: { tick(c: CanvasRenderingContext2D, dtMs: number): void }, paused: boolean,
): void {
  drawBackground(ctx, VIEW_W, VIEW_H)
  drawHud(ctx, state)
  drawFloors(ctx, state)
  drawShaft(ctx, state)
  particles.tick(ctx, 16)
  if (state.over) {
    drawOverlay(ctx, VIEW_W, VIEW_H, '游戏结束', '送达 ' + state.delivered + ' 人 · 按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, VIEW_W, VIEW_H, '已暂停', '按 P 继续 · 按 R 重开')
  }
}
