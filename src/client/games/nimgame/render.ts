/**
 * 取子博弈 Nim 画布渲染器：篝火夜景（星点 + 底部火焰摇曳）、水平火柴
 * 排（当前排高亮、悬停/键盘选取数预览）、玩家/AI 回合指示（AI 思考
 * 动画）、异或局势提示条（绿 安全 / 红 危险 的教学指示）、局数/分数
 * HUD 与暂停/胜负 overlay。渲染器无自有状态，动画相位由调用方传入的
 * timeMs 驱动；命中检测辅助函数供 index.ts 把指针坐标换算成走法。
 */
import type { NimState } from './logic.ts'
import { xorSum } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 460
/** HUD 高度（局数/分数行）。 */
export const HUD_H = 30
/** 回合指示条高度。 */
export const TURN_H = 26
/** 每排火柴带的纵向高度。 */
export const ROW_BAND_H = 38
export const ROWS_TOP = HUD_H + TURN_H + 12
export const HINT_H = 30
export const FIRE_ZONE_H = 84
/** 最多排数下的棋盘总高（布局常量，含提示条与篝火区）。 */
export const LOGICAL_H = ROWS_TOP + 5 * ROW_BAND_H + HINT_H + FIRE_ZONE_H

/** 一根火柴：宽 6、高 26 的木杆 + 顶端火柴头圆点。 */
const STICK_W = 6
const STICK_H = 26
const STICK_GAP = 20
const STICK_STEP = STICK_W + STICK_GAP

/** 某排第一根（最左）火柴的 x：整排居中于逻辑宽度。 */
function rowOriginX(count: number): number {
  return (LOGICAL_W - (count * STICK_STEP - STICK_GAP)) / 2
}

/** 某排火柴带的纵向中心 y。 */
export function rowCenterY(row: number): number {
  return ROWS_TOP + row * ROW_BAND_H + ROW_BAND_H / 2
}

/** 命中检测：逻辑坐标落在哪一排（排带矩形），未命中返回 null。 */
export function rowAt(y: number): number | null {
  const rel = y - ROWS_TOP
  if (rel < 0) return null
  const row = Math.floor(rel / ROW_BAND_H)
  if (row > 4) return null
  return row
}

/**
 * 命中检测：逻辑坐标点到某排第 count 根（从右数起，1..n）的取子步。
 * 排带内的火柴按剩余根数重排，命中第 p 根（左起 0 基）即取 n-p 根。
 * @param x - 逻辑 x 坐标。
 * @param y - 逻辑 y 坐标。
 * @param rows - 各排剩余火柴数。
 * @returns 对应走法；不在任何火柴命中区返回 null。
 */
export function stickAt(x: number, y: number, rows: number[]): { row: number, count: number } | null {
  const row = rowAt(y)
  if (row === null || row >= rows.length) return null
  const n = rows[row]!
  if (n === 0) return null
  const origin = rowOriginX(n)
  for (let p = 0; p < n; p += 1) {
    const cx = origin + p * STICK_STEP + STICK_W / 2
    if (Math.abs(x - cx) <= STICK_STEP / 2) return { row, count: n - p }
  }
  return null
}

/** 画一根竖立火柴：木杆 + 火红圆头，taken 时只画淡影。 */
function drawStick(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  headColor: string, bodyColor: string, alpha: number, lit: boolean,
): void {
  ctx.globalAlpha = alpha
  ctx.fillStyle = bodyColor
  roundRectPath(ctx, cx - STICK_W / 2, cy - STICK_H / 2 + 5, STICK_W, STICK_H - 5, 2)
  ctx.fill()
  ctx.fillStyle = headColor
  if (lit) glow(ctx, headColor, 14)
  ctx.beginPath()
  ctx.arc(cx, cy - STICK_H / 2 + 6, 5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/** 底部篝火：两根交叉木柴 + 随 timeMs 摇曳的双层火焰与外辉光。 */
function drawCampfire(ctx: CanvasRenderingContext2D, cx: number, baseY: number, timeMs: number): void {
  const flicker = Math.sin(timeMs / 90) * 0.5 + Math.sin(timeMs / 37) * 0.5
  // 外辉光。
  const halo = ctx.createRadialGradient(cx, baseY - 22, 4, cx, baseY - 22, 70 + flicker * 8)
  halo.addColorStop(0, 'rgba(224,175,104,0.30)')
  halo.addColorStop(1, 'rgba(224,175,104,0)')
  ctx.fillStyle = halo
  ctx.fillRect(cx - 80, baseY - 92, 160, 100)
  // 木柴。
  ctx.strokeStyle = '#5a4a3a'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  for (const angle of [-0.5, 0.6]) {
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(angle) * 26, baseY - Math.sin(angle) * 10)
    ctx.lineTo(cx + Math.cos(angle) * 26, baseY + Math.sin(angle) * 10)
    ctx.stroke()
  }
  // 双层火焰。
  const flame = (w: number, h: number, color: string, phase: number): void => {
    ctx.fillStyle = color
    glow(ctx, color, 18)
    ctx.beginPath()
    const sway = flicker * phase
    ctx.moveTo(cx - w, baseY - 4)
    ctx.quadraticCurveTo(cx - w * 0.6 + sway, baseY - h * 0.55, cx + sway, baseY - h)
    ctx.quadraticCurveTo(cx + w * 0.6 + sway, baseY - h * 0.55, cx + w, baseY - 4)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
  }
  flame(15 + flicker * 2, 40 + flicker * 5, '#e0af68', 2)
  flame(9 + flicker * 1.5, 26 + flicker * 3, '#f7768e', 4)
}

/** 顶部星点：固定伪随机布局（与时间无关，避免整帧闪烁）。 */
function drawStars(ctx: CanvasRenderingContext2D, timeMs: number): void {
  const stars: Array<[number, number, number]> = [
    [30, 12, 1.4], [74, 30, 1], [120, 10, 1.2], [168, 26, 0.9],
    [300, 14, 1.3], [344, 30, 1], [396, 12, 1.1], [430, 28, 0.9],
    [218, 18, 1],
  ]
  for (let i = 0; i < stars.length; i += 1) {
    const [x, y, r] = stars[i]!
    const tw = 0.55 + 0.45 * Math.abs(Math.sin(timeMs / 700 + i * 1.7))
    ctx.globalAlpha = tw
    ctx.fillStyle = THEME.text
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** 渲染选项（见 index.ts 的调用方持有状态）。 */
export interface RenderOptions {
  /** 键盘/点击选中的当前排，或 null。 */
  selectedRow: number | null
  /** 悬停预览：指向某排第 count 根（从右数）时的发光预览，或 null。 */
  hover: { row: number, count: number } | null
  /** 键盘选定的取子数（1..选中排剩余），或 null。 */
  previewCount: number | null
  /** 赛事总分（HUD）。 */
  score: number
  /** 当前局序号（1 起）。 */
  roundNo: number
  /** AI 思考中（回合指示动画）。 */
  aiThinking: boolean
  /** 动画相位（performance.now() 毫秒）。 */
  timeMs: number
  /** 暂停 overlay。 */
  paused: boolean
  /** 本局结果 overlay 文案（胜/负副标题），或 null。 */
  roundText: string | null
  /** 赛事终局 overlay 文案，或 null。 */
  matchText: string | null
  /** 是否显示异或局势教学提示条。 */
  hintOn: boolean
}

/**
 * 绘制一帧完整画面。
 * @param ctx - 逻辑坐标系下的 2d 上下文。
 * @param w - 逻辑宽度（LOGICAL_W）。
 * @param h - 逻辑高度（LOGICAL_H）。
 * @param state - 当前局面（rows/turn/over）。
 * @param opts - 渲染选项（选中、预览、HUD、overlay）。
 */
export function renderNim(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: NimState, opts: RenderOptions,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)
  drawStars(ctx, opts.timeMs)

  // HUD：局数与总分。
  hudPair(ctx, 10, 21, '局数 ', String(opts.roundNo) + ' / ' + String(5))
  hudPair(ctx, w - 10, 21, '总分 ', String(opts.score), 'right', THEME.gold)

  // 回合指示。
  ctx.textAlign = 'center'
  ctx.font = '600 14px system-ui, sans-serif'
  if (state.over) {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('本局结束', w / 2, 48)
  } else if (opts.aiThinking) {
    const dots = '.'.repeat(1 + Math.floor(opts.timeMs / 350) % 3)
    ctx.fillStyle = accent(1)
    glow(ctx, accent(1), 10)
    ctx.fillText('AI 思考中' + dots, w / 2, 48)
    noGlow(ctx)
  } else {
    ctx.fillStyle = THEME.good
    glow(ctx, THEME.good, 8)
    ctx.fillText('你的回合 · 点排再点第 n 根', w / 2, 48)
    noGlow(ctx)
  }

  // 火柴排。
  for (let row = 0; row < state.rows.length; row += 1) {
    const n = state.rows[row]!
    const cy = rowCenterY(row)
    const selected = row === opts.selectedRow
    if (selected) {
      ctx.fillStyle = 'rgba(122,162,247,0.10)'
      roundRectPath(ctx, 16, cy - ROW_BAND_H / 2 + 2, w - 32, ROW_BAND_H - 4, 8)
      ctx.fill()
    }
    if (n === 0) {
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText('（已取尽）', w / 2, cy + 4)
      continue
    }
    const origin = rowOriginX(n)
    const hovered = opts.hover !== null && opts.hover.row === row ? opts.hover.count : null
    const preview = selected ? opts.previewCount : null
    const headBase = accent(row)
    for (let p = 0; p < n; p += 1) {
      const count = n - p
      const isHover = hovered !== null && count <= hovered
      const isPreview = preview !== null && count <= preview
      const alpha = isHover || isPreview ? 1 : selected ? 0.92 : 0.6
      const head = isHover || isPreview ? THEME.bad : headBase
      const body = isHover || isPreview ? '#d8b48a' : '#8a7a66'
      drawStick(ctx, origin + p * STICK_STEP + STICK_W / 2, cy, head, body, alpha, isHover || isPreview)
    }
    // 排剩余数标签。
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = selected ? THEME.text : THEME.textMuted
    ctx.fillText(String(n), origin - 10, cy + 4)
  }

  // 异或局势提示条（教学向）：轮到你且存在必胜步 → 绿；异或为 0 → 红。
  if (opts.hintOn && !state.over && !opts.aiThinking) {
    const safe = xorSum(state.rows) !== 0
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = safe ? THEME.good : THEME.bad
    glow(ctx, safe ? THEME.good : THEME.bad, 8)
    ctx.fillText(safe ? '局势：安全 —— 异或非零，存在必胜取法' : '局势：危险 —— 异或为零，先取者不利', w / 2, ROWS_TOP + state.rows.length * ROW_BAND_H + 18)
    noGlow(ctx)
  }

  drawCampfire(ctx, w / 2, h - 14, opts.timeMs)

  if (opts.matchText !== null) {
    drawOverlay(ctx, w, h, '全赛落幕', opts.matchText, THEME.gold)
  } else if (opts.roundText !== null) {
    const won = state.loser === 'ai'
    drawOverlay(ctx, w, h, won ? '本局获胜' : '本局失利', opts.roundText, won ? THEME.good : THEME.bad)
  } else if (opts.paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续 · R 重开整赛')
  }
}
