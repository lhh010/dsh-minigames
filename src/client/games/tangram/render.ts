/**
 * 七巧板 Tangram 画布渲染：左侧板块托盘（2×4 槽位、可拖出），右侧目标剪影
 * （半透明底 + 描边），已就位板块以绿色高亮吸附显示，选中/拖拽板块带旋转
 * 指示（虚线圆 + 角度），顶部为关卡 HUD。共享 theme 的背景、HUD 与遮罩。
 */
import { accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, THEME } from '../theme.ts'
import {
  BOARD_W, BOARD_X, containsPoint, HUD_H, LOGICAL_H, LOGICAL_W, piecePoly, SCALE, SLOT, traySlot, TRAY_W, TRAY_X,
  type Poly, type Pt, type TangramState,
} from './logic.ts'

/** 单个板块的最大外接半径（逻辑像素，用于旋转指示圈）。 */
const MAX_RADIUS = 2.2 * SCALE

/** 多边形路径辅助。 */
function polyPath(ctx: CanvasRenderingContext2D, p: Poly): void {
  ctx.beginPath()
  ctx.moveTo(p[0]!.x, p[0]!.y)
  for (let i = 1; i < p.length; i += 1) ctx.lineTo(p[i]!.x, p[i]!.y)
  ctx.closePath()
}

/**
 * 画一块板：填充 accent 色 + 描边；就位时绿色辉光，选中时加亮描边与编号。
 * @param ctx - 画布上下文。
 * @param index - 板块下标。
 * @param state - 当前状态。
 * @param selected - 是否选中（旋转指示在别处统一画）。
 */
function drawPiece(ctx: CanvasRenderingContext2D, index: number, state: TangramState, selected: boolean): void {
  const p = piecePoly(index, state.poses[index]!)
  const color = accent(index)
  const placed = state.placed[index]
  ctx.fillStyle = placed ? color : 'rgba(226,226,238,0.18)'
  if (placed) glow(ctx, THEME.good, 10)
  else if (selected) glow(ctx, color, 10)
  polyPath(ctx, p)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = placed ? THEME.good : selected ? '#ffffff' : color
  ctx.lineWidth = selected ? 2 : 1.5
  polyPath(ctx, p)
  ctx.stroke()
  const c = { x: p.reduce((s, v) => s + v.x, 0) / p.length, y: p.reduce((s, v) => s + v.y, 0) / p.length }
  ctx.fillStyle = placed ? '#0d0d14' : THEME.text
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(index + 1), c.x, c.y)
  ctx.textBaseline = 'alphabetic'
}

/**
 * 旋转指示：选中板块质心外的虚线圆 + 当前角度文字。
 * @param ctx - 画布上下文。
 * @param index - 板块下标。
 * @param state - 当前状态。
 */
function drawRotationHint(ctx: CanvasRenderingContext2D, index: number, state: TangramState): void {
  const pose = state.poses[index]!
  ctx.save()
  ctx.strokeStyle = 'rgba(226,226,238,0.5)'
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.arc(pose.x, pose.y, MAX_RADIUS, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(((pose.rot % 8) * 45) + '\u00b0', pose.x, pose.y - MAX_RADIUS - 6)
}

/**
 * 绘制一帧七巧板。
 * @param ctx - 画布上下文。
 * @param w - 逻辑宽。
 * @param h - 逻辑高。
 * @param state - 当前状态。
 * @param selected - 选中的板块下标（无则 null）。
 * @param paused - 是否暂停（画遮罩）。
 * @param winText - 过关副标题；null 表示进行中。
 */
export function renderTangram(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: TangramState,
  selected: number | null, paused: boolean, winText: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  const placedCount = state.placed.filter(v => v).length
  hudPair(ctx, TRAY_X, 21, '关卡 ', String(state.level))
  hudPair(ctx, TRAY_X + 150, 21, '剪影 ', state.name, 'left', accent((state.level - 1) % 8))
  hudPair(ctx, w / 2 + 60, 21, '已就位 ', placedCount + '/7', 'left', THEME.good)
  hudPair(ctx, w - TRAY_X, 21, '操作 ', String(state.moves), 'right')

  // 左侧托盘面板与槽位。
  const trayY = HUD_H + 4
  const trayH = LOGICAL_H - trayY - 8
  ctx.fillStyle = THEME.panel
  glow(ctx, THEME.panelEdge, 8)
  roundRectPath(ctx, TRAY_X, trayY, TRAY_W, trayH, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  roundRectPath(ctx, TRAY_X + 0.5, trayY + 0.5, TRAY_W - 1, trayH - 1, 10)
  ctx.stroke()
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('板块托盘', TRAY_X + 10, trayY + 16)
  for (let i = 0; i < 7; i += 1) {
    const s = traySlot(i)
    ctx.strokeStyle = 'rgba(226,226,238,0.14)'
    ctx.setLineDash([3, 3])
    roundRectPath(ctx, s.x - SLOT / 2, s.y - SLOT / 2, SLOT, SLOT, 8)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 右侧目标面板。
  const boardY = HUD_H + 4
  const boardH = LOGICAL_H - boardY - 8
  ctx.fillStyle = THEME.panel
  glow(ctx, THEME.panelEdge, 8)
  roundRectPath(ctx, BOARD_X, boardY, BOARD_W, boardH, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.panelEdge
  roundRectPath(ctx, BOARD_X + 0.5, boardY + 0.5, BOARD_W - 1, boardH - 1, 10)
  ctx.stroke()
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('目标剪影 · 顶点与中心入区即就位', BOARD_X + 10, boardY + 16)

  // 目标剪影：半透明底 + 描边。
  ctx.fillStyle = 'rgba(122,162,247,0.10)'
  for (const t of state.target) {
    polyPath(ctx, t)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(122,162,247,0.55)'
  ctx.lineWidth = 1.5
  for (const t of state.target) {
    polyPath(ctx, t)
    ctx.stroke()
  }

  // 板块：先画未选中的，选中/拖拽的最后画（浮于上层）。
  for (let i = 0; i < 7; i += 1) {
    if (i !== selected) drawPiece(ctx, i, state, false)
  }
  if (selected !== null) {
    drawPiece(ctx, selected, state, true)
    drawRotationHint(ctx, selected, state)
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '拼成 ' + state.name, winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '面板继续', THEME.text)
  }
}

/**
 * 命中测试：返回逻辑坐标 (x, y) 处最上层的板块下标（后画的优先），无则 null。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param state - 当前状态。
 */
export function pieceAt(x: number, y: number, state: TangramState): number | null {
  const p: Pt = { x, y }
  for (let i = 6; i >= 0; i -= 1) {
    if (containsPoint(piecePoly(i, state.poses[i]!), p, 6)) return i
  }
  return null
}
