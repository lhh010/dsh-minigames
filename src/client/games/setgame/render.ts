/**
 * 疾速集合 SET 画布渲染：经典 SET 卡牌（红/绿/紫 × 菱/椭圆/波浪 × 实/空/
 * 条纹 × 1-3 个），选中卡浮起 + 金边，教学闪边，成功三卡飞出 + 粒子，错误
 * 震动，剩余牌堆 / 时间 / 集合数 HUD，结束 / 暂停 overlay。渲染器无状态，
 * 动画进度由 index.ts 以视图参数传入。
 */
import type { SetGameState } from './logic.ts'
import { TABLE_MAX, colorOf, countOf, fillOf, shapeOf, targetSets } from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 440
export const LOGICAL_H = 680

/** 牌面三色（红/绿/紫）。 */
export const SET_COLORS = ['#f7768e', '#9ece6a', '#bb9af7'] as const
/** 牌面底色与描边。 */
const CARD_FACE = '#f0eee6'
const CARD_EDGE = '#3b3b52'

/** 牌区几何。 */
const BOARD_X = 16
const BOARD_Y = 66
const BOARD_W = LOGICAL_W - BOARD_X * 2
const BOARD_H = LOGICAL_H - BOARD_Y - 14
const CARD_GAP = 8

/** 每行/列布局：12 张 4×3，13-15 张 3×5。 */
function gridOf(count: number): { cols: number, rows: number, cw: number, ch: number } {
  const cols = count > 12 ? 3 : 4
  const rows = Math.max(1, Math.ceil(count / cols))
  const cw = Math.floor((BOARD_W - (cols - 1) * CARD_GAP) / cols)
  const ch = Math.floor(Math.min(150, (BOARD_H - (rows - 1) * CARD_GAP) / rows))
  return { cols, rows, cw, ch }
}

/**
 * 第 index 张桌面牌的槽位矩形（逻辑坐标）。
 * @param index - 桌面槽位下标。
 * @param count - 桌面张数。
 * @returns 左上角与宽高。
 */
export function cardRect(index: number, count: number): { x: number, y: number, w: number, h: number } {
  const { cols, rows, cw, ch } = gridOf(count)
  const row = Math.floor(index / cols)
  const col = index % cols
  const usedH = rows * ch + (rows - 1) * CARD_GAP
  const y0 = BOARD_Y + Math.max(0, (BOARD_H - usedH) / 2)
  return { x: BOARD_X + col * (cw + CARD_GAP), y: y0 + row * (ch + CARD_GAP), w: cw, h: ch }
}

/**
 * 命中测试：逻辑坐标落在哪张桌面牌上。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param count - 桌面张数。
 * @returns 槽位下标或 null。
 */
export function cardAt(x: number, y: number, count: number): number | null {
  for (let i = 0; i < count; i += 1) {
    const r = cardRect(i, count)
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i
  }
  return null
}

/** 在以 (cx,cy) 为中心、宽 sw 高 sh 的槽内构建第 shape 种形状路径。 */
function shapePath(ctx: CanvasRenderingContext2D, shape: number, cx: number, cy: number, sw: number, sh: number): void {
  ctx.beginPath()
  if (shape === 0) {
    // 菱形
    ctx.moveTo(cx, cy - sh / 2)
    ctx.lineTo(cx + sw / 2, cy)
    ctx.lineTo(cx, cy + sh / 2)
    ctx.lineTo(cx - sw / 2, cy)
    ctx.closePath()
  } else if (shape === 1) {
    // 椭圆
    ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  } else {
    // 波浪（S 形胶囊）
    const w2 = sw / 2
    const h2 = sh / 2
    ctx.moveTo(cx - w2, cy + h2 * 0.45)
    ctx.bezierCurveTo(cx - w2 * 0.45, cy - h2, cx + w2 * 0.45, cy + h2, cx + w2, cy - h2 * 0.45)
    ctx.bezierCurveTo(cx + w2 * 0.55, cy - h2 * 0.05, cx + w2 * 0.35, cy + h2 * 0.25, cx + w2 * 0.35, cy + h2 * 0.3)
    ctx.bezierCurveTo(cx + w2 * 0.2, cy + h2 * 0.75, cx - w2 * 0.35, cy + h2 * 0.4, cx - w2 * 0.5, cy + h2 * 0.35)
    ctx.bezierCurveTo(cx - w2 * 0.62, cy + h2 * 0.55, cx - w2 * 0.55, cy + h2 * 0.6, cx - w2, cy + h2 * 0.45)
    ctx.closePath()
  }
}

/**
 * 画一张 SET 牌：面数 n 的形状、按填充值实/空/条纹着色。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param card - 牌号 0-80。
 * @param x - 左上角横坐标。
 * @param y - 左上角纵坐标（已含浮起偏移）。
 * @param w - 牌宽。
 * @param h - 牌高。
 */
export function drawSetCard(ctx: CanvasRenderingContext2D, card: number, x: number, y: number, w: number, h: number): void {
  roundRectPath(ctx, x, y, w, h, 10)
  ctx.fillStyle = CARD_FACE
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = CARD_EDGE
  ctx.stroke()

  const color = SET_COLORS[colorOf(card)] ?? THEME.text
  const n = countOf(card) + 1
  const shape = shapeOf(card)
  const fill = fillOf(card)
  const sw = Math.min(26, (w - 24) / n - 6)
  const sh = Math.min(40, h - 40)
  const totalW = n * sw + (n - 1) * 6
  const x0 = x + (w - totalW) / 2 + sw / 2
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + i * (sw + 6)
    const cy = y + h / 2
    shapePath(ctx, shape, cx, cy, sw, sh)
    if (fill === 0) {
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = color
      ctx.stroke()
    } else if (fill === 1) {
      ctx.lineWidth = 3
      ctx.strokeStyle = color
      ctx.stroke()
    } else {
      // 条纹：裁剪形状后画斜线，再描边。
      ctx.save()
      ctx.clip()
      ctx.lineWidth = 3
      ctx.strokeStyle = color
      for (let s = -sh; s < sw + sh; s += 7) {
        ctx.beginPath()
        ctx.moveTo(cx - sw / 2 + s, cy + sh)
        ctx.lineTo(cx - sw / 2 + s + sh, cy - sh)
        ctx.stroke()
      }
      ctx.restore()
      shapePath(ctx, shape, cx, cy, sw, sh)
      ctx.lineWidth = 2
      ctx.strokeStyle = color
      ctx.stroke()
    }
  }
}

/** 成功飞出动画中的一张牌。 */
export interface FlyCard { card: number, x: number, y: number, w: number, h: number }

/** 渲染视图参数（动画进度与粒子由 index.ts 维护）。 */
export interface SetView {
  paused: boolean
  /** 错误震动剩余毫秒（0 = 不震）。 */
  shakeMs: number
  /** 飞出动画（cards + 0..1 进度），null = 无。 */
  fly: { cards: FlyCard[], progress: number } | null
  /** 教学闪边三元组（logic.tutorSet 的结果）。 */
  hint: [number, number, number] | null
  /** 动画时钟（毫秒），驱动闪边脉冲。 */
  timeMs: number
  /** 成功粒子系统（场景后、overlay 前 tick）。 */
  particles: ReturnType<typeof createParticles>
}

/**
 * 画一帧。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param state - 游戏状态。
 * @param view - 视图参数。
 * @param dtMs - 本帧毫秒数（供粒子 tick）。
 */
export function renderSetGame(ctx: CanvasRenderingContext2D, state: SetGameState, view: SetView, dtMs: number): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  ctx.save()
  if (view.shakeMs > 0) {
    const amp = Math.min(1, view.shakeMs / 200) * 7
    ctx.translate(Math.sin(view.timeMs / 22) * amp, 0)
  }

  // HUD：牌堆 / 集合（本关目标）/ 关卡（左），得分（右），时间（中）。
  hudPair(ctx, 16, 21, '牌堆', String(state.deck.length))
  hudPair(ctx, 84, 21, '集合', String(state.levelSets) + '/' + String(targetSets(state.level)))
  hudPair(ctx, 186, 21, '关卡', 'Lv' + String(state.level))
  hudPair(ctx, LOGICAL_W - 16, 21, '得分', String(state.score), 'right', THEME.gold)
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  if (state.practice) {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('练习模式 · 不限时', LOGICAL_W / 2, 42)
  } else {
    const secs = Math.ceil(state.timeLeftMs / 1000)
    const mm = Math.floor(secs / 60)
    const ss = secs % 60
    const low = state.timeLeftMs < 30000
    ctx.fillStyle = low ? THEME.bad : THEME.text
    ctx.fillText('剩余 ' + String(mm) + ':' + (ss < 10 ? '0' : '') + String(ss), LOGICAL_W / 2, 42)
  }

  // 桌面牌
  const count = state.table.length
  for (let i = 0; i < count; i += 1) {
    const r = cardRect(i, count)
    const selected = state.selected.includes(i)
    const hinted = view.hint !== null && view.hint.includes(i)
    let dy = 0
    if (selected) dy = -8
    // 底部阴影感：选中时轻微投影
    if (selected) {
      roundRectPath(ctx, r.x + 2, r.y + 4, r.w, r.h, 10)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fill()
    }
    drawSetCard(ctx, state.table[i]!, r.x, r.y + dy, r.w, r.h)
    if (selected) {
      glow(ctx, THEME.gold, 10)
      roundRectPath(ctx, r.x - 1.5, r.y + dy - 1.5, r.w + 3, r.h + 3, 11)
      ctx.lineWidth = 3
      ctx.strokeStyle = THEME.gold
      ctx.stroke()
      noGlow(ctx)
    } else if (hinted) {
      const pulse = 0.5 + 0.5 * Math.sin(view.timeMs / 180)
      ctx.globalAlpha = 0.45 + 0.55 * pulse
      glow(ctx, THEME.gold, 8)
      roundRectPath(ctx, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 11)
      ctx.lineWidth = 3
      ctx.strokeStyle = THEME.gold
      ctx.stroke()
      noGlow(ctx)
      ctx.globalAlpha = 1
    }
  }

  // 成功飞出：三张牌向上淡出缩小。
  if (view.fly !== null && view.fly.progress < 1) {
    const p = view.fly.progress
    const lift = p * 140
    ctx.globalAlpha = 1 - p
    for (const fc of view.fly.cards) {
      const k = 1 - p * 0.4
      drawSetCard(ctx, fc.card, fc.x + (fc.w * (1 - k)) / 2, fc.y - lift + (fc.h * (1 - k)) / 2, fc.w * k, fc.h * k)
    }
    ctx.globalAlpha = 1
  }

  ctx.restore()

  view.particles.tick(ctx, dtMs)

  if (state.phase === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束',
      '得分 ' + String(state.score) + ' · 集合 x' + String(state.setsFound) + ' · Lv' + String(state.level) + ' · 按 R 重开',
      THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  } else if (state.table.length >= TABLE_MAX) {
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('桌面已满 15 张 · 找出其中隐藏的集合', LOGICAL_W / 2, LOGICAL_H - 4)
  }
}

/** 便捷工厂：返回共享粒子系统（成功庆祝特效用）。 */
export function createSetParticles(): ReturnType<typeof createParticles> {
  return createParticles()
}
