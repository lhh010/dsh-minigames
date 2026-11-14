/**
 * 调色大师画布渲染：并排大色块（当前 vs 目标）、三原色滴剂按钮与
 * 提交键（可点击命中检测）、滴入涟漪、色差读数 + 接近度弧、滴数/关卡
 * HUD、过关/失败/通关/暂停覆盖层。共享 theme 视觉件；无状态。
 */
import type { RGB } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 620
export const HUD_H = 30

/** 色差参考满量程（黑白极值），接近度按此归一。 */
const MAX_DISTANCE = 442

const BLOCK = 150
const BLOCK_Y = 60
const BLOCK_GAP = LOGICAL_W - 55 * 2 - BLOCK * 2
const CURRENT_X = 55
const TARGET_X = CURRENT_X + BLOCK + BLOCK_GAP

/** 三个滴剂按钮的圆心与半径（index 用它落涟漪）。 */
export const DROP_BUTTONS: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: 120, y: 440, r: 27 },
  { x: 240, y: 440, r: 27 },
  { x: 360, y: 440, r: 27 },
]
/** 滴剂按钮的展示色（画布上比纯原色柔和但不改变逻辑原色）。 */
const DROP_FILL: readonly string[] = ['rgb(229,57,53)', 'rgb(250,215,50)', 'rgb(66,133,244)']
const DROP_KEY: readonly string[] = ['1 红', '2 黄', '3 蓝']

const SUBMIT_X = 160
const SUBMIT_Y = 505
const SUBMIT_W = 160
const SUBMIT_H = 40

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface ColorMixView {
  /** 当前滴数下标（0 = L1）。 */
  levelIdx: number
  /** 本关滴数上限。 */
  maxDrops: number
  /** 已滴滴剂序列（每项 0..2）。 */
  drops: number[]
  /** 当前混合色（drops 为空时 null，画空盘）。 */
  current: RGB | null
  /** 目标色与其名称。 */
  target: RGB
  targetName: string
  /** 当前色差（current 为 null 时 null）。 */
  distance: number | null
  /** 本关阈值。 */
  threshold: number
  /** 各原色已滴数（徽标展示）。 */
  usedPer: number[]
  score: number
  status: 'playing' | 'cleared' | 'failed' | 'complete'
  paused: boolean
  /** 活动涟漪（圆心/年龄/寿命，毫秒）。 */
  ripples: Array<{ x: number; y: number; age: number; maxAge: number; color: string }>
}

/**
 * 滴剂按钮 / 提交键命中检测。
 * @returns 色号 0..2 或 'SUBMIT'，未命中返回 null。
 */
export function dropAt(x: number, y: number): number | 'SUBMIT' | null {
  for (let i = 0; i < DROP_BUTTONS.length; i += 1) {
    const btn = DROP_BUTTONS[i]!
    if ((x - btn.x) ** 2 + (y - btn.y) ** 2 <= (btn.r + 6) ** 2) return i
  }
  if (x >= SUBMIT_X && x <= SUBMIT_X + SUBMIT_W && y >= SUBMIT_Y && y <= SUBMIT_Y + SUBMIT_H) return 'SUBMIT'
  return null
}

function rgbCss(rgb: RGB): string {
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'
}

/** 一个大色块：填充色（null 时空盘描边）+ 下方标签。 */
function drawBlock(ctx: CanvasRenderingContext2D, x: number, rgb: RGB | null, label: string, sub: string): void {
  roundRectPath(ctx, x, BLOCK_Y, BLOCK, BLOCK, 14)
  if (rgb === null) {
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 2
    ctx.stroke()
  } else {
    const css = rgbCss(rgb)
    glow(ctx, css, 14)
    ctx.fillStyle = css
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(label, x + BLOCK / 2, BLOCK_Y + BLOCK + 22)
  if (sub !== '') {
    ctx.fillStyle = THEME.text
    ctx.font = '600 15px system-ui, sans-serif'
    ctx.fillText(sub, x + BLOCK / 2, BLOCK_Y + BLOCK + 44)
  }
}

/** 色差读数 + 接近度弧（0..1 按满量程归一）。 */
function drawCloseness(ctx: CanvasRenderingContext2D, distance: number | null, threshold: number): void {
  const cx = LOGICAL_W / 2
  const cy = 300
  const r = 34
  const label = distance === null ? '—' : distance.toFixed(1)
  hudPair(ctx, LOGICAL_W / 2, 258, '色差 ', label, 'left', distance !== null && distance <= threshold ? THEME.good : THEME.text)
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('接近度', cx, cy + 4)
  // 背景弧。
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 7
  ctx.stroke()
  // 前景弧：按归一接近度截断。
  const closeness = distance === null ? 0 : Math.max(0, 1 - distance / MAX_DISTANCE)
  if (closeness > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * closeness)
    ctx.strokeStyle = distance !== null && distance <= threshold ? THEME.good : THEME.accents[0]!
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(Math.round(closeness * 100) + '%', cx, cy + 22)
}

function drawDropButtons(ctx: CanvasRenderingContext2D, view: ColorMixView): void {
  const remaining = view.maxDrops - view.drops.length
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < DROP_BUTTONS.length; i += 1) {
    const btn = DROP_BUTTONS[i]!
    const fill = DROP_FILL[i]!
    const disabled = remaining <= 0
    ctx.globalAlpha = disabled ? 0.45 : 1
    glow(ctx, fill, disabled ? 0 : 8)
    ctx.beginPath()
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1.5
    ctx.stroke()
    // 徽标：该原色已滴数。
    ctx.beginPath()
    ctx.arc(btn.x + btn.r * 0.8, btn.y - btn.r * 0.8, 10, 0, Math.PI * 2)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = THEME.text
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillText(String(view.usedPer[i] ?? 0), btn.x + btn.r * 0.8, btn.y - btn.r * 0.8 + 0.5)
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText(DROP_KEY[i]!, btn.x, btn.y + btn.r + 14)
    ctx.globalAlpha = 1
  }
  // 提交键：滴数未满且已有滴剂时可提前提交。
  const canSubmit = view.status === 'playing' && view.drops.length > 0 && remaining > 0
  roundRectPath(ctx, SUBMIT_X, SUBMIT_Y, SUBMIT_W, SUBMIT_H, 8)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = canSubmit ? THEME.accents[1]! : THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.globalAlpha = canSubmit ? 1 : 0.55
  ctx.fillStyle = THEME.text
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.fillText('空格 提交', SUBMIT_X + SUBMIT_W / 2, SUBMIT_Y + SUBMIT_H / 2)
  ctx.globalAlpha = 1
  ctx.textBaseline = 'alphabetic'
}

/** 涟漪：滴入点扩散淡出的圆环。 */
function drawRipples(ctx: CanvasRenderingContext2D, view: ColorMixView): void {
  for (const ripple of view.ripples) {
    const t = ripple.age / ripple.maxAge
    ctx.globalAlpha = (1 - t) * 0.8
    ctx.beginPath()
    ctx.arc(ripple.x, ripple.y, 8 + t * 34, 0, Math.PI * 2)
    ctx.strokeStyle = ripple.color
    ctx.lineWidth = 2.5 * (1 - t) + 0.5
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/**
 * 绘制一帧。
 */
export function renderColorMix(ctx: CanvasRenderingContext2D, view: ColorMixView): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD 条：分数 / 关卡与剩余滴数。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  hudPair(ctx, 10, 20, '分数 ', String(view.score), 'left', view.score > 0 ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W - 10, 20, 'L' + (view.levelIdx + 1) + '/5 · 剩滴 ', String(Math.max(0, view.maxDrops - view.drops.length)), 'right')

  drawBlock(ctx, CURRENT_X, view.current, '当前混合', '')
  drawBlock(ctx, TARGET_X, view.target, '目标 · 阈值 ' + view.threshold, view.targetName)
  drawCloseness(ctx, view.distance, view.threshold)
  drawDropButtons(ctx, view)
  drawRipples(ctx, view)

  if (view.status === 'cleared') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', '空格：下一关', THEME.good)
  } else if (view.status === 'failed') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '色差过大', '空格：重试本关 · R：重开', THEME.bad)
  } else if (view.status === 'complete') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '通关大师！', '总分 ' + view.score + ' · 空格：再来一局', THEME.gold)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P：继续 · R：重开', THEME.text)
  }
}
