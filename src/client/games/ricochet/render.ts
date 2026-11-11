/**
 * 弹跳机器人渲染层：盘面网格与墙块、四色机器人（滑行动画插值）、目标格
 * 同色光环脉冲、HUD（关卡 / 步数 / par / 分数）、底部方向按钮（供 index
 * 命中检测）、暂停 / 过关 / 失败遮罩与过关粒子。渲染为无状态纯绘制。
 */
import {
  W, H, SIZE, CELL, BOARD_X, BOARD_Y, ROBOT_COUNT,
  type Dir, type Pos, type RicochetState,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 滑行动画时长 ms（与 index 层共用）。 */
export const SLIDE_MS = 140

/** 一个方向按钮的命中区。 */
export interface DirButton {
  /** 触发方向。 */
  dir: Dir
  /** 按钮区左上角 x px。 */
  x: number
  /** 按钮区左上角 y px。 */
  y: number
  /** 宽 px。 */
  w: number
  /** 高 px。 */
  h: number
  /** 按钮箭头字符。 */
  label: string
}

/** 底部四个方向按钮（顺序 ↑ ↓ ← →）。 */
export const DIR_BUTTONS: DirButton[] = [
  { dir: 'up', x: 50, y: 428, w: 76, h: 48, label: '\u2191' },
  { dir: 'down', x: 138, y: 428, w: 76, h: 48, label: '\u2193' },
  { dir: 'left', x: 226, y: 428, w: 76, h: 48, label: '\u2190' },
  { dir: 'right', x: 314, y: 428, w: 76, h: 48, label: '\u2192' },
]

/** 渲染选项。 */
export interface RicochetRenderOpts {
  /** 滑行动画：本回合各机器人的出发位置（null 无动画）。 */
  animFrom: Pos[] | null
  /** 动画进度 0..1。 */
  animT: number
  /** 是否暂停遮罩。 */
  paused: boolean
  /** 当前时间 ms（目标光环脉冲相位）。 */
  nowMs: number
}

/** 四色机器人的配色（取主题色 ramp 的稳定索引）。 */
export const ROBOT_COLORS: string[] = []
for (let i = 0; i < ROBOT_COUNT; i += 1) ROBOT_COLORS.push(accent(i * 2))

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
 * 缓动（ease-out）：滑行起步快、到位前减速。
 * @param t - 进度 0..1。
 * @returns 缓动后的进度。
 */
function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - (1 - c) * (1 - c)
}

/**
 * 画一个机器人：圆角方块 + 双眼 + 状态灯；目标机器人带金色描边。
 * @param ctx - 画布上下文。
 * @param x - 左上角 x px。
 * @param y - 左上角 y px。
 * @param color - 机器人颜色。
 * @param isTarget - 是否目标机器人。
 */
function drawRobot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, isTarget: boolean): void {
  const inset = 4
  const bx = x + inset
  const by = y + inset
  const bs = CELL - inset * 2
  glow(ctx, color, 9)
  ctx.fillStyle = color
  roundRectPath(ctx, bx, by, bs, bs, 9)
  ctx.fill()
  noGlow(ctx)
  ctx.lineWidth = isTarget ? 2.5 : 1
  ctx.strokeStyle = isTarget ? THEME.gold : 'rgba(13,13,20,0.5)'
  roundRectPath(ctx, bx, by, bs, bs, 9)
  ctx.stroke()
  ctx.fillStyle = '#14141d'
  ctx.beginPath()
  ctx.arc(bx + bs * 0.34, by + bs * 0.42, 3, 0, Math.PI * 2)
  ctx.arc(bx + bs * 0.66, by + bs * 0.42, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = isTarget ? THEME.gold : '#14141d'
  roundRectPath(ctx, bx + bs / 2 - 4, by + bs - 10, 8, 4, 2)
  ctx.fill()
}

/**
 * 主渲染入口：背景、盘面、目标、机器人、HUD、方向按钮、粒子与遮罩。
 * @param ctx - 画布上下文（已施加逻辑坐标变换）。
 * @param state - 当前状态。
 * @param opts - 渲染选项（动画、暂停、时间）。
 */
export function renderRicochet(ctx: CanvasRenderingContext2D, state: RicochetState, opts: RicochetRenderOpts): void {
  drawBackground(ctx, W, H)

  // HUD 条。
  hudPair(ctx, 16, 28, '关卡', String(state.level))
  hudPair(ctx, 120, 28, '步数', state.moves + '/' + state.limit)
  hudPair(ctx, 240, 28, 'PAR', String(state.par))
  hudPair(ctx, W - 16, 28, '分数', String(state.score), 'right', state.won ? THEME.gold : THEME.text)
  // 目标横幅：明确本关要送哪个机器人去哪（金色描边机器人 → 菱形目标格）。
  const names = ['红', '黄', '绿', '蓝']
  const tName = names[state.targetRobot] ?? '?'
  const tCol = ROBOT_COLORS[state.targetRobot] ?? THEME.text
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  glow(ctx, tCol, 6)
  ctx.fillStyle = tCol
  ctx.fillText('◆ 目标：把【' + tName + '色机器人】（金色描边）滑到菱形目标格', 16, 48)
  noGlow(ctx)

  // 盘面底板。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, BOARD_X - 6, BOARD_Y - 6, SIZE * CELL + 12, SIZE * CELL + 12, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  roundRectPath(ctx, BOARD_X - 6, BOARD_Y - 6, SIZE * CELL + 12, SIZE * CELL + 12, 8)
  ctx.stroke()

  // 网格。
  ctx.strokeStyle = 'rgba(52,52,74,0.45)'
  ctx.lineWidth = 1
  for (let i = 0; i <= SIZE; i += 1) {
    ctx.beginPath()
    ctx.moveTo(BOARD_X + i * CELL, BOARD_Y)
    ctx.lineTo(BOARD_X + i * CELL, BOARD_Y + SIZE * CELL)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(BOARD_X, BOARD_Y + i * CELL)
    ctx.lineTo(BOARD_X + SIZE * CELL, BOARD_Y + i * CELL)
    ctx.stroke()
  }

  // 墙块。
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!state.walls[r]![c]) continue
      const { x, y } = cellXY(r, c)
      ctx.fillStyle = '#2f2f44'
      roundRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 5)
      ctx.fill()
      ctx.strokeStyle = '#46466a'
      ctx.lineWidth = 1
      roundRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 5)
      ctx.stroke()
    }
  }

  // 目标格：同色光环脉冲 + 菱形标记。
  const tColor = ROBOT_COLORS[state.targetRobot] ?? THEME.text
  const tPos = cellXY(state.target.row, state.target.col)
  const pulse = 0.5 + 0.5 * Math.sin(opts.nowMs / 320)
  glow(ctx, tColor, 8 + pulse * 10)
  ctx.strokeStyle = tColor
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(tPos.x + CELL / 2, tPos.y + CELL / 2, 8 + pulse * 5, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = tColor
  ctx.beginPath()
  ctx.moveTo(tPos.x + CELL / 2, tPos.y + 9)
  ctx.lineTo(tPos.x + CELL - 9, tPos.y + CELL / 2)
  ctx.lineTo(tPos.x + CELL / 2, tPos.y + CELL - 9)
  ctx.lineTo(tPos.x + 9, tPos.y + CELL / 2)
  ctx.closePath()
  ctx.fill()

  // 机器人（滑行动画期间从出发点向落点插值）。
  const t = easeOut(opts.animT)
  for (let i = 0; i < state.robots.length; i += 1) {
    const to = state.robots[i]!
    const toXY = cellXY(to.row, to.col)
    let x = toXY.x
    let y = toXY.y
    if (opts.animFrom !== null) {
      const from = opts.animFrom[i] ?? to
      const fromXY = cellXY(from.row, from.col)
      x = fromXY.x + (toXY.x - fromXY.x) * t
      y = fromXY.y + (toXY.y - fromXY.y) * t
    }
    drawRobot(ctx, x, y, ROBOT_COLORS[i] ?? THEME.text, i === state.targetRobot)
  }

  // 方向按钮。
  ctx.font = 'bold 24px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const btn of DIR_BUTTONS) {
    ctx.fillStyle = 'rgba(122,162,247,0.12)'
    roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(122,162,247,0.55)'
    ctx.lineWidth = 1.5
    roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 10)
    ctx.stroke()
    ctx.fillStyle = THEME.text
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1)
  }
  ctx.textBaseline = 'alphabetic'

  particles.tick(ctx, 33)

  if (state.won) {
    drawOverlay(ctx, W, H, '过关！', '回车 / 点击进入下一关', THEME.gold)
  } else if (state.failed) {
    drawOverlay(ctx, W, H, '步数用尽', 'R：重开本关 · U：撤回一步', THEME.bad)
  } else if (opts.paused) {
    drawOverlay(ctx, W, H, '已暂停', 'P：继续')
  }
}

/**
 * 过关时在目标格位置喷发庆祝粒子（index 层调用）。
 * @param state - 当前状态。
 */
export function burstWin(state: RicochetState): void {
  const p = cellXY(state.target.row, state.target.col)
  particles.burst(p.x + CELL / 2, p.y + CELL / 2, ROBOT_COLORS[state.targetRobot] ?? THEME.gold, 26, 170)
}

/**
 * 方向按钮命中检测。
 * @param x - 逻辑坐标 x px。
 * @param y - 逻辑坐标 y px。
 * @returns 命中的方向；未命中返回 null。
 */
export function hitDirectionButton(x: number, y: number): Dir | null {
  for (const btn of DIR_BUTTONS) {
    if (x >= btn.x && x < btn.x + btn.w && y >= btn.y && y < btn.y + btn.h) return btn.dir
  }
  return null
}
