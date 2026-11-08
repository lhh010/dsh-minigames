/**
 * 交叉路口 canvas 渲染：柏油路面与车道线、四向信号灯（红黄绿发光）、
 * 车辆（seed 配色 + 刹车灯）、排队长度警示、通过数/时间/拥堵 HUD、
 * 结束遮罩。渲染器无状态，每帧从纯逻辑状态直接绘制。
 */
import type { TrafficState, Dir } from './logic.ts'
import {
  CENTER, CONGEST_LIMIT, I0, I1, LANE_LEN, ROAD_HALF,
  STOP_LINE, carRect, queueLen, signalOpen,
} from './logic.ts'
import {
  THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = LANE_LEN
export const HUD_H = 34
export const LOGICAL_H = LANE_LEN + HUD_H

/** 柏油底色。 */
const ASPHALT = '#20202c'
/** 车道分隔虚线。 */
const LANE_DASH = 'rgba(226,226,238,0.35)'
/** 道路边缘实线。 */
const ROAD_EDGE = 'rgba(226,226,238,0.22)'
/** 双黄中线。 */
const MEDIAN = '#e0af6888'

/**
 * 绘制一帧完整画面。
 * @param ctx - 画布上下文。
 * @param state - 当前对局状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderTraffic(ctx: CanvasRenderingContext2D, state: TrafficState, paused: boolean): void {
  const y0 = HUD_H
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawHud(ctx, state)

  // 两条柏油道路。
  ctx.fillStyle = ASPHALT
  ctx.fillRect(0, y0 + CENTER - ROAD_HALF, LOGICAL_W, ROAD_HALF * 2)
  ctx.fillRect(CENTER - ROAD_HALF, y0, ROAD_HALF * 2, LOGICAL_H - HUD_H)

  // 道路边缘线与双黄中线。
  ctx.strokeStyle = ROAD_EDGE
  ctx.lineWidth = 2
  strokeLine(ctx, 0, y0 + CENTER - ROAD_HALF, LOGICAL_W, 0)
  strokeLine(ctx, 0, y0 + CENTER + ROAD_HALF, LOGICAL_W, 0)
  strokeLine(ctx, CENTER - ROAD_HALF, y0, 0, LOGICAL_H - HUD_H)
  strokeLine(ctx, CENTER + ROAD_HALF, y0, 0, LOGICAL_H - HUD_H)
  ctx.strokeStyle = MEDIAN
  strokeLine(ctx, 0, y0 + CENTER, CENTER - ROAD_HALF, 0)
  strokeLine(ctx, I1, y0 + CENTER, LOGICAL_W, 0)
  strokeLine(ctx, CENTER, y0, 0, I0 - y0)
  strokeLine(ctx, CENTER, y0 + I1, 0, LOGICAL_H - HUD_H - I1)

  // 同向车道内的超车虚线（每条路两条车道中线之外不再画）。
  ctx.strokeStyle = LANE_DASH
  ctx.lineWidth = 2
  ctx.setLineDash([14, 12])
  strokeLine(ctx, I1, y0 + CENTER - ROAD_HALF / 2, LOGICAL_W - I1, 0)
  strokeLine(ctx, 0, y0 + CENTER + ROAD_HALF / 2, I0, 0)
  strokeLine(ctx, CENTER - ROAD_HALF / 2, y0 + I1, 0, LOGICAL_H - HUD_H - I1)
  strokeLine(ctx, CENTER + ROAD_HALF / 2, y0, 0, I0)
  ctx.setLineDash([])

  drawStopLines(ctx, state, y0)

  // 车辆。
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    for (const car of state.cars[d]!) {
      drawCar(ctx, carRect(car, d), car.hue, car.v, y0, d)
    }
  }

  drawSignals(ctx, state, y0)

  if (state.over === 'crash') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '发生事故', '按 R 重来 · 得分 ' + state.score, THEME.bad)
  } else if (state.over === 'congestion') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '交通瘫痪', '排队超过 ' + CONGEST_LIMIT + ' 辆 · 按 R 重来', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}

function strokeLine(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + dx, y + dy)
  ctx.stroke()
}

/** 停止线 + 排队警示：接近拥堵阈值的入口整条车道呼吸式泛红。 */
function drawStopLines(ctx: CanvasRenderingContext2D, state: TrafficState, y0: number): void {
  const warn = [0, 1, 2, 3].map(d => queueLen(state, d as Dir))
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const q = warn[d]!
    if (q >= CONGEST_LIMIT - 2 && Math.floor(state.time * 3) % 2 === 0) {
      ctx.fillStyle = 'rgba(247,118,142,0.10)'
      paintEntry(ctx, d, y0)
    }
    ctx.fillStyle = 'rgba(226,226,238,0.75)'
    if (d === 0) ctx.fillRect(CENTER - ROAD_HALF, y0 + STOP_LINE - 3, ROAD_HALF - 4, 3)
    if (d === 1) ctx.fillRect(CENTER + 4, y0 + LANE_LEN - STOP_LINE, ROAD_HALF - 4, 3)
    if (d === 2) ctx.fillRect(STOP_LINE - 3, y0 + CENTER + 4, 3, ROAD_HALF - 4)
    if (d === 3) ctx.fillRect(LANE_LEN - STOP_LINE, y0 + CENTER - ROAD_HALF, 3, ROAD_HALF - 4)
  }
}

/** 某方向入口引道的警示底色。 */
function paintEntry(ctx: CanvasRenderingContext2D, dir: Dir, y0: number): void {
  if (dir === 0) ctx.fillRect(CENTER - ROAD_HALF, y0, ROAD_HALF, STOP_LINE)
  if (dir === 1) ctx.fillRect(CENTER, y0 + LANE_LEN - STOP_LINE, ROAD_HALF, STOP_LINE)
  if (dir === 2) ctx.fillRect(0, y0 + CENTER, STOP_LINE, ROAD_HALF)
  if (dir === 3) ctx.fillRect(LANE_LEN - STOP_LINE, y0 + CENTER - ROAD_HALF, STOP_LINE, ROAD_HALF)
}

/** 一辆车：圆角车身 + 头灯 + 刹车灯（低速/排队亮红）。 */
function drawCar(
  ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number },
  hue: number, v: number, y0: number, dir: Dir,
): void {
  const color = accent(hue)
  ctx.fillStyle = color
  glow(ctx, color, 7)
  roundRectPath(ctx, r.x, y0 + r.y, r.w, r.h, 5)
  ctx.fill()
  noGlow(ctx)
  // 头灯朝行驶方向（dir 0 向下、1 向上、2 向右、3 向左），刹车灯在尾部。
  const vertical = r.h > r.w
  const cx = r.x + r.w / 2
  const cy = y0 + r.y + r.h / 2
  const lamp = 3
  ctx.fillStyle = THEME.gold
  if (vertical) {
    const headY = dir === 0 ? y0 + r.y + r.h - 6 : y0 + r.y + 3
    ctx.fillRect(cx - 7, headY, lamp, lamp)
    ctx.fillRect(cx + 4, headY, lamp, lamp)
    if (v < 8) {
      ctx.fillStyle = THEME.bad
      glow(ctx, THEME.bad, 5)
      const tailY = dir === 0 ? y0 + r.y + 1 : y0 + r.y + r.h - 4
      ctx.fillRect(cx - 7, tailY, r.w - 2, lamp)
      noGlow(ctx)
    }
  } else {
    const headX = dir === 2 ? r.x + r.w - 6 : r.x + 3
    ctx.fillRect(headX, cy - 7, lamp, lamp)
    ctx.fillRect(headX, cy + 4, lamp, lamp)
    if (v < 8) {
      ctx.fillStyle = THEME.bad
      glow(ctx, THEME.bad, 5)
      const tailX = dir === 2 ? r.x + 1 : r.x + r.w - 4
      ctx.fillRect(tailX, cy - 7, lamp, r.h - 2)
      noGlow(ctx)
    }
  }
}

/** 四个路口角的信号灯：按 signalOpen 的灯色发光显示三灯灯箱。 */
function drawSignals(ctx: CanvasRenderingContext2D, state: TrafficState, y0: number): void {
  const spots: { x: number; y: number; dir: Dir }[] = [
    { x: I0 - 20, y: y0 + I0 - 20, dir: 0 },
    { x: I1 + 20, y: y0 + I1 + 20, dir: 1 },
    { x: I0 - 20, y: y0 + I1 + 20, dir: 2 },
    { x: I1 + 20, y: y0 + I0 - 20, dir: 3 },
  ]
  for (const s of spots) {
    const open = signalOpen(state, s.dir)
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, s.x - 7, s.y - 15, 14, 30, 6)
    ctx.fill()
    const bulbs: Array<{ color: string; on: boolean }> = [
      { color: THEME.bad, on: open === 'red' },
      { color: THEME.gold, on: open === 'yellow' },
      { color: THEME.good, on: open === 'green' },
    ]
    bulbs.forEach((b, i) => {
      ctx.fillStyle = b.on ? b.color : 'rgba(226,226,238,0.14)'
      if (b.on) glow(ctx, b.color, 9)
      ctx.beginPath()
      ctx.arc(s.x, s.y - 9 + i * 9, 3.6, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    })
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: TrafficState): void {
  hudPair(ctx, 8, 22, '分数 ', String(state.score))
  hudPair(ctx, LOGICAL_W / 2, 22, '时间 ' + state.time.toFixed(0) + 's', '', 'center')
  const worst = Math.max(
    queueLen(state, 0), queueLen(state, 1), queueLen(state, 2), queueLen(state, 3),
  )
  hudPair(
    ctx, LOGICAL_W - 8, 22, '拥堵 ', worst + '/' + CONGEST_LIMIT, 'right',
    worst >= CONGEST_LIMIT - 2 ? THEME.bad : THEME.text,
  )
  hudPair(ctx, LOGICAL_W / 2 + 70, 22, '通过 ', String(state.passed), 'left')
}
