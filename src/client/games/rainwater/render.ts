/**
 * 接雨水 canvas 渲染：共享主题包 + 剖面柱子（蓝色系——地形基座深蓝、
 * 玩家加高的砖亮蓝）、每列蓄水格半透明青色高亮、水面微光线、目标水量 /
 * 当前水量 / 砖块预算 HUD（hudPair）与过关 / 通关 / 暂停 overlay
 * （drawOverlay）。全部无状态：每帧从 RainwaterState 现算现画。
 */
import { H, LEVEL_COUNT, MAX_H, W, totalWater, waterColumns, type RainwaterState } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const HUD_H = 30
const PAD = 20
/** 底部提示行高度。 */
const FOOT_H = 24
/** 地面基线 y。 */
const GROUND_Y = H - FOOT_H - PAD
/** 柱区顶 y（HUD 之下留一格防溢出）。 */
const TOP_Y = HUD_H + 14
const CELL = (GROUND_Y - TOP_Y) / MAX_H

/** 地形基座色（深蓝）。 */
const BASE_FILL = '#2d4a7a'
/** 玩家放置砖块色（亮蓝）。 */
const BRICK_FILL = '#7aa2f7'
/** 蓄水格半透明青色。 */
const WATER_FILL = 'rgba(125,207,255,0.42)'
/** 水面线色。 */
const WATER_LINE = '#73daca'

/**
 * 计算某列的绘制矩形（x / 宽）。
 * @param s - 状态。
 * @param col - 列号。
 * @returns 列左缘 x 与列宽。
 */
export function columnRect(s: RainwaterState, col: number): { x: number, w: number } {
  const margin = 36
  const w = (W - margin * 2) / s.heights.length
  return { x: margin + col * w + w * 0.12, w: w * 0.76 }
}

/**
 * 命中测试：逻辑坐标 x 落在哪一列（任意高度均可点击）。
 * @param s - 状态。
 * @param x - 逻辑 x。
 * @returns 列号，未命中返回 null。
 */
export function columnAt(s: RainwaterState, x: number): number | null {
  const margin = 36
  const w = (W - margin * 2) / s.heights.length
  const col = Math.floor((x - margin) / w)
  if (col < 0 || col >= s.heights.length) return null
  return col
}

/**
 * 绘制一帧。
 * @param ctx - 已应用逻辑坐标变换的 2d 上下文。
 * @param s - 当前对局状态。
 * @param paused - 是否暂停（画暂停 overlay）。
 */
export function renderRainwater(ctx: CanvasRenderingContext2D, s: RainwaterState, paused: boolean): void {
  ctx.clearRect(0, 0, W, H)
  drawBackground(ctx, W, H)

  const water = waterColumns(s.heights)
  const current = totalWater(s.heights)

  // 地面线。
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, GROUND_Y + 1)
  ctx.lineTo(W - PAD, GROUND_Y + 1)
  ctx.stroke()

  // 逐列：地形基座 + 玩家砖 + 蓄水格。
  for (let i = 0; i < s.heights.length; i += 1) {
    const { x, w } = columnRect(s, i)
    const h = s.heights[i]!
    const b = s.base[i]!
    const top = GROUND_Y - h * CELL
    // 地形基座（深蓝）。
    ctx.fillStyle = BASE_FILL
    roundRectPath(ctx, x, GROUND_Y - b * CELL, w, b * CELL, 3)
    ctx.fill()
    // 玩家放置的砖（亮蓝，带微光）。
    if (h > b) {
      glow(ctx, BRICK_FILL, 6)
      ctx.fillStyle = BRICK_FILL
      roundRectPath(ctx, x, top, w, (h - b) * CELL, 3)
      ctx.fill()
      noGlow(ctx)
    }
    // 蓄水格高亮 + 水面线。
    const cells = water[i]!
    if (cells > 0) {
      ctx.fillStyle = WATER_FILL
      const wt = GROUND_Y - (h + cells) * CELL
      ctx.fillRect(x, wt, w, cells * CELL)
      ctx.strokeStyle = WATER_LINE
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, wt + 1)
      ctx.lineTo(x + w, wt + 1)
      ctx.stroke()
    }
  }

  // HUD：关卡、水量（当前/目标）、砖块预算。
  hudPair(ctx, PAD, 20, '关卡', s.level + '/' + LEVEL_COUNT)
  const done = current >= s.target
  hudPair(ctx, W / 2, 20, '水量', current + '/' + s.target, 'center', done ? THEME.good : THEME.text)
  hudPair(ctx, W - PAD, 20, '砖块', s.budget - s.bricksUsed + ' 剩', 'right', s.bricksUsed >= s.budget ? THEME.bad : THEME.text)

  // 底部操作提示 / 非法操作提示。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = s.hint === '' ? THEME.textMuted : THEME.gold
  const foot = s.hint === '' ? '左键：加高 · 右键/Shift+点击：拆砖 · R：重开 · P：暂停' : s.hint
  ctx.fillText(foot, W / 2, H - 10)

  if (s.phase === 'won') {
    if (s.finished) {
      drawOverlay(ctx, W, H, '全部通关', '总分 ' + s.totalScore + ' · 按 R 再来一局', THEME.gold)
    } else {
      drawOverlay(ctx, W, H, '第 ' + s.level + ' 关蓄满', '得分 ' + s.levelScore + ' · 即将进入下一关', THEME.good)
    }
  } else if (paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续', THEME.textMuted)
  }
}
