/**
 * 电路点灯 CircuitBulb 画布渲染：上方一排灯泡卡片（亮灭状态 + 逻辑式
 * 标注），下方一排开关拨钮，两排之间画连接轨道；HUD 显示关卡、拨动
 * 次数对 PAR、剩余提示。渲染器无自身状态——命中检测（switchAt）与
 * 粒子锚点（bulbCenter）供 index.ts 调用，视觉全部走共享主题（../theme.ts）。
 */
import { type GameState, type Hint, type Level, formatExpr, switchName } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽度（各游戏固定逻辑坐标系）。 */
export const LOGICAL_W = 720
/** 顶部 HUD 高度。 */
export const HUD_H = 32
/** 四周留白。 */
export const MARGIN = 14
/** 灯泡卡片带高度。 */
export const BULB_H = 168
/** 灯泡带与开关带之间的走线区高度。 */
export const WIRE_H = 26
/** 开关卡片带高度。 */
export const SWITCH_H = 78
/** 底部操作提示条高度。 */
export const FOOT_H = 24
/** 逻辑画布总高度。 */
export const LOGICAL_H = HUD_H + MARGIN + BULB_H + WIRE_H + SWITCH_H + MARGIN + FOOT_H
/** 开关带顶边 y（命中检测与走线共用）。 */
export const SWITCH_TOP = HUD_H + MARGIN + BULB_H + WIRE_H

/** 同带内卡片间距。 */
const CARD_GAP = 10

/** 带内第 i 张卡片的几何：等宽铺满逻辑宽度。 */
function cardRect(count: number, i: number, top: number, height: number): { x: number; y: number; w: number; h: number } {
  const usable = LOGICAL_W - MARGIN * 2 - CARD_GAP * (count - 1)
  const w = usable / count
  return { x: MARGIN + i * (w + CARD_GAP), y: top, w, h: height }
}

/**
 * 逻辑坐标点落在哪个开关卡片上。
 * @param count 开关总数。
 * @returns 开关下标；不在开关带内返回 null。
 */
export function switchAt(x: number, y: number, count: number): number | null {
  if (y < SWITCH_TOP || y > SWITCH_TOP + SWITCH_H) return null
  for (let i = 0; i < count; i += 1) {
    const r = cardRect(count, i, SWITCH_TOP, SWITCH_H)
    if (x >= r.x && x <= r.x + r.w) return i
  }
  return null
}

/**
 * 第 i 个灯泡的中心点（过关粒子爆点）。
 * @param count 灯泡总数。
 */
export function bulbCenter(i: number, count: number): { x: number; y: number } {
  const r = cardRect(count, i, HUD_H + MARGIN, BULB_H)
  return { x: r.x + r.w / 2, y: r.y + 34 }
}

/** 画一个灯泡卡片：圆形灯泡 + 逻辑式标注。 */
function drawBulbCard(
  ctx: CanvasRenderingContext2D, i: number, count: number, lit: boolean, exprText: string,
): void {
  const r = cardRect(count, i, HUD_H + MARGIN, BULB_H)
  const color = lit ? THEME.gold : THEME.panelEdge
  glow(ctx, color, lit ? 18 : 3)
  ctx.fillStyle = lit ? 'rgba(224,175,104,0.16)' : THEME.panel
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = lit ? THEME.gold : THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  const cx = r.x + r.w / 2
  ctx.beginPath()
  ctx.arc(cx, r.y + 34, 15, 0, Math.PI * 2)
  if (lit) glow(ctx, THEME.gold, 22)
  ctx.fillStyle = lit ? THEME.gold : '#2a2a3a'
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = lit ? THEME.gold : THEME.panelEdge
  ctx.stroke()
  if (lit) {
    // 灯丝：亮起时中心一道折线。
    ctx.strokeStyle = '#15151b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 6, r.y + 36)
    ctx.lineTo(cx - 2, r.y + 32)
    ctx.lineTo(cx + 2, r.y + 36)
    ctx.lineTo(cx + 6, r.y + 32)
    ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = lit ? THEME.text : THEME.textMuted
  ctx.fillText(exprText, cx, r.y + 72)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillStyle = lit ? THEME.gold : THEME.textMuted
  ctx.fillText(lit ? '亮' : '灭', cx, r.y + 90)
}

/** 画一个开关卡片：字母标号 + 拨杆滑槽。 */
function drawSwitchCard(
  ctx: CanvasRenderingContext2D, i: number, count: number, on: boolean, focused: boolean, hint: Hint | null,
): void {
  const r = cardRect(count, i, SWITCH_TOP, SWITCH_H)
  const color = accent(i)
  glow(ctx, color, on ? 14 : 3)
  ctx.fillStyle = on ? color : THEME.panel
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = on ? color : THEME.panelEdge
  ctx.lineWidth = focused ? 2.5 : 1
  if (focused) glow(ctx, THEME.text, 8)
  ctx.stroke()
  noGlow(ctx)

  ctx.textAlign = 'center'
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillStyle = on ? '#15151b' : THEME.text
  ctx.fillText(switchName(i), r.x + r.w / 2, r.y + 24)

  // 拨杆滑槽：亮时圆钮滑向右侧并点亮轨道。
  const slotW = r.w - 18
  const slotH = 10
  const sx = r.x + 9
  const sy = r.y + 40
  roundRectPath(ctx, sx, sy, slotW, slotH, 5)
  ctx.fillStyle = on ? '#15151b' : '#26263a'
  ctx.fill()
  const knobR = 8
  const knobX = on ? sx + slotW - knobR : sx + knobR
  ctx.beginPath()
  ctx.arc(knobX, sy + slotH / 2, knobR, 0, Math.PI * 2)
  ctx.fillStyle = on ? '#fff8e8' : THEME.textMuted
  ctx.fill()

  if (hint !== null && hint.index === i) {
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText(hint.shouldBe ? '应拨开' : '应拨关', r.x + r.w / 2, r.y + 72)
  }
}

/** 画灯泡带与开关带之间的连接轨道。 */
function drawWires(ctx: CanvasRenderingContext2D, bulbCount: number, switchCount: number, lit: boolean[]): void {
  const railY = SWITCH_TOP - WIRE_H / 2
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(MARGIN, railY)
  ctx.lineTo(LOGICAL_W - MARGIN, railY)
  ctx.stroke()
  for (let i = 0; i < bulbCount; i += 1) {
    const c = bulbCenter(i, bulbCount)
    ctx.strokeStyle = lit[i] ? THEME.gold : THEME.panelEdge
    ctx.beginPath()
    ctx.moveTo(c.x, c.y + 22)
    ctx.lineTo(c.x, railY)
    ctx.stroke()
  }
  for (let i = 0; i < switchCount; i += 1) {
    const r = cardRect(switchCount, i, SWITCH_TOP, SWITCH_H)
    ctx.strokeStyle = THEME.panelEdge
    ctx.beginPath()
    ctx.moveTo(r.x + r.w / 2, railY)
    ctx.lineTo(r.x + r.w / 2, SWITCH_TOP)
    ctx.stroke()
  }
}

/**
 * 绘制一帧完整画面。
 * @param game 当前对局状态（关卡数据、开关状态、拨动/提示计数）。
 * @param lit 各灯泡亮灭（调用方已用 bulbStates 算好）。
 * @param cursor 键盘聚焦的开关下标；null 隐藏聚焦环。
 * @param hint 当前展示中的提示；null 不画。
 * @param paused 显示暂停遮罩。
 * @param winText 过关副标题；null 表示进行中。
 */
export function renderCircuit(
  ctx: CanvasRenderingContext2D, w: number, h: number, game: GameState,
  lit: boolean[], cursor: number | null, hint: Hint | null, paused: boolean, winText: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, MARGIN, 21, '关卡 ', String(game.level))
  hudPair(ctx, w - MARGIN, 21, '拨动 ', game.moves + '/' + game.levelData.par, 'right', THEME.gold)

  const level: Level = game.levelData
  drawWires(ctx, level.bulbs.length, level.config.switches, lit)
  for (let i = 0; i < level.bulbs.length; i += 1) {
    drawBulbCard(ctx, i, level.bulbs.length, lit[i] === true, formatExpr(level.bulbs[i]!))
  }
  for (let i = 0; i < level.config.switches; i += 1) {
    drawSwitchCard(ctx, i, level.config.switches, game.states[i] === true, cursor === i, hint)
  }

  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('H 提示 ' + game.hintsUsed + '/2 · R 重开 · P 暂停', LOGICAL_W / 2, h - 8)

  if (winText !== null) {
    drawOverlay(ctx, w, h, '全部点亮', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
