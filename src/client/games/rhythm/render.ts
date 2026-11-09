/**
 * 节奏打击渲染层：4 条竖直轨道 + 底部判定线，音符按剩余时间下落
 * （轨道色发光条）；判定产生打击波纹与 PERFECT 金 / GOOD 蓝 / MISS
 * 红文字弹出；中央连击计数带放大动画，顶部 HUD（心形生命 / 倍率 /
 * 分数），底部 D F J K 按键提示；暂停与结束遮罩、事件粒子。
 */
import type { RhythmState } from './logic.ts'
import { LANE_COUNT, MISS_LATE_MS, W, H, comboMultiplier } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 判定线 y 坐标。 */
const JUDGE_Y = H - 120
/** 轨道区顶部 y。 */
const LANE_TOP = 56
/** 音符从出现到判定线的下落时长 ms。 */
/** 默认下落时长 ms（标准速度）。 */
const APPROACH_MS = 1500
/** 可选下落速度档位（下落时长 ms，越短越快）。 */
export const SPEED_PRESETS: readonly number[] = [2200, 1800, 1500, 1150, 850]
/** 速度档位标签。 */
export const SPEED_LABELS: readonly string[] = ['慢', '较慢', '标准', '较快', '快']
/** 底部按键提示。 */
const KEY_HINTS = ['D', 'F', 'J', 'K']
const PERFECT_COLOR = THEME.gold
const GOOD_COLOR = '#7dcfff'
const MISS_COLOR = THEME.bad

/** 渲染层自有的粒子系统（每个画布一个实例）。 */
const particles = createParticles()

/** 一次打击波纹（判定线处扩散圆环）。 */
interface Ripple {
  lane: number
  radius: number
  life: number
  color: string
}

/** 一次判定文字弹出（上浮渐隐）。 */
interface Popup {
  lane: number
  text: string
  life: number
  color: string
}

// 渲染层特效状态（随判定事件驱动，逐帧衰减）。
const ripples: Ripple[] = []
const popups: Popup[] = []
let comboShown = 0
let comboPop = 0

/** 轨道中心 x 坐标。
 * @param lane - 轨道下标。
 * @returns 中心 x。
 */
function laneCenterX(lane: number): number {
  return (W / LANE_COUNT) * (lane + 0.5)
}

/**
 * 渲染一帧：背景、轨道与判定线、下落音符、特效、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderRhythm(ctx: CanvasRenderingContext2D, state: RhythmState, paused: boolean, approachMs = APPROACH_MS, speedLabel = SPEED_LABELS[2]!): void {
  drawBackground(ctx, W, H)
  const laneW = W / LANE_COUNT

  // 轨道底板与分隔线。
  roundRectPath(ctx, 10, LANE_TOP, W - 20, H - LANE_TOP - 34, 14)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const x = 10 + lane * laneW
    ctx.strokeStyle = 'rgba(52,52,74,0.7)'
    ctx.beginPath()
    ctx.moveTo(x, LANE_TOP + 8)
    ctx.lineTo(x, H - 52)
    ctx.stroke()
  }

  // 按压闪光：最近 150ms 内按过的轨道在判定线附近亮起渐隐竖光柱
  // ——空按也有即时反馈（不只是命中才有反应）。
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const since = state.t - (state.laneFlashMs[lane] ?? -Infinity)
    if (!(since >= 0 && since <= 150)) continue
    const alpha = 1 - since / 150
    const fx = 14 + lane * laneW
    const grad = ctx.createLinearGradient(0, JUDGE_Y - 90, 0, JUDGE_Y + 26)
    grad.addColorStop(0, 'rgba(122,162,255,0)')
    grad.addColorStop(1, 'rgba(122,162,255,' + (0.45 * alpha).toFixed(3) + ')')
    ctx.fillStyle = grad
    ctx.fillRect(fx, JUDGE_Y - 90, laneW - 8, 116)
    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * alpha).toFixed(3) + ')'
    ctx.fillRect(fx, JUDGE_Y - 3, laneW - 8, 6)
  }

  // 判定线：横向亮线 + 呼吸发光。
  const lineColor = accent(0)
  glow(ctx, lineColor, 12 + Math.sin(state.t / 240) * 4)
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(14, JUDGE_Y)
  ctx.lineTo(W - 14, JUDGE_Y)
  ctx.stroke()
  noGlow(ctx)

  // 下落音符：y 随 (note.time - t) 线性逼近判定线。
  const noteW = laneW - 18
  const noteH = 20
  for (const note of state.notes) {
    if (note.judged !== null) continue
    const remain = note.timeMs - state.t
    if (remain > approachMs || remain < -MISS_LATE_MS) continue
    const y = JUDGE_Y - (remain / approachMs) * (JUDGE_Y - LANE_TOP - 12)
    const color = accent(note.lane + 2)
    glow(ctx, color, 10)
    roundRectPath(ctx, laneCenterX(note.lane) - noteW / 2, y - noteH / 2, noteW, noteH, 7)
    ctx.fillStyle = color
    ctx.fill()
    noGlow(ctx)
  }

  // 消费逻辑事件：波纹 + 判定文字弹出 + 粒子。
  for (const ev of state.events) {
    if (ev.type !== 'judge') continue
    const color = ev.judgement === 'perfect' ? PERFECT_COLOR : ev.judgement === 'good' ? GOOD_COLOR : MISS_COLOR
    const text = ev.judgement === 'perfect' ? 'PERFECT' : ev.judgement === 'good' ? 'GOOD' : 'MISS'
    ripples.push({ lane: ev.lane, radius: 10, life: 360, color })
    popups.push({ lane: ev.lane, text, life: 520, color })
    particles.burst(laneCenterX(ev.lane), JUDGE_Y, color, ev.judgement === 'miss' ? 8 : 14, 200)
  }

  // 波纹：扩散圆环渐隐。
  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const rp = ripples[i]!
    rp.radius += 1.6
    rp.life -= 16
    if (rp.life <= 0) {
      ripples.splice(i, 1)
      continue
    }
    ctx.globalAlpha = rp.life / 360
    ctx.strokeStyle = rp.color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(laneCenterX(rp.lane), JUDGE_Y, rp.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // 判定文字弹出：上浮渐隐。
  ctx.textAlign = 'center'
  for (let i = popups.length - 1; i >= 0; i -= 1) {
    const pp = popups[i]!
    pp.life -= 16
    if (pp.life <= 0) {
      popups.splice(i, 1)
      continue
    }
    const rise = (1 - pp.life / 520) * 34
    ctx.globalAlpha = Math.min(1, pp.life / 300)
    ctx.font = '700 17px system-ui, sans-serif'
    ctx.fillStyle = pp.color
    ctx.fillText(pp.text, laneCenterX(pp.lane), JUDGE_Y - 40 - rise)
    ctx.globalAlpha = 1
  }

  // 连击计数：变化时放大弹跳。
  if (state.combo !== comboShown) {
    comboShown = state.combo
    comboPop = 1
  }
  comboPop = Math.max(0, comboPop - 0.06)
  if (state.combo > 0) {
    const scale = 1 + comboPop * 0.35
    ctx.textAlign = 'center'
    ctx.font = 'bold ' + Math.round(38 * scale) + 'px system-ui, sans-serif'
    glow(ctx, THEME.text, 10)
    ctx.fillStyle = state.combo >= 50 ? PERFECT_COLOR : THEME.text
    ctx.fillText(String(state.combo), W / 2, 220)
    noGlow(ctx)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('COMBO x' + comboMultiplier(state.combo), W / 2, 242)
  }

  particles.tick(ctx, paused ? 0 : 16)

  // 顶部 HUD：心形生命 / 倍率 / 分数。
  const hudY = 24
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = state.lives > 0 ? THEME.bad : THEME.textMuted
  ctx.fillText(state.lives > 0 ? '❤'.repeat(state.lives) : '♡', 14, hudY)
  hudPair(ctx, W / 2 - 40, hudY, '倍率', 'x' + comboMultiplier(state.combo))
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.text
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText('分数 ' + state.score, W - 14, hudY)
  // 速度档位指示（[ / ] 调节）。
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('速度 ' + speedLabel + '  [ ]', W - 14, hudY + 16)

  // 底部按键提示。
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(KEY_HINTS[lane]!, laneCenterX(lane), H - 26)
  }

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.finished) {
    drawOverlay(ctx, W, H, '全部完成', state.score + ' 分 · 最大连击 ' + state.maxCombo + ' · 按 R 重开', THEME.good)
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', state.score + ' 分 · 最大连击 ' + state.maxCombo + ' · 按 R 重开', MISS_COLOR)
  }
}
