/**
 * 交通堵塞渲染层：盘面网格、右侧出口箭头缺口、红车醒目红、其它车按朝向
 * 配色（水平蓝 / 垂直绿圆角矩形 + 车窗细节）、选中金色高亮、HUD 区绘制
 * 关卡 / 步数 / 最优 / 分数、过关金色粒子 + 遮罩、暂停遮罩。渲染为无状态
 * 纯绘制（粒子系统为画布级单例）。
 */
import { W, H, SIZE, CELL, BOARD_X, BOARD_Y, vehicleCells, type RushHourState, type Vehicle } from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

/** 水平车配色（蓝系）。 */
const CAR_H = '#5d84d6'
/** 水平车描边。 */
const CAR_H_EDGE = '#3c5ca0'
/** 垂直车配色（绿系）。 */
const CAR_V = '#7db95d'
/** 垂直车描边。 */
const CAR_V_EDGE = '#4e8a3a'
/** 红车配色。 */
const CAR_RED = '#e8564f'
/** 红车描边。 */
const CAR_RED_EDGE = '#a93226'
/** 车窗颜色。 */
const WINDOW_FILL = 'rgba(210,230,255,0.75)'

// 渲染层自有的粒子系统（过关庆祝；每个画布一个实例）。
const particles = createParticles()

/**
 * 单元格左上角像素坐标。
 * @param row - 行号。
 * @param col - 列号。
 * @returns 像素坐标。
 */
function cellXY(row: number, col: number): { x: number, y: number } {
  return { x: BOARD_X + col * CELL, y: BOARD_Y + row * CELL }
}

/**
 * 画一辆车：圆角车身、描边、车窗细节；选中时金色发光描边。
 * @param ctx - 画布上下文。
 * @param vehicle - 车辆数据。
 * @param selected - 是否选中。
 */
function drawVehicle(ctx: CanvasRenderingContext2D, vehicle: Vehicle, selected: boolean): void {
  const origin = vehicleCells(vehicle)[0]!
  const { x, y } = cellXY(origin[0], origin[1])
  const w = (vehicle.horizontal ? vehicle.length : 1) * CELL
  const h = (vehicle.horizontal ? 1 : vehicle.length) * CELL
  const body = vehicle.red ? CAR_RED : vehicle.horizontal ? CAR_H : CAR_V
  const edge = vehicle.red ? CAR_RED_EDGE : vehicle.horizontal ? CAR_H_EDGE : CAR_V_EDGE
  const inset = 3
  const bx = x + inset
  const by = y + inset
  const bw = w - inset * 2
  const bh = h - inset * 2
  if (selected) glow(ctx, THEME.gold, 14)
  ctx.fillStyle = body
  roundRectPath(ctx, bx, by, bw, bh, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.lineWidth = selected ? 3 : 1.5
  ctx.strokeStyle = selected ? THEME.gold : edge
  roundRectPath(ctx, bx, by, bw, bh, 10)
  ctx.stroke()
  // 车窗：车头（水平车右端 / 垂直车底端）两块斜置浅色圆角矩形。
  ctx.fillStyle = WINDOW_FILL
  if (vehicle.horizontal) {
    const wx = bx + bw - 34
    roundRectPath(ctx, wx, by + 7, 13, bh / 2 - 9, 4)
    ctx.fill()
    roundRectPath(ctx, wx, by + bh / 2 + 2, 13, bh / 2 - 9, 4)
    ctx.fill()
    // 尾灯。
    ctx.fillStyle = 'rgba(255,235,150,0.9)'
    roundRectPath(ctx, bx + 4, by + 6, 5, 6, 2)
    ctx.fill()
    roundRectPath(ctx, bx + 4, by + bh - 12, 5, 6, 2)
    ctx.fill()
  } else {
    const wy = by + bh - 34
    roundRectPath(ctx, bx + 7, wy, bw / 2 - 9, 13, 4)
    ctx.fill()
    roundRectPath(ctx, bx + bw / 2 + 2, wy, bw / 2 - 9, 13, 4)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,235,150,0.9)'
    roundRectPath(ctx, bx + 6, by + 4, 6, 5, 2)
    ctx.fill()
    roundRectPath(ctx, bx + bw - 12, by + 4, 6, 5, 2)
    ctx.fill()
  }
}

/**
 * 主渲染入口：背景、盘面、出口箭头、车辆、HUD、粒子与遮罩。
 * @param ctx - 画布上下文（已施加逻辑坐标变换）。
 * @param state - 当前状态。
 * @param selected - 选中车辆索引（null 为未选中）。
 * @param paused - 是否暂停。
 */
export function renderRushHour(
  ctx: CanvasRenderingContext2D,
  state: RushHourState,
  selected: number | null,
  paused: boolean,
): void {
  drawBackground(ctx, W, H)

  // 盘面底板。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, BOARD_X, BOARD_Y, SIZE * CELL, SIZE * CELL, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  roundRectPath(ctx, BOARD_X, BOARD_Y, SIZE * CELL, SIZE * CELL, 8)
  ctx.stroke()
  // 网格。
  ctx.strokeStyle = 'rgba(52,52,74,0.55)'
  ctx.lineWidth = 1
  for (let i = 1; i < SIZE; i += 1) {
    ctx.beginPath()
    ctx.moveTo(BOARD_X + i * CELL, BOARD_Y)
    ctx.lineTo(BOARD_X + i * CELL, BOARD_Y + SIZE * CELL)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(BOARD_X, BOARD_Y + i * CELL)
    ctx.lineTo(BOARD_X + SIZE * CELL, BOARD_Y + i * CELL)
    ctx.stroke()
  }

  // 出口：右侧缺口 + 金色箭头（指离盘面）。
  const exitY = BOARD_Y + state.exitRow * CELL
  ctx.fillStyle = THEME.bgBottom
  ctx.fillRect(BOARD_X + SIZE * CELL - 3, exitY + 2, 6, CELL - 4)
  ctx.fillStyle = THEME.gold
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('→ →', BOARD_X + SIZE * CELL + 5, exitY + CELL / 2)
  ctx.textBaseline = 'alphabetic'

  // 车辆（红车最后画，压住相邻描边）。
  for (let i = 0; i < state.vehicles.length; i += 1) {
    if (!state.vehicles[i]!.red) drawVehicle(ctx, state.vehicles[i]!, selected === i)
  }
  const red = state.vehicles[0]!
  drawVehicle(ctx, red, selected === 0)

  // 过关庆祝粒子（won 时持续迸发）。
  if (state.won && !paused) {
    particles.burst(BOARD_X + SIZE * CELL, BOARD_Y + state.exitRow * CELL + CELL / 2, THEME.gold, 3, 200)
  }
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：关卡 / 步数 / 最优 / 分数。
  const hudY = 21
  hudPair(ctx, 10, hudY, '关卡', String(state.level))
  hudPair(ctx, 96, hudY, '步数', String(state.moves))
  hudPair(ctx, 190, hudY, '最优', String(state.optimal))
  hudPair(ctx, W - 10, hudY, '分数', String(state.score), 'right', state.won ? THEME.gold : THEME.text)
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点击车辆选中，再点目标格移动 · U 撤销', W / 2, H - 14)

  if (state.won) {
    drawOverlay(ctx, W, H, spaced('通关'), '得分 ' + state.score + ' · ] 进入下一关', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  }
}
