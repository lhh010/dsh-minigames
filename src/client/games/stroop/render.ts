/**
 * 斯特鲁普画布渲染：居中大字（以墨色着色）+ 底部 6 个色块答题按钮 +
 * 限时进度条，顶部 HUD（命 / 轮次 / 难度 / 得分 / 连击），连击时的火焰
 * 特效由粒子系统提供，结束 / 暂停用共享 overlay。渲染器无状态，所有
 * 状态由 index.ts 传入。
 */
import type { StroopState } from './logic.ts'
import { COLOR_COUNT, COLOR_NAMES, TOTAL_ROUNDS, difficultyLevel } from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 420
export const LOGICAL_H = 520

/** 底部色块按钮布局。 */
const BTN_W = 56
const BTN_H = 48
const BTN_GAP = 10
const BTN_Y = LOGICAL_H - 74

/** 大字颜色：色块 / 墨色共用的 6 色板（鲜明可辨，与词一一对应）。 */
export const INK_COLORS = ['#f7768e', '#9ece6a', '#7aa2f7', '#e0af68', '#bb9af7', '#ff9e64'] as const
/** 按键序号文案（1-6），画在色块下方。 */
const KEY_LABELS = ['1', '2', '3', '4', '5', '6'] as const

/** 轮次进度条几何。 */
const BAR_X = 20
const BAR_W = LOGICAL_W - 40
const BAR_Y = 150
const BAR_H = 8

/** 各色块按钮矩形。 */
function buttonRect(i: number): { x: number; y: number } {
  const total = COLOR_COUNT * BTN_W + (COLOR_COUNT - 1) * BTN_GAP
  const x0 = (LOGICAL_W - total) / 2
  return { x: x0 + i * (BTN_W + BTN_GAP), y: BTN_Y }
}

/**
 * 命中测试：逻辑坐标落在哪个色块按钮上。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 颜色编号 0-5，或 null（未命中）。
 */
export function swatchAt(x: number, y: number): number | null {
  for (let i = 0; i < COLOR_COUNT; i += 1) {
    const { x: bx, y: by } = buttonRect(i)
    if (x >= bx && x <= bx + BTN_W && y >= by && y <= by + BTN_H) return i
  }
  return null
}

/**
 * 画一帧。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param state - 游戏状态。
 * @param timeLimitMs - 当前轮的总限时（进度条满格值）。
 * @param particles - 连击火焰粒子系统（场景绘制后、overlay 前 tick）。
 * @param flash - 作答反馈色（'good' | 'bad' | null），短暂覆盖在大字下。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param dtMs - 本帧毫秒数（供粒子 tick）。
 */
export function renderStroop(
  ctx: CanvasRenderingContext2D,
  state: StroopState,
  timeLimitMs: number,
  particles: { tick(ctx: CanvasRenderingContext2D, dtMs: number): void; burst(x: number, y: number, color: string, count?: number, speed?: number): void },
  flash: 'good' | 'bad' | null,
  paused: boolean,
  dtMs: number,
): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：命 / 轮次 / 难度（左），得分（右）。
  hudPair(ctx, 16, 21, '命', '❤'.repeat(state.lives) || '—')
  hudPair(ctx, 96, 21, '轮', String(Math.min(state.round + 1, TOTAL_ROUNDS)) + '/' + String(TOTAL_ROUNDS))
  const level = difficultyLevel(state.round)
  hudPair(ctx, 190, 21, '难度', '★'.repeat(level))
  hudPair(ctx, LOGICAL_W - 16, 21, '得分', String(state.score), 'right', THEME.gold)

  // 限时进度条：随剩余时间缩短，末段转红。
  const frac = state.phase === 'prompt' ? Math.max(0, Math.min(1, state.remainingMs / timeLimitMs)) : 0
  roundRectPath(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, 4)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  const barColor = frac > 0.35 ? THEME.good : THEME.bad
  if (frac > 0) {
    glow(ctx, barColor, 5)
    roundRectPath(ctx, BAR_X, BAR_Y, BAR_W * frac, BAR_H, 4)
    ctx.fillStyle = barColor
    ctx.fill()
    noGlow(ctx)
  }

  // 居中大字：字义为词，墨色为填充色。
  const inkColor = INK_COLORS[state.ink] ?? THEME.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 96px system-ui, sans-serif'
  glow(ctx, inkColor, 18)
  ctx.fillStyle = inkColor
  ctx.fillText(COLOR_NAMES[state.word] ?? '?', LOGICAL_W / 2, 260)
  noGlow(ctx)

  // 作答反馈：大字下方的短横线闪绿 / 红。
  if (flash !== null) {
    ctx.fillStyle = flash === 'good' ? THEME.good : THEME.bad
    ctx.fillRect(LOGICAL_W / 2 - 28, 322, 56, 4)
  }

  // 连击火焰：连击 ≥2 时在进度条上方显示火焰 + 连击数。
  if (state.combo >= 2) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 22px system-ui, sans-serif'
    glow(ctx, THEME.gold, 10)
    ctx.fillStyle = THEME.gold
    ctx.fillText('🔥 x' + String(state.combo), LOGICAL_W / 2, BAR_Y - 22)
    noGlow(ctx)
  }

  // 底部色块答题按钮（当前墨色对应块微亮提示由 flash 承担，按钮常亮等权）。
  for (let i = 0; i < COLOR_COUNT; i += 1) {
    const { x, y } = buttonRect(i)
    const color = INK_COLORS[i] ?? THEME.text
    glow(ctx, color, 6)
    roundRectPath(ctx, x, y, BTN_W, BTN_H, 10)
    ctx.fillStyle = color
    ctx.fill()
    noGlow(ctx)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.bgTop
    ctx.fillText(KEY_LABELS[i] ?? '?', x + BTN_W / 2, y + BTN_H / 2)
  }
  ctx.textBaseline = 'alphabetic'

  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('按【墨色】作答 · 不是字义', LOGICAL_W / 2, LOGICAL_H - 12)

  // 连击火焰粒子在场景之上、overlay 之下推进。
  particles.tick(ctx, dtMs)

  if (state.phase === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', '得分 ' + String(state.score) + ' · 最高连击 x' + String(state.bestCombo) + ' · 按 R 重开', THEME.bad)
  } else if (state.phase === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关', '得分 ' + String(state.score) + ' · 最高连击 x' + String(state.bestCombo) + ' · 按 R 重开', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}

/** 便捷工厂：返回共享粒子系统（连击火焰特效用）。 */
export function createStroopParticles(): ReturnType<typeof createParticles> {
  return createParticles()
}
