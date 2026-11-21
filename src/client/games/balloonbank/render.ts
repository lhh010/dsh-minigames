/**
 * 气球银行渲染层：马戏风舞台 + 随打气变大/形变抖动的气球、临界颤动
 * 预警、奖金翻倍表、历史气压计、银行 vs 目标对比条、爆炸碎片粒子与
 * 轮末复盘面板。纯 canvas 绘制，状态全部来自 logic.ts，不含随机源。
 */
import { THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair, createParticles } from '../theme.ts'
import {
  W, H, ROUNDS_PER_LEVEL, LEVEL_TARGETS, payout, levelTarget, thresholdMax, popCounts,
  type BalloonBankState,
} from './logic.ts'

/** 奖金翻倍表显示的最大打气次数行数。 */
const TABLE_ROWS = 8

/**
 * 阈值区间的危险度估计（渲染不知道确切阈值，用公开区间近似）。
 * @param state - 目标状态。
 * @returns 0..1 危险度（当前打气次数 / 阈值上限）。
 */
function dangerOf(state: BalloonBankState): number {
  return Math.min(1, state.pumps / thresholdMax(state.level, state.round))
}

/**
 * 打气次数对应的气球半径。
 * @param pumps - 打气次数。
 * @returns 半径 px（22..112）。
 */
export function balloonRadius(pumps: number): number {
  return 22 + Math.min(12, Math.max(0, pumps)) * 7.5
}

/**
 * 画马戏舞台：顶部幕布条纹 + 聚光灯 + 地台。
 * @param ctx - 画布上下文。
 * @param t - 动画时钟 ms。
 */
function drawStage(ctx: CanvasRenderingContext2D, t: number): void {
  for (let x = 0; x < W; x += 40) {
    ctx.fillStyle = (x / 40) % 2 === 0 ? '#2b1b31' : '#231629'
    ctx.fillRect(x, 0, 40, 34)
    ctx.beginPath()
    ctx.moveTo(x, 34)
    ctx.lineTo(x + 20, 46)
    ctx.lineTo(x + 40, 34)
    ctx.closePath()
    ctx.fill()
  }
  const spotlight = ctx.createRadialGradient(W / 2, 250, 40, W / 2, 250, 210)
  spotlight.addColorStop(0, 'rgba(224,175,104,0.10)')
  spotlight.addColorStop(1, 'rgba(224,175,104,0)')
  ctx.fillStyle = spotlight
  ctx.fillRect(120, 120, 400, 260)
  ctx.fillStyle = THEME.panelEdge
  ctx.fillRect(200, 370, 240, 5)
  ctx.fillStyle = 'rgba(226,226,238,0.10)'
  const sweep = ((t / 24) % 260) - 20
  ctx.fillRect(200 + sweep, 370, 20, 5)
}

/**
 * 画气球：随打气变大、随动画形变抖动；危险度高时颤动加剧并向红偏色。
 * @param ctx - 画布上下文。
 * @param state - 目标状态。
 * @param t - 动画时钟 ms。
 */
function drawBalloon(ctx: CanvasRenderingContext2D, state: BalloonBankState, t: number): void {
  if (state.phase !== 'pumping' && state.phase !== 'levelup') return
  const cx = W / 2
  const cy = 250
  const r = balloonRadius(state.pumps)
  const danger = dangerOf(state)
  const wobble = 0.015 + danger * danger * 0.05
  const shake = danger > 0.6 ? (danger - 0.6) * 6 : 0
  const sx = 1 + Math.sin(t / 85) * wobble
  const sy = 1 - Math.sin(t / 85) * wobble
  const ox = Math.sin(t / 33) * shake
  const oy = Math.cos(t / 41) * shake * 0.6
  const base = accent(4)
  const hot = THEME.bad
  const mix = Math.min(1, Math.max(0, (danger - 0.4) / 0.6))
  const rr = Math.round(parseInt(base.slice(1, 3), 16) * (1 - mix) + parseInt(hot.slice(1, 3), 16) * mix)
  const gg = Math.round(parseInt(base.slice(3, 5), 16) * (1 - mix) + parseInt(hot.slice(3, 5), 16) * mix)
  const bb = Math.round(parseInt(base.slice(5, 7), 16) * (1 - mix) + parseInt(hot.slice(5, 7), 16) * mix)
  const body = '#' + rr.toString(16).padStart(2, '0') + gg.toString(16).padStart(2, '0') + bb.toString(16).padStart(2, '0')
  glow(ctx, body, 14 + danger * 18)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(cx + ox, cy + oy, r * sx, r * sy * 1.06, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.ellipse(cx + ox - r * 0.35, cy + oy - r * 0.4, r * 0.18, r * 0.28, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(cx + ox - 5, cy + oy + r * sy * 1.06)
  ctx.lineTo(cx + ox + 5, cy + oy + r * sy * 1.06)
  ctx.lineTo(cx + ox, cy + oy + r * sy * 1.06 + 9)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(226,226,238,0.4)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx + ox, cy + oy + r * sy * 1.06 + 9)
  const sway = Math.sin(t / 300) * 12
  ctx.quadraticCurveTo(cx + ox + sway, 340, cx + ox, 370)
  ctx.stroke()
}

/**
 * 画奖金翻倍表（左栏）：0..TABLE_ROWS 次打气的潜在奖金，当前行高亮。
 * @param ctx - 画布上下文。
 * @param state - 目标状态。
 */
function drawPayoutTable(ctx: CanvasRenderingContext2D, state: BalloonBankState): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 16, 46, 118, 244, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('奖金翻倍表', 26, 66)
  for (let i = 0; i <= TABLE_ROWS; i += 1) {
    const y = 88 + i * 20
    const active = state.phase === 'pumping' && state.pumps === i
    if (active) {
      ctx.fillStyle = 'rgba(224,175,104,0.16)'
      roundRectPath(ctx, 22, y - 12, 106, 17, 4)
      ctx.fill()
    }
    ctx.font = active ? '600 12px system-ui, sans-serif' : '400 12px system-ui, sans-serif'
    ctx.fillStyle = active ? THEME.gold : THEME.textMuted
    ctx.textAlign = 'left'
    ctx.fillText(String(i) + ' 次', 28, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = active ? THEME.gold : THEME.text
    ctx.fillText(String(payout(i)), 122, y)
  }
  ctx.textAlign = 'center'
  ctx.font = '400 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('每次翻倍…', 75, 282)
}

/**
 * 画历史气压计（右栏）：本关 10 轮格子，爆炸记下爆炸打数，兑现记金
 * 额；底部汇总已爆次数。
 * @param ctx - 画布上下文。
 * @param state - 目标状态。
 */
function drawHistoryGauge(ctx: CanvasRenderingContext2D, state: BalloonBankState): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 506, 46, 118, 244, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('历史气压计', 516, 66)
  for (let i = 0; i < ROUNDS_PER_LEVEL; i += 1) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 514 + col * 54
    const y = 82 + row * 36
    const record = state.history[i]
    const current = state.phase === 'pumping' && state.round === i + 1
    roundRectPath(ctx, x, y, 50, 30, 5)
    ctx.fillStyle = record === undefined
      ? (current ? 'rgba(224,175,104,0.14)' : 'rgba(255,255,255,0.04)')
      : record.popped ? 'rgba(247,118,142,0.16)' : 'rgba(158,206,106,0.13)'
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('第' + String(i + 1) + '轮', x + 25, y + 12)
    ctx.font = '600 12px system-ui, sans-serif'
    if (record === undefined) {
      ctx.fillStyle = current ? THEME.gold : 'rgba(226,226,238,0.25)'
      ctx.fillText(current ? '充气中' : '—', x + 25, y + 25)
    } else if (record.popped) {
      ctx.fillStyle = THEME.bad
      ctx.fillText('爆@' + String(record.pumps), x + 25, y + 25)
    } else {
      ctx.fillStyle = THEME.good
      ctx.fillText('+' + String(record.banked), x + 25, y + 25)
    }
  }
  ctx.textAlign = 'center'
  ctx.font = '400 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('已爆 ' + String(popCounts(state).length) + '/10', 565, 282)
}

/**
 * 画底部：打气信息行 + 银行 vs 目标对比条 + 常速览键位。
 * @param ctx - 画布上下文。
 * @param state - 目标状态。
 */
function drawBottom(ctx: CanvasRenderingContext2D, state: BalloonBankState): void {
  ctx.textAlign = 'center'
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillStyle = state.phase === 'pumping' ? THEME.text : THEME.textMuted
  ctx.fillText('已打 ' + String(state.pumps) + ' 次 · 潜在 ' + String(state.potential), W / 2, 404)
  const barX = 190
  const barW = 260
  const barY = 416
  const target = levelTarget(state.level)
  roundRectPath(ctx, barX, barY, barW, 10, 5)
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fill()
  const bankRatio = Math.min(1, state.bank / target)
  const riskRatio = Math.min(1, (state.bank + state.potential) / target) - bankRatio
  if (bankRatio > 0) {
    roundRectPath(ctx, barX, barY, Math.max(6, barW * bankRatio), 10, 5)
    ctx.fillStyle = THEME.good
    ctx.fill()
  }
  if (riskRatio > 0 && state.phase === 'pumping') {
    ctx.fillStyle = THEME.gold
    ctx.fillRect(barX + barW * bankRatio, barY, barW * riskRatio, 10)
  }
  hudPair(ctx, barX - 10, barY + 9, '银行', String(state.bank), 'right', THEME.good)
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('目标 ' + String(target), barX + barW + 10, barY + 9)
  ctx.textAlign = 'center'
  ctx.font = '400 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('空格打气（潜在翻倍，可能爆）· Enter 兑现入银行 · R 重开 · P 暂停', W / 2, 468)
}

/**
 * 画轮末复盘面板（覆盖层语义：暗幕 + 居中面板，空格继续）。
 * @param ctx - 画布上下文。
 * @param state - 目标状态。
 */
function drawReview(ctx: CanvasRenderingContext2D, state: BalloonBankState): void {
  const r = state.review
  if (state.phase !== 'review' || r === null) return
  ctx.fillStyle = 'rgba(13,13,20,0.6)'
  ctx.fillRect(0, 0, W, H)
  const px = 170
  const py = 150
  const pw = 300
  const ph = 190
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, px, py, pw, ph, 10)
  ctx.fill()
  ctx.strokeStyle = r.banked > 0 ? THEME.good : THEME.bad
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillStyle = r.banked > 0 ? THEME.good : THEME.bad
  ctx.fillText(r.banked > 0 ? '兑现 +' + String(r.banked) : '爆炸！本轮 0 分', W / 2, py + 36)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText('本轮打气 ' + String(r.pumps) + ' 次 · 阈值是第 ' + String(r.threshold) + ' 次', W / 2, py + 66)
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('再打一次可得 ' + String(r.nextPayout) + ' · 期望值 ' + String(Math.round(r.evNext)), W / 2, py + 90)
  ctx.fillText('打到第 ' + String(Math.max(0, r.threshold - 1)) + ' 次理论最大 ' + String(r.maxPayout), W / 2, py + 114)
  ctx.fillStyle = THEME.gold
  ctx.font = '600 14px system-ui, sans-serif'
  const label = state.round >= ROUNDS_PER_LEVEL ? '空格：结算本关' : '空格：下一轮'
  ctx.fillText(label, W / 2, py + ph - 24)
}

/** 渲染器：持有粒子系统与动画时钟，每帧由 index 驱动。 */
export interface BalloonBankRenderer {
  /**
   * 绘制一帧：消费爆炸事件生成碎片粒子后整体重绘。
   * @param state - 目标状态。
   * @param paused - 暂停中（叠加暂停覆盖层）。
   * @param dtMs - 帧间隔 ms（粒子推进）。
   */
  frame(state: BalloonBankState, paused: boolean, dtMs: number): void
  /** 粒子系统是否仍在活动（决定逐帧动画期）。 */
  busy(): boolean
}

/**
 * 创建渲染器。
 * @param ctx - 已按逻辑坐标变换的画布上下文。
 * @returns 渲染器实例。
 */
export function createBalloonBankRenderer(ctx: CanvasRenderingContext2D): BalloonBankRenderer {
  const particles = createParticles()
  let t = 0
  return {
    frame(state, paused, dtMs): void {
      if (!paused) t += dtMs
      for (const ev of state.events) {
        if (ev.type === 'pop') {
          const r = balloonRadius(ev.pumps)
          particles.burst(W / 2, 250, THEME.bad, Math.min(36, 14 + r / 4), 150 + r)
        } else if (ev.type === 'cash') {
          particles.burst(W / 2, 250, THEME.good, 12, 120)
        }
      }
      drawBackground(ctx, W, H)
      drawStage(ctx, t)
      drawPayoutTable(ctx, state)
      drawHistoryGauge(ctx, state)
      drawBalloon(ctx, state, t)
      if (!paused) particles.tick(ctx, dtMs)
      drawBottom(ctx, state)
      drawReview(ctx, state)
      if (state.phase === 'levelup') {
        drawOverlay(ctx, W, H, '第 ' + String(state.level - 1) + ' 关过关', '银行 ' + String(state.levelBanks[state.levelBanks.length - 1] ?? 0) + ' ≥ 目标 ' + String(LEVEL_TARGETS[Math.min(LEVEL_TARGETS.length, state.level) - 2] ?? 0) + ' · 空格开第 ' + String(state.level) + ' 关', THEME.good)
      } else if (state.phase === 'gameover') {
        drawOverlay(ctx, W, H, '整局失败', '银行 ' + String(state.bank) + ' 未达目标 ' + String(levelTarget(state.level)) + ' · R 重开', THEME.bad)
      } else if (state.phase === 'gamewin') {
        drawOverlay(ctx, W, H, '五关通杀！', '最终银行 ' + String(state.bank) + ' · R 重开', THEME.gold)
      } else if (paused) {
        drawOverlay(ctx, W, H, '已暂停', 'P 继续 · R 重开')
      }
    },
    busy(): boolean {
      return particles.size() > 0
    },
  }
}
