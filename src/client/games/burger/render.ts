/**
 * 汉堡师傅渲染层：柜台 + 等待顾客（随时间变急躁的表情）、订单卡片
 * （展示期画分层图 / 制作期画问号）、逐层下落堆叠动画的汉堡、时间条、
 * 心/单数/分数 HUD、底部配料按钮排与结束遮罩。基于共享主题工具，纯
 * canvas 绘制。
 */
import type { BurgerState, Ingredient } from './logic.ts'
import { BUN, COOK_MS, FILLINGS, TOTAL_ORDERS } from './logic.ts'
import {
  THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = 720
export const LOGICAL_H = 480

const HUD_H = 26
const CARD_X = 250
const CARD_Y = 40
const CARD_W = 452
const CARD_H = 150
const BAR_Y = 204
const BAR_H = 12
const COUNTER_Y = 418
const LAYER_H = 20
const BTN_Y = 440
const BTN_H = 34
const BTN_W = 96
const BTN_GAP = 8
const BTN_X0 = (LOGICAL_W - (BTN_W * 7 + BTN_GAP * 6)) / 2

/** 配料视觉：按钮/订单/汉堡层共用同一配色与中文短名。 */
const STYLE: Record<Ingredient, { color: string, label: string }> = {
  bun: { color: '#e0af68', label: '面包' },
  lettuce: { color: '#9ece6a', label: '生菜' },
  patty: { color: '#a05a3c', label: '肉饼' },
  cheese: { color: '#ffd966', label: '芝士' },
  tomato: { color: '#f7768e', label: '番茄' },
  onion: { color: '#c8b6ff', label: '洋葱' },
  pickle: { color: '#73daca', label: '酸黄瓜' },
}

/** 底部按钮顺序：面包在最左，其余按夹料池顺序。 */
const BUTTONS: Ingredient[] = [BUN, ...FILLINGS]

const particles = createParticles()
let lastFrame = 0
let prevServed = -1
let prevHearts = -1
let dropSince = 0 // 最新一层落下的起始时刻（下落动画用）
let prevStacked = -1 // 上帧堆叠层数（检测新层落下）

/**
 * 命中测试：逻辑坐标是否点中某个配料按钮。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 命中的配料 id，未命中返回 null。
 */
export function ingredientAt(x: number, y: number): Ingredient | null {
  if (y < BTN_Y || y > BTN_Y + BTN_H) return null
  for (let i = 0; i < BUTTONS.length; i += 1) {
    const bx = BTN_X0 + i * (BTN_W + BTN_GAP)
    if (x >= bx && x <= bx + BTN_W) return BUTTONS[i]!
  }
  return null
}

/**
 * 画一层汉堡/订单色块：圆角横条 + 高光描边。
 * @param ctx - 画布上下文。
 * @param ing - 配料 id。
 * @param x - 左边界。
 * @param y - 顶边界。
 * @param w - 宽。
 * @param h - 高。
 */
function drawLayerBar(ctx: CanvasRenderingContext2D, ing: Ingredient, x: number, y: number, w: number, h: number): void {
  const s = STYLE[ing]
  ctx.fillStyle = s.color
  roundRectPath(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(13,13,20,0.45)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/**
 * 画顾客：头 + 等待表情；制作期剩余时间越少表情越急。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 */
function drawCustomer(ctx: CanvasRenderingContext2D, state: BurgerState): void {
  const cx = 130
  const cy = 150
  ctx.fillStyle = THEME.panel
  ctx.beginPath()
  ctx.arc(cx, cy, 46, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  const rush = state.phase === 'building' && state.timeLeftMs < COOK_MS * 0.35
  // 眼睛
  ctx.fillStyle = rush ? THEME.bad : THEME.text
  ctx.beginPath()
  ctx.arc(cx - 16, cy - 10, 4, 0, Math.PI * 2)
  ctx.arc(cx + 16, cy - 10, 4, 0, Math.PI * 2)
  ctx.fill()
  // 嘴：等待微笑，急躁时波浪嘴
  ctx.strokeStyle = rush ? THEME.bad : THEME.good
  ctx.lineWidth = 3
  ctx.beginPath()
  if (rush) {
    ctx.moveTo(cx - 14, cy + 18)
    ctx.quadraticCurveTo(cx - 7, cy + 12, cx, cy + 18)
    ctx.quadraticCurveTo(cx + 7, cy + 24, cx + 14, cy + 18)
  } else {
    ctx.arc(cx, cy + 10, 14, 0.15 * Math.PI, 0.85 * Math.PI)
  }
  ctx.stroke()
  // 状态词
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const mood = state.phase === 'showing' ? '正在点单…' : rush ? '等急了！' : '等待出餐'
  ctx.fillText(mood, cx, cy + 70)
}

/**
 * 画订单卡片：展示期逐层可见，制作期全部打问号并显示复刻进度。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 */
function drawOrderCard(ctx: CanvasRenderingContext2D, state: BurgerState): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const head = state.phase === 'showing' ? '订单（记住它！）' : '订单（凭记忆复刻）'
  ctx.fillText(head, CARD_X + 12, CARD_Y + 18)
  ctx.textAlign = 'right'
  ctx.fillText('第 ' + state.orderIndex + ' / ' + TOTAL_ORDERS + ' 单', CARD_X + CARD_W - 12, CARD_Y + 18)

  const rowH = 22
  const w = 180
  const x = CARD_X + 16
  // 自下而上画，第 0 层（面包底）在卡片最底部，镜像汉堡结构
  for (let i = 0; i < state.order.length; i += 1) {
    const y = CARD_Y + CARD_H - 8 - (i + 1) * rowH
    if (state.phase === 'showing') {
      const ing = state.order[i]!
      drawLayerBar(ctx, ing, x, y, w, rowH - 4)
      ctx.textAlign = 'left'
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(13,13,20,0.85)'
      ctx.fillText(STYLE[ing].label, x + 12, y + 14)
    } else {
      const done = i < state.stacked.length
      ctx.fillStyle = done ? THEME.good : THEME.panelEdge
      roundRectPath(ctx, x, y, w, rowH - 4, (rowH - 4) / 2)
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.font = '700 14px system-ui, sans-serif'
      ctx.fillStyle = done ? THEME.bgTop : THEME.text
      ctx.fillText(done ? '✓' : '?', x + w / 2, y + 15)
    }
  }
  // 右侧纵向排布的层数序号（展示期提示顺序从下到上）
  ctx.textAlign = 'right'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('层序 1 → ' + state.order.length, CARD_X + CARD_W - 12, CARD_Y + CARD_H - 16)
  if (state.phase !== 'showing') {
    ctx.fillText('已复刻 ' + state.stacked.length + ' / ' + state.order.length, CARD_X + CARD_W - 12, CARD_Y + CARD_H - 4)
  }
}

/**
 * 画时间条：展示期金条显示展示窗口消耗，制作期绿→红条显示剩余时间。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 */
function drawTimeBar(ctx: CanvasRenderingContext2D, state: BurgerState): void {
  const x = CARD_X
  const w = CARD_W
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, x, BAR_Y, w, BAR_H, BAR_H / 2)
  ctx.fill()
  let ratio = 1
  let color: string = THEME.gold
  if (state.phase === 'showing') {
    ratio = Math.max(0, 1 - state.showElapsedMs / state.showMs)
  } else if (state.phase === 'building') {
    ratio = Math.max(0, state.timeLeftMs / COOK_MS)
    color = ratio > 0.35 ? THEME.good : THEME.bad
  } else {
    ratio = 0
  }
  if (ratio > 0) {
    ctx.fillStyle = color
    glow(ctx, color, 6)
    roundRectPath(ctx, x + 1, BAR_Y + 1, (w - 2) * ratio, BAR_H - 2, (BAR_H - 2) / 2)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.textAlign = 'left'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const label = state.phase === 'showing' ? '记忆窗口' : '出餐倒计时'
  ctx.fillText(label, x, BAR_Y + BAR_H + 14)
}

/**
 * 画柜台与逐层堆叠的汉堡：最新一层带下落动画（400ms 缓入）。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param nowMs - 当前 performance.now()。
 */
function drawBurger(ctx: CanvasRenderingContext2D, state: BurgerState, nowMs: number): void {
  // 柜台
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 250, COUNTER_Y, 452, 22, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  if (state.stacked.length === 0) return
  const cx = 476
  const w = 150
  for (let i = 0; i < state.stacked.length; i += 1) {
    const y = COUNTER_Y - (i + 1) * LAYER_H
    let dy = 0
    if (i === state.stacked.length - 1) {
      const t = Math.min(1, (nowMs - dropSince) / 400)
      dy = -(1 - t * t) * 46 // 平方缓入落位
    }
    drawLayerBar(ctx, state.stacked[i]!, cx - w / 2, y + dy, w, LAYER_H - 2)
  }
}

/**
 * 画底部配料按钮排。
 * @param ctx - 画布上下文。
 */
function drawButtons(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  for (let i = 0; i < BUTTONS.length; i += 1) {
    const ing = BUTTONS[i]!
    const x = BTN_X0 + i * (BTN_W + BTN_GAP)
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, x, BTN_Y, BTN_W, BTN_H, 8)
    ctx.fill()
    const s = STYLE[ing]
    ctx.fillStyle = s.color
    roundRectPath(ctx, x + 6, BTN_Y + 5, BTN_W - 12, 8, 4)
    ctx.fill()
    ctx.fillStyle = THEME.text
    ctx.fillText(s.label, x + BTN_W / 2, BTN_Y + 28)
  }
}

/**
 * 画整帧：HUD（心/单数/分数）→ 顾客 → 订单卡 → 时间条 → 汉堡 → 按钮 →
 * 粒子 → 遮罩。观察 ordersServed/hearts 差异触发粒子；观察 stacked 变
 * 化重置下落动画时钟。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export function renderBurger(ctx: CanvasRenderingContext2D, state: BurgerState, paused: boolean): void {
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：心（实/空）、已出餐数、分数
  ctx.font = '700 16px system-ui, sans-serif'
  ctx.textAlign = 'left'
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i < state.hearts ? THEME.bad : THEME.panelEdge
    glow(ctx, i < state.hearts ? THEME.bad : THEME.panelEdge, 6)
    ctx.fillText('♥', 14 + i * 20, HUD_H)
  }
  noGlow(ctx)
  hudPair(ctx, LOGICAL_W / 2 - 40, HUD_H, '已出餐', state.ordersServed + ' / ' + TOTAL_ORDERS + ' 单')
  hudPair(ctx, LOGICAL_W - 14, HUD_H, '分数', String(state.score), 'right', THEME.gold)

  drawCustomer(ctx, state)
  drawOrderCard(ctx, state)
  drawTimeBar(ctx, state)

  // 下落动画时钟：堆叠变长（或换新订单清空）则重置
  if (prevStacked !== -1 && state.stacked.length !== prevStacked) dropSince = now
  if (dropSince === 0) dropSince = now
  prevStacked = state.stacked.length
  drawBurger(ctx, state, now)

  // 出餐/错单粒子
  if (state.ordersServed > prevServed && prevServed !== -1) {
    particles.burst(476, COUNTER_Y - state.stacked.length * LAYER_H, THEME.good, 14, 150)
  }
  if (state.hearts < prevHearts && prevHearts !== -1) {
    particles.burst(130, 150, THEME.bad, 12, 130)
  }
  prevServed = state.ordersServed
  prevHearts = state.hearts
  particles.tick(ctx, dt)

  drawButtons(ctx)

  if (state.phase === 'over') {
    const won = state.ordersServed >= TOTAL_ORDERS
    drawOverlay(
      ctx, LOGICAL_W, LOGICAL_H,
      won ? '全部出餐！' : '心用光了…',
      '出餐 ' + state.ordersServed + ' / ' + TOTAL_ORDERS + ' 单 · 分数 ' + state.score + ' · 按 R 再来一赛',
      won ? THEME.gold : THEME.bad,
    )
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · 按 R 重开')
  }
}
