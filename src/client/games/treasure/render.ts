/**
 * 寻宝猎人渲染层：海岛风盘面（沙滩底 + 草地 / 椰树 / 岩石 / 灌木装饰格）、
 * 探测点标记（序号 + 反馈色圈）、同心圆助手参考线（最近两次探测点到其
 * 参考目标的等距圆）、提示排除区斜纹、右侧探测历史列表（坐标 + 反馈
 * 图标）、得分 / 关卡 / 探测次数 / 阶段 HUD、过关（宝箱粒子）与失败 /
 * 暂停遮罩。全部为纯 canvas 绘制，特效仅为对逻辑状态的观察。
 */
import type { Feedback, TreasureState } from './logic.ts'
import { LEVELS, referenceDist2 } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 单元边长（逻辑像素）。 */
export const CELL = 30
/** HUD 高度。 */
export const HUD_H = 34
/** 盘面区宽度（按最大关卡 16 列预留并居中）。 */
export const BOARD_W = 16 * CELL
/** 右侧历史侧栏宽度。 */
export const SIDEBAR_W = 186
/** 逻辑画布总宽。 */
export const LOGICAL_W = 20 + BOARD_W + 16 + SIDEBAR_W
/** 逻辑画布总高（HUD + 最大 12 行 + 底边距）。 */
export const LOGICAL_H = HUD_H + 12 * CELL + 24

const SAND = '#d8c08a'
const SAND_DARK = '#c9ad74'
const GRASS = '#7ca85a'
const BUSH = '#4e7d3f'
const ROCK = '#8d8d99'
const TRUNK = '#8a6a42'
const LEAF = '#5da24b'
const WATER_LINE = 'rgba(122,162,247,0.25)'

const FEEDBACK_COLOR: Record<Feedback, string> = {
  first: THEME.gold,
  hotter: '#f7768e',
  colder: '#7dcfff',
  same: THEME.textMuted,
}
const FEEDBACK_ICON: Record<Feedback, string> = {
  first: '·',
  hotter: '🔥',
  colder: '🧊',
  same: '➖',
}

// 渲染侧特效状态：粒子池、帧钟、上一帧阶段与得分（观察逻辑状态）。
const particles = createParticles()
let prevPhase = 'probe'
let prevScore = 0
let prevFrameMs = 0

/** 是否还有存活的过关粒子（index 据此在 dirty 模式下继续重绘）。 */
export function treasureEffectsActive(): boolean {
  return particles.size() > 0
}

/** 盘面绘制原点（当前关卡盘面在预留区内居中）。 */
function boardOrigin(state: TreasureState): { x: number, y: number } {
  return {
    x: 20 + (BOARD_W - state.cols * CELL) / 2,
    y: HUD_H + (12 * CELL - state.rows * CELL) / 2,
  }
}

/** 绘制一处地形装饰（草地草簇 / 椰树 / 岩石 / 灌木；沙滩仅底色）。 */
function drawDecor(ctx: CanvasRenderingContext2D, decor: string, x: number, y: number): void {
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  if (decor === 'grass') {
    ctx.strokeStyle = GRASS
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = -1; i <= 1; i += 1) {
      ctx.moveTo(cx + i * 5, cy + 6)
      ctx.lineTo(cx + i * 5 + i, cy - 2)
    }
    ctx.stroke()
  } else if (decor === 'bush') {
    ctx.fillStyle = BUSH
    ctx.beginPath()
    ctx.arc(cx - 4, cy + 1, 4.5, 0, Math.PI * 2)
    ctx.arc(cx + 4, cy + 1, 4.5, 0, Math.PI * 2)
    ctx.arc(cx, cy - 3, 5, 0, Math.PI * 2)
    ctx.fill()
  } else if (decor === 'palm') {
    ctx.strokeStyle = TRUNK
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx - 2, cy + 8)
    ctx.quadraticCurveTo(cx + 1, cy, cx + 3, cy - 6)
    ctx.stroke()
    ctx.strokeStyle = LEAF
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 4; i += 1) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.7
      ctx.moveTo(cx + 3, cy - 6)
      ctx.lineTo(cx + 3 + Math.cos(a) * 8, cy - 6 + Math.sin(a) * 8)
    }
    ctx.stroke()
  } else if (decor === 'rock') {
    ctx.fillStyle = ROCK
    ctx.beginPath()
    ctx.moveTo(cx - 6, cy + 6)
    ctx.lineTo(cx - 4, cy - 3)
    ctx.lineTo(cx + 3, cy - 6)
    ctx.lineTo(cx + 7, cy + 2)
    ctx.lineTo(cx + 4, cy + 6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(cx - 4, cy - 3)
    ctx.lineTo(cx + 3, cy - 6)
    ctx.lineTo(cx + 2, cy)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param t - 累计秒数（动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderTreasure(ctx: CanvasRenderingContext2D, state: TreasureState, t: number, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const { x: x0, y: y0 } = boardOrigin(state)

  // 过关事件 → 宝箱金色粒子爆发（仅观察逻辑状态）。
  if (state.phase === 'won' && prevPhase !== 'won') {
    const tr = x0 + state.treasure.c * CELL + CELL / 2
    const tc = y0 + state.treasure.r * CELL + CELL / 2
    particles.burst(tr, tc, THEME.gold, 26, 170)
    particles.burst(tr, tc, accent(4), 14, 120)
  }
  if (state.score > prevScore) {
    const last = state.history[state.history.length - 1]
    if (last !== undefined) particles.burst(x0 + last.c * CELL + CELL / 2, y0 + last.r * CELL + CELL / 2, THEME.good, 12, 130)
  }
  prevPhase = state.phase
  prevScore = state.score

  // 盘面：沙滩棋盘底 + 装饰 + 网格线。
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const x = x0 + c * CELL
      const y = y0 + r * CELL
      ctx.fillStyle = (r + c) % 2 === 0 ? SAND : SAND_DARK
      ctx.fillRect(x, y, CELL, CELL)
      drawDecor(ctx, state.decor[r]![c]!, x, y)
    }
  }
  ctx.strokeStyle = WATER_LINE
  ctx.lineWidth = 1
  ctx.strokeRect(x0 - 3.5, y0 - 3.5, state.cols * CELL + 7, state.rows * CELL + 7)
  roundRectPath(ctx, x0 - 3, y0 - 3, state.cols * CELL + 6, state.rows * CELL + 6, 6)
  ctx.stroke()

  // 同心圆助手：最近两次探测点到各自参考目标的等距圆参考线。
  if (state.helperOn && state.history.length > 0) {
    const recent = state.history.slice(-2)
    ctx.save()
    recent.forEach((p, i) => {
      const px = x0 + p.c * CELL + CELL / 2
      const py = y0 + p.r * CELL + CELL / 2
      const radius = Math.sqrt(referenceDist2(state, p.r, p.c)) * CELL
      ctx.strokeStyle = i === recent.length - 1 ? 'rgba(224,175,104,0.85)' : 'rgba(122,162,247,0.5)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 5])
      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      ctx.stroke()
    })
    ctx.restore()
  }

  // 提示排除区：斜纹暗化。
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (!state.excluded[r]![c]) continue
      const x = x0 + c * CELL
      const y = y0 + r * CELL
      ctx.fillStyle = 'rgba(13,13,20,0.45)'
      ctx.fillRect(x, y, CELL, CELL)
      ctx.strokeStyle = 'rgba(226,226,238,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 4, y + CELL - 4)
      ctx.lineTo(x + CELL - 4, y + 4)
      ctx.stroke()
    }
  }

  // 探测点标记：序号 + 反馈色圈。
  state.history.forEach((p, i) => {
    const x = x0 + p.c * CELL + CELL / 2
    const y = y0 + p.r * CELL + CELL / 2
    const color = FEEDBACK_COLOR[p.feedback]
    glow(ctx, color, 6)
    ctx.fillStyle = 'rgba(21,21,27,0.85)'
    ctx.beginPath()
    ctx.arc(x, y, CELL * 0.38, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
    noGlow(ctx)
    ctx.fillStyle = color
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), x, y + 4)
  })

  // 终局揭示：真宝藏宝箱 + 假宝藏叉标。
  if (state.phase === 'won' || state.phase === 'lost') {
    const tr = state.treasure
    const tx = x0 + tr.c * CELL
    const ty = y0 + tr.r * CELL
    glow(ctx, THEME.gold, 12)
    ctx.fillStyle = '#9a6b35'
    roundRectPath(ctx, tx + 5, ty + 8, CELL - 10, CELL - 14, 3)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = THEME.gold
    ctx.fillRect(tx + 5, ty + 13, CELL - 10, 3)
    for (const f of state.fakes) {
      const fx = x0 + f.c * CELL + CELL / 2
      const fy = y0 + f.r * CELL + CELL / 2
      ctx.strokeStyle = THEME.bad
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(fx - 7, fy - 7)
      ctx.lineTo(fx + 7, fy + 7)
      ctx.moveTo(fx + 7, fy - 7)
      ctx.lineTo(fx - 7, fy + 7)
      ctx.stroke()
    }
  }

  // 右侧历史侧栏。
  const sx = 20 + BOARD_W + 16
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, sx, HUD_H, SIDEBAR_W, LOGICAL_H - HUD_H - 14, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('探测历史', sx + 12, HUD_H + 22)
  ctx.font = '600 12px system-ui, sans-serif'
  if (state.history.length === 0) {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('点击盘面开始探测', sx + 12, HUD_H + 44)
  }
  state.history.forEach((p, i) => {
    const y = HUD_H + 42 + i * 20
    if (y > LOGICAL_H - 24) return
    const color = FEEDBACK_COLOR[p.feedback]
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(String(i + 1).padStart(2, '0') + ' (' + p.c + ',' + p.r + ')', sx + 12, y)
    ctx.fillStyle = color
    ctx.fillText(FEEDBACK_ICON[p.feedback], sx + 86, y)
  })
  if (state.helperOn) {
    ctx.fillStyle = accent(6)
    ctx.fillText('同心圆助手 ON · 计分减半', sx + 12, LOGICAL_H - 44)
  }
  if (state.phase === 'identify') {
    ctx.fillStyle = THEME.gold
    ctx.fillText('指认阶段：点一格指认', sx + 12, LOGICAL_H - 26)
  }

  // HUD：得分 / 关卡 / 探测次数 / 助手与提示状态。
  hudPair(ctx, 10, 22, '得分', String(state.score))
  hudPair(ctx, 120, 22, '关卡', '第' + state.level + '/' + LEVELS.length + '关', 'left', accent(6))
  const probeLabel = state.phase === 'probe' ? '剩 ' + state.probesLeft : state.phase === 'identify' ? '指认中' : '终局'
  hudPair(ctx, 250, 22, '探测', probeLabel, 'left', state.phase === 'identify' ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W - SIDEBAR_W - 24, 22, '助手', state.helperOn ? 'A 开' : 'A 关', 'right', state.helperOn ? accent(6) : THEME.textMuted)
  hudPair(ctx, LOGICAL_W - 10, 22, '提示', state.hintUsed ? '已用' : 'H 可用', 'right', state.hintUsed ? THEME.textMuted : THEME.text)

  // 常驻规则速览：🔥更热=比上次探测点近 · 🧊更冷=更远 · ➖同温=等距；比较对象是「上一次探测点」这一点最容易误解。
  ctx.font = '500 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('🔥更热=比上次探测点更近 · 🧊更冷=更远 · ➖同温=等距 —— 两次探测夹出范围，次数用尽后点击指认', 10, 42)

  // 指认阶段脉冲提示框。
  if (state.phase === 'identify') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5)
    ctx.strokeStyle = 'rgba(224,175,104,' + (0.35 + 0.4 * pulse).toFixed(3) + ')'
    ctx.lineWidth = 2.5
    roundRectPath(ctx, x0 - 6, y0 - 6, state.cols * CELL + 12, state.rows * CELL + 12, 8)
    ctx.stroke()
  }

  particles.tick(ctx, dtMs)

  if (state.phase === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关！', '得分 ' + state.score + ' · 按 R 重新开始', THEME.gold)
  } else if (state.phase === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '寻宝失败', '挖错了地点 · 按 R 重新开始', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
