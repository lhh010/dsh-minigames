/**
 * 配方厨房渲染层：左侧订单卡队列（工序图标进度 + 倒计时条 + 同煮标
 * 记）、右侧俯视厨房（双灶眼火苗动画 + 砧板）、火候条（红-暗-绿-暗-红
 * 分区 + 往复游标）、出餐飞出动画、糊烟粒子、分数/关卡/时间 HUD 与终
 * 局/暂停遮罩。基于共享主题工具，纯 canvas 绘制。
 */
import type { RecipeOrder, RecipeState, SlotItem, StepKind } from './logic.ts'
import {
  GREEN_HI, GREEN_LO, MAX_QUEUE, RED_EDGE, STEP_MS, TARGET_PER_LEVEL, TIMING_MAX_MS, TOTAL_LEVELS,
  heatCursor,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 720
export const LOGICAL_H = 520

const HUD_H = 24
/** 订单卡列：左侧 3 张。 */
const CARD_X = 12
const CARD_Y = 40
const CARD_W = 204
const CARD_H = 142
const CARD_GAP = 12
/** 厨房区。 */
const KITCHEN_X = 236
const KITCHEN_Y = 40
const KITCHEN_W = 472
const KITCHEN_H = 468
/** 灶眼圆心与半径；砧板矩形。 */
const BURNERS: { x: number, y: number }[] = [
  { x: KITCHEN_X + 128, y: KITCHEN_Y + 150 },
  { x: KITCHEN_X + 344, y: KITCHEN_Y + 150 },
]
const BURNER_R = 54
const BOARD = { x: KITCHEN_X + 141, y: KITCHEN_Y + 300, w: 190, h: 84 }
/** 火候条（画在工位正下方）。 */
const HEAT_BAR_W = 132
const HEAT_BAR_H = 10

/** 工序视觉：图标 + 中文短名 + 主色。 */
const STEP_STYLE: Record<StepKind, { icon: string, label: string, color: string }> = {
  cut: { icon: '\u{1F52A}', label: '切', color: '#7dcfff' },
  boil: { icon: '\u2668', label: '煮', color: '#7aa2f7' },
  fry: { icon: '\u{1F373}', label: '炒', color: '#ff9e64' },
}

const particles = createParticles()
/** 出餐飞出动画项：从厨房中心飘出的餐盘。 */
interface FlyOff { x: number, y: number, life: number }
const flyOffs: FlyOff[] = []
/** 糊烟：灰烟团（上飘淡出，与粒子池独立以便盖在灶眼上方）。 */
interface Smoke { x: number, y: number, life: number, size: number }
const smokes: Smoke[] = []
let lastFrame = 0
let prevServed = -1
let prevBurn = -1

/**
 * 命中测试：逻辑坐标点中哪个工位（0/1 灶眼，2 砧板）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 工位下标，未命中返回 null。
 */
export function stationAt(x: number, y: number): number | null {
  for (let i = 0; i < 2; i += 1) {
    const b = BURNERS[i]!
    const dx = x - b.x
    const dy = y - b.y
    if (dx * dx + dy * dy <= (BURNER_R + 8) * (BURNER_R + 8)) return i
  }
  if (x >= BOARD.x - 8 && x <= BOARD.x + BOARD.w + 8 && y >= BOARD.y - 8 && y <= BOARD.y + BOARD.h + 8) return 2
  return null
}

/**
 * 命中测试：逻辑坐标点中哪张订单卡。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 订单下标，未命中返回 null。
 */
export function orderCardAt(x: number, y: number): number | null {
  for (let i = 0; i < MAX_QUEUE; i += 1) {
    const cy = CARD_Y + i * (CARD_H + CARD_GAP)
    if (x >= CARD_X && x <= CARD_X + CARD_W && y >= cy && y <= cy + CARD_H) return i
  }
  return null
}

/**
 * 画一张订单卡：选中高亮、工序图标行（完成打勾/当前描金）、倒计时条、
 * 同煮标记与完美计数。
 * @param ctx - 画布上下文。
 * @param order - 订单。
 * @param idx - 订单下标。
 * @param selected - 是否选中。
 */
function drawOrderCard(ctx: CanvasRenderingContext2D, order: RecipeOrder, idx: number, selected: boolean): void {
  const y = CARD_Y + idx * (CARD_H + CARD_GAP)
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, CARD_X, y, CARD_W, CARD_H, 10)
  ctx.fill()
  ctx.strokeStyle = selected ? accent(idx) : THEME.panelEdge
  ctx.lineWidth = selected ? 2 : 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.fillStyle = selected ? accent(idx) : THEME.textMuted
  ctx.fillText('订单 #' + order.id, CARD_X + 12, y + 20)
  if (order.paired) {
    ctx.textAlign = 'right'
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText('同煮', CARD_X + CARD_W - 12, y + 20)
  }
  // 工序图标行：完成打勾，当前（下一道待做）描金圈
  const stepN = order.steps.length
  const sw = 34
  const x0 = CARD_X + (CARD_W - stepN * sw) / 2 + sw / 2
  for (let i = 0; i < stepN; i += 1) {
    const st = STEP_STYLE[order.steps[i]!]
    const cx = x0 + i * sw
    const cy = y + 56
    const done = i < order.stepIndex
    const current = i === order.stepIndex
    ctx.beginPath()
    ctx.arc(cx, cy, 14, 0, Math.PI * 2)
    ctx.fillStyle = done ? 'rgba(158,206,106,0.16)' : THEME.bgTop
    ctx.fill()
    ctx.strokeStyle = current ? THEME.gold : done ? THEME.good : THEME.panelEdge
    ctx.lineWidth = current ? 2 : 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = done ? THEME.good : THEME.text
    ctx.fillText(done ? '\u2713' : st.icon, cx, cy + 5)
  }
  // 倒计时条
  const barY = y + CARD_H - 34
  const ratio = Math.max(0, order.timeLeftMs / order.limitMs)
  ctx.fillStyle = THEME.bgTop
  roundRectPath(ctx, CARD_X + 12, barY, CARD_W - 24, 8, 4)
  ctx.fill()
  const color = ratio > 0.35 ? THEME.good : THEME.bad
  if (ratio > 0) {
    ctx.fillStyle = color
    roundRectPath(ctx, CARD_X + 13, barY + 1, (CARD_W - 26) * ratio, 6, 3)
    ctx.fill()
  }
  ctx.textAlign = 'left'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('剩余 ' + Math.ceil(order.timeLeftMs / 1000) + 's · 完美 \u00d7' + order.perfectCount, CARD_X + 12, y + CARD_H - 10)
}

/**
 * 画灶眼：深色锅架 + 加工中的火苗动画（sin 抖动）+ 锅内工序信息。
 * @param ctx - 画布上下文。
 * @param burner - 灶眼序号。
 * @param item - 工位上的工序（可为空）。
 * @param nowMs - 当前 performance.now()。
 */
function drawBurner(ctx: CanvasRenderingContext2D, burner: number, item: SlotItem | null, nowMs: number): void {
  const b = BURNERS[burner]!
  ctx.beginPath()
  ctx.arc(b.x, b.y, BURNER_R, 0, Math.PI * 2)
  ctx.fillStyle = THEME.bgTop
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  // 锅架辐条
  ctx.strokeStyle = 'rgba(52,52,74,0.9)'
  ctx.lineWidth = 3
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI + nowMs / 4000
    ctx.beginPath()
    ctx.moveTo(b.x + Math.cos(a) * 10, b.y + Math.sin(a) * 10)
    ctx.lineTo(b.x + Math.cos(a) * (BURNER_R - 8), b.y + Math.sin(a) * (BURNER_R - 8))
    ctx.stroke()
  }
  if (item === null) {
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('灶眼 ' + (burner + 1), b.x, b.y + 4)
    return
  }
  const st = STEP_STYLE[item.kind]
  if (item.phase === 'cooking') {
    // 火苗：三层三角随时间抖动，高度随倒计时进度升高
    const progress = 1 - item.cookLeftMs / STEP_MS[item.kind]
    const flick = Math.sin(nowMs / 60 + burner * 2) * 4
    for (let layer = 0; layer < 3; layer += 1) {
      const h = (18 + progress * 16) * (1 - layer * 0.28) + flick * (layer + 1) * 0.4
      const w = 26 - layer * 7
      const colors = ['#f7768e', '#ff9e64', '#e0af68']
      ctx.fillStyle = colors[layer]!
      glow(ctx, colors[layer]!, 8)
      ctx.beginPath()
      ctx.moveTo(b.x - w / 2, b.y + 16)
      ctx.lineTo(b.x + w / 2, b.y + 16)
      ctx.lineTo(b.x, b.y + 16 - h)
      ctx.closePath()
      ctx.fill()
      noGlow(ctx)
    }
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(st.icon + ' ' + st.label + ' ' + Math.ceil(item.cookLeftMs / 1000) + 's', b.x, b.y - 26)
  } else {
    // 火候期：锅内冒小泡 + 提示看下方火候条
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = st.color
    glow(ctx, st.color, 8)
    ctx.fillText(st.icon + ' 就绪！', b.x, b.y - 24)
    noGlow(ctx)
  }
}

/**
 * 画砧板：木色圆角板 + 加工中的工序信息。
 * @param ctx - 画布上下文。
 * @param item - 工位上的工序（可为空）。
 * @param nowMs - 当前 performance.now()。
 */
function drawBoard(ctx: CanvasRenderingContext2D, item: SlotItem | null, nowMs: number): void {
  ctx.fillStyle = '#5a4a38'
  roundRectPath(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 12)
  ctx.fill()
  ctx.strokeStyle = '#7a6448'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.textAlign = 'center'
  if (item === null) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(226,226,238,0.75)'
    ctx.fillText('砧板', BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h / 2 + 4)
    return
  }
  const st = STEP_STYLE[item.kind]
  if (item.phase === 'cooking') {
    // 刀光左右移动的小动画
    const t = (nowMs / 300) % 2
    const kx = BOARD.x + BOARD.w * (t < 1 ? 0.2 + t * 0.6 : 0.8 - (t - 1) * 0.6)
    ctx.strokeStyle = '#c8d3f5'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(kx - 10, BOARD.y + 30)
    ctx.lineTo(kx + 10, BOARD.y + 24)
    ctx.stroke()
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(st.icon + ' ' + st.label + ' ' + Math.ceil(item.cookLeftMs / 1000) + 's', BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h - 18)
  } else {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = st.color
    glow(ctx, st.color, 8)
    ctx.fillText(st.icon + ' 切好了！', BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h / 2 + 5)
    noGlow(ctx)
  }
}

/**
 * 画工位下方的火候条：两端红区、中央绿区、暗色过渡带与白色游标三角
 * （位置 = heatCursor 当前值）。
 * @param ctx - 画布上下文。
 * @param cx - 条中心横坐标。
 * @param y - 条顶纵坐标。
 * @param item - 火候期工序。
 */
function drawHeatBar(ctx: CanvasRenderingContext2D, cx: number, y: number, item: SlotItem): void {
  const x = cx - HEAT_BAR_W / 2
  const seg = (from: number, to: number, color: string): void => {
    ctx.fillStyle = color
    ctx.fillRect(x + HEAT_BAR_W * from, y + 1, HEAT_BAR_W * (to - from), HEAT_BAR_H - 2)
  }
  ctx.fillStyle = THEME.bgTop
  roundRectPath(ctx, x, y, HEAT_BAR_W, HEAT_BAR_H, 5)
  ctx.fill()
  seg(0, RED_EDGE, THEME.bad)
  seg(RED_EDGE, GREEN_LO, THEME.panelEdge)
  seg(GREEN_LO, GREEN_HI, THEME.good)
  seg(GREEN_HI, 1 - RED_EDGE, THEME.panelEdge)
  seg(1 - RED_EDGE, 1, THEME.bad)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  const v = heatCursor(item.timingMs)
  const vx = x + HEAT_BAR_W * v
  ctx.fillStyle = THEME.text
  glow(ctx, THEME.text, 6)
  ctx.beginPath()
  ctx.moveTo(vx - 5, y - 5)
  ctx.lineTo(vx + 5, y - 5)
  ctx.lineTo(vx, y + 2)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // 火候期剩余（自动糊倒计时）
  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const left = Math.max(0, Math.ceil((TIMING_MAX_MS - item.timingMs) / 1000))
  ctx.fillText('火候 ' + left + 's', cx, y + HEAT_BAR_H + 13)
}

/**
 * 画整帧：背景 → HUD → 订单卡 → 厨房 → 火候条 → 粒子/烟/飞出 → 遮罩。
 * 观察 servedTotal/burnCount 差异触发飞出与糊烟。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export function renderRecipe(ctx: CanvasRenderingContext2D, state: RecipeState, paused: boolean): void {
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：分数 / 关卡进度 / 出餐 / 时间
  hudPair(ctx, 14, HUD_H, '分数', String(state.score), 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W / 2 - 30, HUD_H, '关卡', state.level + ' / ' + TOTAL_LEVELS)
  hudPair(ctx, LOGICAL_W / 2 + 110, HUD_H, '本关出餐', state.servedInLevel + ' / ' + TARGET_PER_LEVEL)
  const secs = Math.floor(state.elapsedMs / 1000)
  hudPair(ctx, LOGICAL_W - 14, HUD_H, '时间', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'), 'right')

  for (let i = 0; i < state.orders.length; i += 1) {
    drawOrderCard(ctx, state.orders[i]!, i, i === state.selectedOrderIdx)
  }

  // 厨房台面
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, KITCHEN_X, KITCHEN_Y, KITCHEN_W, KITCHEN_H, 14)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  for (let i = 0; i < 2; i += 1) drawBurner(ctx, i, state.slots[i]!, now)
  drawBoard(ctx, state.slots[2]!, now)
  for (let i = 0; i < 3; i += 1) {
    const item = state.slots[i]!
    if (item === null || item.phase !== 'timing') continue
    const cx = i < 2 ? BURNERS[i]!.x : BOARD.x + BOARD.w / 2
    const y = i < 2 ? BURNERS[i]!.y + BURNER_R + 10 : BOARD.y + BOARD.h + 6
    drawHeatBar(ctx, cx, y, item)
  }

  // 出餐飞出：餐盘从厨房中心升起飞出
  if (state.servedTotal > prevServed && prevServed !== -1) {
    flyOffs.push({ x: KITCHEN_X + KITCHEN_W / 2, y: KITCHEN_Y + 150, life: 0 })
    particles.burst(KITCHEN_X + KITCHEN_W / 2, KITCHEN_Y + 130, THEME.gold, 14, 160)
  }
  prevServed = state.servedTotal
  // 糊烟：灰烟团从灶眼/砧板上升起
  if (state.burnCount > prevBurn && prevBurn !== -1) {
    smokes.push({ x: KITCHEN_X + KITCHEN_W / 2, y: KITCHEN_Y + 160, life: 0, size: 18 })
    particles.burst(KITCHEN_X + KITCHEN_W / 2, KITCHEN_Y + 160, THEME.bad, 10, 120)
  }
  prevBurn = state.burnCount

  for (let i = flyOffs.length - 1; i >= 0; i -= 1) {
    const f = flyOffs[i]!
    f.life += dt
    if (f.life > 700) { flyOffs.splice(i, 1); continue }
    const t = f.life / 700
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = '#e2e2ee'
    ctx.beginPath()
    ctx.ellipse(f.x + t * 90, f.y - t * 110, 22, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  for (let i = smokes.length - 1; i >= 0; i -= 1) {
    const s = smokes[i]!
    s.life += dt
    if (s.life > 900) { smokes.splice(i, 1); continue }
    const t = s.life / 900
    ctx.globalAlpha = (1 - t) * 0.5
    ctx.fillStyle = '#8a8a99'
    ctx.beginPath()
    ctx.arc(s.x + Math.sin(t * 6) * 10, s.y - t * 70, s.size * (0.6 + t), 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  particles.tick(ctx, dt)

  if (state.phase === 'over') {
    drawOverlay(
      ctx, LOGICAL_W, LOGICAL_H, '完美收官！',
      '出餐 ' + state.servedTotal + ' 份 · 分数 ' + state.score + ' · 按 R 再来一局',
      THEME.gold,
    )
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · 按 R 重开')
  }
}
