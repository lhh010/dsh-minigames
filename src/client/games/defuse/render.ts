/**
 * 拆弹专家渲染层：规则卡（编号 + 条件文本 + 颜色图例）、炸弹面板
 * （弯曲贝塞尔线缆、剪断处飞出火花、两端接线端子）、面板属性可视化
 * （序列号 / 标记符号 / 电池）、倒计时大数字（临限红闪）、拆弹进度
 * HUD、爆炸粒子与成功遮罩。粒子系统为渲染层自有实例。
 */
import type { DefuseState, WireColor } from './logic.ts'
import { W, H, MAX_BOMBS, DEFUSE_MS, ruleColors, ruleText } from './logic.ts'
import {
  THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 线缆颜色的画布色值。 */
const WIRE_HEX: Record<WireColor, string> = {
  red: '#f7768e', yellow: '#e0af68', blue: '#7aa2f7', green: '#9ece6a', white: '#e2e2ee',
}

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 规则卡区域。 */
const CARD_X = 24
const CARD_Y = 96
const CARD_W = W - CARD_X * 2
/** 规则卡可用总高（到炸弹面板顶部）。 */
const CARD_AREA_H = 208
/** 炸弹面板。 */
const PANEL_X = 24
const PANEL_Y = 320
const PANEL_W = W - PANEL_X * 2
const PANEL_H = 226
/** 线缆两端接线端子 x。 */
const TERMINAL_L = PANEL_X + 46
const TERMINAL_R = PANEL_X + PANEL_W - 46
/** 线缆行布局（在面板内垂直均布）。 */
const WIRE_TOP = PANEL_Y + 40
const WIRE_BOTTOM = PANEL_Y + PANEL_H - 52

/**
 * 第 i 根线的 y 坐标（面板内垂直均布）。
 * @param count - 线缆总数。
 * @param i - 线缆索引。
 * @returns y 坐标。
 */
function wireY(count: number, i: number): number {
  const step = count > 1 ? (WIRE_BOTTOM - WIRE_TOP) / (count - 1) : 0
  return WIRE_TOP + i * step
}

/**
 * 未剪线缆的贝塞尔采样点（点击命中测试与火花定位共用）。
 * @param i - 线缆索引。
 * @param y - 该线的 y 坐标。
 * @param cutX - 采样 / 剪断点 x（默认中点）。
 * @returns 采样点数组。
 */
function wireCurvePoints(i: number, y: number): { x: number, y: number }[] {
  // 每根线用索引奇偶翻转下垂方向，避免全部同弧拥挤；二次贝塞尔采样。
  const sag = (i % 2 === 0 ? 1 : -1) * 14
  const cx = (TERMINAL_L + TERMINAL_R) / 2
  const cy = y + sag
  const pts: { x: number, y: number }[] = []
  for (let k = 0; k <= 8; k += 1) {
    const t = k / 8
    const bx = (1 - t) * (1 - t) * TERMINAL_L + 2 * (1 - t) * t * cx + t * t * TERMINAL_R
    const by = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * y
    pts.push({ x: bx, y: by })
  }
  return pts
}

/**
 * 点击命中测试：返回距点击 14px 内最近的未剪线缆索引。
 * @param state - 当前状态。
 * @param px - 逻辑坐标 x。
 * @param py - 逻辑坐标 y。
 * @returns 线缆索引，未命中返回 null。
 */
export function wireHitTest(state: DefuseState, px: number, py: number): number | null {
  const bomb = state.bombs[state.bombIndex]!
  let best = -1
  let bestDist = 14
  for (let i = 0; i < bomb.wires.length; i += 1) {
    if (state.cut[i]) continue
    for (const p of wireCurvePoints(i, wireY(bomb.wires.length, i))) {
      const d = Math.hypot(px - p.x, py - p.y)
      if (d < bestDist) { bestDist = d; best = i }
    }
  }
  return best >= 0 ? best : null
}

/**
 * 粒子系统是否仍在活动（index 层据此决定 dirty 重绘）。
 * @returns true 表示还有粒子在飞。
 */
export function defuseParticlesActive(): boolean {
  return particles.size() > 0
}

/**
 * 画一根线缆：未剪为完整贝塞尔弧线；已剪为左右两半下垂断口。
 * @param ctx - 画布上下文。
 * @param i - 线缆索引。
 * @param y - 该线的 y 坐标。
 * @param color - 线缆颜色。
 * @param isCut - 是否已剪断。
 */
function drawWire(ctx: CanvasRenderingContext2D, i: number, y: number, color: string, isCut: boolean): void {
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = 7
  glow(ctx, color, 5)
  if (!isCut) {
    const pts = wireCurvePoints(i, y)
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let k = 1; k < pts.length; k += 1) ctx.lineTo(pts[k]!.x, pts[k]!.y)
    ctx.stroke()
  } else {
    const midX = (TERMINAL_L + TERMINAL_R) / 2
    const left = wireCurvePoints(i, y).filter((p) => p.x <= midX)
    const right = wireCurvePoints(i, y).filter((p) => p.x >= midX)
    // 断口两半各自下垂。
    const droop = (i % 2 === 0 ? 1 : -1) * 10
    ctx.beginPath()
    ctx.moveTo(left[0]!.x, left[0]!.y)
    for (const p of left.slice(1)) ctx.lineTo(p.x, p.y + droop * ((p.x - TERMINAL_L) / (midX - TERMINAL_L)))
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(right[0]!.x, right[0]!.y + droop * ((TERMINAL_R - right[0]!.x) / (TERMINAL_R - midX)))
    for (const p of right.slice(1)) ctx.lineTo(p.x, p.y + droop * ((TERMINAL_R - p.x) / (TERMINAL_R - midX)))
    ctx.stroke()
  }
  noGlow(ctx)
  // 两端接线端子。
  ctx.fillStyle = THEME.panelEdge
  ctx.fillRect(TERMINAL_L - 7, y - 7, 14, 14)
  ctx.fillRect(TERMINAL_R - 7, y - 7, 14, 14)
}

/**
 * 画一张规则卡：编号徽章 + 条件文本 + 结论色图例点。
 * @param ctx - 画布上下文。
 * @param index - 卡片序号（1 起）。
 * @param x - 左上 x。
 * @param y - 左上 y。
 * @param w - 卡宽。
 * @param h - 卡高。
 * @param text - 规则文本。
 * @param colors - 图例颜色。
 */
function drawRuleCard(
  ctx: CanvasRenderingContext2D, index: number, x: number, y: number, w: number, h: number,
  text: string, colors: { hex: string, label: string }[],
): void {
  roundRectPath(ctx, x, y, w, h, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 编号徽章。
  ctx.beginPath()
  ctx.arc(x + 22, y + h / 2, 12, 0, Math.PI * 2)
  ctx.fillStyle = THEME.panelEdge
  ctx.fill()
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText(String(index), x + 22, y + h / 2 + 4.5)
  // 规则文本。
  ctx.textAlign = 'left'
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(text, x + 42, y + h / 2 + 5)
  // 结论色图例点。
  let lx = x + w - 16
  for (let i = colors.length - 1; i >= 0; i -= 1) {
    const c = colors[i]!
    ctx.beginPath()
    ctx.arc(lx, y + h / 2, 7, 0, Math.PI * 2)
    ctx.fillStyle = c.hex
    glow(ctx, c.hex, 6)
    ctx.fill()
    noGlow(ctx)
    lx -= 20
  }
}

/**
 * 渲染一帧：背景、倒计时、规则卡、炸弹面板（线缆 + 属性可视化）、
 * 事件粒子、HUD 与遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderDefuse(ctx: CanvasRenderingContext2D, state: DefuseState, paused: boolean): void {
  drawBackground(ctx, W, H)
  const bomb = state.bombs[state.bombIndex]!

  // ---- 倒计时大数字（<10s 红闪）。 ----
  const seconds = Math.ceil(state.timeLeft / 1000)
  const danger = state.timeLeft <= 10000 && !state.over
  const blinkOn = Math.floor(state.timeLeft / 250) % 2 === 0
  ctx.textAlign = 'center'
  ctx.font = 'bold 42px system-ui, sans-serif'
  ctx.fillStyle = danger ? (blinkOn ? THEME.bad : THEME.gold) : THEME.text
  if (danger && blinkOn) glow(ctx, THEME.bad, 14)
  ctx.fillText(String(seconds) + 's', W / 2, 62)
  noGlow(ctx)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('倒计时', W / 2, 78)

  // ---- 规则卡（2-3 张均布）。 ----
  const count = bomb.rules.length
  const gap = 10
  const cardH = Math.floor((CARD_AREA_H - gap * (count - 1)) / count)
  for (let i = 0; i < count; i += 1) {
    const rule = bomb.rules[i]!
    const colors = ruleColors(rule, bomb.facts).map((c) => ({ hex: WIRE_HEX[c], label: c }))
    drawRuleCard(ctx, i + 1, CARD_X, CARD_Y + i * (cardH + gap), CARD_W, cardH, ruleText(rule), colors)
  }

  // ---- 炸弹面板。 ----
  roundRectPath(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = state.timeLeft <= 10000 ? THEME.bad : THEME.panelEdge
  ctx.lineWidth = 2
  if (state.timeLeft <= 10000) glow(ctx, THEME.bad, 8)
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('BOMB ' + String(state.bombIndex + 1) + ' · 剪断应剪的线', PANEL_X + 14, PANEL_Y + 22)

  // 线缆。
  const wireCount = bomb.wires.length
  for (let i = 0; i < wireCount; i += 1) {
    drawWire(ctx, i, wireY(wireCount, i), WIRE_HEX[bomb.wires[i]!], state.cut[i] === true)
  }

  // 面板属性可视化：序列号 / 标记 / 电池。
  const infoY = PANEL_Y + PANEL_H - 26
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('序列号', PANEL_X + 16, infoY)
  ctx.fillStyle = THEME.text
  ctx.font = 'bold 14px ui-monospace, monospace'
  ctx.fillText(bomb.serial, PANEL_X + 62, infoY)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('标记', PANEL_X + 150, infoY)
  ctx.fillStyle = THEME.gold
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillText(bomb.mark === '' ? '无' : bomb.mark, PANEL_X + 186, infoY)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('电池', PANEL_X + 236, infoY)
  for (let i = 0; i < bomb.batteries; i += 1) {
    const bx = PANEL_X + 272 + i * 22
    roundRectPath(ctx, bx, infoY - 11, 16, 10, 2)
    ctx.fillStyle = THEME.good
    glow(ctx, THEME.good, 5)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = THEME.panelEdge
    ctx.fillRect(bx + 16, infoY - 8, 3, 4)
  }

  // ---- 事件粒子：剪线火花 / 拆除金光 / 爆炸红爆。 ----
  for (const ev of state.events) {
    if (ev.type === 'cut') {
      const y = wireY(wireCount, ev.wire)
      particles.burst((TERMINAL_L + TERMINAL_R) / 2, y, WIRE_HEX[bomb.wires[ev.wire]!], 14, 150)
    } else if (ev.type === 'defuse') {
      particles.burst(W / 2, PANEL_Y + PANEL_H / 2, THEME.good, 22, 190)
    } else if (ev.type === 'explode') {
      particles.burst(W / 2, PANEL_Y + PANEL_H / 2, THEME.bad, 40, 280)
      particles.burst(W / 2, H / 2, THEME.gold, 20, 220)
    } else if (ev.type === 'win') {
      particles.burst(W / 2, H / 2, THEME.gold, 34, 240)
    }
  }
  particles.tick(ctx, 33)

  // ---- HUD ----
  hudPair(ctx, 16, 28, '分数', String(state.score), 'left', THEME.gold)
  hudPair(ctx, W - 16, 28, '弹', String(state.bombIndex + 1) + '/' + String(MAX_BOMBS), 'right')
  const cutCount = state.cut.filter((c) => c).length
  hudPair(ctx, W - 16, 50, '已剪', cutCount + '/' + String(wireCount), 'right')

  // ---- 遮罩 ----
  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '计时已冻结 · 按 P 继续 · R 重开')
  } else if (state.over) {
    if (state.won) {
      drawOverlay(ctx, W, H, '全部拆除', '五颗炸弹全部拆除 · R 再来一局', THEME.gold)
    } else {
      drawOverlay(ctx, W, H, '轰 · 爆炸', '拆弹失败 · R 重开', THEME.bad)
    }
  } else if (state.defuseMs > 0) {
    const k = 1 - state.defuseMs / DEFUSE_MS
    drawOverlay(ctx, W, H, '拆除成功', '第 ' + String(state.bombIndex + 1) + ' 颗搞定' + (k > 0.5 ? ' · 下一颗更快' : ''), THEME.good)
  }
}
