/**
 * 丝路商队渲染：古卷轴地图 + 行情城市面板 + 驼队/事件卡动画，纯
 * canvas 绘制，不持有游戏状态；index.ts 持有动画时钟并以 dirty 模式
 * 按需重绘。可选的 hits 数组在绘制时收集可点击区域（城市/买卖按钮），
 * 供点击交互的命中测试复用同一布局。
 */
import { THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair } from '../theme.ts'
import { GOODS, priceAt, visiblePrice, W, H, type CaravanState } from './logic.ts'

/** 驼队动画时钟：fromIdx→toIdx 的行程进度 t（0..1）与事件卡翻开进度 cardT。 */
export interface CaravanAnim {
  fromIdx: number
  toIdx: number
  t: number
  cardT: number
}

/** 一块可点击区域（渲染时收集，index 命中测试用）。 */
export interface CaravanHit {
  x: number
  y: number
  w: number
  h: number
  kind: 'city' | 'buy' | 'sell'
  payload: number
}

/** 市场面板左上角。 */
const PANEL_X = 692
const PANEL_Y = 64
const PANEL_W = 256

/** 平滑插值（smoothstep）。 */
function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 资产额 = 银钱 + 存货按当前城行情估值。 */
function assetValue(s: CaravanState): number {
  let worth = s.money
  for (let g = 0; g < GOODS.length; g += 1) worth += s.cargo[g]! * priceAt(s, s.cityIdx, g)
  return worth
}

/**
 * 绘制整帧：背景卷轴、道路绿洲、城市与驼队、右侧行情面板、HUD、
 * 事件卡与结算/暂停遮罩。
 * @param ctx - 逻辑坐标系的 2d 上下文。
 * @param s - 商队状态。
 * @param paused - 暂停遮罩开关。
 * @param anim - 动画时钟（null：驼队静止停在当前城市）。
 * @param hits - 可选：绘制时收集的可点击区域（先清空再填充）。
 */
export function renderCaravan(
  ctx: CanvasRenderingContext2D,
  s: CaravanState,
  paused: boolean,
  anim: CaravanAnim | null,
  hits?: CaravanHit[],
): void {
  if (hits !== undefined) hits.length = 0
  drawBackground(ctx, W, H)
  const cities = s.world.cities
  const playing = s.phase === 'playing'

  // —— 古卷轴地图 ——
  ctx.fillStyle = 'rgba(224,175,104,0.07)'
  roundRectPath(ctx, 16, 52, 664, 532, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.textAlign = 'left'
  ctx.fillText('· 丝路商道 ·', 28, 72)

  // 道路（双向表只画 i<j 的每条一次）与绿洲
  for (let i = 0; i < cities.length; i += 1) {
    for (const road of cities[i]!.roads) {
      const j = road.to
      if (j <= i) continue
      const a = cities[i]!
      const b = cities[j]!
      const reachable = playing && s.cityIdx === i && s.movePoints >= road.moveCost && s.water >= road.waterCost
      ctx.strokeStyle = reachable ? THEME.gold : 'rgba(226,226,238,0.16)'
      ctx.lineWidth = reachable ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      if (road.oasis) {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        ctx.fillStyle = THEME.good
        ctx.beginPath()
        ctx.arc(mx, my, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = '600 10px system-ui, sans-serif'
        ctx.fillStyle = THEME.textMuted
        ctx.fillText('绿洲', mx + 6, my + 3)
      }
    }
  }

  // 城市：当前城金色高亮，可直达城描边，未到访城虚线圈（行情模糊）
  for (let i = 0; i < cities.length; i += 1) {
    const c = cities[i]!
    const here = s.cityIdx === i
    const goable = playing && !here
      && s.world.cities[s.cityIdx]!.roads.some((r) => r.to === i && s.movePoints >= r.moveCost && s.water >= r.waterCost)
    if (here || goable) glow(ctx, here ? THEME.gold : THEME.good, 12)
    ctx.fillStyle = here ? THEME.gold : goable ? THEME.good : THEME.panel
    ctx.beginPath()
    ctx.arc(c.x, c.y, here ? 13 : 9, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = s.visited[i] === true ? accent(i) : 'rgba(226,226,238,0.3)'
    if (s.visited[i] !== true) ctx.setLineDash([3, 3])
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = here ? THEME.gold : THEME.text
    ctx.fillText(c.name, c.x, c.y + 26)
    if (hits !== undefined) hits.push({ x: c.x - 18, y: c.y - 18, w: 36, h: 36, kind: 'city', payload: i })
  }

  // 驼队：动画期间在两城间插值行进，否则停在当前城旁
  let cx = cities[s.cityIdx]!.x + 16
  let cy = cities[s.cityIdx]!.y - 18
  if (anim !== null && anim.t < 1) {
    const a = cities[anim.fromIdx]!
    const b = cities[anim.toIdx]!
    const e = ease(Math.max(0, Math.min(1, anim.t)))
    cx = a.x + (b.x - a.x) * e
    cy = a.y + (b.y - a.y) * e - 20 * Math.sin(Math.PI * e)
  }
  ctx.font = '24px system-ui, sans-serif'
  ctx.textAlign = 'center'
  glow(ctx, THEME.gold, 8)
  ctx.fillText('🐫', cx, cy)
  noGlow(ctx)

  // —— HUD 顶栏 ——
  const cfg = s.world.config
  hudPair(ctx, 24, 28, '天', s.day + '/' + cfg.days)
  hudPair(ctx, 130, 28, '银钱', String(s.money), 'left', THEME.gold)
  hudPair(ctx, 232, 28, '水', s.water + '/' + cfg.waterCap, 'left', THEME.accents[5]!)
  hudPair(ctx, 322, 28, '移动力', s.movePoints + '/' + cfg.camels)
  hudPair(ctx, W - 24, 28, '资产', assetValue(s) + ' / ' + cfg.goal, 'right', assetValue(s) >= cfg.goal ? THEME.good : THEME.text)

  // 过关提示行：缺口 + 剩余天数换算的日均目标 + 下一步建议（物价导向）。
  drawGoalHint(ctx, s)

  // 市场面板
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, PANEL_X, PANEL_Y, PANEL_W, 470, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.gold
  ctx.fillText(cities[s.cityIdx]!.name + ' · 集市', PANEL_X + 14, PANEL_Y + 24)

  for (let g = 0; g < GOODS.length; g += 1) {
    const rowY = PANEL_Y + 52 + g * 84
    const sel = s.selectedGood === g
    if (sel) {
      ctx.fillStyle = 'rgba(122,162,247,0.12)'
      roundRectPath(ctx, PANEL_X + 6, rowY - 16, PANEL_W - 12, 78, 8)
      ctx.fill()
    }
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = sel ? accent(g) : THEME.text
    ctx.fillText((g + 1) + ' ' + GOODS[g]!.name + ' ×' + s.cargo[g]!, PANEL_X + 14, rowY)

    // 行情价：与 logic.visiblePrice 同源；远程城（未到访）显示 ≈ 与波浪号
    const shown = visiblePrice(s, s.cityIdx, g)
    const known = s.visited[s.cityIdx] === true
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = known ? THEME.text : THEME.textMuted
    ctx.fillText((known ? '' : '≈') + shown + ' 文' + (known ? '' : ' ~'), PANEL_X + 14, rowY + 18)

    // 价格条：相对该商品基准价上限的比例
    const ratio = Math.max(0.05, Math.min(1, shown / (GOODS[g]!.base * 1.6)))
    ctx.fillStyle = 'rgba(226,226,238,0.12)'
    ctx.fillRect(PANEL_X + 14, rowY + 26, 120, 5)
    ctx.fillStyle = accent(g)
    ctx.fillRect(PANEL_X + 14, rowY + 26, 120 * ratio, 5)

    if (playing) {
      drawButton(ctx, hits, PANEL_X + 150, rowY + 2, 42, 22, '买', THEME.good, 'buy', g)
      drawButton(ctx, hits, PANEL_X + 200, rowY + 2, 42, 22, '卖', THEME.bad, 'sell', g)
    }
  }

  // 生效事件提示（战乱/丰收挂起的行情修正）
  let evY = PANEL_Y + 486
  for (const e of s.activeEvents) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = e.scale > 1 ? THEME.bad : THEME.good
    ctx.fillText((e.scale > 1 ? '↑' : '↓') + GOODS[e.good]!.name + '（至第' + e.until + '天）', PANEL_X + 10, evY)
    evY += 18
  }

  // 事件卡翻开动画（cardT 0..1：水平缩放的翻牌）
  if (anim !== null && anim.cardT < 1 && s.lastCard !== null) {
    const k = Math.abs(Math.cos(Math.PI * anim.cardT))
    const cw = 190 * k
    const cxp = 348
    const cyp = 100
    ctx.fillStyle = 'rgba(30,30,42,0.95)'
    roundRectPath(ctx, cxp - cw / 2, cyp, cw, 54, 8)
    ctx.fill()
    ctx.strokeStyle = THEME.gold
    ctx.stroke()
    if (k > 0.45) {
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = s.lastCard.kind === 'tax' ? THEME.bad : s.lastCard.kind === 'none' ? THEME.textMuted : THEME.gold
      ctx.fillText(s.lastCard.kind === 'none' ? '一路平安' : s.lastCard.label, cxp, cyp + 32)
    }
  }

  // 行商日志（最近几条）
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  let logY = 566
  for (let i = s.log.length - 1; i >= 0 && logY > 508; i -= 1) {
    ctx.fillText(s.log[i]!, 24, logY)
    logY -= 16
  }

  if (paused) drawOverlay(ctx, W, H, '暂停', 'P：继续 · R：重开')
  else if (s.phase === 'won') drawOverlay(ctx, W, H, '商 路 通 达', '资产 ' + assetValue(s) + ' 文达标 · R：重开', THEME.good)
  else if (s.phase === 'lost') drawOverlay(ctx, W, H, '商 队 散 伙', '期限已至，资产 ' + assetValue(s) + ' 文 · R：重开', THEME.bad)
}

/** 小按钮：圆角矩形 + 文案，并把区域推入 hits。 */
function drawButton(
  ctx: CanvasRenderingContext2D,
  hits: CaravanHit[] | undefined,
  x: number, y: number, w: number, h: number,
  label: string, color: string, kind: 'buy' | 'sell', payload: number,
): void {
  ctx.fillStyle = 'rgba(226,226,238,0.08)'
  roundRectPath(ctx, x, y, w, h, 5)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.fillText(label, x + w / 2, y + 15)
  if (hits !== undefined) hits.push({ x, y, w, h, kind, payload })
}

/** 过关提示：资产缺口、按剩余天数折算的日均目标与下一步建议（低买高卖导向）。
 * @param ctx - 画布上下文。
 * @param s - 当前状态。
 */
function drawGoalHint(ctx: CanvasRenderingContext2D, s: CaravanState): void {
  const cfg = s.world.config
  const net = assetValue(s)
  const gap = Math.max(0, cfg.goal - net)
  const daysLeft = Math.max(0, cfg.days - s.day)
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  if (gap <= 0) {
    glow(ctx, THEME.good, 6)
    ctx.fillStyle = THEME.good
    ctx.fillText('✓ 资产已达标——再完成任意买卖或结束今天即过关', W / 2, 52)
    noGlow(ctx)
    return
  }
  const perDay = daysLeft > 0 ? Math.ceil(gap / daysLeft) : gap
  // 找全城最值钱的低买机会与最值钱的抛售城（已到访精确价）。
  let best: { buy: string, sell: string, gain: number } | null = null
  for (let gi = 0; gi < GOODS.length; gi += 1) {
    let lo = Number.POSITIVE_INFINITY
    let loCity = ''
    let hi = 0
    let hiCity = ''
    for (let c = 0; c < s.world.cities.length; c += 1) {
      const p = priceAt(s, c, gi)
      if (p < lo) { lo = p; loCity = s.world.cities[c]!.name }
      if (p > hi) { hi = p; hiCity = s.world.cities[c]!.name }
    }
    if (hi - lo > (best?.gain ?? 0)) best = { buy: loCity, sell: hiCity, gain: hi - lo }
  }
  glow(ctx, THEME.accents[0]!, 5)
  ctx.fillStyle = THEME.accents[0]!
  ctx.fillText('目标还差 ' + gap + ' 资产 · ' + (daysLeft > 0 ? '剩 ' + daysLeft + ' 天（日均需 +' + perDay + '）' : '今天最后一天！'), W / 2, 52)
  noGlow(ctx)
  if (best !== null && best.gain > 0) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('行情建议：' + best.buy + ' 买入 → ' + best.sell + ' 卖出（价差 ' + best.gain + '）', W / 2, 70)
  }
}
