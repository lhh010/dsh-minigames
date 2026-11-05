/**
 * 极速反应渲染层：中央大灯（等待=琥珀呼吸圆环「等待…」，信号=绿色
 * 爆闪「按！」，结果=大号毫秒数字 / 抢按红「太早了」/ 超时红「超时」）、
 * 顶部 HUD（命 / 轮次 / 平均 / 最佳 / 分数）、底部轮次进度点、暂停与
 * 结束遮罩、事件粒子。
 */
import type { ReactionState } from './logic.ts'
import { GO_LIMIT_MS, HIT_SCORE_BASE, HIT_SCORE_MIN, HIT_SCORE_MS_FACTOR, ROUND_COUNT, W, H } from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const WAIT_COLOR = '#e0af68'
const GO_COLOR = '#9ece6a'
const FOUL_COLOR = '#f7768e'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/**
 * 中央指示灯底座：圆角面板 + 呼吸外环。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param color - 当前阶段主色。
 */
function drawDial(ctx: CanvasRenderingContext2D, state: ReactionState, color: string): void {
  const cx = W / 2, cy = H / 2 + 10
  const r = 110
  // 底座面板。
  roundRectPath(ctx, cx - r - 26, cy - r - 26, (r + 26) * 2, (r + 26) * 2, 24)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 呼吸外环。
  const breathe = 1 + Math.sin(state.t / 300) * 0.06
  glow(ctx, color, 18)
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy, r * breathe, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
}

/**
 * 结果展示阶段最近一次命中的得分文案。
 * @param state - 当前状态。
 * @returns 得分数值。
 */
function gainedOf(state: ReactionState): number {
  return Math.max(HIT_SCORE_MIN, Math.round(HIT_SCORE_BASE - (state.lastMs ?? 0) * HIT_SCORE_MS_FACTOR))
}

/**
 * 渲染一帧：背景、指示灯与阶段文案、粒子、HUD、进度点、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderReaction(ctx: CanvasRenderingContext2D, state: ReactionState, paused: boolean): void {
  drawBackground(ctx, W, H)
  const cx = W / 2, cy = H / 2 + 10

  if (state.phase === 'wait') {
    drawDial(ctx, state, WAIT_COLOR)
    ctx.textAlign = 'center'
    ctx.font = 'bold 44px system-ui, sans-serif'
    ctx.fillStyle = WAIT_COLOR
    ctx.fillText('等待…', cx, cy + 14)
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('灯变绿立刻按', cx, cy + 48)
  } else if (state.phase === 'go') {
    // 信号：全屏绿色脉冲 + 大灯爆闪。
    const k = 1 - Math.min(1, state.phaseMs / 500)
    ctx.fillStyle = 'rgba(158,206,106,' + (0.10 + 0.10 * k).toFixed(3) + ')'
    ctx.fillRect(0, 0, W, H)
    drawDial(ctx, state, GO_COLOR)
    glow(ctx, GO_COLOR, 30)
    ctx.fillStyle = GO_COLOR
    ctx.beginPath()
    ctx.arc(cx, cy, 74, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.textAlign = 'center'
    ctx.font = 'bold 52px system-ui, sans-serif'
    ctx.fillStyle = '#10101a'
    ctx.fillText('按！', cx, cy + 16)
  } else if (state.phase === 'feedback') {
    if (state.feedback === 'hit') {
      drawDial(ctx, state, GO_COLOR)
      ctx.textAlign = 'center'
      ctx.font = 'bold 56px system-ui, sans-serif'
      ctx.fillStyle = THEME.text
      ctx.fillText(Math.round(state.lastMs ?? 0) + ' ms', cx, cy + 6)
      ctx.font = '700 18px system-ui, sans-serif'
      ctx.fillStyle = GO_COLOR
      ctx.fillText('+' + gainedOf(state) + ' 分', cx, cy + 40)
    } else {
      drawDial(ctx, state, FOUL_COLOR)
      ctx.textAlign = 'center'
      ctx.font = 'bold 40px system-ui, sans-serif'
      ctx.fillStyle = FOUL_COLOR
      ctx.fillText(state.feedback === 'foul' ? '太早了！' : '超时！', cx, cy + 8)
      ctx.font = '600 14px system-ui, sans-serif'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText(state.feedback === 'foul' ? '信号前按键 -1 命' : '超过 ' + GO_LIMIT_MS + ' ms -1 命', cx, cy + 42)
    }
  } else {
    drawDial(ctx, state, THEME.panelEdge)
    ctx.textAlign = 'center'
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('结束', cx, cy + 10)
  }

  // 消费逻辑事件：命中绿爆、抢按/超时红爆、通关金爆。
  for (const ev of state.events) {
    if (ev.type === 'signal') particles.burst(cx, cy, GO_COLOR, 26, 300)
    else if (ev.type === 'hit') particles.burst(cx, cy, GO_COLOR, 30, 260)
    else if (ev.type === 'foul' || ev.type === 'miss') particles.burst(cx, cy, FOUL_COLOR, 22, 220)
    else if (ev.type === 'complete') particles.burst(cx, cy, THEME.gold, 40, 320)
  }
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：命 / 轮次 / 平均 / 最佳 / 分数。
  const hudY = 18
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = state.lives >= 1 ? THEME.bad : THEME.textMuted
  ctx.fillText(state.lives >= 1 ? '❤'.repeat(state.lives) : '♡', 40, hudY)
  hudPair(ctx, 90, hudY, '轮次', Math.min(state.roundIndex + 1, ROUND_COUNT) + '/' + ROUND_COUNT)
  const avg = state.hits > 0 ? Math.round(state.totalMs / state.hits) + 'ms' : '--'
  hudPair(ctx, 210, hudY, '平均', avg)
  hudPair(ctx, 330, hudY, '最佳', state.bestMs === null ? '--' : Math.round(state.bestMs) + 'ms')
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.text
  ctx.fillText('分数 ' + state.score, W - 10, hudY)

  // 底部轮次进度点：绿=命中、红=超时作废、金=当前轮、暗=未玩。
  const dotY = H - 22
  const gap = 34
  const x0 = W / 2 - ((ROUND_COUNT - 1) * gap) / 2
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('轮次', x0 - 34, dotY + 4)
  for (let i = 0; i < ROUND_COUNT; i += 1) {
    const x = x0 + i * gap
    let color = 'rgba(226,226,238,0.18)'
    if (i < state.results.length) color = state.results[i] === 'hit' ? GO_COLOR : FOUL_COLOR
    else if (i === state.roundIndex && !state.over) color = THEME.gold
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, dotY, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over && state.complete) {
    const avgEnd = state.hits > 0 ? Math.round(state.totalMs / state.hits) + ' ms' : '--'
    drawOverlay(ctx, W, H, '全部完成', state.score + ' 分 · 平均 ' + avgEnd + ' · 最快 ' + (state.bestMs ?? 0) + ' ms · 按 R 重开', GO_COLOR)
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', state.score + ' 分 · 按 R 重开', FOUL_COLOR)
  }
}
