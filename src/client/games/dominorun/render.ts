/**
 * 多米诺连锁 DominoRun 渲染：侧视积木风盘面（平台块纹理、骨牌白底
 * 彩点、桥板木纹、加速器箭头）、逐牌倒下旋转的推倒波浪动画、铃铛摆
 * 动、库存栏与 HUD、暂停 / 过关 / 链断 overlay。全部为纯 canvas 绘制。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'
import type { Inventory, Level, Piece, PieceType } from './logic.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 960
export const LOGICAL_H = 600

/** 库存栏区域（底部）。 */
const BAR_H = 96
/** 盘面四周留白。 */
const MARGIN = 40

/** 渲染视图快照：index 每帧组装，render 只读不存状态。 */
export interface DominoView {
  level: Level
  levelIndex: number
  pieces: Piece[]
  phase: 'build' | 'chain'
  fallen: number[]
  outcome: null | 'won' | 'lost'
  paused: boolean
  hoverX: number | null
  selectedType: PieceType
  left: Inventory
  pips: number[]
  /** 连锁开始后经过的毫秒（倒下波浪进度）。 */
  animMs: number
  score: number | null
}

interface Geometry {
  cell: number
  originX: number
  bottomY: number
}

/** 盘面几何：按列数与最高地形算格子尺寸，盘面水平居中、锚在库存栏上方。 */
export function geometry(level: Level): Geometry {
  const maxH = Math.max(...level.terrain, 1)
  const cell = Math.max(
    12,
    Math.min(Math.floor((LOGICAL_W - MARGIN * 2) / level.w), Math.floor((LOGICAL_H - BAR_H - MARGIN * 2) / (maxH + 3))),
  )
  return {
    cell,
    originX: Math.floor((LOGICAL_W - cell * level.w) / 2),
    bottomY: LOGICAL_H - BAR_H - 24,
  }
}

/** 画布逻辑坐标 → 盘面列号（不在盘面竖向范围内返回 null）。 */
export function columnAt(level: Level, px: number, py: number): number | null {
  const geo = geometry(level)
  const x = Math.floor((px - geo.originX) / geo.cell)
  if (x < 0 || x >= level.w) return null
  if (py < MARGIN || py > geo.bottomY + geo.cell) return null
  return x
}

/** 倒下旋转角（度）：fallen 序号 × 拍长决定起步时刻，缓动倒到 78°。 */
function fallAngle(idx: number, animMs: number): number {
  const start = idx * 150
  const t = Math.max(0, Math.min(1, (animMs - start) / 170))
  return 78 * t * t
}

function drawTerrain(ctx: CanvasRenderingContext2D, view: DominoView, geo: Geometry): void {
  const { level } = view
  for (let x = 0; x < level.w; x += 1) {
    const h = level.terrain[x]!
    const px = geo.originX + x * geo.cell
    if (h <= 0) {
      // 沟壑：底部画警示斜纹示意空档。
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = THEME.textMuted
      ctx.lineWidth = 2
      const baseY = geo.bottomY
      for (let i = 0; i < 3; i += 1) {
        const cx = px + geo.cell * (0.2 + i * 0.3)
        ctx.beginPath()
        ctx.moveTo(cx - 4, baseY + 10)
        ctx.lineTo(cx + 4, baseY + 2)
        ctx.stroke()
      }
      ctx.restore()
      continue
    }
    // 实心柱：逐格积木块 + 顶面亮边。
    for (let row = 0; row < h; row += 1) {
      const py = geo.bottomY - (row + 1) * geo.cell
      const tint = row === h - 1 ? THEME.panel : '#26263a'
      roundRectPath(ctx, px + 1, py + 1, geo.cell - 2, geo.cell - 2, 4)
      ctx.fillStyle = tint
      ctx.fill()
      ctx.strokeStyle = THEME.panelEdge
      ctx.lineWidth = 1
      ctx.stroke()
    }
    const topY = geo.bottomY - h * geo.cell
    ctx.fillStyle = accent(x % 8)
    ctx.globalAlpha = 0.55
    ctx.fillRect(px + 2, topY + 1, geo.cell - 4, 3)
    ctx.globalAlpha = 1
  }
}

function drawPusher(ctx: CanvasRenderingContext2D, view: DominoView, geo: Geometry): void {
  const { level } = view
  const px = geo.originX + level.pusherX * geo.cell
  const topY = geo.bottomY - level.terrain[level.pusherX]! * geo.cell
  // 推手：金色底座 + 指向右的推杆。
  roundRectPath(ctx, px + 4, topY - geo.cell * 0.5, geo.cell - 8, geo.cell * 0.5, 3)
  ctx.fillStyle = THEME.gold
  glow(ctx, THEME.gold, 8)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(px + geo.cell / 2, topY - geo.cell * 0.45)
  ctx.lineTo(px + geo.cell + geo.cell * 0.35, topY - geo.cell * 0.2)
  ctx.stroke()
}

function drawBell(ctx: CanvasRenderingContext2D, view: DominoView, geo: Geometry): void {
  const { level, outcome, animMs } = view
  const cell = geo.cell
  const px = geo.originX + level.bellX * geo.cell + cell / 2
  const topY = geo.bottomY - level.terrain[level.bellX]! * cell
  const swing = outcome === 'won'
    ? Math.sin(animMs / 90) * 0.5
    : Math.sin(animMs / 700) * 0.08
  ctx.save()
  ctx.translate(px, topY - cell * 1.1)
  ctx.rotate(swing)
  const color = outcome === 'won' ? THEME.gold : '#c9c9d8'
  glow(ctx, color, outcome === 'won' ? 14 : 6)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-cell * 0.3, 0)
  ctx.quadraticCurveTo(0, -cell * 0.9, cell * 0.3, 0)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, cell * 0.08, cell * 0.08, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.restore()
}

function drawDominoPiece(
  ctx: CanvasRenderingContext2D, view: DominoView, geo: Geometry,
  piece: Piece, angleDeg: number, alpha: number,
): void {
  const cell = geo.cell
  const px = geo.originX + piece.x * geo.cell + cell / 2
  const baseY = geo.bottomY - view.level.terrain[piece.x]! * cell
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(px, baseY)
  ctx.rotate((angleDeg * Math.PI) / 180)
  const w = cell * 0.34
  const h = cell * 0.92
  // 白底骨牌。
  roundRectPath(ctx, -w / 2, -h, w, h, 3)
  ctx.fillStyle = '#e8e8f2'
  ctx.fill()
  ctx.strokeStyle = piece.type === 'booster' ? accent(3) : THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (piece.type === 'booster') {
    // 加速器：牌面上两道向右箭头。
    ctx.strokeStyle = accent(3)
    ctx.lineWidth = 2
    for (let i = 0; i < 2; i += 1) {
      const y = -h * (0.38 + i * 0.26)
      ctx.beginPath()
      ctx.moveTo(-w * 0.18, y)
      ctx.lineTo(w * 0.16, y)
      ctx.moveTo(w * 0.04, y - w * 0.16)
      ctx.lineTo(w * 0.2, y)
      ctx.lineTo(w * 0.04, y + w * 0.16)
      ctx.stroke()
    }
  } else {
    // 普通骨牌：种子彩点。
    ctx.fillStyle = accent(view.pips[piece.x] ?? 0)
    ctx.beginPath()
    ctx.arc(0, -h * 0.42, w * 0.16, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, -h * 0.68, w * 0.16, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawBridge(ctx: CanvasRenderingContext2D, view: DominoView, geo: Geometry, piece: Piece, active: boolean): void {
  const { level } = view
  const cell = geo.cell
  const x = piece.x
  const px = geo.originX + x * cell
  // 桥面高度 = 沟壑有效高度（左侧最近实心列的顶面）。
  const deckY = geo.bottomY - effHeightLocal(level, x) * cell
  const plankH = Math.max(5, cell * 0.16)
  ctx.save()
  ctx.globalAlpha = active ? 1 : 0.85
  if (active) glow(ctx, accent(4), 8)
  ctx.fillStyle = '#8a6a48'
  ctx.fillRect(px + 1, deckY - plankH, cell - 2, plankH)
  noGlow(ctx)
  // 木纹。
  ctx.strokeStyle = '#6d5338'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px + 4, deckY - plankH + 1)
  ctx.lineTo(px + cell - 4, deckY - plankH + 1)
  ctx.stroke()
  // 支撑小柱。
  ctx.fillStyle = '#6d5338'
  ctx.fillRect(px + cell * 0.46, deckY - plankH, 3, plankH + 2)
  ctx.restore()
}

/** 沟壑列的有效高度（与 logic.effHeight 同规则，渲染层本地实现避免循环依赖类型外的开销）。 */
function effHeightLocal(level: Level, x: number): number {
  for (let i = x; i >= 0; i -= 1) {
    if (level.terrain[i]! > 0) return level.terrain[i]!
  }
  return 0
}

function drawHoverGhost(ctx: CanvasRenderingContext2D, view: DominoView, geo: Geometry): void {
  if (view.hoverX === null || view.phase !== 'build' || view.paused) return
  const cell = geo.cell
  const px = geo.originX + view.hoverX * cell
  const ground = view.level.terrain[view.hoverX]!
  const placeable = view.hoverX !== view.level.pusherX && view.hoverX !== view.level.bellX
    && !view.pieces.some(p => p.x === view.hoverX) && view.left[view.selectedType] > 0
    && (view.selectedType === 'bridge' ? ground === 0 : ground > 0)
  ctx.save()
  ctx.globalAlpha = 0.35
  const topY = geo.bottomY - (ground > 0 ? ground * cell : effHeightLocal(view.level, view.hoverX) * cell)
  ctx.fillStyle = placeable ? THEME.good : THEME.bad
  roundRectPath(ctx, px + 2, topY - cell, cell - 4, cell, 4)
  ctx.fill()
  ctx.restore()
}

const PIECE_LABELS: Record<PieceType, string> = { domino: '骨牌', bridge: '桥板', booster: '加速器' }
const PIECE_KEYS: Record<PieceType, string> = { domino: '1', bridge: '2', booster: '3' }

function drawInventoryBar(ctx: CanvasRenderingContext2D, view: DominoView): void {
  const top = LOGICAL_H - BAR_H + 8
  roundRectPath(ctx, MARGIN, top, LOGICAL_W - MARGIN * 2, BAR_H - 16, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  const slotW = 220
  const startX = (LOGICAL_W - slotW * 3 - 16 * 2) / 2
  const types: PieceType[] = ['domino', 'bridge', 'booster']
  for (let i = 0; i < types.length; i += 1) {
    const t = types[i]!
    const x = startX + i * (slotW + 16)
    const selected = view.selectedType === t
    roundRectPath(ctx, x, top + 10, slotW, BAR_H - 36, 8)
    ctx.fillStyle = selected ? '#2a2a3e' : '#22222f'
    if (selected) {
      ctx.strokeStyle = accent(i + 1)
      ctx.lineWidth = 1.5
    } else {
      ctx.strokeStyle = THEME.panelEdge
      ctx.lineWidth = 1
    }
    ctx.fill()
    ctx.stroke()
    // 迷你图标：骨牌竖条 / 桥板横条 / 加速器箭头。
    const iconColor = view.left[t] > 0 ? accent(i + 1) : THEME.textMuted
    ctx.fillStyle = iconColor
    if (t === 'domino') {
      roundRectPath(ctx, x + 18, top + 20, 10, 28, 2)
      ctx.fill()
    } else if (t === 'bridge') {
      roundRectPath(ctx, x + 12, top + 32, 26, 7, 2)
      ctx.fill()
    } else {
      ctx.strokeStyle = iconColor
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(x + 14, top + 24)
      ctx.lineTo(x + 32, top + 32)
      ctx.lineTo(x + 14, top + 40)
      ctx.stroke()
    }
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.text
    ctx.fillText(PIECE_LABELS[t] + ' × ' + view.left[t], x + 52, top + 30)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(PIECE_KEYS[t] + ' 号键选用', x + 52, top + 50)
  }
}

/** 库存槽命中测试：点中哪个件型槽（与 drawInventoryBar 同一几何）。
 * @param px - 逻辑横坐标。
 * @param py - 逻辑纵坐标。
 * @returns 件型；未命中返回 null。
 */
export function inventorySlotAt(px: number, py: number): PieceType | null {
  const top = LOGICAL_H - BAR_H + 8
  if (py < top + 10 || py > top + 10 + BAR_H - 36) return null
  const slotW = 220
  const startX = (LOGICAL_W - slotW * 3 - 16 * 2) / 2
  const types: PieceType[] = ['domino', 'bridge', 'booster']
  for (let i = 0; i < types.length; i += 1) {
    const x = startX + i * (slotW + 16)
    if (px >= x && px <= x + slotW) return types[i]!
  }
  return null
}

/** 整帧绘制入口（index 每个渲染帧调用一次）。 */
export function renderScene(ctx: CanvasRenderingContext2D, view: DominoView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const geo = geometry(view.level)
  ctx.font = '700 15px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.text
  ctx.fillText('关卡 ' + (view.levelIndex + 1) + '/5 · ' + view.level.name, MARGIN + 4, 30)
  hudPair(
    ctx, LOGICAL_W - MARGIN - 4, 28,
    '剩余 ' + (view.left.domino + view.left.bridge + view.left.booster) + ' 件',
    '空格推倒',
    'right',
  )
  drawTerrain(ctx, view, geo)
  drawPusher(ctx, view, geo)
  drawHoverGhost(ctx, view, geo)
  // 先画未倒的，再画倒下中的（ fallen 波浪旋转）。
  const fallenIdx = new Map<number, number>()
  view.fallen.forEach((x, i) => fallenIdx.set(x, i))
  for (const piece of view.pieces) {
    if (fallenIdx.has(piece.x)) continue
    if (piece.type === 'bridge') drawBridge(ctx, view, geo, piece, false)
    else drawDominoPiece(ctx, view, geo, piece, 0, 1)
  }
  for (const x of view.fallen) {
    const piece = view.pieces.find(p => p.x === x)
    if (piece === undefined) continue
    if (piece.type === 'bridge') {
      drawBridge(ctx, view, geo, piece, true)
      continue
    }
    const idx = fallenIdx.get(x)!
    drawDominoPiece(ctx, view, geo, piece, fallAngle(idx, view.animMs), 1)
  }
  drawBell(ctx, view, geo)
  drawInventoryBar(ctx, view)
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续 · R 重开')
  } else if (view.outcome === 'won') {
    const scoreText = view.score === null ? '' : ' · 得分 ' + view.score
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', '铃铛响了' + scoreText, THEME.good)
  } else if (view.outcome === 'lost') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '链断了', '空格回到建造期重摆，补上一张牌', THEME.bad)
  }
}
