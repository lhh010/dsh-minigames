/**
 * 麻将连连看渲染层：竹骨质感牌面（象牙底、侧面厚度带）、几何绘制的筒/条/万
 * 符号、选中高亮与提示对闪烁、消除路径折线动画（含场外虚拟圈坐标）、死局
 * 自动洗牌的抖动动画，以及 HUD（关 / 剩余对 / 时间）。动画状态集中在
 * {@link MahjongView}，逻辑层保持纯函数。
 */
import type { MahjongState, Pos } from './logic.ts'
import { GRID_ROWS, GRID_COLS, suitOf, rankOf, pairsRemaining } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

/** 逻辑像素常量：牌格边长、HUD 高、四周留给场外折线的边距。 */
export const CELL = 44
export const HUD_H = 34
export const PAD = 26
export const BOARD_W = GRID_COLS * CELL
export const BOARD_H = GRID_ROWS * CELL
export const LOGICAL_W = BOARD_W + PAD * 2
export const LOGICAL_H = HUD_H + BOARD_H + PAD * 2

/** 路径折线动画时长（毫秒）与尾部淡出时长。 */
const CLEAR_MS = 340
const CLEAR_FADE_MS = 200
/** 洗牌抖动动画时长。 */
const SHUFFLE_MS = 420
/** 提示对高亮保留时长。 */
const HINT_MS = 2500

/** 网格坐标（允许 -1 / rows / cols 场外虚拟圈）转画布中心点。 */
export function cellCenter(p: Pos): { x: number; y: number } {
  return { x: PAD + p.c * CELL + CELL / 2, y: HUD_H + PAD + p.r * CELL + CELL / 2 }
}

/** 一次消除的折线动画（path 为逻辑层返回的拐点序列，含两端点）。 */
export interface ClearFx {
  path: Pos[]
  startMs: number
}

/**
 * 渲染侧动画状态：选中格、提示对、进行中的消除折线与洗牌动画。
 * 由 index.ts 持有并驱动，逻辑层不感知；renderMahjong 读取公开字段绘制。
 */
export interface MahjongView {
  /** 当前选中的牌格（null 未选）。 */
  selected: Pos | null
  /** 展示中的提示对（超时后渲染层自动不再绘制）。 */
  hint: [Pos, Pos] | null
  hintStartMs: number
  /** 洗牌动画开始时刻（越界值表示不在动画中）。 */
  shuffleStartMs: number
  /** 进行中的消除折线。 */
  clears: ClearFx[]
  /** 粒子系统（消除爆点）。 */
  particles: { burst(x: number, y: number, color: string, count?: number, speed?: number): void; tick(ctx: CanvasRenderingContext2D, dtMs: number): void; size(): number }
  /** 选中 / 取消选中一张牌。 */
  select(p: Pos | null): void
  /** 展示一对提示。 */
  showHint(pair: [Pos, Pos]): void
  /** 播放一条消除折线动画。 */
  playClear(path: Pos[]): void
  /** 播放洗牌抖动动画。 */
  playShuffle(): void
  /** 是否仍有进行中的动画（决定是否需要重绘）。 */
  active(nowMs: number): boolean
  /** 清空全部动画状态（重开 / 换关时调用）。 */
  reset(): void
}

/** 建立一个空的渲染视图状态。 */
export function createMahjongView(): MahjongView {
  const view: MahjongView = {
    selected: null,
    hint: null,
    hintStartMs: 0,
    shuffleStartMs: -SHUFFLE_MS,
    clears: [],
    particles: createParticles(),
    select(p): void {
      view.selected = p
    },
    showHint(pair): void {
      view.hint = pair
      view.hintStartMs = performance.now()
    },
    playClear(path): void {
      view.clears.push({ path, startMs: performance.now() })
      const a = cellCenter(path[0]!)
      const b = cellCenter(path[path.length - 1]!)
      view.particles.burst(a.x, a.y, THEME.good, 10, 120)
      view.particles.burst(b.x, b.y, THEME.good, 10, 120)
    },
    playShuffle(): void {
      view.shuffleStartMs = performance.now()
    },
    active(nowMs: number): boolean {
      if (view.selected !== null) return true
      if (view.hint !== null && nowMs - view.hintStartMs < HINT_MS) return true
      if (nowMs - view.shuffleStartMs < SHUFFLE_MS) return true
      if (view.particles.size() > 0) return true
      for (const fx of view.clears) {
        if (nowMs - fx.startMs < CLEAR_MS + CLEAR_FADE_MS) return true
      }
      return false
    },
    reset(): void {
      view.selected = null
      view.hint = null
      view.hintStartMs = 0
      view.shuffleStartMs = -SHUFFLE_MS
      view.clears.length = 0
    },
  }
  return view
}

/** 筒（圆点）在牌面内的单位坐标布局，下标 = 点数 - 1。 */
const DOT_LAYOUT: (readonly (readonly [number, number])[])[] = [
  [[0.5, 0.5]],
  [[0.34, 0.34], [0.66, 0.66]],
  [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
  [[0.34, 0.28], [0.66, 0.28], [0.34, 0.5], [0.66, 0.5], [0.34, 0.72], [0.66, 0.72]],
  [[0.3, 0.24], [0.5, 0.24], [0.7, 0.24], [0.3, 0.56], [0.5, 0.56], [0.7, 0.56], [0.5, 0.84]],
  [[0.28, 0.28], [0.5, 0.28], [0.72, 0.28], [0.28, 0.56], [0.5, 0.56], [0.72, 0.56], [0.28, 0.84], [0.72, 0.84]],
  [[0.28, 0.24], [0.5, 0.24], [0.72, 0.24], [0.28, 0.5], [0.5, 0.5], [0.72, 0.5], [0.28, 0.76], [0.5, 0.76], [0.72, 0.76]],
]

/** 万字牌用中文数字。 */
const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 花色主色：筒蓝、条绿、万红。 */
const SUIT_COLORS = ['#5a7bd6', '#4d9e5f', '#c94f4f']

/** 竹骨牌底色系。 */
const TILE_FACE = '#eae3cf'
const TILE_EDGE = '#b7ab8b'
const TILE_SIDE = '#cfc3a0'

/**
 * 画一张竹骨麻将牌（含几何筒/条/万符号）。
 * @param ctx - 画布上下文。
 * @param x - 牌格左上角 x。
 * @param y - 牌格左上角 y。
 * @param size - 牌格边长。
 * @param kind - 牌面编号 1..27。
 */
function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, kind: number): void {
  const inset = 2
  const w = size - inset * 2
  // 侧面厚度：底部一条深色带模拟骨牌立体感。
  ctx.fillStyle = TILE_SIDE
  roundRectPath(ctx, x + inset, y + inset + 2.5, w, w, 6)
  ctx.fill()
  ctx.fillStyle = TILE_FACE
  roundRectPath(ctx, x + inset, y + inset, w, w, 6)
  ctx.fill()
  ctx.strokeStyle = TILE_EDGE
  ctx.lineWidth = 1
  ctx.stroke()

  const suit = suitOf(kind)
  const rank = rankOf(kind)
  const color = SUIT_COLORS[suit] ?? THEME.text
  const fx = x + inset + 4
  const fy = y + inset + 4
  const fw = w - 8
  const layout: readonly (readonly [number, number])[] = DOT_LAYOUT[rank - 1] ?? [[0.5, 0.5]]
  if (suit === 0) {
    // 筒：实心圆点 + 中心小圆孔。
    const r = layout.length <= 2 ? fw * 0.14 : layout.length <= 5 ? fw * 0.11 : fw * 0.09
    for (const [ux, uy] of layout) {
      const cx = fx + ux * fw
      const cy = fy + uy * fw
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = TILE_FACE
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (suit === 1) {
    // 条：竖直竹节棒 + 两条浅色竹节线。
    const stickH = layout.length <= 2 ? fw * 0.72 : layout.length <= 5 ? fw * 0.5 : fw * 0.34
    const stickW = Math.max(3.5, stickH * 0.26)
    for (const [ux, uy] of layout) {
      const cx = fx + ux * fw
      const cy = fy + uy * fw
      ctx.fillStyle = color
      roundRectPath(ctx, cx - stickW / 2, cy - stickH / 2, stickW, stickH, stickW / 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(234,227,207,0.75)'
      ctx.fillRect(cx - stickW / 2, cy - stickH * 0.18, stickW, 1.2)
      ctx.fillRect(cx - stickW / 2, cy + stickH * 0.14, stickW, 1.2)
    }
  } else {
    // 万：红色中文数字 + 小「万」字。
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold ' + Math.round(fw * 0.52) + 'px system-ui, sans-serif'
    ctx.fillText(NUMERALS[rank - 1] ?? '?', fx + fw / 2, fy + fw * 0.4)
    ctx.font = 'bold ' + Math.round(fw * 0.3) + 'px system-ui, sans-serif'
    ctx.fillText('万', fx + fw / 2, fy + fw * 0.76)
    ctx.textBaseline = 'alphabetic'
  }
}

/**
 * 画选中 / 提示高亮框。
 * @param pulse - 提示对使用呼吸闪烁；选中框常亮。
 */
function highlight(ctx: CanvasRenderingContext2D, p: Pos, color: string, nowMs: number, pulse: boolean): void {
  const { x, y } = cellCenter(p)
  const alpha = pulse ? 0.55 + 0.45 * Math.abs(Math.sin(nowMs / 180)) : 1
  ctx.save()
  ctx.globalAlpha = alpha
  glow(ctx, color, 12)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  roundRectPath(ctx, x - CELL / 2 + 2, y - CELL / 2 + 2, CELL - 4, CELL - 4, 7)
  ctx.stroke()
  noGlow(ctx)
  ctx.restore()
}

/**
 * 画一帧完整场景。
 * @param ctx - 画布上下文。
 * @param state - 逻辑状态。
 * @param view - 渲染动画状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderMahjong(
  ctx: CanvasRenderingContext2D, state: MahjongState, view: MahjongView, paused: boolean, dtMs: number,
): void {
  const nowMs = performance.now()
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：关 / 剩余对 / 时间。
  const pairs = pairsRemaining(state.grid)
  const sec = Math.ceil(state.timeLeft)
  const timeColor = sec <= 15 ? THEME.bad : THEME.gold
  hudPair(ctx, PAD, 21, '关 ', String(state.level))
  hudPair(ctx, LOGICAL_W / 2, 21, '剩余对 ', String(pairs), 'center', pairs === 0 ? THEME.good : THEME.text)
  hudPair(ctx, LOGICAL_W - PAD, 21, '时间 ', String(sec) + 's', 'right', timeColor)

  // 洗牌抖动：窗口期内每格按确定性相位小幅漂移并整体透明度波动。
  const shuffleAge = nowMs - view.shuffleStartMs
  const shuffling = shuffleAge >= 0 && shuffleAge < SHUFFLE_MS
  const shuffleFade = shuffling ? Math.sin((shuffleAge / SHUFFLE_MS) * Math.PI) : 0

  // 牌面槽位与牌。
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < GRID_COLS; c += 1) {
      const x = PAD + c * CELL
      const y = HUD_H + PAD + r * CELL
      if (state.layout[r]![c] === true && state.grid[r]![c] === 0) {
        // 已消除的槽位：极淡底座，暗示这里曾放牌。
        ctx.fillStyle = 'rgba(255,255,255,0.045)'
        roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 6)
        ctx.fill()
      }
      const kind = state.grid[r]![c]!
      if (kind === 0) continue
      if (shuffling) {
        ctx.save()
        ctx.globalAlpha = 1 - shuffleFade * 0.55
        const jx = Math.sin(nowMs / 70 + r * 3.1 + c * 1.7) * 4 * shuffleFade
        const jy = Math.cos(nowMs / 62 + r * 2.3 + c * 4.1) * 3 * shuffleFade
        drawTile(ctx, x + jx, y + jy, CELL, kind)
        ctx.restore()
      } else {
        drawTile(ctx, x, y, CELL, kind)
      }
    }
  }

  // 高亮：选中 + 提示对（提示超时自动失效）。
  if (view.selected !== null) highlight(ctx, view.selected, accent(0), nowMs, false)
  if (view.hint !== null && nowMs - view.hintStartMs < HINT_MS) {
    highlight(ctx, view.hint[0], THEME.gold, nowMs, true)
    highlight(ctx, view.hint[1], THEME.gold, nowMs, true)
  }

  // 消除折线动画：折线推进 + 尾部淡出。
  drawClears(ctx, view, nowMs)
  view.particles.tick(ctx, dtMs)

  if (state.result === 'win') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', '按 空格 进入下一关 · R 重开', THEME.good)
  } else if (state.result === 'lose') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '时间到', '按 R 重开本关', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}

/** 画所有进行中的消除折线（坐标允许落在场外虚拟圈上）。 */
function drawClears(ctx: CanvasRenderingContext2D, view: MahjongView, nowMs: number): void {
  for (let i = view.clears.length - 1; i >= 0; i -= 1) {
    const fx = view.clears[i]!
    const age = nowMs - fx.startMs
    if (age >= CLEAR_MS + CLEAR_FADE_MS) {
      view.clears.splice(i, 1)
      continue
    }
    const points = fx.path.map(cellCenter)
    const total = polylineLength(points)
    const progress = Math.min(1, age / CLEAR_MS)
    const alpha = age <= CLEAR_MS ? 1 : 1 - (age - CLEAR_MS) / CLEAR_FADE_MS
    ctx.save()
    ctx.globalAlpha = alpha
    glow(ctx, THEME.gold, 10)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(points[0]!.x, points[0]!.y)
    let drawn = 0
    const budget = total * progress
    for (let k = 1; k < points.length; k += 1) {
      const p = points[k - 1]!
      const q = points[k]!
      const seg = Math.hypot(q.x - p.x, q.y - p.y)
      if (drawn + seg <= budget) {
        ctx.lineTo(q.x, q.y)
        drawn += seg
      } else {
        const t = (budget - drawn) / seg
        ctx.lineTo(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)
        break
      }
    }
    ctx.stroke()
    noGlow(ctx)
    // 折线拐点小圆珠。
    ctx.fillStyle = THEME.gold
    for (const pt of points) {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** 折线总长度。 */
function polylineLength(points: { x: number; y: number }[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i - 1]!
    const q = points[i]!
    total += Math.hypot(q.x - p.x, q.y - p.y)
  }
  return total
}
