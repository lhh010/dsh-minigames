/**
 * 叠叠乐渲染：等轴测投影木塔（层偶沿 X、奇沿 Z 正交），木色顶面
 * + 两侧面明暗；悬空高危块按 previewStress 由琥珀渐变到红并加辉光，
 * hover 块描边高亮。布局计算（computeLayout）与绘制分离，命中测试
 * （blockHitTest）复用同一布局保证点选与显示一致。
 */
import { canPull, previewStress, type JengaState } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽（px）。 */
export const logicalW = 640
/** 逻辑画布高（px）。 */
export const logicalH = 600

/** 等轴测参数：块宽单元 / 屏幕层高 / 塔心水平位置。 */
const U = 34
const BLOCK_LEN = 3 * U
const LEVEL_H = 22
const CX = 320
const TOP_Y = 150

/** 3D 坐标（x/z 为等轴测平面，yLev 为 0 起的层号）→ 屏幕坐标。 */
function project(x: number, z: number, yLev: number): { x: number, y: number } {
  return { x: CX + (x - z) * 0.866, y: TOP_Y + yLev * LEVEL_H + (x + z) * 0.5 }
}

/** 一个块的投影布局：顶面四边形 + 屏幕包围盒。 */
export interface BlockLayout {
  level: number
  slot: number
  /** 顶面四角（顺时针）。 */
  top: Array<{ x: number, y: number }>
  /** 全部 8 角的包围盒。 */
  minX: number, minY: number, maxX: number, maxY: number
  /** 等轴测深度（块中心 x+z）：画家算法排序键——原 (maxX-CX)+maxY
   * 混合横纵坐标，同层横排块排序错乱导致前排画到后排之后（穿模错位）。 */
  depth: number
}

/**
 * 计算整塔布局：底层到顶层逐块投影。块长沿层方向（偶层沿 X、奇层
 * 沿 Z），宽 1 单元、屏幕高 LEVEL_H。
 */
export function computeLayout(state: JengaState): BlockLayout[] {
  const out: BlockLayout[] = []
  for (const b of state.blocks) {
    const alongX = b.level % 2 === 0
    const halfLen = BLOCK_LEN / 2
    const c = alongX ? b.slot * U : b.slot * U
    const x0 = alongX ? -halfLen : c - U / 2
    const x1 = alongX ? halfLen : c + U / 2
    const z0 = alongX ? c - U / 2 : -halfLen
    const z1 = alongX ? c + U / 2 : halfLen
    const yBase = b.level - 1
    const corners = [
      project(x0, z0, yBase), project(x1, z0, yBase),
      project(x1, z1, yBase), project(x0, z1, yBase),
      project(x0, z0, yBase + 1), project(x1, z0, yBase + 1),
      project(x1, z1, yBase + 1), project(x0, z1, yBase + 1),
    ]
    const xs = corners.map(p => p.x)
    const ys = corners.map(p => p.y)
    out.push({
      level: b.level,
      slot: b.slot,
      top: [corners[4]!, corners[5]!, corners[6]!, corners[7]!],
      minX: Math.min(...xs), minY: Math.min(...ys),
      maxX: Math.max(...xs), maxY: Math.max(...ys),
      depth: (x0 + x1) / 2 + (z0 + z1) / 2,
    })
  }
  return out
}

/** 射线法点在四边形内判定。 */
function inQuad(px: number, py: number, quad: Array<{ x: number, y: number }>): boolean {
  let inside = false
  for (let i = 0, j = 3; i < 4; j = i, i += 1) {
    const a = quad[i]!
    const b = quad[j]!
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * 命中测试：从顶层往下找第一个顶面（或包围盒）包含点的仍在位块。
 * @returns 'level:slot' 键或 null。
 */
export function blockHitTest(state: JengaState, x: number, y: number): string | null {
  const layout = computeLayout(state)
  for (let i = layout.length - 1; i >= 0; i -= 1) {
    const l = layout[i]!
    const b = state.blocks[i]!
    if (!b.present) continue
    if (x < l.minX || x > l.maxX || y < l.minY || y > l.maxY) continue
    if (inQuad(x, y, l.top)) return b.level + ':' + b.slot
  }
  return null
}

/** 木色按应力插值：0 → 原木色，≥1 → 红。 */
function woodColor(ratio: number, base: string): string {
  if (ratio >= 1) return THEME.bad
  if (ratio > 0.6) return ratio > 0.85 ? '#d98a56' : '#cf9a5e'
  return base
}

function facePath(ctx: CanvasRenderingContext2D, pts: Array<{ x: number, y: number }>): void {
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y)
  ctx.closePath()
}

/**
 * 绘制整塔场景：背景、应力着色的等轴测木塔（近块后画）、hover 高亮、
 * 分数 / 层数 / 已抽块 HUD；ended 时叠加结束 overlay。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设置）。
 * @param state - 塔状态。
 * @param hover - hover 块键（'level:slot'）或 null。
 * @param shake - 屏幕抖动幅度（px，0 不抖）。
 * @param paused - 暂停 overlay。
 * @param flashText - 结束语（塔倒 / 收手）或 null。
 */
export function renderJenga(
  ctx: CanvasRenderingContext2D,
  state: JengaState,
  hover: string | null,
  shake: number,
  paused: boolean,
  flashText: string | null,
): void {
  drawBackground(ctx, logicalW, logicalH)
  ctx.save()
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)

  // 地面台座
  const g0 = project(-BLOCK_LEN / 2 - 6, -BLOCK_LEN / 2 - 6, 0)
  const g1 = project(BLOCK_LEN / 2 + 6, BLOCK_LEN / 2 + 6, 0)
  ctx.fillStyle = '#26262f'
  roundRectPath(ctx, g0.x - 6, g0.y - 4, g1.x - g0.x + 12, g1.y - g0.y + 10, 8)
  ctx.fill()

  const layout = computeLayout(state)
  // 画家算法：按等轴测深度（块中心 x+z）排序，同柱再按层——远（小 x+z）
  // 先画、近后画。深度相同（同柱不同层）时低层先画，覆盖关系正确。
  const order = layout
    .map((l, i) => ({ l, i, key: l.depth * 1000 + l.level }))
    .sort((a, b) => a.key - b.key)

  for (const { l, i } of order) {
    const b = state.blocks[i]!
    if (!b.present) continue
    const alongX = b.level % 2 === 0
    const halfLen = BLOCK_LEN / 2
    const c = b.slot * U
    const x0 = alongX ? -halfLen : c - U / 2
    const x1 = alongX ? halfLen : c + U / 2
    const z0 = alongX ? c - U / 2 : -halfLen
    const z1 = alongX ? c + U / 2 : halfLen
    const yb = b.level - 1
    const p000 = project(x0, z0, yb), p100 = project(x1, z0, yb)
    const p101 = project(x1, z1, yb), p001 = project(x0, z1, yb)
    const pTop = [project(x0, z0, yb + 1), project(x1, z0, yb + 1), project(x1, z1, yb + 1), project(x0, z1, yb + 1)]
    const risk = canPull(state, b.level, b.slot) ? previewStress(state, b.level, b.slot) : 0
    const hot = risk > 0.9
    if (hot) { glow(ctx, THEME.bad, 10) }
    // 两个朝向观察者的侧面（+X 面与 +Z 面）
    facePath(ctx, [p100, p101, pTop[2]!, pTop[1]!])
    ctx.fillStyle = woodColor(risk, '#8f6a3f')
    ctx.fill()
    facePath(ctx, [p001, p101, pTop[2]!, pTop[3]!])
    ctx.fillStyle = woodColor(risk, '#a87f4e')
    ctx.fill()
    // 顶面
    facePath(ctx, pTop)
    ctx.fillStyle = woodColor(risk, '#c9a06a')
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = 'rgba(20,16,10,0.5)'
    ctx.lineWidth = 1
    facePath(ctx, pTop)
    ctx.stroke()
    // hover 高亮：合法抽块描边
    if (hover !== null && hover === b.level + ':' + b.slot) {
      const legal = canPull(state, b.level, b.slot)
      ctx.strokeStyle = legal ? THEME.accents[0]! : THEME.bad
      ctx.lineWidth = 2.5
      glow(ctx, legal ? THEME.accents[0]! : THEME.bad, 8)
      facePath(ctx, pTop)
      ctx.stroke()
      noGlow(ctx)
    }
  }
  ctx.restore()

  // HUD
  hudPair(ctx, 16, 26, '分数', String(state.score))
  hudPair(ctx, 16, 46, '层数', String(state.levels) + ' 层')
  hudPair(ctx, logicalW - 16, 26, '已抽', String(state.pulled) + ' 块', 'right')
  hudPair(ctx, logicalW - 16, 46, '状态', state.status === 'playing' ? '进行中' : state.status === 'collapsed' ? '塔倒了' : '收手', 'right',
    state.status === 'playing' ? THEME.text : state.status === 'collapsed' ? THEME.bad : THEME.good)

  if (paused) drawOverlay(ctx, logicalW, logicalH, '暂停中', '按 P 继续 · R 重开', THEME.gold)
  else if (flashText !== null) {
    const fail = state.status === 'collapsed'
    drawOverlay(ctx, logicalW, logicalH, fail ? '塔倒了' : '顺利收手',
      flashText + ' · 按 R 重开', fail ? THEME.bad : THEME.good)
  }
}
