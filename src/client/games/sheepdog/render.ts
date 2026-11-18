/**
 * 牧羊犬渲染：草地纹理、围栏木栅与开口、羊（白椭圆+头朝向+腿动画）、
 * 牧羊犬（黑白 + 跑动）、狼（灰）、恐慌 "!" 标记、入栏数/计时 HUD 与
 * 过关/失败/暂停 overlay。纯绘制，不触碰游戏逻辑。
 */
import { THEME, accent, glow, noGlow, drawBackground, drawOverlay, hudPair } from '../theme.ts'
import {
  W, H, HUD_H, LEVELS, fieldRect, penRect, penOpening, PEN_OPEN_W,
  type SheepdogState, type Sheep,
} from './logic.ts'

/** 草地基色与条纹（暖绿基调，与面板夜色协调）。 */
const GRASS_BASE = '#3f5c3a'
const GRASS_STRIPE = '#456540'
const HEDGE = '#2c452a'
/** 木栅颜色。 */
const FENCE_POST = '#8a6b4a'
const FENCE_RAIL = '#b08a5e'
const FENCE_EDGE = '#5e4630'

/**
 * 画一具四足身体：椭圆身 + 朝向头部 + 四条摆动腿 + 尾巴。
 * @param ctx - 画布上下文。
 * @param x - 中心 x。
 * @param y - 中心 y。
 * @param heading - 朝向（rad，0 = 向右）。
 * @param legPhase - 步态相位（速度积分而来）。
 * @param body - 身体填充色。
 * @param head - 头/腿色。
 */
function drawCritter(
  ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, legPhase: number,
  body: string, patch: string | null, head: string, scale: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  const swing = Math.sin(legPhase) * 3 * scale
  // 腿：两前两后，随步态相位前后摆。
  ctx.strokeStyle = head
  ctx.lineWidth = 1.6 * scale
  ctx.beginPath()
  ctx.moveTo(4 * scale, 2.5 * scale); ctx.lineTo(4 * scale + swing, 6.5 * scale)
  ctx.moveTo(4 * scale, -2.5 * scale); ctx.lineTo(4 * scale - swing, -6.5 * scale)
  ctx.moveTo(-4 * scale, 2.5 * scale); ctx.lineTo(-4 * scale - swing, 6.5 * scale)
  ctx.moveTo(-4 * scale, -2.5 * scale); ctx.lineTo(-4 * scale + swing, -6.5 * scale)
  ctx.stroke()
  // 尾巴。
  ctx.beginPath()
  ctx.moveTo(-8 * scale, 0)
  ctx.lineTo(-12 * scale, Math.sin(legPhase * 1.3) * 2 * scale)
  ctx.stroke()
  // 身体。
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, 0, 9 * scale, 6 * scale, 0, 0, Math.PI * 2)
  ctx.fill()
  // 花斑（犬的黑色披布）。
  if (patch !== null) {
    ctx.fillStyle = patch
    ctx.beginPath()
    ctx.ellipse(-1.5 * scale, 0.5 * scale, 5.5 * scale, 4 * scale, 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  // 头（朝向正前方）。
  ctx.fillStyle = head
  ctx.beginPath()
  ctx.arc(8.5 * scale, 0, 3.6 * scale, 0, Math.PI * 2)
  ctx.fill()
  // 耳朵。
  ctx.beginPath()
  ctx.moveTo(7.5 * scale, -3 * scale); ctx.lineTo(9.5 * scale, -5.5 * scale); ctx.lineTo(10.5 * scale, -2.5 * scale)
  ctx.moveTo(7.5 * scale, 3 * scale); ctx.lineTo(9.5 * scale, 5.5 * scale); ctx.lineTo(10.5 * scale, 2.5 * scale)
  ctx.fill()
  ctx.restore()
}

/**
 * 画一只羊：白身、深灰头、恐慌时头顶红 "!"。
 * @param ctx - 画布上下文。
 * @param s - 羊。
 */
function drawSheep(ctx: CanvasRenderingContext2D, s: Sheep): void {
  drawCritter(ctx, s.x, s.y, s.heading, s.legPhase, '#efece2', null, '#6f6f78', 0.95)
  if (s.panic > 0.45) {
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 5)
    ctx.fillText('!', s.x, s.y - 14)
    noGlow(ctx)
  }
}

/**
 * 画围栏：木桩 + 横栏，下边留出开口（虚线标出开口范围）。
 * @param ctx - 画布上下文。
 * @param pen - 围栏矩形。
 */
function drawPen(ctx: CanvasRenderingContext2D, pen: { x: number, y: number, w: number, h: number }): void {
  const openHalf = PEN_OPEN_W / 2
  const cx = pen.x + pen.w / 2
  // 栏内草地微亮 + 槽位虚圈提示。
  ctx.fillStyle = 'rgba(233,220,170,0.10)'
  ctx.fillRect(pen.x, pen.y, pen.w, pen.h)
  ctx.strokeStyle = FENCE_RAIL
  ctx.lineWidth = 3
  // 上边与左右整段横栏。
  ctx.beginPath()
  ctx.moveTo(pen.x, pen.y); ctx.lineTo(pen.x + pen.w, pen.y)
  ctx.moveTo(pen.x, pen.y); ctx.lineTo(pen.x, pen.y + pen.h)
  ctx.moveTo(pen.x + pen.w, pen.y); ctx.lineTo(pen.x + pen.w, pen.y + pen.h)
  // 下边留开口。
  ctx.moveTo(pen.x, pen.y + pen.h); ctx.lineTo(cx - openHalf, pen.y + pen.h)
  ctx.moveTo(cx + openHalf, pen.y + pen.h); ctx.lineTo(pen.x + pen.w, pen.y + pen.h)
  ctx.stroke()
  // 木桩。
  ctx.fillStyle = FENCE_POST
  ctx.strokeStyle = FENCE_EDGE
  ctx.lineWidth = 1
  const posts: Array<[number, number]> = [
    [pen.x, pen.y], [pen.x + pen.w, pen.y],
    [pen.x, pen.y + pen.h], [cx - openHalf, pen.y + pen.h],
    [cx + openHalf, pen.y + pen.h], [pen.x + pen.w, pen.y + pen.h],
    [pen.x + pen.w / 2, pen.y],
  ]
  for (const [px, py] of posts) {
    ctx.beginPath()
    ctx.rect(px - 2, py - 5, 4, 10)
    ctx.fill()
    ctx.stroke()
  }
  // 开口地面虚线提示。
  const open = { x: cx, y: pen.y + pen.h }
  ctx.strokeStyle = accent(2)
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.arc(open.x, open.y, 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * 渲染整帧：背景草地 → 围栏 → 狼 → 羊 → 犬 → HUD → overlay。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设好）。
 * @param st - 游戏状态。
 * @param paused - 是否暂停（暂停时叠加 overlay）。
 */
export function renderSheepdog(ctx: CanvasRenderingContext2D, st: SheepdogState, paused: boolean): void {
  const level = LEVELS[st.levelIndex]!
  const f = fieldRect(level)
  drawBackground(ctx, W, H)

  // 场地草地 + 条纹 + 草簇纹理（草簇位置来自 seed，确定性）。
  ctx.fillStyle = GRASS_BASE
  ctx.fillRect(f.x, f.y, f.w, f.h)
  ctx.fillStyle = GRASS_STRIPE
  for (let sx = f.x; sx < f.x + f.w; sx += 34) {
    ctx.fillRect(sx, f.y, 17, f.h)
  }
  for (const d of st.deco) {
    ctx.strokeStyle = d.shade > 0.5 ? 'rgba(126,168,102,0.5)' : 'rgba(70,101,64,0.7)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(d.x - d.r / 2, d.y + d.r / 2)
    ctx.lineTo(d.x, d.y - d.r / 2)
    ctx.lineTo(d.x + d.r / 2, d.y + d.r / 2)
    ctx.stroke()
  }
  // 场地树篱边框。
  ctx.strokeStyle = HEDGE
  ctx.lineWidth = 5
  ctx.strokeRect(f.x - 2.5, f.y - 2.5, f.w + 5, f.h + 5)

  drawPen(ctx, penRect(level))

  // 狼（灰身 + 红眼）。
  for (const wolf of st.wolves) {
    drawCritter(ctx, wolf.x, wolf.y, Math.atan2(wolf.vy, wolf.vx), st.elapsedMs / 90, '#7d8087', '#5c5f66', '#4a4d54', 1.0)
    ctx.fillStyle = THEME.bad
    ctx.beginPath()
    ctx.arc(wolf.x + Math.cos(Math.atan2(wolf.vy, wolf.vx)) * 10, wolf.y + Math.sin(Math.atan2(wolf.vy, wolf.vx)) * 10, 1.3, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const s of st.sheep) drawSheep(ctx, s)

  // 牧羊犬（黑白 + 跑动 + 淡淡光晕让主角醒目）。
  glow(ctx, accent(0), 8)
  drawCritter(ctx, st.dog.x, st.dog.y, st.dog.heading, st.dog.legPhase, '#f4f4f8', '#2a2a34', '#2a2a34', 1.1)
  noGlow(ctx)

  // HUD：关卡、入栏进度、限时。
  const accentColor = st.timeLeftMs < 10_000 ? THEME.bad : THEME.text
  hudPair(ctx, 10, 20, '关卡', String(st.levelIndex + 1) + '/' + String(LEVELS.length))
  hudPair(ctx, W / 2, 20, '入栏', st.pennedCount + '/' + st.sheep.length, 'center', accent(2))
  hudPair(ctx, W - 10, 20, '限时', (st.timeLeftMs / 1000).toFixed(1) + 's', 'right', accentColor)
  hudPair(ctx, W / 2, 44, '得分', String(st.score), 'center', THEME.gold)

  if (st.phase === 'won') {
    drawOverlay(ctx, W, H, '过关！', '剩余 ' + Math.ceil(st.timeLeftMs / 1000) + ' 秒 · 加分已入账 · 即将进入下一关', THEME.good)
  } else if (st.phase === 'lost') {
    drawOverlay(ctx, W, H, '时间到', '还剩 ' + (st.sheep.length - st.pennedCount) + ' 只羊 · 按 R 重开', THEME.bad)
  } else if (st.phase === 'campaign-won') {
    drawOverlay(ctx, W, H, '全圈完成！', '五关羊群全部入栏 · 总分 ' + st.score + ' · 按 R 再来一局', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · 按 R 重开')
  }
  void HUD_H
}
