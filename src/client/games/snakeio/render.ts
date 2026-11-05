/**
 * 蛇界争霸渲染层：摄像机跟随 + 矩形毒墙世界 + 收缩毒圈 + 发光蛇身
 * 圆链 + 朝向眼睛 + 光点 glow + 左下小地图 + HUD（长度/排名/击杀/毒圈）
 * + 死亡 / 吃鸡 / 暂停 overlay。全部为纯 canvas 绘制；摄像机状态由调用方
 * （index.ts）持有并传入，本模块不保存跨帧状态。
 */
import {
  CX, CY, WORLD_H, WORLD_W, playerRank, thicknessOf, speedOf, zoneRadiusAt,
  type IoFood, type IoSnake, type IoState,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 960
export const LOGICAL_H = 600

/** 每帧由 index.ts 组装的视图参数。 */
export interface IoView {
  /** 摄像机中心（世界坐标）。 */
  camX: number
  camY: number
  paused: boolean
}

/** 世界坐标 -> 画布坐标。 */
function toScreen(v: IoView, x: number, y: number): { x: number; y: number } {
  return { x: x - v.camX + LOGICAL_W / 2, y: y - v.camY + LOGICAL_H / 2 }
}

/** 背景网格点（运动视差）。 */
function drawGridDots(ctx: CanvasRenderingContext2D, v: IoView): void {
  ctx.fillStyle = 'rgba(226,226,238,0.05)'
  const step = 90
  const x0 = Math.floor((v.camX - LOGICAL_W / 2) / step) * step
  const y0 = Math.floor((v.camY - LOGICAL_H / 2) / step) * step
  for (let y = y0; y < v.camY + LOGICAL_H / 2 + step; y += step) {
    for (let x = x0; x < v.camX + LOGICAL_W / 2 + step; x += step) {
      if (x < 0 || x > WORLD_W || y < 0 || y > WORLD_H) continue
      const p = toScreen(v, x, y)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** 四周毒墙（危险红光边框）。 */
function drawWalls(ctx: CanvasRenderingContext2D, v: IoView): void {
  if (v.camX < -100 || v.camX > WORLD_W + 100 || v.camY < -100 || v.camY > WORLD_H + 100) return
  const a = toScreen(v, 0, 0)
  const b = toScreen(v, WORLD_W, WORLD_H)
  glow(ctx, THEME.bad, 18)
  ctx.strokeStyle = 'rgba(247,118,142,0.9)'
  ctx.lineWidth = 5
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
  noGlow(ctx)
}

/** 收缩毒圈：圈外红色蒙版 + 圈边亮环。 */
function drawZone(ctx: CanvasRenderingContext2D, state: IoState, v: IoView): void {
  const r = zoneRadiusAt(state.tick)
  const c = toScreen(v, CX, CY)
  if (Math.hypot(v.camX - CX, v.camY - CY) > r + 1100) return
  // 圈外蒙版：整屏红罩挖掉圈。
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2, true)
  ctx.fillStyle = 'rgba(247,118,142,0.10)'
  ctx.fill()
  ctx.restore()
  glow(ctx, THEME.bad, 12)
  ctx.strokeStyle = 'rgba(247,118,142,0.7)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
}

/** 单个光点（glow 圆）。 */
function drawFood(ctx: CanvasRenderingContext2D, f: IoFood, v: IoView): void {
  const p = toScreen(v, f.x, f.y)
  if (p.x < -20 || p.x > LOGICAL_W + 20 || p.y < -20 || p.y > LOGICAL_H + 20) return
  const col = accent(f.color)
  glow(ctx, col, 8)
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(p.x, p.y, f.r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/** 一条蛇：渐变圆链 + 头部眼睛；boost 时整体加发光拖尾。 */
function drawSnake(ctx: CanvasRenderingContext2D, s: IoSnake, v: IoView, isPlayer: boolean): void {
  const col = accent(s.color)
  const th = thicknessOf(s)
  const left = v.camX - LOGICAL_W / 2 - 60
  const right = v.camX + LOGICAL_W / 2 + 60
  const top = v.camY - LOGICAL_H / 2 - 60
  const bottom = v.camY + LOGICAL_H / 2 + 60
  const n = s.points.length
  if (s.boosting) glow(ctx, col, 16)
  ctx.fillStyle = col
  const pulse = s.boosting ? 0.75 + 0.25 * Math.sin(s.id * 1.7) : 1
  for (let i = n - 1; i >= 0; i -= 2) {
    const p = s.points[i]!
    if (p.x < left || p.x > right || p.y < top || p.y > bottom) continue
    const t = i / n
    const r = th * (0.55 + 0.45 * (1 - t)) * pulse
    ctx.globalAlpha = 0.88
    ctx.beginPath()
    ctx.arc(p.x - v.camX + LOGICAL_W / 2, p.y - v.camY + LOGICAL_H / 2, r, 0, Math.PI * 2)
    ctx.fill()
    if (i % 16 === 0) {
      ctx.globalAlpha = 0.28
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(p.x - v.camX + LOGICAL_W / 2, p.y - v.camY + LOGICAL_H / 2, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = col
    }
  }
  ctx.globalAlpha = 1
  noGlow(ctx)
  // 头部 + 朝向眼睛。
  const h = toScreen(v, s.x, s.y)
  glow(ctx, col, 14)
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(h.x, h.y, th * 1.05, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  const a = s.angle
  const px = Math.cos(a + Math.PI / 2)
  const py = Math.sin(a + Math.PI / 2)
  for (const side of [-1, 1]) {
    const ex = h.x + Math.cos(a) * th * 0.32 + px * side * th * 0.5
    const ey = h.y + Math.sin(a) * th * 0.32 + py * side * th * 0.5
    ctx.fillStyle = '#f5f5fa'
    ctx.beginPath()
    ctx.arc(ex, ey, th * 0.36, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = THEME.panel
    ctx.beginPath()
    ctx.arc(ex + Math.cos(a) * th * 0.14, ey + Math.sin(a) * th * 0.14, th * 0.18, 0, Math.PI * 2)
    ctx.fill()
  }
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(226,226,238,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(h.x, h.y, th * 1.05 + 4, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** 左下小地图：矩形世界 + 毒圈 + 蛇位点（玩家白色大点）。 */
function drawMinimap(ctx: CanvasRenderingContext2D, state: IoState, v: IoView): void {
  const mw = 150
  const mh = mw * (WORLD_H / WORLD_W)
  const ox = 14
  const oy = LOGICAL_H - 14 - mh
  roundRectPath(ctx, ox - 4, oy - 4, mw + 8, mh + 8, 8)
  ctx.fillStyle = 'rgba(30,30,42,0.72)'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = 'rgba(247,118,142,0.5)'
  ctx.strokeRect(ox, oy, mw, mh)
  // 毒圈。
  const k = mw / WORLD_W
  ctx.strokeStyle = 'rgba(247,118,142,0.55)'
  ctx.beginPath()
  ctx.arc(ox + CX * k, oy + CY * k, zoneRadiusAt(state.tick) * k, 0, Math.PI * 2)
  ctx.stroke()
  for (const s of state.snakes) {
    if (!s.alive) continue
    const mx = ox + s.x * k
    const my = oy + s.y * k
    if (s.ai) {
      ctx.fillStyle = accent(s.color)
      ctx.beginPath()
      ctx.arc(mx, my, Math.max(1.5, thicknessOf(s) * 0.12), 0, Math.PI * 2)
      ctx.fill()
    } else {
      glow(ctx, THEME.text, 6)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    }
  }
}

/** 顶部 HUD：长度 / 排名 / 击杀；右侧加速提示 / 速度 / 毒圈半径。 */
function drawHud(ctx: CanvasRenderingContext2D, state: IoState): void {
  const player = state.snakes[0]!
  const rank = playerRank(state)
  hudPair(ctx, 16, 26, '长度', String(Math.floor(Math.max(0, player.length))))
  hudPair(ctx, 16, 46, '排名', rank > 0 ? String(rank) + ' / ' + aliveCount(state) : '—')
  hudPair(ctx, 16, 66, '击杀', String(player.kills))
  const boostReady = player.length > 14
  hudPair(ctx, LOGICAL_W - 16, 26, '加速', boostReady ? '按住上键 / 空格' : '长度不足', 'right', boostReady ? THEME.text : THEME.textMuted)
  const boostSpd = Math.round(speedOf(player))
  hudPair(ctx, LOGICAL_W - 16, 46, '速度', boostSpd + ' px/s', 'right', player.boosting ? THEME.gold : THEME.textMuted)
  hudPair(ctx, LOGICAL_W - 16, 66, '毒圈', Math.round(zoneRadiusAt(state.tick)) + ' px', 'right', THEME.bad)
}

function aliveCount(state: IoState): number {
  let n = 0
  for (const s of state.snakes) if (s.alive) n += 1
  return n
}

/**
 * 整帧渲染入口：背景 -> 世界（网格点/毒墙/毒圈/光点/蛇）-> 小地图 ->
 * HUD -> 暂停/死亡/吃鸡 overlay。
 * @param ctx - 画布上下文。
 * @param state - 引擎状态。
 * @param view - 摄像机等视图参数。
 */
export function renderSnakeio(ctx: CanvasRenderingContext2D, state: IoState, view: IoView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawGridDots(ctx, view)
  drawWalls(ctx, view)
  drawZone(ctx, state, view)
  for (const f of state.foods) drawFood(ctx, f, view)
  for (const s of state.snakes) {
    if (s.alive && s.ai) drawSnake(ctx, s, view, false)
  }
  const player = state.snakes[0]!
  if (player.alive) drawSnake(ctx, player, view, true)
  drawMinimap(ctx, state, view)
  drawHud(ctx, state)
  if (state.over && state.stats !== null) {
    const st = state.stats
    if (st.win) {
      drawOverlay(
        ctx, LOGICAL_W, LOGICAL_H, '吃 鸡 大 吉',
        '活到最后！长度峰值 ' + st.peak + ' · 击杀 ' + st.kills + ' · 用时 ' + st.seconds.toFixed(1) + 's · R 重开',
        THEME.gold,
      )
    } else {
      drawOverlay(
        ctx, LOGICAL_W, LOGICAL_H, '游戏结束',
        '长度峰值 ' + st.peak + ' · 击杀 ' + st.kills + ' · 存活 ' + st.seconds.toFixed(1) + 's · R 重开',
        THEME.bad,
      )
    }
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已 暂 停', 'P 继续争霸', THEME.text)
  }
}
