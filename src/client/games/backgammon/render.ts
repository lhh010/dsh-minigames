/**
 * 双陆棋 Backgammon 画布渲染：4 象限 24 尖点棋盘（上下各 12 个三角、
 * 中央 bar 中柱、右侧 bear off 出局槽）、双色棋子堆叠计数、顶部骰子
 * （滚动动画、已用骰面变暗）、可走点/出局槽高亮、选中子金环、局分
 * 与 pip HUD、提示行与掷骰按钮、暂停/局终/整场 overlay。共享 theme
 * 视觉件；本模块无状态，全部命中检测为纯函数。
 *
 * 盘面方位：下排右→左为 1..12（1 在最右），上排左→右为 13..24
 * （24 在最右）；玩家内区为右下 1-6 点。
 */
import type { Board, BackgammonPhase, Side } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 960
export const LOGICAL_H = 640

const HUD_Y = 20
const BOARD_Y0 = 46
const BOARD_Y1 = LOGICAL_H - 84
const MID_Y = (BOARD_Y0 + BOARD_Y1) / 2
const BAR_W = 56
const BOARD_X0 = 18
const BOARD_X1 = LOGICAL_W - 72
const BAR_L = (BOARD_X0 + BOARD_X1) / 2 - BAR_W / 2
const BAR_R = BAR_L + BAR_W
const HALF_W = BAR_L - BOARD_X0
const POINT_W = HALF_W / 6
const TRI_H = (BOARD_Y1 - BOARD_Y0) * 0.44
const CHECKER_R = Math.min(POINT_W * 0.38, 13)

const TRAY_X = BOARD_X1 + 6
const TRAY_W = LOGICAL_W - 8 - TRAY_X

const DICE_SIZE = 40
const DICE_GAP = 12
const DICE_Y = 8
const DICE_X0 = LOGICAL_W / 2 - DICE_SIZE - DICE_GAP / 2
const HINT_Y = LOGICAL_H - 60
const ROLL_BTN = { x: LOGICAL_W / 2 - 80, y: LOGICAL_H - 48, w: 160, h: 32 }

/** 玩家/对方棋子主色。 */
const YOU_COLOR = accent(0)
const AI_COLOR = THEME.bad

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface BackgammonView {
  board: Board
  phase: BackgammonPhase
  turn: Side
  dice: [number, number] | null
  /** 未用骰面（判断已用骰变暗）。 */
  remaining: number[]
  /** 局号与局分。 */
  roundNo: number
  roundWinsYou: number
  roundWinsAi: number
  matchWinner: Side | null
  /** 选中来源（-1 无，0 中栏，1..24 点）。 */
  selected: number
  /** 当前可选来源（来自合法单步的 from 集合）。 */
  movable: number[]
  /** 选中来源的合法落点（0 = bear off）。 */
  targets: number[]
  /** 掷骰滚动动画进行中。 */
  rolling: boolean
  /** 临时提示文本，空串表示无。 */
  toast: string
  /** 玩家按 P 的手动暂停。 */
  userPaused: boolean
  /** 面板驱动的暂停（实例未运行）。 */
  paused: boolean
}

/** 点 p（1..24）的中心 x。 */
export function pointCenterX(p: number): number {
  if (p >= 1 && p <= 6) return BAR_R + (6 - p) * POINT_W + POINT_W / 2
  if (p >= 7 && p <= 12) return BAR_L - (p - 7) * POINT_W - POINT_W / 2
  if (p >= 13 && p <= 18) return BAR_L - (18 - p) * POINT_W - POINT_W / 2
  return BAR_R + (p - 19) * POINT_W + POINT_W / 2
}

/** 点 p 位于下排（1..12）还是上排（13..24）。 */
function isBottom(p: number): boolean {
  return p <= 12
}

/**
 * 命中检测：返回点击到的尖点编号（1..24），按整列半区判定；未命中
 * 返回 null。
 */
export function pointAt(x: number, y: number): number | null {
  for (let p = 1; p <= 24; p += 1) {
    const cx = pointCenterX(p)
    if (x < cx - POINT_W / 2 || x > cx + POINT_W / 2) continue
    if (isBottom(p) && y >= MID_Y && y <= BOARD_Y1) return p
    if (!isBottom(p) && y >= BOARD_Y0 && y <= MID_Y) return p
  }
  return null
}

/** 中栏玩家侧（下半段）命中：可选中栏上的己方子。 */
export function barAt(x: number, y: number): boolean {
  return x >= BAR_L && x <= BAR_R && y >= MID_Y && y <= BOARD_Y1
}

/** 玩家 bear off 出局槽（右列下半段）命中。 */
export function offAt(x: number, y: number): boolean {
  return x >= TRAY_X && y >= MID_Y && y <= BOARD_Y1
}

/** 掷骰按钮命中。 */
export function rollButtonAt(x: number, y: number): boolean {
  return x >= ROLL_BTN.x && x <= ROLL_BTN.x + ROLL_BTN.w
    && y >= ROLL_BTN.y && y <= ROLL_BTN.y + ROLL_BTN.h
}

/** 骰面点位的九宫格坐标（0..1 相对位置），下标 = 面值。 */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.5], [0.72, 0.5], [0.28, 0.72], [0.72, 0.72]],
}

/**
 * 画一颗骰子：滚动中按时间轮换面并轻微抖动，已用骰面整体变暗。
 * @param i - 骰子序号（横向排布）。。
 * @param face - 展示面值（1..6）。
 * @param used - 该骰已用完（变暗）。
 * @param rolling - 滚动动画中。
 * @param nowMs - 当前时间戳（毫秒）。
 */
function drawDie(ctx: CanvasRenderingContext2D, i: number, face: number, used: boolean, rolling: boolean, nowMs: number): void {
  const x = DICE_X0 + i * (DICE_SIZE + DICE_GAP) + (rolling ? Math.sin(nowMs / 50 + i * 1.7) * 2 : 0)
  const y = DICE_Y
  ctx.globalAlpha = used ? 0.35 : 1
  roundRectPath(ctx, x, y, DICE_SIZE, DICE_SIZE, 8)
  ctx.fillStyle = '#eceaf4'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#23232e'
  for (const [px, py] of PIPS[face] ?? []) {
    ctx.beginPath()
    ctx.arc(x + px * DICE_SIZE, y + py * DICE_SIZE, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画一枚棋子（圆片 + 高光弧），color 为主色。
 * @returns 无。
 */
function drawChecker(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.beginPath()
  ctx.arc(cx, cy, CHECKER_R, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(13,13,20,0.55)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx - CHECKER_R * 0.25, cy - CHECKER_R * 0.25, CHECKER_R * 0.45, Math.PI * 0.9, Math.PI * 1.6)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/**
 * 画一个尖点上的棋子堆：最多 5 枚叠片，超过 5 枚在最上一枚标数字。
 * @param p - 尖点编号（1..24）。
 * @param count - 棋子数。
 * @param color - 主色。
 */
function drawStack(ctx: CanvasRenderingContext2D, p: number, count: number, color: string): void {
  if (count <= 0) return
  const cx = pointCenterX(p)
  const step = CHECKER_R * 1.55
  const shown = Math.min(count, 5)
  for (let i = 0; i < shown; i += 1) {
    const cy = isBottom(p) ? BOARD_Y1 - CHECKER_R - 3 - i * step : BOARD_Y0 + CHECKER_R + 3 + i * step
    drawChecker(ctx, cx, cy, color)
  }
  if (count > 5) {
    const topY = isBottom(p)
      ? BOARD_Y1 - CHECKER_R - 3 - (shown - 1) * step
      : BOARD_Y0 + CHECKER_R + 3 + (shown - 1) * step
    ctx.font = 'bold ' + String(Math.round(CHECKER_R * 1.1)) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#16161e'
    ctx.fillText(String(count), cx, topY)
    ctx.textBaseline = 'alphabetic'
  }
}

/**
 * 画一个三角尖点；target 时以绿色辉光高亮（合法落点）。
 */
function drawTriangle(ctx: CanvasRenderingContext2D, p: number, target: boolean, index: number): void {
  const cx = pointCenterX(p)
  const baseY = isBottom(p) ? BOARD_Y1 : BOARD_Y0
  const tipY = isBottom(p) ? BOARD_Y1 - TRI_H : BOARD_Y0 + TRI_H
  ctx.beginPath()
  ctx.moveTo(cx - POINT_W / 2, baseY)
  ctx.lineTo(cx + POINT_W / 2, baseY)
  ctx.lineTo(cx, tipY)
  ctx.closePath()
  const even = index % 2 === 0
  ctx.fillStyle = target ? 'rgba(158,206,106,0.30)' : even ? '#262636' : '#20202e'
  ctx.fill()
  ctx.strokeStyle = target ? THEME.good : THEME.panelEdge
  ctx.lineWidth = target ? 2 : 1
  ctx.stroke()
  if (target) {
    glow(ctx, THEME.good, 10)
    ctx.beginPath()
    ctx.arc(cx, tipY + (isBottom(p) ? 10 : -10), 5, 0, Math.PI * 2)
    ctx.fillStyle = THEME.good
    ctx.fill()
    noGlow(ctx)
  }
  // 点号：贴边小字，方便定位。
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(String(p), cx, isBottom(p) ? baseY - 5 : baseY + 14)
}

/**
 * 主渲染入口：整幅盘面 + HUD + 骰子 + 提示 + overlay。
 * @param ctx - 已按逻辑坐标变换的 2d 上下文。
 * @param view - 当前视图状态。
 * @param nowMs - 当前时间戳（毫秒，骰子动画相位用）。
 */
export function renderBackgammon(ctx: CanvasRenderingContext2D, view: BackgammonView, nowMs: number): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 盘面底板（左右两翼）。
  roundRectPath(ctx, BOARD_X0, BOARD_Y0, BAR_L - BOARD_X0, BOARD_Y1 - BOARD_Y0, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  roundRectPath(ctx, BAR_R, BOARD_Y0, BOARD_X1 - BAR_R, BOARD_Y1 - BOARD_Y0, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()

  // 24 个尖点（含高亮落点）。
  const targetSet = new Set(view.targets)
  for (let p = 1; p <= 24; p += 1) {
    drawTriangle(ctx, p, targetSet.has(p), p)
  }

  // 中柱：玩家子（下半）与对方子（上半）。
  roundRectPath(ctx, BAR_L, BOARD_Y0, BAR_W, BOARD_Y1 - BOARD_Y0, 8)
  ctx.fillStyle = '#171722'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('BAR', (BAR_L + BAR_R) / 2, MID_Y - 4)
  const step = CHECKER_R * 1.55
  for (let i = 0; i < Math.min(view.board.barYou, 5); i += 1) {
    drawChecker(ctx, (BAR_L + BAR_R) / 2, BOARD_Y1 - CHECKER_R - 3 - i * step, YOU_COLOR)
  }
  for (let i = 0; i < Math.min(view.board.barAi, 5); i += 1) {
    drawChecker(ctx, (BAR_L + BAR_R) / 2, BOARD_Y0 + CHECKER_R + 3 + i * step, AI_COLOR)
  }
  if (view.selected === 0 && view.board.barYou > 0) {
    glow(ctx, THEME.gold, 14)
    ctx.beginPath()
    ctx.arc((BAR_L + BAR_R) / 2, BOARD_Y1 - CHECKER_R - 3, CHECKER_R + 3, 0, Math.PI * 2)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2.5
    ctx.stroke()
    noGlow(ctx)
  }

  // 出局槽（右列：上对方、下玩家；高亮为合法 bear off 落点）。
  roundRectPath(ctx, TRAY_X, BOARD_Y0, TRAY_W, (MID_Y - BOARD_Y0) - 3, 8)
  ctx.fillStyle = '#1a1a26'
  ctx.fill()
  roundRectPath(ctx, TRAY_X, MID_Y + 3, TRAY_W, BOARD_Y1 - MID_Y - 3, 8)
  ctx.fillStyle = targetSet.has(0) ? 'rgba(158,206,106,0.28)' : '#1a1a26'
  ctx.fill()
  if (targetSet.has(0)) {
    ctx.strokeStyle = THEME.good
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('OFF', TRAY_X + TRAY_W / 2, BOARD_Y0 + 12)
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillStyle = AI_COLOR
  ctx.fillText(String(view.board.offAi), TRAY_X + TRAY_W / 2, MID_Y - 16)
  ctx.fillStyle = YOU_COLOR
  ctx.fillText(String(view.board.offYou), TRAY_X + TRAY_W / 2, MID_Y + 22)

  // 双方棋子堆 + 选中/可动高亮。
  const movableSet = new Set(view.movable)
  for (let p = 1; p <= 24; p += 1) {
    drawStack(ctx, p, view.board.you[p - 1]!, YOU_COLOR)
    drawStack(ctx, p, view.board.ai[p - 1]!, AI_COLOR)
    if (view.turn === 'you' && view.phase === 'move' && view.board.you[p - 1]! > 0 && (movableSet.has(p) || view.selected === p)) {
      const cy = isBottom(p) ? BOARD_Y1 - CHECKER_R - 3 : BOARD_Y0 + CHECKER_R + 3
      glow(ctx, view.selected === p ? THEME.gold : YOU_COLOR, view.selected === p ? 16 : 8)
      ctx.beginPath()
      ctx.arc(pointCenterX(p), cy, CHECKER_R + 2, 0, Math.PI * 2)
      ctx.strokeStyle = view.selected === p ? THEME.gold : YOU_COLOR
      ctx.lineWidth = 2
      ctx.stroke()
      noGlow(ctx)
    }
  }

  // 骰子（滚动动画 / 已用变暗）。
  if (view.dice !== null || view.rolling) {
    const faces: number[] = view.dice === null ? [] : view.dice[0] === view.dice[1]
      ? [view.dice[0]!, view.dice[0]!, view.dice[0]!, view.dice[0]!]
      : [view.dice[0]!, view.dice[1]!]
    const usedCount = faces.length - view.remaining.length
    for (let i = 0; i < faces.length; i += 1) {
      const rollingFace = 1 + (Math.floor(nowMs / 80) + i) % 6
      drawDie(ctx, i, view.rolling ? rollingFace : faces[i]!, i < usedCount, view.rolling, nowMs)
    }
  }

  // HUD：局数局分（左）、pip 对比（右）。
  ctx.textBaseline = 'alphabetic'
  hudPair(ctx, 24, HUD_Y, '局分', view.roundWinsYou + ' : ' + view.roundWinsAi, 'left')
  let pipYou = 0
  let pipAi = 0
  for (let p = 1; p <= 24; p += 1) {
    pipYou += view.board.you[p - 1]! * p
    pipAi += view.board.ai[p - 1]! * (25 - p)
  }
  pipYou += view.board.barYou * 25
  pipAi += view.board.barAi * 25
  hudPair(ctx, LOGICAL_W - 24, HUD_Y, 'pip', pipYou + ' : ' + pipAi, 'right')
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('第 ' + view.roundNo + ' 局 · 你蓝 对方红', LOGICAL_W / 2, BOARD_Y0 - 8)

  // 提示行 + 掷骰按钮。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = view.toast !== '' ? THEME.gold : THEME.textMuted
  const hint = view.toast !== '' ? view.toast : hintFor(view)
  ctx.fillText(hint, LOGICAL_W / 2, HINT_Y)
  if (view.phase === 'roll' && view.turn === 'you' && !view.userPaused && !view.paused) {
    roundRectPath(ctx, ROLL_BTN.x, ROLL_BTN.y, ROLL_BTN.w, ROLL_BTN.h, 8)
    ctx.fillStyle = accent(0)
    ctx.fill()
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillStyle = '#14141c'
    ctx.fillText('掷骰（空格）', LOGICAL_W / 2, ROLL_BTN.y + 21)
  }

  // 覆盖层：暂停 / 局终 / 整场终。
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P 键继续')
    return
  }
  if (view.userPaused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续 · 按 R 重开')
    return
  }
  if (view.phase === 'roundOver') {
    const win = view.roundWinsYou > view.roundWinsAi
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H,
      '第 ' + String(view.roundNo) + ' 局 ' + (win ? '你胜' : '对方胜'),
      '空格：下一局 · R：重开整场', win ? THEME.good : THEME.bad)
    return
  }
  if (view.phase === 'matchOver') {
    const youWin = view.matchWinner === 'you'
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, youWin ? '整场胜利' : '憾负整场',
      youWin ? '3 局 2 胜达成 · 空格或 R 再来一场' : '对方先取 2 局 · 空格或 R 再来一场',
      youWin ? THEME.good : THEME.bad)
  }
}

/** 依阶段生成默认提示行文案。 */
function hintFor(view: BackgammonView): string {
  if (view.phase === 'roll') {
    return view.turn === 'you' ? '空格 / 点击按钮掷骰' : '对方掷骰中…'
  }
  if (view.phase === 'move') {
    if (view.turn !== 'you') return '对方行子中…'
    if (view.board.barYou > 0) return '你有子上栏：先从对方内区入场'
    if (view.selected >= 0) return '点击绿色高亮点落子（右槽 = 移出）'
    return '点击蓝子选中 · 可走点会亮起'
  }
  if (view.phase === 'roundOver') return '空格：下一局'
  if (view.phase === 'matchOver') return '空格 / R：再来一场'
  return ''
}
