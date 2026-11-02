/**
 * 黑洞吞噬渲染层：俯视城市路网（街区 + 马路 + 斑马线）、简单形状物体
 * （树圆 / 路灯点 / 车矩形 / 楼方块带顶面偏移伪 3D）、多层旋涡渐变黑洞
 * （玩家蓝紫、AI 红系）与吸入收缩动画（位置/缩放已在 logic 层逐 tick
 * 更新，直接绘制即可）、里程碑浮字、HUD（倒计时/口径/吞数/排名）、小
 * 地图与结束排名 overlay。全部为纯 canvas 绘制；摄像机与浮字状态由
 * 调用方（index.ts）持有并传入，本模块不保存跨帧状态。
 */
import {
  BLOCK, GRID_COLS, GRID_ROWS, KIND_RADIUS, MILESTONES, WORLD_W, WORLD_H,
  playerRank, type CityObject, type Hole, type HoleState,
} from './logic.ts'
import { THEME, accent, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 960
export const LOGICAL_H = 600

/** 里程碑浮字（index.ts 持有并推进 age，>1 淡出）。 */
export interface FloatText {
  x: number
  y: number
  text: string
  age: number
}

/** 每帧由 index.ts 组装的视图参数。 */
export interface HoleView {
  camX: number
  camY: number
  /** 动画时钟（秒，驱动旋涡旋转）。 */
  time: number
  paused: boolean
  floats: FloatText[]
}

/** 世界坐标 -> 画布坐标。 */
function toScreen(v: HoleView, x: number, y: number): { x: number; y: number } {
  return { x: x - v.camX + LOGICAL_W / 2, y: y - v.camY + LOGICAL_H / 2 }
}

/** ---------------- 路网 ---------------- */

/** 背景地面 + 街区地块 + 马路 + 路口斑马线。 */
function drawCity(ctx: CanvasRenderingContext2D, v: HoleView): void {
  ctx.fillStyle = '#191921'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  const road = 16
  const left = v.camX - LOGICAL_W / 2
  const top = v.camY - LOGICAL_H / 2
  const col0 = Math.max(0, Math.floor(left / BLOCK))
  const col1 = Math.min(GRID_COLS - 1, Math.floor((left + LOGICAL_W) / BLOCK))
  const row0 = Math.max(0, Math.floor(top / BLOCK))
  const row1 = Math.min(GRID_ROWS - 1, Math.floor((top + LOGICAL_H) / BLOCK))
  // 马路中线虚线。
  ctx.strokeStyle = 'rgba(226,226,238,0.10)'
  ctx.lineWidth = 2
  ctx.setLineDash([12, 14])
  ctx.beginPath()
  for (let col = col0; col <= col1 + 1; col += 1) {
    const p = toScreen(v, col * BLOCK, 0)
    ctx.moveTo(p.x, 0)
    ctx.lineTo(p.x, LOGICAL_H)
  }
  for (let row = row0; row <= row1 + 1; row += 1) {
    const p = toScreen(v, 0, row * BLOCK)
    ctx.moveTo(0, p.y)
    ctx.lineTo(LOGICAL_W, p.y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  // 街区地块（内缩出马路）。
  ctx.fillStyle = '#20202c'
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      const p = toScreen(v, col * BLOCK + road / 2, row * BLOCK + road / 2)
      ctx.fillRect(p.x, p.y, BLOCK - road, BLOCK - road)
    }
  }
  // 路口斑马线（每个可见路口四条短杠中的两条，够示意）。
  ctx.fillStyle = 'rgba(226,226,238,0.16)'
  for (let row = row0; row <= row1 + 1; row += 1) {
    for (let col = col0; col <= col1 + 1; col += 1) {
      const p = toScreen(v, col * BLOCK, row * BLOCK)
      for (let k = -2; k <= 2; k += 1) {
        ctx.fillRect(p.x + k * 6 - 2, p.y - 13, 4, 10)
        ctx.fillRect(p.x + k * 6 - 2, p.y + 3, 4, 10)
      }
    }
  }
}

/** ---------------- 物体 ---------------- */

/** 单件物体：按档绘制（楼画伪 3D 双层面）。 */
function drawObject(ctx: CanvasRenderingContext2D, obj: CityObject, v: HoleView): void {
  const p = toScreen(v, obj.x, obj.y)
  const pad = 40
  if (p.x < -pad || p.x > LOGICAL_W + pad || p.y < -pad || p.y > LOGICAL_H + pad) return
  if (obj.kind === 'building') {
    const s = KIND_RADIUS.building * (obj.r / KIND_RADIUS.building)
    // 底面阴影 + 顶面偏移伪 3D。
    ctx.fillStyle = 'rgba(10,10,16,0.5)'
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2)
    ctx.fillStyle = '#3a3a52'
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2)
    ctx.fillStyle = '#4c4c6a'
    ctx.fillRect(p.x - s + 5, p.y - s - 6, s * 2 - 6, s * 2 - 6)
    ctx.strokeStyle = 'rgba(226,226,238,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(p.x - s + 5, p.y - s - 6, s * 2 - 6, s * 2 - 6)
    return
  }
  if (obj.kind === 'car') {
    const w = 34 * (obj.r / KIND_RADIUS.car)
    const h = 17 * (obj.r / KIND_RADIUS.car)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(obj.angle)
    ctx.fillStyle = accent(obj.id % 8)
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 4)
    ctx.fill()
    ctx.fillStyle = 'rgba(13,13,20,0.8)'
    ctx.fillRect(-w * 0.12, -h / 2 + 2, w * 0.3, h - 4)
    ctx.restore()
    return
  }
  if (obj.kind === 'lamp') {
    glow(ctx, THEME.gold, 6)
    ctx.fillStyle = THEME.gold
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(1.5, obj.r * 0.6), 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    return
  }
  // 树：深绿圆 + 浅绿芯。
  ctx.fillStyle = '#2d4a2d'
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1, obj.r), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3f6b3f'
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(0.6, obj.r * 0.55), 0, Math.PI * 2)
  ctx.fill()
}

/** ---------------- 黑洞 ---------------- */

/** 多层旋涡渐变黑洞：外圈吸积环 + 三层旋转弧臂 + 中心事件视界。 */
function drawHole(ctx: CanvasRenderingContext2D, hole: Hole, v: HoleView, isPlayer: boolean): void {
  const p = toScreen(v, hole.x, hole.y)
  const r = Math.max(4, hole.r)
  const base = isPlayer ? '#7aa2f7' : '#f7768e'
  const mid = isPlayer ? '#bb9af7' : '#ff9e64'
  // 吸积盘外环。
  glow(ctx, base, 22)
  const g = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r * 1.5)
  g.addColorStop(0, '#000000')
  g.addColorStop(0.55, isPlayer ? 'rgba(122,162,247,0.55)' : 'rgba(247,118,142,0.55)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 三层旋转弧臂（相邻层反向旋转，吸入感）。
  for (let layer = 0; layer < 3; layer += 1) {
    const rr = r * (0.35 + layer * 0.28)
    const dir = layer % 2 === 0 ? 1 : -1
    ctx.strokeStyle = layer === 1 ? mid : base
    ctx.globalAlpha = 0.75 - layer * 0.18
    ctx.lineWidth = Math.max(1.5, r * 0.12)
    ctx.beginPath()
    const start = dir * v.time * (2.2 + layer * 0.9) + layer * 2.1
    ctx.arc(p.x, p.y, rr, start, start + Math.PI * 1.25)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  // 事件视界。
  ctx.fillStyle = '#05050a'
  ctx.beginPath()
  ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = base
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2)
  ctx.stroke()
  // 玩家白圈标识；AI 名字。
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(226,226,238,0.55)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 1.55, v.time * 0.8, v.time * 0.8 + Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  } else {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.bad
    ctx.fillText(hole.name, p.x, p.y - r - 8)
  }
}

/** ---------------- 小地图 / HUD / 浮字 ---------------- */

/** 右下小地图：世界框 + 洞位点 + 剩余物体灰点密度省略（只画洞）。 */
function drawMinimap(ctx: CanvasRenderingContext2D, state: HoleState, v: HoleView): void {
  const w = 132
  const h = w * (WORLD_H / WORLD_W)
  const x0 = LOGICAL_W - w - 14
  const y0 = LOGICAL_H - h - 14
  roundRectPath(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 8)
  ctx.fillStyle = 'rgba(30,30,42,0.72)'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(122,162,247,0.16)'
  ctx.fillRect(x0, y0, w, h)
  const k = w / WORLD_W
  for (const hole of state.holes) {
    ctx.fillStyle = hole.ai ? THEME.bad : '#ffffff'
    ctx.beginPath()
    ctx.arc(x0 + hole.x * k, y0 + hole.y * k, Math.max(1.5, hole.r * 0.08), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(226,226,238,0.3)'
  ctx.strokeRect(x0 + (v.camX - LOGICAL_W / 2) * k, y0 + (v.camY - LOGICAL_H / 2) * k, LOGICAL_W * k, LOGICAL_H * k)
}

/** 顶部 HUD：倒计时 / 口径 / 吞数 / 排名 + 下一里程碑提示。 */
function drawHud(ctx: CanvasRenderingContext2D, state: HoleState): void {
  const player = state.holes[0]!
  const remain = Math.max(0, Math.ceil((3600 - state.tick) / 30))
  const mm = Math.floor(remain / 60)
  const ss = remain % 60
  const timeText = mm + ':' + (ss < 10 ? '0' : '') + ss
  hudPair(ctx, 16, 26, '剩余', timeText, 'left', remain <= 15 ? THEME.bad : THEME.text)
  hudPair(ctx, 16, 46, '口径', Math.round(player.r * 10) / 10 + ' m')
  hudPair(ctx, 16, 66, '吞噬', String(player.eaten))
  hudPair(ctx, 16, 86, '排名', playerRank(state) + ' / ' + state.holes.length)
  const next = MILESTONES[player.milestone]
  if (next !== undefined) {
    hudPair(ctx, LOGICAL_W - 16, 26, '下一口径', next.r + ' m', 'right', THEME.textMuted)
  } else {
    hudPair(ctx, LOGICAL_W - 16, 26, '状态', '吞噬整座城', 'right', THEME.gold)
  }
}

/** 里程碑浮字：向上漂移淡出。 */
function drawFloats(ctx: CanvasRenderingContext2D, v: HoleView): void {
  ctx.textAlign = 'center'
  ctx.font = 'bold 15px system-ui, sans-serif'
  for (const f of v.floats) {
    const p = toScreen(v, f.x, f.y)
    ctx.globalAlpha = Math.max(0, 1 - f.age)
    ctx.fillStyle = THEME.gold
    glow(ctx, THEME.gold, 8)
    ctx.fillText(f.text, p.x, p.y - 30 - f.age * 46)
    noGlow(ctx)
  }
  ctx.globalAlpha = 1
}

/** 结束排名 overlay：名次行 + 玩家成绩。 */
function drawEndOverlay(ctx: CanvasRenderingContext2D, state: HoleState): void {
  const rows = state.stats ?? []
  const me = rows.find(row => !row.ai)
  const title = me !== undefined && me.rank === 1 ? '天坑之王' : '时间到'
  let subtitle = ''
  if (me !== undefined) subtitle = '第 ' + me.rank + ' 名 · 口径 ' + Math.round(me.r * 10) / 10 + ' · 吞噬 ' + me.eaten + ' 件'
  drawOverlay(ctx, LOGICAL_W, LOGICAL_H, title, subtitle, me !== undefined && me.rank === 1 ? THEME.gold : THEME.text)
  // 排名榜。
  ctx.textAlign = 'center'
  ctx.font = '600 14px system-ui, sans-serif'
  let y = LOGICAL_H / 2 + 52
  for (const row of rows) {
    ctx.fillStyle = row.ai ? THEME.bad : THEME.text
    const line = row.rank + '. ' + row.name + ' — 口径 ' + Math.round(row.r * 10) / 10 + ' · ' + row.eaten + ' 件'
    ctx.fillText(line, LOGICAL_W / 2, y)
    y += 22
  }
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('R 重开', LOGICAL_W / 2, y + 4)
}

/**
 * 整帧渲染入口：城市 -> 物体 -> AI 洞 -> 玩家洞 -> 浮字 -> 小地图 ->
 * HUD -> 暂停/结束 overlay。
 * @param ctx - 画布上下文。
 * @param state - 引擎状态。
 * @param view - 摄像机/时钟/浮字等视图参数。
 */
export function renderHole(ctx: CanvasRenderingContext2D, state: HoleState, view: HoleView): void {
  drawCity(ctx, view)
  for (const obj of state.objects) drawObject(ctx, obj, view)
  for (let i = 1; i < state.holes.length; i += 1) drawHole(ctx, state.holes[i]!, view, false)
  drawHole(ctx, state.holes[0]!, view, true)
  drawFloats(ctx, view)
  drawMinimap(ctx, state, view)
  drawHud(ctx, state)
  if (state.over && state.stats !== null) {
    drawEndOverlay(ctx, state)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已 暂 停', 'P 继续吞噬', THEME.text)
  }
}
