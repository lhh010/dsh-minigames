/**
 * 真珠回路渲染器：细网格 + 格点、圆角连续描边的回路、白珠白圈 /
 * 黑珠黑圈、违规红标（分叉/交叉点、已证伪珠格）、提示边闪烁、完成
 * 回路发光动画与过关/暂停 overlay。使用共享视觉套件（../theme.ts）。
 */
import { branchDots, edgeCount, pearlViolations, type EdgeState, type Pearl } from './logic.ts'
import { THEME, drawBackground, glow, noGlow, hudPair, drawOverlay } from '../theme.ts'

const HUD_H = 40
const CELL = 44
const MARGIN = 22
/** 命中容差（格单位）。 */
const HIT_CELLS = 0.30

/** 渲染视图状态（由 index.ts 组装）。 */
export interface MasyuView {
  w: number
  h: number
  pearls: Pearl[]
  edges: EdgeState[]
  /** 悬停边索引，-1 无。 */
  hover: number
  /** 提示边索引，-1 无。 */
  hintEdge: number
  /** 提示闪烁强度 0..1（0 不画）。 */
  hintAlpha: number
  levelLabel: string
  unique: boolean
  elapsed: string
  solved: boolean
  /** 完成发光脉冲 0..1（呼吸相位）。 */
  solvedPulse: number
  paused: boolean
}

/** 逻辑画布宽。 */
export function logicalW(w: number): number {
  return MARGIN * 2 + CELL * w
}

/** 逻辑画布高。 */
export function logicalH(h: number): number {
  return HUD_H + MARGIN * 2 + CELL * h
}

/** 格点 (col,row) 的像素坐标。 */
export function dotX(col: number): number {
  return MARGIN + col * CELL
}

/** 格点 (col,row) 的像素坐标。 */
export function dotY(row: number): number {
  return HUD_H + MARGIN + row * CELL
}

/**
 * 指针位置对应的边索引（-1 无）：最近边匹配，把指针换算成格点浮点
 * 坐标后在水平/垂直候选里取更近者，容差 HIT_CELLS。
 */
export function edgeAt(w: number, h: number, x: number, y: number): number {
  if (y < HUD_H) return -1
  const fx = (x - MARGIN) / CELL
  const fy = (y - HUD_H - MARGIN) / CELL
  if (fx < -HIT_CELLS || fx > w + HIT_CELLS || fy < -HIT_CELLS || fy > h + HIT_CELLS) return -1
  const hRow = Math.round(fy)
  const hCol = Math.floor(fx)
  const vCol = Math.round(fx)
  const vRow = Math.floor(fy)
  const distH = hRow >= 0 && hRow <= h && hCol >= 0 && hCol < w ? Math.abs(fy - hRow) : Infinity
  const distV = vCol >= 0 && vCol <= w && vRow >= 0 && vRow < h ? Math.abs(fx - vCol) : Infinity
  if (distH <= distV) {
    if (distH <= HIT_CELLS) return hRow * w + hCol
  } else if (distV <= HIT_CELLS) {
    return w * (h + 1) + vRow * (w + 1) + vCol
  }
  return -1
}

/** 边 i 两端格点索引（渲染侧）。 */
function edgeDotsOf(w: number, h: number, i: number): [number, number] {
  const hc = w * (h + 1)
  if (i < hc) {
    const row = Math.floor(i / w)
    const col = i % w
    const a = row * (w + 1) + col
    return [a, a + 1]
  }
  const j = i - hc
  const row = Math.floor(j / (w + 1))
  const col = j % (w + 1)
  const a = row * (w + 1) + col
  return [a, a + (w + 1)]
}

/** 主渲染入口。 */
export function renderMasyu(ctx: CanvasRenderingContext2D, view: MasyuView): void {
  const { w, h, pearls, edges } = view
  const W = logicalW(w)
  const H = logicalH(h)
  drawBackground(ctx, W, H)

  // 细网格 + 格点。
  ctx.strokeStyle = 'rgba(226,226,238,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let r = 0; r <= h; r += 1) {
    ctx.moveTo(dotX(0), dotY(r))
    ctx.lineTo(dotX(w), dotY(r))
  }
  for (let c = 0; c <= w; c += 1) {
    ctx.moveTo(dotX(c), dotY(0))
    ctx.lineTo(dotX(c), dotY(h))
  }
  ctx.stroke()
  ctx.fillStyle = 'rgba(226,226,238,0.35)'
  for (let r = 0; r <= h; r += 1) {
    for (let c = 0; c <= w; c += 1) {
      ctx.beginPath()
      ctx.arc(dotX(c), dotY(r), 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 悬停边高亮。
  if (view.hover >= 0 && edges[view.hover] !== 1) {
    const [a, b] = edgeDotsOf(w, h, view.hover)
    strokeSegment(ctx, w, h, a, b, 'rgba(255,255,255,0.25)', 3, 0)
  }

  // 画线：按连通分量连成折线后圆角描边。
  const used = new Uint8Array(edges.length)
  const lineColor = view.solved ? THEME.gold : THEME.good
  if (view.solved) glow(ctx, THEME.gold, 10 + 14 * view.solvedPulse)
  for (let i = 0; i < edgeCount(w, h); i += 1) {
    if (edges[i] !== 1 || used[i] === 1) continue
    // 收集该分量全部边。
    const comp: number[] = [i]
    used[i] = 1
    for (let qi = 0; qi < comp.length; qi += 1) {
      const [a, b] = edgeDotsOf(w, h, comp[qi]!)
      for (let j = 0; j < edgeCount(w, h); j += 1) {
        if (edges[j] !== 1 || used[j] === 1) continue
        const [x, y] = edgeDotsOf(w, h, j)
        if (x === a || y === a || x === b || y === b) { used[j] = 1; comp.push(j) }
      }
    }
    // 把分量排成行走序折线后描边（圆角拐弯）。
    const ordered = orderComponent(comp, w, h)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 3.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ordered.forEach((d, k) => {
      const col = d % (w + 1)
      const row = Math.floor(d / (w + 1))
      if (k === 0) ctx.moveTo(dotX(col), dotY(row))
      else ctx.lineTo(dotX(col), dotY(row))
    })
    ctx.stroke()
  }
  noGlow(ctx)

  // 违规：分叉/交叉点红标。
  for (const d of branchDots(edges, w, h)) {
    const col = d % (w + 1)
    const row = Math.floor(d / (w + 1))
    ctx.beginPath()
    ctx.arc(dotX(col), dotY(row), 5, 0, Math.PI * 2)
    ctx.fillStyle = THEME.bad
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // 违规珠格红标 + 珠绘制。
  const violated = new Set(pearlViolations(edges, pearls, w, h))
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      const p = pearls[r * w + c]!
      if (p === 0) continue
      const cx = dotX(c) + CELL / 2
      const cy = dotY(r) + CELL / 2
      const bad = violated.has(r * w + c)
      if (p === 1) {
        // 白珠：白圈。
        ctx.beginPath()
        ctx.arc(cx, cy, 8.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(16,16,26,0.9)'
        ctx.fill()
        ctx.lineWidth = 3
        ctx.strokeStyle = bad ? THEME.bad : '#e2e2ee'
        ctx.stroke()
      } else {
        // 黑珠：黑圈（亮描边保证深底可见）。
        ctx.beginPath()
        ctx.arc(cx, cy, 8.5, 0, Math.PI * 2)
        ctx.fillStyle = bad ? THEME.bad : '#0c0c12'
        ctx.fill()
        ctx.lineWidth = 1.6
        ctx.strokeStyle = bad ? THEME.bad : '#e2e2ee'
        ctx.stroke()
      }
    }
  }

  // 提示边闪烁。
  if (view.hintEdge >= 0 && view.hintAlpha > 0) {
    const [a, b] = edgeDotsOf(w, h, view.hintEdge)
    ctx.globalAlpha = view.hintAlpha
    strokeSegment(ctx, w, h, a, b, THEME.gold, 5, 10)
    ctx.globalAlpha = 1
  }

  hudPair(ctx, W - MARGIN, 22, view.levelLabel + ' ', (view.unique ? '唯一解' : '多解') + ' · ' + view.elapsed, 'right', THEME.gold)

  if (view.solved) {
    drawOverlay(ctx, W, H, '过关！', '即将进入下一关 · R 重开本关', THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续', THEME.text)
  }
}

/** 两格点间线段描边（含可选辉光）。 */
function strokeSegment(ctx: CanvasRenderingContext2D, w: number, h: number, a: number, b: number, color: string, width: number, blur: number): void {
  const ac = a % (w + 1)
  const ar = Math.floor(a / (w + 1))
  const bc = b % (w + 1)
  const br = Math.floor(b / (w + 1))
  if (blur > 0) glow(ctx, color, blur)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(dotX(ac), dotY(ar))
  ctx.lineTo(dotX(bc), dotY(br))
  ctx.stroke()
  if (blur > 0) noGlow(ctx)
}

/** 把一个画线分量的格点排成行走序（环或开放路径）。 */
function orderComponent(comp: readonly number[], w: number, h: number): number[] {
  const dotsOf = (e: number): [number, number] => edgeDotsOf(w, h, e)
  const taken = new Set<number>()
  const first = comp[0]!
  taken.add(first)
  const [a0, b0] = dotsOf(first)
  const pts: number[] = [a0, b0]
  // 从 b0 前向延伸。
  let grew = true
  while (grew) {
    grew = false
    const cur = pts[pts.length - 1]!
    for (const e of comp) {
      if (taken.has(e)) continue
      const [x, y] = dotsOf(e)
      if (x !== cur && y !== cur) continue
      taken.add(e)
      pts.push(x === cur ? y : x)
      grew = true
      break
    }
  }
  // 从 a0 反向延伸（开放路径时）。
  grew = true
  while (grew) {
    grew = false
    const cur = pts[0]!
    for (const e of comp) {
      if (taken.has(e)) continue
      const [x, y] = dotsOf(e)
      if (x !== cur && y !== cur) continue
      taken.add(e)
      pts.unshift(x === cur ? y : x)
      grew = true
      break
    }
  }
  return pts
}
