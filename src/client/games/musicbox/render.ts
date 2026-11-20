/**
 * 音乐盒渲染层：固定逻辑坐标（LOGICAL_W x LOGICAL_H）内的纯 canvas 绘制 ——
 * 顶部 HUD（关卡/命/分/提示/播放次数）、中部旋律拍槽（已填唱名与当前拍）、
 * 下部七根可点击唱名条，以及各阶段的遮罩。不含任何 DOM 或状态变更。
 */
import { MAX_LEVEL, SCALE, SOLFEGE, type MusicBoxState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽。 */
export const LOGICAL_W = 560
/** 逻辑画布高。 */
export const LOGICAL_H = 480

/** 唱名条几何常量（点击命中与绘制共用）。 */
const BAR_W = 56
const BAR_GAP = 10
const BARS_W = SCALE * BAR_W + (SCALE - 1) * BAR_GAP
const BAR_X0 = (LOGICAL_W - BARS_W) / 2
const BAR_BASE_Y = 420
const BAR_LABEL_Y = 444
const BAR_MIN_H = 150
const BAR_MAX_H = 210
/** 旋律拍槽区域。 */
const SLOT_Y = 64
const SLOT_H = 52

/** 渲染视图输入：纯状态 + index 层维护的展示态。 */
export interface MusicBoxView {
  state: MusicBoxState
  paused: boolean
  /** localStorage 最佳分（面板代管）。 */
  best: number
  /** 正在播放的拍下标（听辨阶段的金色高亮）；null 表示未在播放。 */
  playSlot: number | null
  /** 每个唱名的闪烁剩余秒数：正数绿闪（答对），负数红闪（答错），0 无。 */
  flashes: number[]
  /** 底部提示消息（如"播放次数已用完"）；null 不显示。 */
  message: string | null
}

/** 唱名条 n 的中心 x 坐标。 */
export function barCenterX(n: number): number {
  return BAR_X0 + n * (BAR_W + BAR_GAP) + BAR_W / 2
}

/** 唱名条 n 的高度（do..si 起伏，纯视觉）。 */
function barHeight(n: number): number {
  return BAR_MIN_H + ((n * 37) % (BAR_MAX_H - BAR_MIN_H + 1))
}

/**
 * 命中测试：逻辑坐标 (x, y) 落在哪根唱名条的点击热区。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 唱名下标 0..6；不在热区返回 -1。
 */
export function solfegeHit(x: number, y: number): number {
  if (y < BAR_BASE_Y - BAR_MAX_H - 24 || y > BAR_LABEL_Y + 18) return -1
  for (let n = 0; n < SCALE; n += 1) {
    const bx = BAR_X0 + n * (BAR_W + BAR_GAP)
    if (x >= bx - BAR_GAP / 2 && x <= bx + BAR_W + BAR_GAP / 2) return n
  }
  return -1
}

function drawHud(ctx: CanvasRenderingContext2D, state: MusicBoxState, best: number): void {
  hudPair(ctx, 16, 26, '关卡', state.level + '/' + MAX_LEVEL)
  hudPair(ctx, 110, 26, '命', '♥'.repeat(Math.max(0, state.lives)), 'left', THEME.bad)
  hudPair(ctx, 190, 26, '提示', 'H x' + state.hintsLeft, 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W / 2, 26, '播放', '空格 x' + state.playsLeft, 'center')
  hudPair(ctx, LOGICAL_W - 16, 26, '最佳', String(best), 'right', THEME.gold)
  hudPair(ctx, LOGICAL_W - 16, 46, '分数', String(state.score), 'right')
}

function drawSlots(ctx: CanvasRenderingContext2D, view: MusicBoxView): void {
  const { state, playSlot } = view
  const n = state.melody.length
  const boxW = Math.min(46, (LOGICAL_W - 32 - (n - 1) * 6) / n)
  const totalW = n * boxW + (n - 1) * 6
  const x0 = (LOGICAL_W - totalW) / 2
  for (let i = 0; i < n; i += 1) {
    const step = state.melody[i]!
    const x = x0 + i * (boxW + 6)
    const filled = i < state.inputIndex || state.phase !== 'input'
    const isCurrent = i === state.inputIndex && state.phase === 'input'
    const isPlaying = playSlot === i
    roundRectPath(ctx, x, SLOT_Y, boxW, SLOT_H, 8)
    ctx.fillStyle = isPlaying ? 'rgba(224,175,104,0.20)' : isCurrent ? 'rgba(122,162,247,0.16)' : 'rgba(30,30,42,0.92)'
    ctx.fill()
    ctx.lineWidth = isPlaying ? 2.5 : isCurrent ? 2 : 1
    ctx.strokeStyle = isPlaying ? THEME.gold : isCurrent ? THEME.accents[0] : THEME.panelEdge
    if (isPlaying || isCurrent) glow(ctx, isPlaying ? THEME.gold : THEME.accents[0], 8)
    ctx.stroke()
    noGlow(ctx)
    // 拍内已填/未填唱名：和弦拍竖排两行。
    ctx.textAlign = 'center'
    for (let k = 0; k < step.notes.length; k += 1) {
      const shown = filled || (state.phase === 'input' && (state.slotFilled[i]! & (1 << k)) !== 0)
      ctx.font = '600 14px system-ui, sans-serif'
      ctx.fillStyle = shown ? THEME.text : THEME.textMuted
      const cy = SLOT_Y + (step.notes.length === 1 ? SLOT_H / 2 + 5 : 17 + k * 21)
      ctx.fillText(shown ? SOLFEGE[step.notes[k]!]! : '?', x + boxW / 2, cy)
    }
    // 长拍标记：底部小横线（时值 2 拍）。
    if (step.beats === 2) {
      ctx.strokeStyle = 'rgba(226,226,238,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x + 8, SLOT_Y + SLOT_H - 6)
      ctx.lineTo(x + boxW - 8, SLOT_Y + SLOT_H - 6)
      ctx.stroke()
    }
  }
}

function drawBars(ctx: CanvasRenderingContext2D, view: MusicBoxView): void {
  const { state, flashes } = view
  const hint = state.hintNotes
  for (let n = 0; n < SCALE; n += 1) {
    const bx = BAR_X0 + n * (BAR_W + BAR_GAP)
    const h = barHeight(n)
    const by = BAR_BASE_Y - h
    const flash = flashes[n] ?? 0
    const hinted = hint !== null && hint.includes(n)
    roundRectPath(ctx, bx, by, BAR_W, h, 10)
    let fill = 'rgba(122,162,247,0.16)'
    if (flash > 0) fill = 'rgba(158,206,106,0.55)'
    else if (flash < 0) fill = 'rgba(247,118,142,0.5)'
    else if (hinted) fill = 'rgba(224,175,104,0.42)'
    ctx.fillStyle = fill
    if (flash !== 0 || hinted) glow(ctx, flash > 0 ? THEME.good : flash < 0 ? THEME.bad : THEME.gold, 14)
    ctx.fill()
    noGlow(ctx)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = flash !== 0 || hinted ? (flash > 0 ? THEME.good : flash < 0 ? THEME.bad : THEME.gold) : accent(n)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillStyle = hinted ? THEME.gold : THEME.text
    ctx.fillText(SOLFEGE[n]!, bx + BAR_W / 2, by + 24)
    ctx.font = '500 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(n + 1), bx + BAR_W / 2, BAR_LABEL_Y)
  }
}

/**
 * 绘制一帧音乐盒。
 * @param ctx - 逻辑坐标已就位的 2d 上下文。
 * @param view - 视图状态。
 */
export function renderMusicBox(ctx: CanvasRenderingContext2D, view: MusicBoxView): void {
  const { state, paused, message } = view
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawHud(ctx, state, view.best)
  drawSlots(ctx, view)
  drawBars(ctx, view)
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('听旋律，按顺序点击唱名条复现（1-7 键）', LOGICAL_W / 2, 176)
  if (message !== null) {
    ctx.fillStyle = THEME.gold
    ctx.fillText(message, LOGICAL_W / 2, 196)
  }
  if (state.phase === 'level-clear') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关', 'Enter 进入第 ' + Math.min(state.level + 1, MAX_LEVEL) + ' 关', THEME.good)
  } else if (state.phase === 'game-over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', 'Enter 重开 · 本关得分已入账', THEME.bad)
  } else if (state.phase === 'complete') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '通关', '五段旋律全部复现成功 · Enter 再来一局', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', 'P 继续', THEME.text)
  }
}
