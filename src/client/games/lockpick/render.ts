/**
 * 开锁达人渲染层：锁芯横剖面（锁体 + 弹子孔 + 顶针通道）、已设定弹子
 * 亮绿卡在剪切线、当前施力弹子随力度位移、设定窗口暗区（低难度提示）、
 * 顶部张力弧指示（含最低设定张力标记）、耐久/进度/分数 HUD、开锁旋转
 * 动画与崩塌粒子抖动、暂停/失败/胜利遮罩。
 */
import type { LockpickState } from './logic.ts'
import {
  W, H, MAX_LOCKS, MIN_SET_TENSION, UNLOCK_MS, COLLAPSE_SHAKE_MS,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

const BODY_X = 70
const BODY_Y = 210
const BODY_W = W - BODY_X * 2
const BODY_H = 190
/** 剪切线（锁芯上缘/弹子孔顶）y。 */
const SHEAR_Y = BODY_Y + 44
/** 弹子孔底部 y（行程起点）。 */
const PIN_BOTTOM = BODY_Y + BODY_H - 26
/** 弹子总行程 px（对应归一化行程 1.0）。 */
const TRAVEL = PIN_BOTTOM - SHEAR_Y - 18

const CORE_COLOR = '#2a2a3a'
const CORE_EDGE = '#4a4a62'
const BODY_COLOR = '#23232f'
const PIN_COLOR = '#c4c9d8'
const PIN_DARK = '#8b91a5'
const WINDOW_BAND = 'rgba(122,162,247,0.16)'

/**
 * 第 i 颗弹子孔中心的 x 坐标。
 * @param count - 弹子总数。
 * @param i - 弹子索引。
 * @returns x 坐标。
 */
function pinX(count: number, i: number): number {
  const span = BODY_W - 56
  const step = count > 1 ? span / (count - 1) : 0
  return BODY_X + 28 + i * step
}

/**
 * 画一颗弹子（在孔内随行程上移，已设定亮绿卡在剪切线上）。
 * @param ctx - 画布上下文。
 * @param x - 孔中心 x。
 * @param pos - 归一化行程。
 * @param isSet - 是否已设定。
 */
function drawPin(ctx: CanvasRenderingContext2D, x: number, pos: number, isSet: boolean): void {
  const lift = pos * TRAVEL
  const bottom = PIN_BOTTOM - lift
  const top = bottom - 26
  ctx.fillStyle = isSet ? THEME.good : PIN_COLOR
  if (isSet) glow(ctx, THEME.good, 9)
  ctx.fillRect(x - 7, top, 14, 26)
  noGlow(ctx)
  ctx.fillStyle = isSet ? THEME.good : PIN_DARK
  ctx.fillRect(x - 9, bottom, 18, 6)
}

/**
 * 渲染一帧：背景、张力弧、锁体剖面（含开锁旋转）、弹子与窗口、粒子、
 * 抖动、HUD 与遮罩。事件每帧消费为粒子特效。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderLockpick(ctx: CanvasRenderingContext2D, state: LockpickState, paused: boolean): void {
  drawBackground(ctx, W, H)

  // 崩塌抖动：整屏小幅水平晃动。
  let shakeX = 0
  if (state.shakeMs > 0) {
    const k = state.shakeMs / COLLAPSE_SHAKE_MS
    shakeX = Math.sin(state.t / 16) * 8 * k
  }
  ctx.save()
  ctx.translate(shakeX, 0)

  // ---- 张力弧指示（顶部）：0..1 弧长 + 最低设定张力刻度。 ----
  const gaugeX = W / 2
  const gaugeY = 96
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(gaugeX, gaugeY, 46, Math.PI * 0.75, Math.PI * 2.25)
  ctx.stroke()
  const sweep = Math.PI * 1.5 * state.tension
  if (state.tension > 0.01) {
    ctx.strokeStyle = state.tension >= MIN_SET_TENSION ? accent(3) : THEME.bad
    glow(ctx, ctx.strokeStyle, 8)
    ctx.beginPath()
    ctx.arc(gaugeX, gaugeY, 46, Math.PI * 0.75, Math.PI * 0.75 + sweep)
    ctx.stroke()
    noGlow(ctx)
  }
  // 最低设定张力刻度 + 方向小指针。
  const markA = Math.PI * 0.75 + Math.PI * 1.5 * MIN_SET_TENSION
  ctx.strokeStyle = THEME.textMuted
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(gaugeX + Math.cos(markA) * 38, gaugeY + Math.sin(markA) * 38)
  ctx.lineTo(gaugeX + Math.cos(markA) * 54, gaugeY + Math.sin(markA) * 54)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('张力', gaugeX, gaugeY + 6)
  if (state.tensionDir !== 0) {
    ctx.fillStyle = accent(3)
    ctx.fillText(state.tensionDir < 0 ? '◀' : '▶', gaugeX + state.tensionDir * 34, gaugeY + 4)
  }

  // ---- 锁芯剖面（开锁动画时整体旋转）。 ----
  ctx.save()
  ctx.translate(W / 2, BODY_Y + BODY_H / 2)
  if (state.unlockMs > 0) {
    const k = 1 - state.unlockMs / UNLOCK_MS
    ctx.rotate(k * 0.55)
  }
  ctx.translate(-W / 2, -(BODY_Y + BODY_H / 2))
  // 锁体。
  roundRectPath(ctx, BODY_X, BODY_Y, BODY_W, BODY_H, 14)
  ctx.fillStyle = BODY_COLOR
  ctx.fill()
  ctx.strokeStyle = CORE_EDGE
  ctx.lineWidth = 2
  ctx.stroke()
  // 锁芯（下半，开锁前与锁体平齐）。
  roundRectPath(ctx, BODY_X + 10, SHEAR_Y, BODY_W - 20, BODY_Y + BODY_H - SHEAR_Y - 10, 8)
  ctx.fillStyle = CORE_COLOR
  ctx.fill()
  ctx.strokeStyle = CORE_EDGE
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 剪切线。
  ctx.strokeStyle = 'rgba(226,226,238,0.35)'
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(BODY_X + 10, SHEAR_Y)
  ctx.lineTo(BODY_X + BODY_W - 10, SHEAR_Y)
  ctx.stroke()
  ctx.setLineDash([])

  const count = state.pins.length
  const showWindow = state.lockIndex < 2
  for (let i = 0; i < count; i += 1) {
    const x = pinX(count, i)
    const spec = state.pins[i]!
    // 弹子孔通道（上缘抬高到 SHEAR_Y-36：满行程弹子顶（SHEAR_Y-8）与
    // 窗口暗区都收在通道内，不再画出孔外）。
    const HOLE_TOP = SHEAR_Y - 36
    ctx.fillStyle = 'rgba(13,13,20,0.55)'
    ctx.fillRect(x - 10, HOLE_TOP, 20, PIN_BOTTOM - HOLE_TOP + 34)
    // 设定窗口暗区（低难度提示；高难度不显示）——按弹子顶几何对齐
    // （pin top = PIN_BOTTOM - pos*TRAVEL - 26），并钳制在通道内。
    if (showWindow) {
      const loY = Math.max(HOLE_TOP + 1, PIN_BOTTOM - spec.windowHigh * TRAVEL - 26)
      const hiY = Math.min(PIN_BOTTOM + 8, PIN_BOTTOM - spec.windowLow * TRAVEL - 26)
      ctx.fillStyle = WINDOW_BAND
      ctx.fillRect(x - 10, loY, 20, hiY - loY)
      ctx.strokeStyle = 'rgba(122,162,247,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(x - 10, loY, 20, hiY - loY)
    }
    drawPin(ctx, x, state.pos[i]!, state.set[i] === true)
    // 当前选中弹子的标记 + 施力箭头。
    if (i === state.current && !state.over) {
      ctx.fillStyle = accent(0)
      ctx.beginPath()
      ctx.moveTo(x - 6, BODY_Y + BODY_H + 10)
      ctx.lineTo(x + 6, BODY_Y + BODY_H + 10)
      ctx.lineTo(x, BODY_Y + BODY_H + 2)
      ctx.closePath()
      ctx.fill()
      if (state.pressing) {
        ctx.fillStyle = accent(4)
        ctx.fillRect(x - 2, BODY_Y - 26, 4, 16)
        ctx.beginPath()
        ctx.moveTo(x - 6, BODY_Y - 26)
        ctx.lineTo(x + 6, BODY_Y - 26)
        ctx.lineTo(x, BODY_Y - 34)
        ctx.closePath()
        ctx.fill()
      }
    }
    // 孔位编号（数字键）。
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = i === state.current ? accent(0) : THEME.textMuted
    ctx.fillText(String(i + 1), x, BODY_Y + BODY_H + 30)
  }
  ctx.restore()
  ctx.restore()

  // 事件粒子：设定冒绿点、过冲崩出红点。
  for (const ev of state.events) {
    if (ev.type === 'set') {
      const x = pinX(state.pins.length, ev.pin)
      particles.burst(x, SHEAR_Y - 10, THEME.good, 10, 110)
    } else if (ev.type === 'overshoot') {
      const x = pinX(state.pins.length, ev.pin)
      particles.burst(x, SHEAR_Y + 20, THEME.bad, 16, 170)
      if (ev.collapsed > 0) particles.burst(W / 2, BODY_Y + BODY_H / 2, THEME.gold, 12, 140)
    } else if (ev.type === 'unlock') {
      particles.burst(W / 2, BODY_Y + BODY_H / 2, THEME.gold, 22, 200)
    } else if (ev.type === 'win') {
      particles.burst(W / 2, H / 2, THEME.gold, 30, 240)
    }
  }
  particles.tick(ctx, 33)

  // ---- HUD ----
  const durColor = state.durability >= 2 ? THEME.good : THEME.bad
  hudPair(ctx, 16, 28, '耐久', String(state.durability), 'left', durColor)
  hudPair(ctx, 16, 50, '锁', String(state.lockIndex + 1) + '/' + String(MAX_LOCKS), 'left', THEME.gold)
  hudPair(ctx, W - 16, 28, '分数', String(state.score), 'right')
  const setCount = state.set.filter((s) => s).length
  hudPair(ctx, W - 16, 50, '已设定', setCount + '/' + String(state.pins.length), 'right')
  // 新手教学横幅（前两把锁常驻）：分步图解核心循环——放在弹子编号
  // 之下、结束遮罩之上的空带（原放在 y74 与张力弧/耐久点重叠）。
  if (state.lockIndex < 2) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, THEME.accents[0]!, 5)
    ctx.fillStyle = THEME.accents[0]!
    ctx.fillText('① ←/→ 绷张力过刻度  ② 数字键选弹子  ③ 空格顶起  ④ 暗区内松开', W / 2, BODY_Y + BODY_H + 58)
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('过冲=弹回+崩已设定（张力越高崩越多） · 全设定自动开锁', W / 2, BODY_Y + BODY_H + 78)
    noGlow(ctx)
  }
  // 耐久点。
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath()
    ctx.arc(30 + i * 18, 68, 5, 0, Math.PI * 2)
    ctx.fillStyle = i < state.durability ? durColor : THEME.panelEdge
    ctx.fill()
  }

  // ---- 遮罩 ----
  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    if (state.won) {
      drawOverlay(ctx, W, H, '全部开锁', '五把锁全部拿下 · R 再来一局', THEME.gold)
    } else {
      drawOverlay(ctx, W, H, '锁芯崩坏', '耐久耗尽 · R 重开', THEME.bad)
    }
  } else if (state.unlockMs > 0) {
    drawOverlay(ctx, W, H, '咔哒 · 开锁', '第 ' + String(state.lockIndex + 1) + ' 把 · 下一把更紧', THEME.good)
  }
}
