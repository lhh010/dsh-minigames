/**
 * 关箱 Shut the Box 画布渲染：顶部两颗骰子（滚动动画）、1-9 数字板
 * （立/翻状态、可翻高亮、选中金框）、掷骰按钮、回合提示（含无法行动
 * 提示）、剩余和/局数/总分 HUD、暂停与终局覆盖层。共享 theme 视觉件；
 * 本模块无状态，全部命中检测为纯函数。
 */
import { TILE_MAX, TOTAL_ROUNDS, enumerateMoves } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 620
const HUD_H = 30

const DICE_SIZE = 54
const DICE_GAP = 16
const DICE_Y = 58
const DICE_X0 = (LOGICAL_W - (2 * DICE_SIZE + DICE_GAP)) / 2

const TILE_W = 44
const TILE_H = 76
const TILE_GAP = 6
const TILES_X0 = (LOGICAL_W - (TILE_MAX * TILE_W + (TILE_MAX - 1) * TILE_GAP)) / 2
const TILES_Y = 170

const HINT_Y = 148
const ROLL_BTN = { x: 160, y: 300, w: 160, h: 38 }
const BOARD_TITLE_Y = 196
const FOOTER_Y = LOGICAL_H - 14

/** 一局的阶段：待掷骰 / 待翻板 / 本局结束 / 整场结束。 */
export type ShutboxPhase = 'needRoll' | 'needMove' | 'roundOver' | 'ended'

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface ShutboxView {
  /** 翻板状态（下标 i = 数字 i+1，true 立着）。 */
  up: boolean[]
  /** 当前选中的数字（子和未达骰面总和前可继续增选）。 */
  selected: number[]
  /** 最近一次骰面（未掷过或本局已结算为 null）。 */
  dice: readonly number[] | null
  /** 掷骰滚动动画进行中。 */
  rolling: boolean
  /** 当前阶段。 */
  phase: ShutboxPhase
  /** 当前局号（1..5）。 */
  roundNo: number
  /** 本局累计连击加分。 */
  comboPoints: number
  /** 每局得分（已结算的局）。 */
  roundScores: number[]
  /** 整场总分。 */
  total: number
  /** 本局是否关箱（roundOver 阶段的展示用）。 */
  roundShut: boolean
  /** 临时提示文本，空串表示无。 */
  toast: string
  /** 玩家按 P 的手动暂停。 */
  userPaused: boolean
  /** 面板驱动的暂停（实例未运行）。 */
  paused: boolean
}

/** 第 n 块数字板（1..9）的矩形。 */
export function tileRect(n: number): { x: number, y: number, w: number, h: number } {
  return { x: TILES_X0 + (n - 1) * (TILE_W + TILE_GAP), y: TILES_Y, w: TILE_W, h: TILE_H }
}

/**
 * 命中检测：返回点击到的数字（1..9），未命中返回 null。
 */
export function tileAt(x: number, y: number): number | null {
  for (let n = 1; n <= TILE_MAX; n += 1) {
    const r = tileRect(n)
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return n
  }
  return null
}

/** 掷骰按钮命中。 */
export function rollButtonAt(x: number, y: number): boolean {
  return x >= ROLL_BTN.x && x <= ROLL_BTN.x + ROLL_BTN.w
    && y >= ROLL_BTN.y && y <= ROLL_BTN.y + ROLL_BTN.h
}

/** 骰面点位的九宫格坐标（0..1 相对位置），下标 = 面值。 */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.26, 0.26], [0.74, 0.74]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.74], [0.74, 0.74]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.5], [0.74, 0.5], [0.26, 0.74], [0.74, 0.74]],
}

/**
 * 画一颗骰子：滚动中按时间轮换面并轻微抖动。
 * @param i - 骰子下标（0..1）。
 * @param face - 展示面值（1..6）。
 * @param rolling - 是否处于滚动动画。
 * @param nowMs - 当前时间戳（毫秒，动画相位用）。
 */
function drawDie(ctx: CanvasRenderingContext2D, i: number, face: number, rolling: boolean, nowMs: number): void {
  const x = DICE_X0 + i * (DICE_SIZE + DICE_GAP) + (rolling ? Math.sin(nowMs / 55 + i * 1.9) * 2 : 0)
  const y = DICE_Y
  roundRectPath(ctx, x, y, DICE_SIZE, DICE_SIZE, 10)
  ctx.fillStyle = '#eceaf4'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#23232e'
  for (const [px, py] of PIPS[face] ?? []) {
    ctx.beginPath()
    ctx.arc(x + px * DICE_SIZE, y + py * DICE_SIZE, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 画一块数字板：立着 = 亮色竖板（可翻数字带 accent 描边、属于合法组合
 * 的再亮一档、选中的金框）；翻下 = 暗色躺板 + 灰数字。
 */
function drawTile(
  ctx: CanvasRenderingContext2D, n: number, up: boolean, selected: boolean, movable: boolean,
): void {
  const r = tileRect(n)
  if (up) {
    if (selected) glow(ctx, THEME.gold, 12)
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 8)
    ctx.fillStyle = selected ? '#2a2a3a' : THEME.panel
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = selected ? THEME.gold : movable ? accent(n % 8) : THEME.panelEdge
    ctx.lineWidth = selected ? 2.5 : movable ? 2 : 1
    ctx.stroke()
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = movable ? THEME.text : THEME.textMuted
    ctx.fillText(String(n), r.x + r.w / 2, r.y + r.h / 2 + (selected ? 1 : 0))
    ctx.textBaseline = 'alphabetic'
  } else {
    // 翻下：贴底的暗色矮板。
    const flatH = 22
    roundRectPath(ctx, r.x, r.y + r.h - flatH, r.w, flatH, 6)
    ctx.fillStyle = '#16161f'
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(n), r.x + r.w / 2, r.y + r.h - flatH / 2)
    ctx.textBaseline = 'alphabetic'
  }
}

function drawHint(ctx: CanvasRenderingContext2D, view: ShutboxView): void {
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  let hint: string
  if (view.phase === 'needRoll') hint = '空格 / 点击按钮掷两骰'
  else if (view.phase === 'needMove') {
    const sum = view.selected.reduce((a, b) => a + b, 0)
    const target = (view.dice?.[0] ?? 0) + (view.dice?.[1] ?? 0)
    hint = '点和 ' + String(sum) + '/' + String(target) + ' · 点击数字选组合，凑满即翻下'
  } else if (view.phase === 'roundOver') hint = view.roundShut ? '关箱！全部翻下 · 空格开下一局' : '无法凑出点和，本局终了 · 空格开下一局'
  else hint = '空格 / 点击再赛一场'
  ctx.fillText(hint, LOGICAL_W / 2, HINT_Y)

  const disabled = view.phase !== 'needRoll' || view.rolling
  const label = view.phase === 'ended' ? '再赛一场' : view.phase === 'roundOver' ? '下一局' : '掷骰'
  roundRectPath(ctx, ROLL_BTN.x, ROLL_BTN.y, ROLL_BTN.w, ROLL_BTN.h, 8)
  ctx.fillStyle = disabled ? THEME.panel : THEME.accents[0]!
  ctx.fill()
  ctx.strokeStyle = disabled ? THEME.panelEdge : THEME.accents[0]!
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = disabled ? THEME.textMuted : '#14141c'
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, ROLL_BTN.x + ROLL_BTN.w / 2, ROLL_BTN.y + ROLL_BTN.h / 2)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 绘制一帧。
 * @param nowMs - 当前时间戳（毫秒），驱动滚动动画的轮换面与抖动相位。
 */
export function renderShutbox(ctx: CanvasRenderingContext2D, view: ShutboxView, nowMs: number): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD 条：总分 / 剩余和与局数。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  hudPair(ctx, 10, 20, '总分 ', String(view.total), 'left', view.total > 0 ? THEME.gold : THEME.text)
  let remaining = 0
  for (let n = 1; n <= TILE_MAX; n += 1) if (view.up[n - 1] === true) remaining += n
  hudPair(ctx, LOGICAL_W - 10, 20, '剩余和 ', String(remaining) + ' · 局 ' + String(view.roundNo) + '/' + String(TOTAL_ROUNDS), 'right')

  // 两骰：滚动中按时间轮换展示面（无随机源，纯确定性动画）。
  if (view.dice !== null) {
    for (let i = 0; i < 2; i += 1) {
      const face = view.rolling ? 1 + (Math.floor(nowMs / 70) + i) % 6 : view.dice[i] ?? 1
      drawDie(ctx, i, face, view.rolling, nowMs)
    }
  } else {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('— 未掷骰 —', LOGICAL_W / 2, DICE_Y + DICE_SIZE / 2)
  }

  drawHint(ctx, view)

  // 数字板区标题与连击提示。
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('数字板 1-9', TILES_X0, BOARD_TITLE_Y)
  if (view.phase === 'needMove' && view.comboPoints > 0) {
    ctx.textAlign = 'right'
    ctx.fillStyle = THEME.gold
    ctx.fillText('连击 +' + String(view.comboPoints), TILES_X0 + TILE_MAX * TILE_W + (TILE_MAX - 1) * TILE_GAP, BOARD_TITLE_Y)
  }

  // 可翻高亮：出现在任一合法组合里的立着的数字。
  let movable = new Set<number>()
  if (view.phase === 'needMove' && view.dice !== null) {
    const target = view.dice[0]! + view.dice[1]!
    for (const move of enumerateMoves(view.up, target)) {
      for (const n of move) movable.add(n)
    }
  }
  if (view.phase === 'needMove') {
    for (const s of view.selected) movable = new Set([...movable].filter(n => n !== s))
  }
  for (let n = 1; n <= TILE_MAX; n += 1) {
    drawTile(ctx, n, view.up[n - 1] === true, view.selected.includes(n), movable.has(n))
  }

  if (view.toast !== '') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, THEME.gold, 8)
    ctx.fillStyle = THEME.gold
    ctx.fillText(view.toast, LOGICAL_W / 2, ROLL_BTN.y + ROLL_BTN.h + 20)
    noGlow(ctx)
  }

  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('R：重开 · P：暂停', LOGICAL_W / 2, FOOTER_Y)

  if (view.phase === 'ended') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '比赛结束', spaced('总分') + ' ' + String(view.total) + ' · 空格 / 点击再赛一场', THEME.gold)
  } else if (view.phase === 'roundOver') {
    const sub = view.roundShut ? '关箱满分 +50 · 空格开下一局' : '剩余和 ' + String(view.up.reduce((s, u, i) => s + (u ? i + 1 : 0), 0)) + ' · 空格开下一局'
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, view.roundShut ? '关箱！' : '本局终了', sub, view.roundShut ? THEME.gold : THEME.bad)
  } else if (view.userPaused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · R 重开', THEME.text)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板恢复后继续', THEME.text)
  }
}
