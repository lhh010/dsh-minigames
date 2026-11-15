/**
 * 开心农场渲染层：等距视角田块（颜色随状态）、作物三阶段图（苗→半熟→
 * 熟，成熟果实闪烁）、天气横幅（雨滴下落/太阳射线动画）、市场价格条形
 * 走势、底部作物卡（点击购买并选中）、金钱/天数/目标 HUD 与过关遮罩。
 * 基于共享主题工具，纯 canvas 绘制；观察金钱增长触发收获粒子。
 */
import type { CropId, FarmState, FarmTile } from './logic.ts'
import { CROPS, CROP_ORDER, DAY_TICKS, LEVELS, PRICE_MAX, PRICE_MIN } from './logic.ts'
import {
  THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = 760
export const LOGICAL_H = 520

const HUD_H = 24
const FIELD_CX = 250
const FIELD_CY = 250
const TILE_W = 62
const TILE_H = 31
/** 市场走势面板。 */
const MKT_X = 470
const MKT_Y = 56
const MKT_W = 276
const MKT_H = 170
/** 底部作物卡。 */
const CARD_W = 88
const CARD_H = 74
const CARD_GAP = 14
const CARD_Y = LOGICAL_H - CARD_H - 14
const CARD_X0 = (LOGICAL_W - (CARD_W * 3 + CARD_GAP * 2)) / 2

/** 田块状态 → 地面基色（叠加在等距菱形上）。 */
const TILE_COLOR: Record<FarmTile['state'], string> = {
  wasteland: '#3a3a4c',
  tilled: '#6b4a32',
  planted: '#5f4630',
  growing: '#54683c',
  mature: '#3f7a44',
}

const WEATHER_TEXT: Record<FarmState['weather'], string> = {
  sunny: '晴',
  rain: '雨',
  drought: '旱',
}

const particles = createParticles()
let prevMoney = -1

/** 等距中心点缓存：键为 "cols:rows"。 */
const centerCache = new Map<string, { x: number, y: number }[]>()

/**
 * 田块等距中心点（行优先下标对应）：先把整片网格的包围盒平移到田块区
 * 中心，使不同关卡尺寸都居中。
 * @param cols - 列数。
 * @param rows - 行数。
 * @returns 每块田的中心坐标数组。
 */
export function tileCenters(state: FarmState): { x: number, y: number }[] {
  const level = LEVELS[state.levelIndex]!
  const key = level.cols + ':' + level.rows
  let cached = centerCache.get(key)
  if (cached === undefined) {
    const raw: { x: number, y: number }[] = []
    for (let r = 0; r < level.rows; r += 1) {
      for (let c = 0; c < level.cols; c += 1) {
        raw.push({ x: (c - r) * (TILE_W / 2), y: (c + r) * (TILE_H / 2) })
      }
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of raw) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    const ox = FIELD_CX - (minX + maxX) / 2
    const oy = FIELD_CY - (minY + maxY) / 2
    cached = raw.map(p => ({ x: p.x + ox, y: p.y + oy }))
    centerCache.set(key, cached)
  }
  return cached
}

/**
 * 命中测试：逻辑坐标落在哪块田（菱形内判定，逐块扫 ≤30 块）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param state - 游戏状态。
 * @returns 田块下标，未命中返回 null。
 */
export function tileAt(x: number, y: number, state: FarmState): number | null {
  const centers = tileCenters(state)
  for (let i = 0; i < centers.length; i += 1) {
    const p = centers[i]!
    if (Math.abs(x - p.x) / (TILE_W / 2) + Math.abs(y - p.y) / (TILE_H / 2) <= 1) return i
  }
  return null
}

/**
 * 命中测试：逻辑坐标点中哪张作物卡（用于购买并选中）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 作物 id，未命中返回 null。
 */
export function cardAt(x: number, y: number): CropId | null {
  if (y < CARD_Y || y > CARD_Y + CARD_H) return null
  for (let i = 0; i < CROP_ORDER.length; i += 1) {
    const cx = CARD_X0 + i * (CARD_W + CARD_GAP)
    if (x >= cx && x <= cx + CARD_W) return CROP_ORDER[i]!
  }
  return null
}

/**
 * 画一块等距菱形田地：地面色 + 描边，成熟时外发光。
 * @param ctx - 画布上下文。
 * @param cx - 中心横坐标。
 * @param cy - 中心纵坐标。
 * @param tile - 田块。
 */
function drawTileBase(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: FarmTile): void {
  const color = TILE_COLOR[tile.state]
  ctx.beginPath()
  ctx.moveTo(cx, cy - TILE_H / 2)
  ctx.lineTo(cx + TILE_W / 2, cy)
  ctx.lineTo(cx, cy + TILE_H / 2)
  ctx.lineTo(cx - TILE_W / 2, cy)
  ctx.closePath()
  if (tile.state === 'mature') glow(ctx, THEME.good, 8)
  ctx.fillStyle = color
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(13,13,20,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
  if (tile.state === 'wasteland') {
    // 荒地：撒几粒石子点
    ctx.fillStyle = 'rgba(226,226,238,0.25)'
    for (const [dx, dy] of [[-12, 2], [4, -4], [12, 5], [-3, 8]] as const) {
      ctx.fillRect(cx + dx, cy + dy, 2, 2)
    }
  }
  if (tile.state === 'planted') {
    // 已播种：中央一粒种子 + 需水刻度（旱两次）
    ctx.fillStyle = CROPS[tile.crop ?? 'carrot'].color
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < tile.waterNeed; i += 1) {
      ctx.fillStyle = i < tile.waterCount ? '#7dcfff' : 'rgba(226,226,238,0.2)'
      ctx.beginPath()
      ctx.arc(cx - 6 + i * 6, cy + TILE_H / 2 - 4, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/**
 * 画作物生长阶段图：苗（小茎）→半熟（茎 + 小果）→熟（大果，闪烁）。
 * @param ctx - 画布上下文。
 * @param cx - 田块中心横坐标。
 * @param cy - 田块中心纵坐标。
 * @param tile - 田块。
 * @param nowMs - 当前 performance.now()（成熟闪烁相位）。
 */
function drawCrop(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: FarmTile, nowMs: number): void {
  const crop = CROPS[tile.crop ?? 'carrot']
  const ratio = tile.crop === null ? 0 : tile.growth / crop.growTicks
  if (tile.state === 'growing') {
    // 茎随比例长高
    const h = 6 + ratio * 14
    ctx.strokeStyle = '#9ece6a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx, cy - h)
    ctx.stroke()
    if (ratio >= 0.4) {
      ctx.fillStyle = crop.color
      ctx.beginPath()
      ctx.arc(cx, cy - h, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    return
  }
  if (tile.state === 'mature') {
    const blink = 0.7 + 0.3 * Math.sin(nowMs / 180)
    ctx.globalAlpha = blink
    glow(ctx, crop.color, 10)
    ctx.fillStyle = crop.color
    ctx.beginPath()
    ctx.arc(cx, cy - 8, 7, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#9ece6a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx, cy - 3)
    ctx.stroke()
  }
}

/**
 * 画天气横幅：文案 + 太阳射线旋转（晴/旱）或雨滴下落（雨）。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param nowMs - 当前 performance.now()。
 */
function drawWeatherBanner(ctx: CanvasRenderingContext2D, state: FarmState, nowMs: number): void {
  const bx = LOGICAL_W / 2
  const by = 58
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, bx - 92, by - 16, 184, 30, 15)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = state.weather === 'drought' ? THEME.bad : state.weather === 'rain' ? '#7dcfff' : THEME.gold
  const hint = state.weather === 'drought' ? '（需浇两次水）' : state.weather === 'rain' ? '（全场自动浇水）' : ''
  ctx.fillText('今日 · ' + WEATHER_TEXT[state.weather] + hint, bx - 76, by + 4)
  const ix = bx + 70
  if (state.weather === 'rain') {
    ctx.fillStyle = '#7dcfff'
    for (let i = 0; i < 3; i += 1) {
      const t = ((nowMs / 300 + i * 0.33) % 1)
      ctx.globalAlpha = 1 - t
      ctx.fillRect(ix - 8 + i * 6, by - 12 + t * 22, 2, 6)
    }
    ctx.globalAlpha = 1
  } else {
    const ang = nowMs / 600
    ctx.strokeStyle = state.weather === 'drought' ? THEME.bad : THEME.gold
    ctx.lineWidth = 2
    for (let i = 0; i < 8; i += 1) {
      const a = ang + (i * Math.PI) / 4
      ctx.beginPath()
      ctx.moveTo(ix + Math.cos(a) * 7, by - 2 + Math.sin(a) * 7)
      ctx.lineTo(ix + Math.cos(a) * 10, by - 2 + Math.sin(a) * 10)
      ctx.stroke()
    }
  }
}

/**
 * 画市场走势面板：当前倍率百分比 + 最近 26 个 tick 的条形走势（>1 绿
 * 上、<1 红下，中线为 ×1.0）。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 */
function drawMarket(ctx: CanvasRenderingContext2D, state: FarmState): void {
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, MKT_X, MKT_Y, MKT_W, MKT_H, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('市场行情', MKT_X + 12, MKT_Y + 20)
  const pct = Math.round(state.marketMult * 100)
  ctx.textAlign = 'right'
  ctx.font = '700 16px system-ui, sans-serif'
  ctx.fillStyle = state.marketMult >= 1 ? THEME.good : THEME.bad
  ctx.fillText('×' + (state.marketMult).toFixed(2) + '（' + pct + '%）', MKT_X + MKT_W - 12, MKT_Y + 22)

  const bars = state.marketHistory.slice(-26)
  const baseY = MKT_Y + 108
  const half = 40
  const span = PRICE_MAX - PRICE_MIN
  // 中线（×1.0）
  ctx.strokeStyle = 'rgba(226,226,238,0.2)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(MKT_X + 12, baseY)
  ctx.lineTo(MKT_X + MKT_W - 12, baseY)
  ctx.stroke()
  const bw = (MKT_W - 24) / 26
  for (let i = 0; i < bars.length; i += 1) {
    const m = bars[i]!
    const up = m >= 1
    const h = ((m - 1) / span) * half * 2
    const x = MKT_X + 12 + i * bw
    ctx.fillStyle = up ? THEME.good : THEME.bad
    if (up) ctx.fillRect(x + 1, baseY - h, bw - 2, h)
    else ctx.fillRect(x + 1, baseY, bw - 2, -h)
  }
  ctx.textAlign = 'left'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('种子买价与收成卖价随此指数浮动——低买高卖', MKT_X + 12, MKT_Y + MKT_H - 10)
}

/**
 * 画底部作物卡：名称、库存、买价、生长 tick；选中卡描边高亮。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 */
function drawCards(ctx: CanvasRenderingContext2D, state: FarmState): void {
  ctx.textAlign = 'center'
  for (let i = 0; i < CROP_ORDER.length; i += 1) {
    const id = CROP_ORDER[i]!
    const crop = CROPS[id]
    const x = CARD_X0 + i * (CARD_W + CARD_GAP)
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, x, CARD_Y, CARD_W, CARD_H, 8)
    ctx.fill()
    if (state.selectedCrop === id) {
      glow(ctx, crop.color, 8)
      ctx.strokeStyle = crop.color
      ctx.lineWidth = 2
      ctx.stroke()
      noGlow(ctx)
    } else {
      ctx.strokeStyle = THEME.panelEdge
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(crop.name, x + CARD_W / 2, CARD_Y + 18)
    ctx.fillStyle = crop.color
    ctx.beginPath()
    ctx.arc(x + CARD_W / 2, CARD_Y + 32, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('库存 ' + state.seedStock[id] + ' · 买 ' + Math.max(1, Math.round(crop.seedCost * state.marketMult)), x + CARD_W / 2, CARD_Y + 50)
    ctx.fillText(crop.growTicks + ' tick 熟 · 卖 ' + Math.round(crop.sellPrice * state.marketMult), x + CARD_W / 2, CARD_Y + 64)
  }
}

/**
 * 画整帧：背景 → HUD → 天气横幅 → 等距田块与作物 → 市场面板 → 作物卡
 * → 粒子 → 遮罩。观察金钱增长触发收获粒子。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export function renderFarm(ctx: CanvasRenderingContext2D, state: FarmState, paused: boolean): void {
  const now = performance.now()
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  const level = LEVELS[state.levelIndex]!
  hudPair(ctx, 14, HUD_H, '金钱', String(state.money), 'left', THEME.gold)
  const dayColor = state.day > level.days - 1 ? THEME.bad : THEME.text
  hudPair(ctx, LOGICAL_W / 2 - 60, HUD_H, '第', state.day + ' / ' + level.days + ' 天 · ' + Math.round(state.tickInDay / DAY_TICKS * 100) + '%', 'left', dayColor)
  hudPair(ctx, LOGICAL_W - 14, HUD_H, '目标', state.money + ' / ' + level.target, 'right', state.money >= level.target ? THEME.good : THEME.text)

  drawWeatherBanner(ctx, state, now)

  const centers = tileCenters(state)
  for (let i = 0; i < state.tiles.length; i += 1) {
    drawTileBase(ctx, centers[i]!.x, centers[i]!.y, state.tiles[i]!)
  }
  for (let i = 0; i < state.tiles.length; i += 1) {
    drawCrop(ctx, centers[i]!.x, centers[i]!.y, state.tiles[i]!, now)
  }

  drawMarket(ctx, state)
  drawCards(ctx, state)

  if (state.money > prevMoney && prevMoney !== -1) {
    particles.burst(FIELD_CX, FIELD_CY, THEME.gold, 12, 140)
  }
  prevMoney = state.money
  particles.tick(ctx, 16)

  if (state.phase === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '达标丰收！', '赚到 ' + state.money + ' / ' + level.target + ' · 按 N 下一关 · 按 R 重开本关', THEME.gold)
  } else if (state.phase === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '季节过去了…', '仅赚到 ' + state.money + ' / ' + level.target + ' · 按 R 重开本关', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · 按 R 重开')
  }
}
