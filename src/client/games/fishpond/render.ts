/**
 * 鱼塘物语渲染层：俯视鱼塘（水面波纹、鱼的游动轨迹与摆尾转弯、大小阶段
 * 体型、颜色基因渲染、饥饿气泡、出售确认挂牌）、钓鱼场景（力度条甜区、
 * 浮漂沉浮动画、提竿水花、鱼影游过）、市场面板（六品种每日行情与涨跌、
 * 鱼苗/鱼粮/扩塘商店卡）、金币/体力/鱼粮/游戏日/图鉴 HUD 与过关遮罩。
 * 基于共享主题工具，纯 canvas 绘制；观察金币与钓鱼结果触发粒子。
 */
import type { FishpondState, Genes, PondFish } from './logic.ts'
import {
  BASE_SLOTS, EXPAND_COSTS, FOOD_COST, FOOD_PER_BUY, LEVELS, MAX_ENERGY, MAX_SLOTS,
  POWER_HI, POWER_LO, SPECIES, SPECIES_ORDER, expansionCost, fryCost, isStarving,
  priceMultiplier, sellPrice, stageOf,
} from './logic.ts'
import {
  THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = 760
export const LOGICAL_H = 540

/** 三个区域视图。 */
export type View = 'pond' | 'fish' | 'market'

/** HUD 高度。 */
const HUD_H = 26
/** 导航标签。 */
const NAV_Y = 34
const NAV_W = 70
const NAV_H = 24
const NAV_X0 = LOGICAL_W - 14 - NAV_W * 3 - 8 * 2
/** 俯视鱼塘水面。 */
const WATER_X = 20
const WATER_Y = 72
const WATER_W = 496
const WATER_H = 400
/** 右侧信息面板。 */
const SIDE_X = 532
const SIDE_W = LOGICAL_H > 0 ? LOGICAL_W - SIDE_X - 14 : 214
/** 结束今天按钮。 */
export const NEXT_DAY_RECT = { x: SIDE_X, y: LOGICAL_H - 46, w: SIDE_W, h: 32 }

const particles = createParticles()
let prevCoins = -1
let prevFishingStatus = 'idle'

/** 塘格中心（3 列网格，行优先），供渲染与命中测试共用。 */
export function slotCenter(slot: number, slots: number): { x: number, y: number } {
  const cols = 3
  const rows = Math.ceil(slots / cols)
  const cw = WATER_W / cols
  const ch = WATER_H / rows
  const c = slot % cols
  const r = Math.floor(slot / cols)
  return { x: WATER_X + c * cw + cw / 2, y: WATER_Y + r * ch + ch / 2 }
}

/**
 * 命中测试：逻辑坐标落在哪个塘格（3 列网格矩形判定）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param state - 游戏状态。
 * @returns 塘格下标，未命中返回 null。
 */
export function pondSlotAt(x: number, y: number, state: FishpondState): number | null {
  if (x < WATER_X || x > WATER_X + WATER_W || y < WATER_Y || y > WATER_Y + WATER_H) return null
  const cols = 3
  const rows = Math.ceil(state.pondSlots / cols)
  const c = Math.floor(((x - WATER_X) / WATER_W) * cols)
  const r = Math.floor(((y - WATER_Y) / WATER_H) * rows)
  const slot = r * cols + c
  return slot >= 0 && slot < state.pondSlots ? slot : null
}

/**
 * 命中测试：逻辑坐标点中哪个导航标签。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 视图 id，未命中返回 null。
 */
export function navAt(x: number, y: number): View | null {
  if (y < NAV_Y || y > NAV_Y + NAV_H) return null
  const labels: View[] = ['pond', 'fish', 'market']
  for (let i = 0; i < labels.length; i += 1) {
    const nx = NAV_X0 + i * (NAV_W + 8)
    if (x >= nx && x <= nx + NAV_W) return labels[i]!
  }
  return null
}

/** 商店条目。 */
export type ShopItem =
  | { kind: 'fry', species: (typeof SPECIES_ORDER)[number] & ('crucian' | 'guppy' | 'carp') }
  | { kind: 'food' }
  | { kind: 'expand' }

/** 商店卡矩形（按渲染顺序），供命中测试与绘制共用。 */
const SHOP_FRY = ['crucian', 'guppy', 'carp'] as const
const SHOP_X = 400
const SHOP_W = LOGICAL_W - SHOP_X - 14
const SHOP_ROW_H = 62
const SHOP_Y0 = 96

/**
 * 命中测试：逻辑坐标点中哪个商店条目。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 商店条目，未命中返回 null。
 */
export function shopAt(x: number, y: number): ShopItem | null {
  if (x < SHOP_X || x > SHOP_X + SHOP_W) return null
  for (let i = 0; i < SHOP_FRY.length; i += 1) {
    const ry = SHOP_Y0 + i * (SHOP_ROW_H + 8)
    if (y >= ry && y <= ry + SHOP_ROW_H) return { kind: 'fry', species: SHOP_FRY[i]! }
  }
  const foodY = SHOP_Y0 + 3 * (SHOP_ROW_H + 8)
  if (y >= foodY && y <= foodY + SHOP_ROW_H) return { kind: 'food' }
  const expandY = SHOP_Y0 + 4 * (SHOP_ROW_H + 8)
  if (y >= expandY && y <= expandY + SHOP_ROW_H) return { kind: 'expand' }
  return null
}

/** 基因 → 体表颜色（三通道 0-9 映射 0-255）。 */
export function geneColor(genes: Genes): string {
  const ch = (v: number): number => Math.round((v / 9) * 255)
  return 'rgb(' + ch(genes[0]) + ',' + ch(genes[1]) + ',' + ch(genes[2]) + ')'
}

/**
 * 画一条鱼：基因色身体 + 品种色尾鳍（摆尾相位模拟转弯）、大小阶段体型、
 * 眼睛与性别记号；饥饿鱼冒气泡；待售鱼挂牌。
 */
function drawFish(ctx: CanvasRenderingContext2D, fish: PondFish, nowMs: number, state: FishpondState): void {
  const center = slotCenter(fish.slot, state.pondSlots)
  const stage = stageOf(fish)
  // 游动轨迹：绕格心缓慢巡游，相位由 id 错开
  const t = nowMs / 1000
  const px = center.x + Math.sin(t * 0.9 + fish.id * 1.7) * 16
  const py = center.y + Math.cos(t * 0.6 + fish.id * 2.3) * 10
  const dir = Math.cos(t * 0.9 + fish.id * 1.7) >= 0 ? 1 : -1
  const bodyR = stage === 2 ? 13 : stage === 1 ? 9 : 5.5
  const wag = Math.sin(t * 7 + fish.id) * 0.5
  const bodyColor = geneColor(fish.genes)
  const finColor = SPECIES[fish.species].color
  ctx.save()
  ctx.translate(px, py)
  ctx.scale(dir, 1)
  // 尾鳍（摆尾）
  ctx.fillStyle = finColor
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.moveTo(-bodyR * 0.8, 0)
  ctx.lineTo(-bodyR * 1.7, -bodyR * 0.7 + wag * bodyR * 0.5)
  ctx.lineTo(-bodyR * 1.7, bodyR * 0.7 + wag * bodyR * 0.5)
  ctx.closePath()
  ctx.fill()
  // 身体
  ctx.globalAlpha = 1
  glow(ctx, bodyColor, 6)
  ctx.fillStyle = bodyColor
  ctx.beginPath()
  ctx.ellipse(0, 0, bodyR * 1.25, bodyR * 0.72, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 背鳍
  ctx.fillStyle = finColor
  ctx.beginPath()
  ctx.moveTo(-bodyR * 0.2, -bodyR * 0.6)
  ctx.lineTo(bodyR * 0.3, -bodyR * 1.05)
  ctx.lineTo(bodyR * 0.5, -bodyR * 0.55)
  ctx.closePath()
  ctx.fill()
  // 眼睛
  ctx.fillStyle = '#10101a'
  ctx.beginPath()
  ctx.arc(bodyR * 0.55, -bodyR * 0.15, Math.max(1.4, bodyR * 0.16), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 性别记号（成鱼显示）
  if (stage === 2) {
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = fish.sex === 'M' ? '#7aa2f7' : '#f7768e'
    ctx.fillText(fish.sex === 'M' ? '♂' : '♀', px + bodyR + 2, py - bodyR)
  }
  // 今天已喂：小绿点
  if (fish.fedToday) {
    ctx.fillStyle = THEME.good
    ctx.beginPath()
    ctx.arc(px - bodyR - 4, py - bodyR, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  // 饥饿气泡（连饿 2 天）
  if (isStarving(fish)) {
    ctx.strokeStyle = 'rgba(226,226,238,0.6)'
    ctx.lineWidth = 1
    for (let i = 0; i < 3; i += 1) {
      const bt = ((nowMs / 900 + i * 0.33) % 1)
      ctx.globalAlpha = 1 - bt
      ctx.beginPath()
      ctx.arc(px + Math.sin(fish.id + i * 2) * 6, py - bodyR - bt * 22, 2 + i * 0.8, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  // 出售确认挂牌
  if (state.pendingSell === fish.slot) {
    const price = sellPrice(state, fish)
    const label = '再点出售 ' + price + ' 币'
    ctx.font = '600 11px system-ui, sans-serif'
    const w = ctx.measureText(label).width + 12
    ctx.fillStyle = 'rgba(30,30,42,0.92)'
    roundRectPath(ctx, px - w / 2, py - bodyR - 26, w, 18, 6)
    ctx.fill()
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    ctx.fillText(label, px, py - bodyR - 13)
  }
}

/** 画俯视鱼塘：水面渐变、波纹、塘格、鱼群。 */
function drawPondView(ctx: CanvasRenderingContext2D, state: FishpondState, nowMs: number): void {
  // 水面
  const waterGradient = ctx.createLinearGradient(0, WATER_Y, 0, WATER_Y + WATER_H)
  waterGradient.addColorStop(0, '#1c3050')
  waterGradient.addColorStop(1, '#12203a')
  ctx.fillStyle = waterGradient
  roundRectPath(ctx, WATER_X, WATER_Y, WATER_W, WATER_H, 14)
  ctx.fill()
  ctx.strokeStyle = '#2e4a72'
  ctx.lineWidth = 2
  ctx.stroke()
  // 波纹：三处同心扩散环
  ctx.strokeStyle = 'rgba(125,207,255,0.28)'
  ctx.lineWidth = 1.5
  const rippleSpots = [
    { x: WATER_X + WATER_W * 0.25, y: WATER_Y + WATER_H * 0.3 },
    { x: WATER_X + WATER_W * 0.7, y: WATER_Y + WATER_H * 0.62 },
    { x: WATER_X + WATER_W * 0.45, y: WATER_Y + WATER_H * 0.82 },
  ]
  for (let i = 0; i < rippleSpots.length; i += 1) {
    const spot = rippleSpots[i]!
    const rt = ((nowMs / 2400 + i * 0.37) % 1)
    ctx.globalAlpha = 1 - rt
    ctx.beginPath()
    ctx.ellipse(spot.x, spot.y, 8 + rt * 34, (8 + rt * 34) * 0.45, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  // 塘格
  const cols = 3
  const rows = Math.ceil(state.pondSlots / cols)
  const cw = WATER_W / cols
  const ch = WATER_H / rows
  ctx.strokeStyle = 'rgba(46,74,114,0.85)'
  ctx.lineWidth = 1
  for (let i = 0; i < state.pondSlots; i += 1) {
    const center = slotCenter(i, state.pondSlots)
    ctx.strokeRect(center.x - cw / 2 + 4, center.y - ch / 2 + 4, cw - 8, ch - 8)
    if (state.pond[i] === null || state.pond[i] === undefined) {
      ctx.fillStyle = 'rgba(125,207,255,0.05)'
      ctx.fillRect(center.x - cw / 2 + 4, center.y - ch / 2 + 4, cw - 8, ch - 8)
    }
  }
  // 鱼（按格序，后画的在上层）
  for (let i = 0; i < state.pondSlots; i += 1) {
    const fish = state.pond[i]
    if (fish !== null && fish !== undefined) drawFish(ctx, fish, nowMs, state)
  }
  drawSidePanel(ctx, state)
}

/** 右侧信息面板：图鉴、操作提示、结束今天按钮。 */
function drawSidePanel(ctx: CanvasRenderingContext2D, state: FishpondState): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, SIDE_X, WATER_Y, SIDE_W, 300, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('图鉴（' + SPECIES_ORDER.filter(s => state.collected[s]).length + ' / 6）', SIDE_X + 12, WATER_Y + 22)
  for (let i = 0; i < SPECIES_ORDER.length; i += 1) {
    const id = SPECIES_ORDER[i]!
    const spec = SPECIES[id]
    const ry = WATER_Y + 40 + i * 30
    const got = state.collected[id]
    ctx.globalAlpha = got ? 1 : 0.35
    ctx.fillStyle = spec.color
    ctx.beginPath()
    ctx.arc(SIDE_X + 20, ry, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(spec.name, SIDE_X + 34, ry + 4)
    ctx.fillStyle = got ? THEME.good : THEME.textMuted
    ctx.fillText(got ? '✓ 已收集' : '？未收集', SIDE_X + 100, ry + 4)
    ctx.globalAlpha = 1
  }
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点击幼鱼：喂食（耗 1 鱼粮）', SIDE_X + 12, WATER_Y + 232)
  ctx.fillText('点击成鱼两次：按行情卖出', SIDE_X + 12, WATER_Y + 250)
  ctx.fillText('一公一母成鱼相邻自动繁殖', SIDE_X + 12, WATER_Y + 268)
  // 结束今天按钮
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, NEXT_DAY_RECT.x, NEXT_DAY_RECT.y, NEXT_DAY_RECT.w, NEXT_DAY_RECT.h, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillStyle = THEME.good
  ctx.fillText('结束今天 ▶', NEXT_DAY_RECT.x + NEXT_DAY_RECT.w / 2, NEXT_DAY_RECT.y + 21)
}

/** 画力度条：竖条 + 甜区高亮 + 当前游标。 */
function drawPowerBar(ctx: CanvasRenderingContext2D, state: FishpondState): void {
  const bx = 64
  const by = 110
  const bh = 240
  const bw = 22
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, bx - 8, by - 8, bw + 16, bh + 16, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(226,226,238,0.12)'
  ctx.fillRect(bx, by, bw, bh)
  // 甜区（注意画布 y 向下：力度 0 在下、1 在上）
  const zoneTop = by + bh * (1 - POWER_HI)
  const zoneH = bh * (POWER_HI - POWER_LO)
  glow(ctx, THEME.good, 8)
  ctx.fillStyle = 'rgba(158,206,106,0.4)'
  ctx.fillRect(bx, zoneTop, bw, zoneH)
  noGlow(ctx)
  const cursorY = by + bh * (1 - state.fishing.power)
  ctx.fillStyle = THEME.text
  ctx.fillRect(bx - 4, cursorY - 3, bw + 8, 6)
  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('力度', bx + bw / 2, by + bh + 26)
}

/** 画钓鱼场景：侧视水面、浮漂、鱼影、状态提示。 */
function drawFishingView(ctx: CanvasRenderingContext2D, state: FishpondState, nowMs: number): void {
  const horizon = 250
  // 天空与水面
  ctx.fillStyle = '#151a2e'
  ctx.fillRect(0, HUD_H, LOGICAL_W, horizon - HUD_H)
  const sea = ctx.createLinearGradient(0, horizon, 0, LOGICAL_H)
  sea.addColorStop(0, '#1c3050')
  sea.addColorStop(1, '#101d33')
  ctx.fillStyle = sea
  ctx.fillRect(0, horizon, LOGICAL_W, LOGICAL_H - horizon)
  // 水天线波光
  ctx.strokeStyle = 'rgba(125,207,255,0.35)'
  ctx.lineWidth = 1
  for (let i = 0; i < 9; i += 1) {
    const wx = ((nowMs / 60 + i * 97) % (LOGICAL_W + 80)) - 40
    ctx.globalAlpha = 0.5 - i * 0.04
    ctx.beginPath()
    ctx.moveTo(wx, horizon + 2)
    ctx.lineTo(wx + 30, horizon + 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  // 鱼影（等待期在水下巡游）
  if (state.fishing.status === 'wait' || state.fishing.status === 'power') {
    const t = nowMs / 1000
    for (let i = 0; i < 3; i += 1) {
      const fx = LOGICAL_W - ((t * 26 + i * 190) % (LOGICAL_W + 120)) + 60
      const fy = horizon + 70 + Math.sin(t * 1.4 + i * 2.1) * 22 + i * 34
      ctx.fillStyle = 'rgba(10,16,30,0.55)'
      ctx.beginPath()
      ctx.ellipse(fx, fy, 22 - i * 4, 8 - i, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  drawPowerBar(ctx, state)
  // 浮漂与钓竿
  const bobberX = LOGICAL_W - 180
  let bobberY = horizon + 6
  const f = state.fishing
  if (f.status === 'wait') {
    // 咬钩窗口内猛烈下沉，否则轻微起伏
    const biting = f.elapsed >= f.biteAt - f.halfWindow && f.elapsed <= f.biteAt + f.halfWindow
    bobberY += biting ? 16 + Math.sin(nowMs / 40) * 3 : Math.sin(nowMs / 300) * 3
  } else if (f.status === 'result' && f.pending !== null) {
    bobberY += 20
  }
  ctx.strokeStyle = '#8a6d46'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(bobberX - 90, LOGICAL_H - 60)
  ctx.quadraticCurveTo(bobberX - 30, horizon - 60, bobberX, bobberY - 4)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(226,226,238,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(bobberX, bobberY - 4)
  ctx.lineTo(bobberX, bobberY)
  ctx.stroke()
  glow(ctx, f.status === 'wait' ? THEME.bad : THEME.text, 8)
  ctx.fillStyle = f.status === 'wait' ? '#f7768e' : '#e2e2ee'
  ctx.beginPath()
  ctx.arc(bobberX, bobberY, 7, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 状态文案
  ctx.textAlign = 'center'
  ctx.font = '700 18px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  let headline = '点击水面抛竿（耗 1 体力）'
  if (f.status === 'power') headline = '再点一次锁定力度！'
  else if (f.status === 'wait') {
    const biting = f.elapsed >= f.biteAt - f.halfWindow && f.elapsed <= f.biteAt + f.halfWindow
    headline = biting ? '现在！快提竿！' : '等浮漂下沉……'
    ctx.fillStyle = biting ? THEME.gold : THEME.text
  } else if (f.status === 'result') {
    if (f.pending !== null) {
      headline = '钓到 ' + SPECIES[f.pending.species].name + '！'
      ctx.fillStyle = THEME.good
    } else {
      headline = state.message
      ctx.fillStyle = THEME.bad
    }
  }
  ctx.fillText(headline, LOGICAL_W / 2 + 40, 120)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('力度进甜区 → 浮漂下沉瞬间点击提竿 · 体力 ' + state.energy + ' / ' + MAX_ENERGY, LOGICAL_W / 2 + 40, 144)
  // 咬钩进度环（等待期）
  if (f.status === 'wait') {
    const progress = Math.min(1, f.elapsed / (f.biteAt + f.halfWindow))
    ctx.strokeStyle = 'rgba(226,226,238,0.25)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(bobberX, bobberY - 26, 12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = THEME.gold
    ctx.beginPath()
    ctx.arc(bobberX, bobberY - 26, 12, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
    ctx.stroke()
  }
  // 结果卡片：钓到的鱼入塘预览
  if (f.status === 'result' && f.pending !== null) {
    const fish = f.pending
    const cardX = LOGICAL_W / 2 + 40
    const cardY = 190
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, cardX - 110, cardY, 220, 96, 10)
    ctx.fill()
    ctx.strokeStyle = THEME.good
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = geneColor(fish.genes)
    ctx.beginPath()
    ctx.ellipse(cardX - 70, cardY + 34, 26, 13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = SPECIES[fish.species].color
    ctx.beginPath()
    ctx.moveTo(cardX - 92, cardY + 34)
    ctx.lineTo(cardX - 106, cardY + 24)
    ctx.lineTo(cardX - 106, cardY + 44)
    ctx.closePath()
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.font = '700 15px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(SPECIES[fish.species].name + (fish.sex === 'M' ? ' ♂' : ' ♀'), cardX - 30, cardY + 30)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('基因 ' + fish.genes.join('-'), cardX - 30, cardY + 48)
    ctx.fillText('点击放入鱼塘', cardX - 30, cardY + 66)
  }
}

/** 画市场面板：六品种行情与 7 日迷你走势、商店卡。 */
function drawMarketView(ctx: CanvasRenderingContext2D, state: FishpondState): void {
  // 行情表
  const tblX = 20
  const tblY = 96
  const tblW = 350
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, tblX, tblY - 28, tblW, 368, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('今日行情（成鱼基准价 × 行情）', tblX + 14, tblY - 8)
  for (let i = 0; i < SPECIES_ORDER.length; i += 1) {
    const id = SPECIES_ORDER[i]!
    const spec = SPECIES[id]
    const ry = tblY + 22 + i * 52
    const mult = priceMultiplier(id, state.day, state.seed)
    const prev = priceMultiplier(id, state.day - 1, state.seed)
    const price = Math.round(spec.base * mult)
    ctx.fillStyle = spec.color
    ctx.beginPath()
    ctx.arc(tblX + 26, ry, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(spec.name, tblX + 42, ry + 4)
    ctx.textAlign = 'right'
    ctx.font = '700 15px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText(String(price) + ' 币', tblX + 150, ry + 4)
    // 涨跌（相对昨天）
    const up = mult >= prev
    ctx.fillStyle = up ? THEME.good : THEME.bad
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillText((up ? '▲ ' : '▼ ') + Math.abs(Math.round((mult - prev) * 100)) + '%', tblX + 210, ry + 4)
    // 7 日迷你走势
    const sparkX = tblX + 226
    ctx.strokeStyle = up ? THEME.good : THEME.bad
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let d = 0; d < 7; d += 1) {
      const m = priceMultiplier(id, state.day - 6 + d, state.seed)
      const sx = sparkX + d * 16
      const sy = ry - (m - 0.6) * 40
      if (d === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    ctx.stroke()
    ctx.textAlign = 'left'
  }
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('正弦周期 ' + 7 + ' 天 + 种子噪声：等高价再卖', tblX + 14, tblY + 326)
  // 商店
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillText('商店', SHOP_X + 4, 84)
  for (let i = 0; i < SHOP_FRY.length; i += 1) {
    const id = SHOP_FRY[i]!
    const ry = SHOP_Y0 + i * (SHOP_ROW_H + 8)
    drawShopCard(ctx, SHOP_X, ry, state, fryCost(id), true)
    ctx.fillStyle = SPECIES[id].color
    ctx.beginPath()
    ctx.ellipse(SHOP_X + 30, ry + SHOP_ROW_H / 2, 16, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(SPECIES[id].name + '鱼苗', SHOP_X + 56, ry + 24)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(SPECIES[id].growDays + ' 天养成 · 基准 ' + SPECIES[id].base + ' 币', SHOP_X + 56, ry + 44)
  }
  const foodY = SHOP_Y0 + 3 * (SHOP_ROW_H + 8)
  drawShopCard(ctx, SHOP_X, foodY, state, FOOD_COST, state.coins >= FOOD_COST)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = '#e0af68'
  ctx.fillText('鱼粮 ×' + FOOD_PER_BUY, SHOP_X + 20, foodY + 25)
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillText('点击幼鱼消耗喂食 · 现有 ' + state.food + ' 份', SHOP_X + 20, foodY + 45)
  const expandY = SHOP_Y0 + 4 * (SHOP_ROW_H + 8)
  const cost = expansionCost(state)
  drawShopCard(ctx, SHOP_X, expandY, state, cost, cost > 0 && state.coins >= cost)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = '#7dcfff'
  ctx.fillText('扩建鱼塘', SHOP_X + 20, expandY + 25)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const expandText = cost > 0
    ? (state.coins >= cost ? cost : EXPAND_COSTS[state.pondSlots - BASE_SLOTS] ?? 0) + ' 币 → ' + (state.pondSlots + 1) + ' 格'
    : '已满 ' + MAX_SLOTS + ' 格'
  ctx.fillText(expandText, SHOP_X + 20, expandY + 45)
}

/** 商店卡底与可购态描边。 */
function drawShopCard(ctx: CanvasRenderingContext2D, x: number, y: number, state: FishpondState, cost: number, affordable: boolean): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, x, y, SHOP_W, SHOP_ROW_H, 8)
  ctx.fill()
  ctx.strokeStyle = affordable ? THEME.good : THEME.panelEdge
  ctx.lineWidth = affordable ? 1.5 : 1
  ctx.stroke()
  ctx.textAlign = 'right'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillStyle = affordable ? THEME.gold : THEME.bad
  ctx.fillText(cost > 0 ? String(cost) + ' 币' : '售罄', x + SHOP_W - 14, y + SHOP_ROW_H / 2 + 5)
  ctx.textAlign = 'left'
  void state
}

/** 画顶部 HUD：金币/游戏日/体力/鱼粮 + 关卡目标 + 导航标签。 */
function drawHud(ctx: CanvasRenderingContext2D, state: FishpondState, view: View): void {
  const level = LEVELS[state.levelIndex]!
  hudPair(ctx, 14, 18, '金币', String(state.coins), 'left', THEME.gold)
  hudPair(ctx, 130, 18, '第 ' + state.day + ' 天', '', 'left')
  let hearts = ''
  for (let i = 0; i < MAX_ENERGY; i += 1) hearts += i < state.energy ? '●' : '○'
  hudPair(ctx, 240, 18, '体力', hearts, 'left', state.energy > 0 ? '#f7768e' : THEME.bad)
  hudPair(ctx, 360, 18, '鱼粮', String(state.food), 'left', '#e0af68')
  const goalMet = state.coins >= level.target && (!level.needAllSpecies || SPECIES_ORDER.every(s => state.collected[s]))
  hudPair(ctx, 520, 18, 'L' + (state.levelIndex + 1), level.label, 'left', goalMet ? THEME.good : THEME.text)
  // 导航标签
  const labels: { id: View, name: string }[] = [
    { id: 'pond', name: '鱼塘' },
    { id: 'fish', name: '钓点' },
    { id: 'market', name: '市场' },
  ]
  for (let i = 0; i < labels.length; i += 1) {
    const nx = NAV_X0 + i * (NAV_W + 8)
    const active = view === labels[i]!.id
    ctx.fillStyle = active ? THEME.panelEdge : THEME.panel
    roundRectPath(ctx, nx, NAV_Y, NAV_W, NAV_H, 6)
    ctx.fill()
    ctx.strokeStyle = active ? THEME.accents[0] : THEME.panelEdge
    ctx.lineWidth = active ? 1.5 : 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = active ? THEME.text : THEME.textMuted
    ctx.fillText(labels[i]!.name, nx + NAV_W / 2, NAV_Y + 16)
  }
  // 消息条
  if (state.message !== '') {
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(state.message, LOGICAL_W / 2, LOGICAL_H - 12)
  }
}

/**
 * 画整帧：背景 → HUD → 当前区域视图 → 粒子 → 过关/暂停遮罩。
 * 观察金币增长触发金粒子、钓鱼入 result 触发水花。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param view - 当前区域视图。
 * @param paused - 是否暂停。
 */
export function renderFishpond(ctx: CanvasRenderingContext2D, state: FishpondState, view: View, paused: boolean): void {
  const now = performance.now()
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawHud(ctx, state, view)
  if (view === 'pond') drawPondView(ctx, state, now)
  else if (view === 'fish') drawFishingView(ctx, state, now)
  else drawMarketView(ctx, state)
  // 粒子：卖出入账 / 钓到鱼水花
  if (state.coins > prevCoins && prevCoins !== -1) {
    particles.burst(SIDE_X + SIDE_W / 2, 60, THEME.gold, 12, 140)
  }
  if (state.fishing.status === 'result' && prevFishingStatus !== 'result') {
    particles.burst(LOGICAL_W - 180, 260, '#7dcfff', 16, 170)
  }
  prevCoins = state.coins
  prevFishingStatus = state.fishing.status
  particles.tick(ctx, 16)
  if (state.phase === 'won') {
    const last = state.levelIndex >= LEVELS.length - 1
    drawOverlay(
      ctx, LOGICAL_W, LOGICAL_H,
      last ? '鱼塘传奇！' : '目标达成！',
      (last ? '集齐 6 品种并赚到 ' + LEVELS[state.levelIndex]!.target + ' 币 · ' : LEVELS[state.levelIndex]!.label + ' · ')
        + '按 N 下一关 · 按 R 重开',
      THEME.gold,
    )
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · 按 R 重开')
  }
}
