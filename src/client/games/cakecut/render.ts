/**
 * 蛋糕等分 CakeCut 的渲染：俯视蛋糕（奶油同心纹理 + 每块独立浅色）、
 * 刀线预览（虚线吸附到块边交点）、切块分离位移、每块面积偏差标签、
 * 剩余刀数/容差 HUD、对称辅助线与过关/暂停 overlay。世界坐标以蛋糕
 * 中心为原点，画布逻辑坐标 640×520，本模块负责双向映射。
 */
import type { Block, Line, Poly, Pt, Seg } from './logic.ts'
import { pointInBlock } from './logic.ts'
import {
  THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 画布逻辑宽度。 */
export const logicalW = 640
/** 画布逻辑高度。 */
export const logicalH = 520
/** 世界坐标到画布坐标的缩放与平移（蛋糕中心 → 画布中上方）。 */
const SCALE = 2.15
const CX = logicalW / 2
const CY = 250

/** 世界点 → 画布点。 */
export function toCanvas(p: Pt): Pt {
  return { x: CX + p.x * SCALE, y: CY + p.y * SCALE }
}

/** 画布坐标（如鼠标事件换算结果）→ 世界点。 */
export function toWorld(x: number, y: number): Pt {
  return { x: (x - CX) / SCALE, y: (y - CY) / SCALE }
}

/** 一块的绘制视图：块本体 + 分离位移 + 偏差标签。 */
export interface BlockView {
  block: Block
  color: string
  offset: Pt
  label: string
  labelColor: string
}

/** 刀线预览：吸附后的实体段集合与合法性着色。 */
export interface PreviewView { segs: Seg[]; ok: boolean }

/** 顶部 HUD 数据。 */
export interface HudView {
  levelName: string
  levelIndex: number
  cutsLeft: number
  piecesNow: number
  piecesTarget: number
  tolerancePct: string
  time: string
  failText: string | null
}

/** 一帧完整绘制输入（index 组装，本模块只画）。 */
export interface CakeRenderInput {
  blocks: BlockView[]
  outlineCenter: Pt
  guides: Line[]
  showGuides: boolean
  preview: PreviewView | null
  hud: HudView
  paused: boolean
  winText: string | null
}

/** 多边形路径（画布坐标）。 */
function polyPath(ctx: CanvasRenderingContext2D, poly: Poly, off: Pt): void {
  ctx.beginPath()
  for (let i = 0; i < poly.length; i += 1) {
    const p = toCanvas({ x: poly[i]!.x + off.x, y: poly[i]!.y + off.y })
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

/** 块路径：外轮廓 + 孔洞（evenodd 填充）。 */
function blockPath(ctx: CanvasRenderingContext2D, block: Block, off: Pt): void {
  polyPath(ctx, block.outer, off)
  for (const h of block.holes) polyPath(ctx, h, off)
}

/** 块质心（世界坐标，简单顶点平均足够标签定位）。 */
export function centroid(poly: Poly, off: Pt): Pt {
  let x = 0
  let y = 0
  for (const p of poly) { x += p.x; y += p.y }
  const n = poly.length
  return { x: x / n + off.x, y: y / n + off.y }
}

/** 端点世界坐标 → 像素长度。 */
function segPixels(s: Seg): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) * SCALE
}

/**
 * 绘制一帧蛋糕等分局面。
 * @param ctx - 画布上下文（已应用 fit 变换）。
 * @param input - 本帧视图数据。
 */
export function renderCake(ctx: CanvasRenderingContext2D, input: CakeRenderInput): void {
  drawBackground(ctx, logicalW, logicalH)

  // 盘面底座。
  roundRectPath(ctx, 26, 52, logicalW - 52, 400, 18)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // 盘沿装饰圈。
  ctx.beginPath()
  ctx.arc(CX, CY, 208, 0, Math.PI * 2)
  ctx.strokeStyle = THEME.panelEdge
  ctx.setLineDash([2, 6])
  ctx.stroke()
  ctx.setLineDash([])

  // 对称辅助线（过关或开启时）。
  if (input.showGuides || input.winText !== null) {
    ctx.save()
    ctx.strokeStyle = THEME.gold
    ctx.globalAlpha = 0.65
    ctx.lineWidth = 1.25
    ctx.setLineDash([8, 7])
    for (const g of input.guides) {
      const a = toCanvas(g.a)
      const b = toCanvas(g.b)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 蛋糕块：浅色填充 + 同心奶油纹理 + 描边。
  const center = toCanvas(input.outlineCenter)
  for (let i = 0; i < input.blocks.length; i += 1) {
    const v = input.blocks[i]!
    ctx.save()
    blockPath(ctx, v.block, v.offset)
    ctx.fillStyle = v.color
    ctx.globalAlpha = 0.32
    ctx.fill('evenodd')
    ctx.globalAlpha = 1
    ctx.clip('evenodd')
    // 奶油纹理：围绕蛋糕中心的同心圆弧。
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1
    for (let r = 14; r < 230; r += 22) {
      ctx.beginPath()
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
    blockPath(ctx, v.block, v.offset)
    ctx.strokeStyle = v.color
    ctx.lineWidth = 2
    glow(ctx, v.color, 5)
    ctx.stroke()
    noGlow(ctx)
  }

  // 每块偏差标签。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  for (const v of input.blocks) {
    const c = toCanvas(centroid(v.block.outer, v.offset))
    // 标签避让：取块内可用点，质心若落在孔洞则沿 y 上移。
    let cy = c.y
    if (!pointInBlock(centroid(v.block.outer, v.offset), v.block) && v.block.holes.length > 0) cy -= 90
    ctx.fillStyle = v.labelColor
    ctx.fillText(v.label, c.x, cy)
  }

  // 刀线预览：吸附到实体段的虚线。
  if (input.preview !== null) {
    ctx.save()
    ctx.strokeStyle = input.preview.ok ? THEME.good : THEME.bad
    ctx.globalAlpha = 0.95
    ctx.lineWidth = 2
    ctx.setLineDash([10, 7])
    for (const s of input.preview.segs) {
      if (segPixels(s) < 6) continue
      const a = toCanvas(s.a)
      const b = toCanvas(s.b)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.restore()
  }

  // HUD。
  const hud = input.hud
  hudPair(ctx, 40, 34, '关卡', hud.levelIndex + 1 + '/5 · ' + hud.levelName)
  hudPair(ctx, 40, 58, '剩余刀数', String(hud.cutsLeft), 'left',
    hud.cutsLeft === 0 ? THEME.bad : THEME.text)
  hudPair(ctx, logicalW / 2 + 20, 34, '份数', hud.piecesNow + '/' + hud.piecesTarget, 'left',
    hud.piecesNow === hud.piecesTarget ? THEME.good : THEME.text)
  // 右对齐 HUD 用 'right' 对齐贴边——原先默认 left 对齐把文本画到 x 右侧，
  // 容差/用时整段出屏。
  hudPair(ctx, logicalW - 40, 34, '容差', '±' + hud.tolerancePct, 'right')
  hudPair(ctx, logicalW - 40, 58, '用时', hud.time, 'right')

  if (input.hud.failText !== null && input.winText === null && !input.paused) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    ctx.fillText(input.hud.failText, logicalW / 2, 486)
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('R：重开本关 · U：撤回上一刀', logicalW / 2, 510)
  }

  if (input.winText !== null) {
    drawOverlay(ctx, logicalW, logicalH, '过关', input.winText, THEME.gold)
  } else if (input.paused) {
    drawOverlay(ctx, logicalW, logicalH, '暂停', 'P：继续', THEME.text)
  }
}
