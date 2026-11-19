/**
 * 收获季节渲染层：纯 canvas 绘制（无 DOM、无状态）。四季色调田格、
 * 作物生长阶段图（苗→开花→成熟→过熟警示）、温室格标识、天气横幅、
 * 资产/周数/目标 HUD、作物卡池、动作按钮与季末结算 overlay。布局
 * 命中检测（tileAt/cardAt/buttonAt）与绘制共用同一份几何常量。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'
import {
  CROP_POOL, GRID, SEASONS, WEATHER_NAME, WEEKS_PER_SEASON, isMature,
  ACTIONS_PER_WEEK,
  type CropFamily, type HarvestState, type HarvestTile, type Weather,
} from './logic.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 960
export const LOGICAL_H = 640

/** 田格几何（左上原点 + 边长 + 间隙）。 */
const BOARD_X = 24
const BOARD_Y = 92
const CELL = 70
const GAP = 6

/** 卡池卡几何。 */
const CARD_X = 508
const CARD_Y = 92
const CARD_W = 428
const CARD_H = 86
const CARD_GAP = 10

/** 动作按钮几何。 */
const BTN_Y = 512
const BTN_W = 100
const BTN_H = 40
const BTN_GAP = 8

/** 动作按钮标签（下标即动作 id：0 播种 1 浇水 2 收获 3 休耕）。 */
export const ACTION_LABELS = ['播种[1]', '浇水[2]', '收获[3]', '休耕[4]']

/** 家庭中文短名（卡片展示）。 */
const FAMILY_NAME: Record<CropFamily, string> = {
  root: '根科', grass: '禾科', legume: '豆科', brassica: '十字花科', fruit: '果科',
}

/** 天气横幅色。 */
const WEATHER_COLOR: Record<Weather, string> = {
  sunny: THEME.gold, rain: '#7dcfff', drought: '#f7768e', pest: '#bb9af7',
}

/** 各季田土主色（春→夏→秋→冬→回春暖调）。 */
const SEASON_SOIL = ['#4a5533', '#5a5a2e', '#6b4f2a', '#44506b', '#3f5a44']
/** 各季季名。 */
const SEASON_NAME = ['一', '二', '三', '四', '五']

/**
 * 画布坐标 → 田格下标。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 田格下标（0..35），未命中返回 null。
 */
export function tileAt(x: number, y: number): number | null {
  const col = Math.floor((x - BOARD_X) / (CELL + GAP))
  const row = Math.floor((y - BOARD_Y) / (CELL + GAP))
  if (col < 0 || col >= GRID || row < 0 || row >= GRID) return null
  const cx = BOARD_X + col * (CELL + GAP)
  const cy = BOARD_Y + row * (CELL + GAP)
  if (x < cx || x > cx + CELL || y < cy || y > cy + CELL) return null
  return row * GRID + col
}

/**
 * 画布坐标 → 卡池卡下标。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 卡下标（0..3），未命中返回 null。
 */
export function cardAt(x: number, y: number): number | null {
  for (let i = 0; i < 4; i += 1) {
    const cy = CARD_Y + i * (CARD_H + CARD_GAP)
    if (x >= CARD_X && x <= CARD_X + CARD_W && y >= cy && y <= cy + CARD_H) return i
  }
  return null
}

/**
 * 画布坐标 → 动作按钮下标（0 播种 1 浇水 2 收获 3 休耕）。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 按钮下标，未命中返回 null。
 */
export function buttonAt(x: number, y: number): number | null {
  for (let i = 0; i < 4; i += 1) {
    const bx = CARD_X + i * (BTN_W + BTN_GAP)
    if (x >= bx && x <= bx + BTN_W && y >= BTN_Y && y <= BTN_Y + BTN_H) return i
  }
  return null
}

/** 画一块田格：土色底、温室标识、肥力条、作物生长阶段图。 */
function drawTile(ctx: CanvasRenderingContext2D, tile: HarvestTile, index: number, seasonIndex: number, cx: number, cy: number): void {
  const soil = SEASON_SOIL[seasonIndex % SEASON_SOIL.length]!
  roundRectPath(ctx, cx, cy, CELL, CELL, 8)
  ctx.fillStyle = tile.crop === null ? soil : soil
  ctx.fill()
  ctx.strokeStyle = tile.greenhouse ? '#7dcfff' : THEME.panelEdge
  ctx.lineWidth = tile.greenhouse ? 2 : 1
  ctx.stroke()
  ctx.lineWidth = 1
  if (tile.greenhouse) {
    ctx.fillStyle = '#7dcfff'
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('温', cx + 4, cy + 12)
  }
  // 肥力条：底部宽度按肥力，色随肥力衰减转红
  const fw = (CELL - 12) * (tile.fertility / 100)
  ctx.fillStyle = tile.fertility > 50 ? THEME.good : tile.fertility > 25 ? THEME.gold : THEME.bad
  ctx.fillRect(cx + 6, cy + CELL - 8, fw, 3)
  if (tile.crop === null) return
  const spec = CROP_POOL[tile.crop]
  const ratio = tile.growth / spec.growWeeks
  const mx = cx + CELL / 2
  const my = cy + CELL / 2 + 8
  if (isMature(tile)) {
    // 成熟：果实色圆 + 过熟警示红圈
    glow(ctx, spec.color, 10)
    ctx.fillStyle = spec.color
    ctx.beginPath()
    ctx.arc(mx, my - 4, 13, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = 'rgba(226,226,238,0.5)'
    ctx.beginPath()
    ctx.arc(mx, my - 4, 13, 0, Math.PI * 2)
    ctx.stroke()
    if (tile.overWeeks >= 1) {
      ctx.strokeStyle = THEME.bad
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(mx, my - 4, 18, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.fillStyle = THEME.bad
      ctx.font = '600 9px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('过熟', mx, cy + 14)
    }
    return
  }
  // 生长阶段：苗（细茎两叶）→ 拔节（高茎）→ 开花（顶部花点）
  const hgt = 6 + Math.min(1, ratio) * 16
  ctx.strokeStyle = ratio < 0.34 ? '#9ece6a' : '#73daca'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(mx, my)
  ctx.lineTo(mx, my - hgt)
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.fillStyle = '#9ece6a'
  ctx.beginPath()
  ctx.ellipse(mx - 5, my - hgt * 0.55, 4, 2, -0.5, 0, Math.PI * 2)
  ctx.ellipse(mx + 5, my - hgt * 0.55, 4, 2, 0.5, 0, Math.PI * 2)
  ctx.fill()
  if (ratio >= 0.67) {
    ctx.fillStyle = '#e2e2ee'
    for (let k = -1; k <= 1; k += 1) {
      ctx.beginPath()
      ctx.arc(mx + k * 5, my - hgt - 2, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (tile.quality < 1) {
    ctx.fillStyle = THEME.bad
    ctx.font = '600 9px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('虫', cx + CELL - 4, cy + 14)
  }
}

/** 画一张作物卡：名称/科别/种子价/生长周数/售价，选中态高亮。 */
function drawCard(ctx: CanvasRenderingContext2D, state: HarvestState, i: number): void {
  const cy = CARD_Y + i * (CARD_H + CARD_GAP)
  const spec = CROP_POOL[state.cardPool[i]!]
  const selected = i === state.selectedCard
  roundRectPath(ctx, CARD_X, cy, CARD_W, CARD_H, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = selected ? accent(i) : THEME.panelEdge
  ctx.lineWidth = selected ? 2 : 1
  ctx.stroke()
  ctx.lineWidth = 1
  if (selected) {
    glow(ctx, accent(i), 8)
    roundRectPath(ctx, CARD_X, cy, CARD_W, CARD_H, 10)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.fillStyle = spec.color
  ctx.beginPath()
  ctx.arc(CARD_X + 26, cy + CARD_H / 2, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(spec.name + '（' + FAMILY_NAME[spec.family] + (spec.legume ? '·养地' : '') + '）', CARD_X + 46, cy + 24)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('种子 ' + spec.seedCost + ' · 生长 ' + spec.growWeeks + ' 周 · 售 ' + spec.sellPrice + (spec.fertDrain > 0 ? ' · 耗肥 ' + spec.fertDrain : ' · 不耗肥'), CARD_X + 46, cy + 44)
  const affordable = state.money >= spec.seedCost
  ctx.fillStyle = affordable ? THEME.good : THEME.bad
  ctx.fillText(affordable ? '可购买' : '资金不足', CARD_X + 46, cy + 66)
}

/**
 * 绘制整帧场景（不含结束/暂停 overlay）。
 * @param ctx - 画布上下文（fitCanvas 已变换）。
 * @param state - 一局状态。
 */
export function renderHarvest(ctx: CanvasRenderingContext2D, state: HarvestState, currentAction = 0): void {
  const w = LOGICAL_W
  const h = LOGICAL_H
  drawBackground(ctx, w, h)
  // HUD 行
  const seasonLabel = '第' + SEASON_NAME[state.seasonIndex]! + '季'
  hudPair(ctx, 24, 34, '季节', seasonLabel + ' ' + (state.seasonIndex + 1) + '/5')
  hudPair(ctx, 160, 34, '周', state.week + '/' + WEEKS_PER_SEASON)
  hudPair(ctx, 260, 34, '资金', String(state.money), 'left', THEME.gold)
  hudPair(ctx, 360, 34, '库存', String(state.inventoryValue), 'left', THEME.good)

  // 常驻教学横幅：一句话玩法 + 当前可用动作数（新手不知道点哪/为何没反应）。
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('① 点作物卡选种 ② 按 1-4 或点按钮选动作 ③ 点田格执行 · 空格=下一周', 24, 88)
  glow(ctx, state.actionsLeft > 0 ? THEME.good : THEME.bad, 5)
  ctx.fillStyle = state.actionsLeft > 0 ? THEME.good : THEME.bad
  ctx.textAlign = 'right'
  ctx.fillText('本周剩余动作 ' + state.actionsLeft + '/' + ACTIONS_PER_WEEK, 936, 88)
  noGlow(ctx)
  hudPair(ctx, 470, 34, '目标', String(SEASONS[state.seasonIndex]!.target))
  hudPair(ctx, w - 24, 34, '动作', state.actionsLeft + '/' + 2, 'right', state.actionsLeft > 0 ? THEME.text : THEME.bad)
  // 天气横幅
  const banner = '本周天气：' + WEATHER_NAME[state.weather]
  ctx.font = 'bold 15px system-ui, sans-serif'
  const bw = ctx.measureText(banner).width + 28
  const bx = (w - bw) / 2
  roundRectPath(ctx, bx, 48, bw, 26, 13)
  ctx.fillStyle = 'rgba(30,30,42,0.9)'
  ctx.fill()
  ctx.strokeStyle = WEATHER_COLOR[state.weather]
  ctx.stroke()
  ctx.fillStyle = WEATHER_COLOR[state.weather]
  ctx.textAlign = 'center'
  ctx.fillText(banner, w / 2, 66)
  // 田格
  for (let i = 0; i < state.tiles.length; i += 1) {
    const col = i % GRID
    const row = Math.floor(i / GRID)
    drawTile(ctx, state.tiles[i]!, i, state.seasonIndex, BOARD_X + col * (CELL + GAP), BOARD_Y + row * (CELL + GAP))
  }
  // 作物卡
  for (let i = 0; i < state.cardPool.length; i += 1) drawCard(ctx, state, i)
  // 动作按钮
  for (let i = 0; i < 4; i += 1) {
    const bxx = CARD_X + i * (BTN_W + BTN_GAP)
    roundRectPath(ctx, bxx, BTN_Y, BTN_W, BTN_H, 8)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.stroke()
    ctx.fillStyle = accent(i + 2)
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(ACTION_LABELS[i]!, bxx + BTN_W / 2, BTN_Y + 25)
  }
  // 下一周提示 + 事件行
  ctx.textAlign = 'right'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('空格：下一周', CARD_X + 4 * BTN_W + 3 * BTN_GAP, BTN_Y + 66)
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(state.lastEvent, BOARD_X, 596)
}

/**
 * 田格中心逻辑坐标（收获粒子定位用）。
 * @param index - 田格下标（0..35）。
 * @returns 中心 [x, y]。
 */
export function tileCenter(index: number): [number, number] {
  const col = index % GRID
  const row = Math.floor(index / GRID)
  return [BOARD_X + col * (CELL + GAP) + CELL / 2, BOARD_Y + row * (CELL + GAP) + CELL / 2]
}

/**
 * 绘制季末/终局/暂停 overlay（粒子之后调用）。
 * @param ctx - 画布上下文。
 * @param state - 一局状态。
 * @param paused - 是否暂停（叠加暂停面）。
 */
export function renderHarvestOverlay(ctx: CanvasRenderingContext2D, state: HarvestState, paused: boolean): void {
  const w = LOGICAL_W
  const h = LOGICAL_H
  if (state.phase === 'seasonEnd') {
    const r = state.seasonResult!
    drawOverlay(ctx, w, h, '本季丰收', '资产 ' + r.assets + ' ≥ 目标 ' + r.target + ' · 回车/空格进入下一季', THEME.gold)
  } else if (state.phase === 'won') {
    drawOverlay(ctx, w, h, '五 季 通 关', '资金流与轮作的艺术 · 按 R 再来一局', THEME.good)
  } else if (state.phase === 'lost') {
    drawOverlay(ctx, w, h, '未 达 目 标', '季末资产 ' + state.seasonResult!.assets + ' < ' + state.seasonResult!.target + ' · 按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, w, h, spaced('已暂停'), '按 P 继续', THEME.text)
  }
}

