/**
 * 建桥大师 Bridge Builder 画布渲染：侧视峡谷剖面（两岸崖壁 + 谷底水
 * 面）、可建网格点、锚点 / 立柱、杆件（测试期按应力比绿→金→红变
 * 色）、小车（车轮随里程滚动、车身随两轮高度倾斜）、断裂粒子由
 * index 层驱动共享粒子池。渲染器无状态（全部信息由 {@link
 * BuilderView} 传入），同一输入绘制结果确定。
 */
import {
  CELL,
  DECK_ROW,
  FLOOR_ROW,
  WHEEL_BASE,
  WHEEL_R,
  beamCost,
  stressRatio,
  type BridgeBeam,
  type BridgeLevel,
  type BridgeNode,
  type RunWorld,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 840
export const LOGICAL_H = 490
/** 网格原点偏移（逻辑像素）。 */
const OX = 40
const OY = 30

/** 网格列 → 逻辑像素横坐标。 */
export function px(x: number): number {
  return OX + x * CELL
}

/** 网格行 → 逻辑像素纵坐标。 */
export function py(y: number): number {
  return OY + y * CELL
}

/** 一帧的全部绘制输入（由 index 持有并驱动）。 */
export interface BuilderView {
  /** 关卡定义。 */
  level: BridgeLevel
  /** 0 起关卡下标。 */
  levelIndex: number
  /** 建造蓝图杆件（build 与 test 模式都保留，供测试结束后回建）。 */
  beams: BridgeBeam[]
  /** 测试物理世界（仅 test 模式非空；杆件坐标取自节点实况）。 */
  world: RunWorld | null
  /** build = 建造期；test = 测试期。 */
  mode: 'build' | 'test'
  /** 测试结果（测试结束才有）。 */
  outcome: 'running' | 'won' | 'failed' | null
  /** 建造期已选第一格点。 */
  selected: BridgeNode | null
  /** 建造期悬停格点。 */
  hover: BridgeNode | null
  /** 暂停中。 */
  paused: boolean
  /** 过关得分（won 时显示）。 */
  score: number | null
  /** 车轮累计滚动里程（逻辑像素，驱动轮辐旋转）。 */
  travel: number
}

/**
 * 最近网格点（吸附半径内才算）。
 * @param x 逻辑像素横坐标。
 * @param y 逻辑像素纵坐标。
 * @param level 关卡（提供可建范围）。
 */
export function nearestNode(x: number, y: number, level: BridgeLevel): BridgeNode | null {
  const gx = Math.round((x - OX) / CELL)
  const gy = Math.round((y - OY) / CELL)
  const node: BridgeNode = { x: gx, y: gy }
  const inside = gx >= level.leftAnchor.x && gx <= level.rightAnchor.x && gy >= 0 && gy <= DECK_ROW
  if (!inside) return null
  const dist = Math.hypot(x - px(gx), y - py(gy))
  return dist <= 16 ? node : null
}

/**
 * 命中杆件（点到线段距离 < 拆除容差；build 模式按网格坐标）。
 * @param x 逻辑像素横坐标。
 * @param y 逻辑像素纵坐标。
 * @param beams 蓝图杆件。
 * @returns 命中杆件下标；落空返回 null。
 */
export function pickBeam(x: number, y: number, beams: readonly BridgeBeam[]): number | null {
  let best = -1
  let bestDist = 8
  for (let i = 0; i < beams.length; i += 1) {
    const beam = beams[i]!
    const ax = px(beam.a.x)
    const ay = py(beam.a.y)
    const bx = px(beam.b.x)
    const by = py(beam.b.y)
    const ex = bx - ax
    const ey = by - ay
    const lenSq = ex * ex + ey * ey
    let t = lenSq === 0 ? 0 : ((x - ax) * ex + (y - ay) * ey) / lenSq
    t = Math.min(1, Math.max(0, t))
    const dist = Math.hypot(x - (ax + ex * t), y - (ay + ey * t))
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best >= 0 ? best : null
}

/** 蓝图总造价（HUD 用）。 */
function beamTotalCost(beams: readonly BridgeBeam[]): number {
  let sum = 0
  for (const b of beams) sum += beamCost(b.a, b.b)
  return sum
}

/** 谷底水面波光（伪随机但由固定表驱动，确定性）。 */
const WATER_SPARKS: ReadonlyArray<{ x: number, y: number }> = Array.from({ length: 40 }, (_, i) => ({
  x: ((i * 97) % 800) / 800,
  y: ((i * 61) % 100) / 100,
}))

function drawCanyon(ctx: CanvasRenderingContext2D, view: BuilderView): void {
  const level = view.level
  const deckY = py(DECK_ROW)
  const floorY = py(FLOOR_ROW)
  const leftX = px(level.leftAnchor.x)
  const rightX = px(level.rightAnchor.x)
  // 峡谷水面。
  ctx.fillStyle = '#16324a'
  ctx.fillRect(OX, floorY, LOGICAL_W - OX * 2, LOGICAL_H - floorY - 6)
  ctx.fillStyle = 'rgba(122,162,247,0.25)'
  for (const s of WATER_SPARKS) {
    ctx.fillRect(OX + 8 + s.x * (LOGICAL_W - OX * 2 - 16), floorY + 6 + s.y * 18, 8, 2)
  }
  // 两岸崖壁。
  ctx.fillStyle = '#2b2440'
  ctx.fillRect(0, deckY, leftX, floorY - deckY)
  ctx.fillRect(rightX, deckY, LOGICAL_W - rightX, floorY - deckY)
  ctx.fillStyle = '#37304f'
  ctx.fillRect(0, deckY - 6, leftX, 6)
  ctx.fillRect(rightX, deckY - 6, LOGICAL_W - rightX, 6)
  // 崖壁岩理。
  ctx.strokeStyle = 'rgba(226,226,238,0.08)'
  ctx.lineWidth = 1
  for (let y = deckY + 22; y < floorY; y += 26) {
    ctx.beginPath()
    ctx.moveTo(8, y)
    ctx.lineTo(leftX - 10, y + 8)
    ctx.moveTo(rightX + 10, y + 8)
    ctx.lineTo(LOGICAL_W - 8, y)
    ctx.stroke()
  }
  // 中立柱：柱顶锚点 + 谷底升起的柱身。
  for (const p of level.pillars) {
    const cxp = px(p.x)
    ctx.fillStyle = '#37304f'
    ctx.fillRect(cxp - 7, py(p.y), 14, floorY - py(p.y))
    ctx.strokeStyle = THEME.panelEdge
    ctx.strokeRect(cxp - 7, py(p.y), 14, floorY - py(p.y))
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, view: BuilderView): void {
  const level = view.level
  const busy = view.mode === 'test'
  for (let gx = level.leftAnchor.x; gx <= level.rightAnchor.x; gx += 1) {
    for (let gy = 0; gy <= DECK_ROW; gy += 1) {
      const isAnchor = (gx === level.leftAnchor.x && gy === DECK_ROW)
        || (gx === level.rightAnchor.x && gy === DECK_ROW)
        || level.pillars.some(p => p.x === gx && p.y === gy)
      if (isAnchor) continue
      ctx.fillStyle = busy ? 'rgba(226,226,238,0.10)' : 'rgba(226,226,238,0.22)'
      ctx.fillRect(px(gx) - 1.5, py(gy) - 1.5, 3, 3)
    }
  }
  // 锚点：金色方块。
  ctx.fillStyle = THEME.gold
  for (const a of [level.leftAnchor, level.rightAnchor, ...level.pillars]) {
    glow(ctx, THEME.gold, 8)
    ctx.fillRect(px(a.x) - 5, py(a.y) - 5, 10, 10)
    noGlow(ctx)
  }
  // 悬停 / 已选格点。
  if (view.mode === 'build') {
    for (const [node, ring] of [[view.hover, false], [view.selected, true]] as const) {
      if (node === null) continue
      ctx.strokeStyle = ring ? THEME.text : THEME.textMuted
      ctx.lineWidth = ring ? 2 : 1
      ctx.beginPath()
      ctx.arc(px(node.x), py(node.y), 8, 0, Math.PI * 2)
      ctx.stroke()
      if (ring && view.hover !== null) {
        // 预览连线。
        ctx.strokeStyle = 'rgba(226,226,238,0.35)'
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(px(node.x), py(node.y))
        ctx.lineTo(px(view.hover.x), py(view.hover.y))
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }
}

/** 应力比 → 杆件颜色（绿 → 金 → 红）。 */
export function stressColor(ratio: number): string {
  if (ratio < 0.45) return THEME.good
  if (ratio < 0.75) return THEME.gold
  return THEME.bad
}

function drawBeams(ctx: CanvasRenderingContext2D, view: BuilderView): void {
  if (view.world !== null) {
    // 测试期：按物理节点实况绘制，颜色随应力比。物理世界存的是网格×CELL
    // 原始坐标——绘制时补 OX/OY 偏移，与建造期蓝图完全同一坐标系（否则
    // 空格开测后整座桥相对蓝图错位 40/30px）。
    for (let bi = 0; bi < view.world.beams.length; bi += 1) {
      const beam = view.world.beams[bi]!
      if (beam.broken) continue
      const a = view.world.nodes[beam.ai]!
      const b = view.world.nodes[beam.bi]!
      const ratio = stressRatio(view.world, bi)
      const color = stressColor(ratio)
      ctx.strokeStyle = color
      ctx.lineWidth = 5
      if (ratio >= 0.75) glow(ctx, color, 8)
      ctx.beginPath()
      ctx.moveTo(a.x + OX, a.y + OY)
      ctx.lineTo(b.x + OX, b.y + OY)
      ctx.stroke()
      noGlow(ctx)
    }
    return
  }
  // 建造期：按网格坐标绘制。
  ctx.strokeStyle = accent(2)
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  for (const beam of view.beams) {
    ctx.beginPath()
    ctx.moveTo(px(beam.a.x), py(beam.a.y))
    ctx.lineTo(px(beam.b.x), py(beam.b.y))
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
}

/** 小车：车身随两轮连线倾斜，轮辐随 travel 旋转。 */
function drawCar(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, travel: number): void {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  ctx.save()
  ctx.translate(x0, y0)
  ctx.rotate(ang)
  // 车身：两轮之间 + 前后各探出一截。
  ctx.fillStyle = accent(4)
  glow(ctx, accent(4), 8)
  roundRectPath(ctx, -16, -13, WHEEL_BASE + 32, 11, 4)
  ctx.fill()
  noGlow(ctx)
  // 驾驶室。
  ctx.fillStyle = accent(0)
  roundRectPath(ctx, 0, -22, 18, 10, 3)
  ctx.fill()
  ctx.restore()
  // 车轮（不随车身旋转，轮辐随里程转）。
  for (const [wx, wy] of [[x0, y0], [x1, y1]] as const) {
    ctx.fillStyle = '#1a1a24'
    ctx.beginPath()
    ctx.arc(wx, wy, WHEEL_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 1.5
    ctx.stroke()
    const spin = travel / WHEEL_R
    ctx.beginPath()
    for (let k = 0; k < 3; k += 1) {
      const t = spin + (k * Math.PI) / 3
      ctx.moveTo(wx, wy)
      ctx.lineTo(wx + Math.cos(t) * (WHEEL_R - 2), wy + Math.sin(t) * (WHEEL_R - 2))
    }
    ctx.stroke()
  }
}

function drawHud(ctx: CanvasRenderingContext2D, view: BuilderView): void {
  const cost = beamTotalCost(view.beams)
  const remain = view.level.budget - cost
  hudPair(ctx, 12, 20, '关卡 ', String(view.levelIndex + 1) + '/5 · ' + view.level.name)
  hudPair(ctx, LOGICAL_W / 2, 20, '预算 ', String(Math.max(0, remain)) + ' / ' + String(view.level.budget), 'left', remain <= 0 ? THEME.bad : THEME.gold)
  if (view.world !== null) {
    const ratio = view.world.maxStress
    hudPair(ctx, LOGICAL_W - 12, 20, '应力 ', String(Math.min(999, Math.round(ratio * 100))) + '%', 'right', stressColor(ratio))
  } else {
    hudPair(ctx, LOGICAL_W - 12, 20, '杆件 ', String(view.beams.length), 'right')
  }
  // 底部提示。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  const hint = view.mode === 'build'
    ? '点两个格点放梁 · 点杆件拆除 · 空格开始测试'
    : '空格返回建造 · R 重开'
  ctx.fillText(hint, LOGICAL_W / 2, LOGICAL_H - 10)
}

/**
 * 绘制一整帧：背景 → 峡谷 → 网格 → 杆件 → 小车 → HUD → 结算 overlay。
 * @param view 见 {@link BuilderView}。
 */
export function renderBuilderScene(ctx: CanvasRenderingContext2D, view: BuilderView): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawCanyon(ctx, view)
  drawGrid(ctx, view)
  drawBeams(ctx, view)
  if (view.world !== null) {
    const w0 = view.world.wheels[0]!
    const w1 = view.world.wheels[1]!
    // 车轮同为网格原始坐标——补 OX/OY 与蓝图对齐。
    drawCar(ctx, w0.x + OX, w0.y + OY, w1.x + OX, w1.y + OY, view.travel)
  } else {
    // 建造期：左岸待发的预告车。
    const y = py(DECK_ROW) - WHEEL_R - 4
    drawCar(ctx, px(view.level.leftAnchor.x) - WHEEL_BASE - 10, y, px(view.level.leftAnchor.x) - 10, y, 0)
  }
  drawHud(ctx, view)
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  } else if (view.outcome === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关', '得分 ' + String(view.score ?? 0) + ' · N 下一关 · 空格改建', THEME.good)
  } else if (view.outcome === 'failed') {
    const broken = view.world !== null && view.world.brokenCount > 0
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, broken ? '坍塌' : '失败', '按 R 重开 · 空格返回建造改进设计', THEME.bad)
  }
}
