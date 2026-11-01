/**
 * 合成大西瓜渲染层：黄色警戒线（危险时脉冲增亮）、左右墙与地面、各级
 * 水果彩色圆 + 高光与表情、投放位引导线与手上水果（冷却半透明）、下一
 * 个水果预览、HUD 分数/下一个/最高级、合成爆裂粒子与浮字、暂停/结束
 * 遮罩。粒子为渲染层私有，消费 logic 产生的 merge 事件。
 */
import {
  W,
  H,
  WALL_L,
  WALL_R,
  FLOOR_Y,
  WARN_Y,
  DROP_Y,
  FRUIT_NAMES,
  clampDropX,
  fruitRadius,
  type SuikaState,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 各级水果主色（樱桃红→西瓜绿）。 */
const FRUIT_COLORS = [
  '#f7768e', '#ff5d8f', '#9d7cd8', '#e0c341', '#ff9e64',
  '#e06c60', '#9ece6a', '#f2a0b5', '#e6b450', '#b6d94c', '#4caf6d',
] as const
/** 水果描边色统一用深色半透明。 */
const EDGE = 'rgba(21,21,27,0.45)'
/** 警戒线黄色。 */
const WARN_COLOR = '#e0c341'
/** 墙体色。 */
const WALL_COLOR = '#2a2a3a'

/**
 * 画容器：左右墙、地面与警戒线。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态（警戒线随危险度增亮）。
 */
function drawArena(ctx: CanvasRenderingContext2D, state: SuikaState): void {
  ctx.fillStyle = WALL_COLOR
  ctx.fillRect(0, WARN_Y - 10, WALL_L, H - WARN_Y + 10)
  ctx.fillRect(WALL_R, WARN_Y - 10, W - WALL_R, H - WARN_Y + 10)
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)
  ctx.strokeStyle = 'rgba(52,52,74,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(WALL_L, FLOOR_Y)
  ctx.lineTo(WALL_R, FLOOR_Y)
  ctx.moveTo(WALL_L, WARN_Y - 10)
  ctx.lineTo(WALL_L, H)
  ctx.moveTo(WALL_R, WARN_Y - 10)
  ctx.lineTo(WALL_R, H)
  ctx.stroke()

  // 警戒线：虚线黄；越线累积越多越亮并脉动。
  const danger = state.phase === 'over' ? 1 : Math.min(1, state.overMs / 900)
  const pulse = 0.6 + 0.4 * Math.sin(state.t / 90)
  ctx.save()
  ctx.globalAlpha = 0.45 + danger * pulse * 0.55
  ctx.strokeStyle = WARN_COLOR
  ctx.lineWidth = 2 + danger * 2
  glow(ctx, WARN_COLOR, danger * 8)
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.moveTo(WALL_L, WARN_Y)
  ctx.lineTo(WALL_R, WARN_Y)
  ctx.stroke()
  ctx.restore()
}

/**
 * 画一个水果：主色圆 + 描边 + 左上高光 + 简单表情（双眼与笑口）。
 * @param ctx - 画布上下文。
 * @param x - 圆心 x。
 * @param y - 圆心 y。
 * @param level - 水果等级。
 */
function drawFruit(ctx: CanvasRenderingContext2D, x: number, y: number, level: number): void {
  const r = fruitRadius(level)
  const color = FRUIT_COLORS[level] ?? FRUIT_COLORS[FRUIT_COLORS.length - 1]!
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  glow(ctx, color, 8)
  ctx.fill()
  noGlow(ctx)
  ctx.lineWidth = 2
  ctx.strokeStyle = EDGE
  ctx.stroke()
  // 左上高光。
  ctx.beginPath()
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fill()
  // 表情：双眼 + 笑口（小果只画点状眼）。
  const eye = Math.max(1.6, r * 0.09)
  ctx.fillStyle = 'rgba(21,21,27,0.85)'
  ctx.beginPath()
  ctx.arc(x - r * 0.28, y - r * 0.08, eye, 0, Math.PI * 2)
  ctx.arc(x + r * 0.28, y - r * 0.08, eye, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y + r * 0.12, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.lineWidth = Math.max(1.5, r * 0.07)
  ctx.strokeStyle = 'rgba(21,21,27,0.7)'
  ctx.stroke()
}

/**
 * 消费逻辑事件（合成爆裂粒子）并推进粒子。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param dtMs - 距上帧 ms。
 */
function tickEffects(ctx: CanvasRenderingContext2D, state: SuikaState, dtMs: number): void {
  for (const ev of state.events) {
    if (ev.type === 'merge') {
      particles.burst(ev.x, ev.y, FRUIT_COLORS[ev.level] ?? WARN_COLOR, ev.bonus ? 26 : 13, ev.bonus ? 220 : 150)
    }
  }
  particles.tick(ctx, dtMs)
}

/**
 * 画完整一帧。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 * @param dtMs - 距上帧 ms（粒子推进用）。
 */
export function renderSuika(ctx: CanvasRenderingContext2D, state: SuikaState, paused: boolean, dtMs: number): void {
  drawBackground(ctx, W, H)
  drawArena(ctx, state)

  // 场上水果。
  for (const f of state.fruits) drawFruit(ctx, f.x, f.y, f.level)

  // 投放位：引导虚线 + 手上水果（冷却中半透明示忙）。
  if (state.phase === 'play' && !paused) {
    const r = fruitRadius(state.next)
    const x = clampDropX(state.dropX, state.next)
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 8])
    ctx.beginPath()
    ctx.moveTo(x, DROP_Y + r)
    ctx.lineTo(x, WARN_Y)
    ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = state.cooldownMs > 0 ? 0.45 : 1
    drawFruit(ctx, x, DROP_Y, state.next)
    ctx.restore()
  }

  // HUD：分数（左）、最高级（右）。
  hudPair(ctx, WALL_L + 8, 22, '分数', String(state.score))
  hudPair(ctx, W - 12, 22, '最高', FRUIT_NAMES[state.topLevel] ?? FRUIT_NAMES[0]!, 'right', THEME.gold)

  // 下一个预览（右上小盒）。
  const boxX = W - 86
  const boxY = 34
  ctx.fillStyle = THEME.panel
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, 62, 52, 8)
  ctx.fill()
  ctx.stroke()
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('下一个', boxX + 31, boxY + 13)
  const prevR = Math.min(16, fruitRadius(state.next))
  ctx.save()
  ctx.translate(boxX + 31, boxY + 33)
  ctx.scale(prevR / fruitRadius(state.next), prevR / fruitRadius(state.next))
  drawFruit(ctx, 0, 0, state.next)
  ctx.restore()

  // 粒子与浮字。
  tickEffects(ctx, state, paused ? 0 : dtMs)
  state.events.length = 0
  for (const f of state.floats) {
    const alpha = 1 - f.life / 950
    ctx.globalAlpha = alpha
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    glow(ctx, THEME.gold, 6)
    ctx.fillText(f.text, f.x, f.y)
    noGlow(ctx)
    ctx.globalAlpha = 1
  }

  if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 最高合成 ' + (FRUIT_NAMES[state.topLevel] ?? FRUIT_NAMES[0]!) + ' · R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, W, H, '已暂停', 'P 继续 · R 重开')
  }
}
