/**
 * 七巧拼图 Tangram2 渲染：木纹桌面、剪影淡色填充轮廓、七块彩色板（选中
 * 高亮 + 拖拽抬起阴影）、已放块贴合描边发亮、覆盖率 / 关卡 / 步数 / 用时
 * HUD，以及暂停与过关 overlay。全部为纯 canvas 绘制，状态由 logic 的
 * TangramState 提供，本模块不持有游戏数据。
 */
import { THEME, accent, glow, noGlow, drawBackground, drawOverlay, hudPair, roundRectPath } from '../theme.ts'
import { LOGICAL_H, LOGICAL_W, pointInPolygon, polygonOf, coveragePercent, type TangramState } from './logic.ts'

/** 渲染视图：逻辑状态 + 交互态 + 进度标记（由 index 组装）。 */
export interface TangramView {
  state: TangramState
  selected: number | null
  dragging: boolean
  score: number
  cleared: boolean
  complete: boolean
  paused: boolean
}

/** 每块板固定取一个强调色（按板块编号稳定分配）。 */
function pieceColor(id: number): string {
  return accent(id)
}

/** 确定性伪随机（木纹纹理用，与游戏随机无关）。 */
function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 木纹桌面：共享渐变底 + 若干低透明度深色横向纹路（纯函数式，无状态）。 */
function drawWoodTable(ctx: CanvasRenderingContext2D): void {
  const rows = 7
  for (let i = 0; i < rows; i += 1) {
    const y = 40 + i * 88 + hash01(i) * 30
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= LOGICAL_W; x += 60) {
      ctx.lineTo(x, y + Math.sin((x + i * 130) / 190) * 5 + hash01(i * 31 + x) * 4)
    }
    ctx.strokeStyle = 'rgba(90,64,38,0.16)'
    ctx.lineWidth = 5 + hash01(i * 7) * 6
    ctx.stroke()
  }
}

/** 盘面底板 + 剪影淡色填充（各槽位同色填充即并集剪影）。 */
function drawSilhouette(ctx: CanvasRenderingContext2D, state: TangramState): void {
  ctx.fillStyle = 'rgba(30,30,42,0.55)'
  roundRectPath(ctx, 60, 40, 720, 520, 18)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(226,226,238,0.10)'
  for (const slot of state.slots) {
    ctx.beginPath()
    ctx.moveTo(slot.poly[0]![0], slot.poly[0]![1])
    for (let i = 1; i < slot.poly.length; i += 1) ctx.lineTo(slot.poly[i]![0], slot.poly[i]![1])
    ctx.closePath()
    ctx.fill()
  }
}

/** 沿多边形顶点构建 path。 */
function pathPoly(ctx: CanvasRenderingContext2D, poly: readonly ([number, number])[]): void {
  ctx.beginPath()
  ctx.moveTo(poly[0]![0], poly[0]![1])
  for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i]![0], poly[i]![1])
  ctx.closePath()
}

/** 一块板的绘制：已放块贴合并高亮；未放块半透明，选中/拖拽加阴影抬起。 */
function drawPiece(ctx: CanvasRenderingContext2D, state: TangramState, id: number, view: TangramView): void {
  const p = state.pieces.find((q) => q.id === id)
  if (p === undefined) return
  const color = pieceColor(id)
  const lift = view.dragging && view.selected === id ? 7 : view.selected === id ? 3 : 0
  const poly = polygonOf(p.kind, p.rot, p.flipped, p.x, p.y - lift, state.unit)
  ctx.save()
  if (!p.placed) {
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 6 + lift
    ctx.shadowOffsetY = 3 + lift
  }
  pathPoly(ctx, poly)
  if (p.placed) {
    glow(ctx, color, 10)
    ctx.fillStyle = color
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else {
    ctx.globalAlpha = view.selected === id ? 1 : 0.82
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = view.selected === id ? '#ffffff' : 'rgba(255,255,255,0.28)'
    ctx.lineWidth = view.selected === id ? 2.5 : 1.2
    ctx.stroke()
  }
  ctx.restore()
}

/** 顶部 HUD：关卡 / 图形名 / 覆盖率 / 步数 / 用时 / 总分。 */
function drawHud(ctx: CanvasRenderingContext2D, view: TangramView): void {
  const s = view.state
  const seconds = Math.floor(s.elapsedMs / 1000)
  const timeText = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  ctx.textAlign = 'left'
  hudPair(ctx, 24, 28, '关卡 ' + s.level + '/5 · ' + s.name, '')
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText('七巧拼图', 24, 28)
  hudPair(ctx, 24, 50, '覆盖率', coveragePercent(s).toFixed(0) + '%', 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W - 24, 28, '总分', String(view.score), 'right')
  hudPair(ctx, LOGICAL_W - 24, 50, '步数', String(s.moves), 'right')
  hudPair(ctx, LOGICAL_W - 24, 72, '用时', timeText, 'right')
}

/** 主渲染入口：桌面 -> 剪影 -> 已放块 -> 未放块 -> HUD -> overlay。 */
export function renderTangram(ctx: CanvasRenderingContext2D, view: TangramView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawWoodTable(ctx)
  drawSilhouette(ctx, view.state)
  for (const p of view.state.pieces) if (p.placed) drawPiece(ctx, view.state, p.id, view)
  for (const p of view.state.pieces) if (!p.placed) drawPiece(ctx, view.state, p.id, view)
  drawHud(ctx, view)
  if (view.paused && !view.complete) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续 · 长按 R 重开')
    return
  }
  if (view.complete) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关', '总分 ' + view.score + ' · 按 R 再来一轮', THEME.gold)
    return
  }
  if (view.cleared) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '拼图完成', view.state.name + ' · 空格进入下一关', THEME.good)
  }
}

/**
 * 命中测试：返回包含该点的最上层未放置板块编号（后绘制者优先）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param state - 关卡状态。
 * @returns 命中的板块编号，未命中返回 null。
 */
export function pieceHit(x: number, y: number, state: TangramState): number | null {
  for (let i = state.pieces.length - 1; i >= 0; i -= 1) {
    const p = state.pieces[i]!
    if (p.placed) continue
    const poly = polygonOf(p.kind, p.rot, p.flipped, p.x, p.y, state.unit)
    if (pointInPolygon(x, y, poly)) return p.id
  }
  return null
}
