/**
 * 魔方 canvas 渲染：十字展开图（L F R B 一排，U 在 F 上、D 在 F 下），
 * 每面 3×3 贴纸格网 + 行/列旋转箭头（箭头命中检测见 {@link arrowAt}），
 * HUD 显示 关卡/打乱参考/提示余量/步数/计时，拧动时受影响贴纸沿箭头
 * 方向滚动高亮，过关显示庆祝 overlay。渲染器无状态：全部状态由调用方
 * 传入；视觉件来自共享 ../theme.ts。
 */
import { FACES, arrowMove, layerIndices, type Cube, type FaceName, type Move } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 面板顶 HUD 高度。 */
export const HUD_H = 34
/** 展开图与画布边缘留白（含外层箭头空间）。 */
export const EDGE = 30
/** 面与面之间的箭头槽宽。 */
export const GUTTER = 18
/** 一个 3×3 面的边长。 */
export const FACE = 120
/** 相邻面的中心距。 */
export const PITCH = FACE + GUTTER
/** 贴纸内边距与格间距。 */
const PAD = 4
const SGAP = 3
const CELL = (FACE - PAD * 2 - SGAP * 2) / 3

export const LOGICAL_W = EDGE * 2 + PITCH * 3 + FACE
export const LOGICAL_H = HUD_H + GUTTER + PITCH * 2 + FACE + EDGE

/** 展开图里 F 处于第 1 列、第 1 行；U/D 与 F 同列。 */
const FACE_POS: Record<FaceName, { x: number; y: number }> = {
  L: { x: EDGE, y: HUD_H + GUTTER + PITCH },
  F: { x: EDGE + PITCH, y: HUD_H + GUTTER + PITCH },
  R: { x: EDGE + PITCH * 2, y: HUD_H + GUTTER + PITCH },
  B: { x: EDGE + PITCH * 3, y: HUD_H + GUTTER + PITCH },
  U: { x: EDGE + PITCH, y: HUD_H + GUTTER },
  D: { x: EDGE + PITCH, y: HUD_H + GUTTER + PITCH * 2 },
}

const FACE_INDEX: Record<FaceName, number> = { U: 0, D: 1, L: 2, R: 3, F: 4, B: 5 }

/** 六面贴纸配色（下标 = 颜色号 = 面号）：白黄橙红绿蓝。 */
export const FACE_COLORS: readonly string[] = [
  '#e8e8f0', // U 白
  '#e0af68', // D 黄
  '#ff9e64', // L 橙
  '#f7768e', // R 红
  '#9ece6a', // F 绿
  '#7aa2f7', // B 蓝
]

/** 一个可点击的旋转箭头（含命中矩形与等价走法）。 */
export interface Arrow {
  face: FaceName
  axis: 'row' | 'col'
  index: number
  dir: number
  /** 逻辑坐标命中矩形。 */
  x: number
  y: number
  w: number
  h: number
  /** 等价层旋转。 */
  move: Move
  /** 受影响贴纸下标集合（拧动高亮）。 */
  indices: readonly number[]
}

const ARROWS: Arrow[] = []
for (const face of FACES) {
  const { x: fx, y: fy } = FACE_POS[face]
  for (let i = 0; i < 3; i += 1) {
    const midY = fy + PAD + i * (CELL + SGAP) + CELL / 2
    const midX = fx + PAD + i * (CELL + SGAP) + CELL / 2
    for (const dir of [-1, 1]) {
      const rx = dir > 0 ? fx + FACE + 1 : fx - GUTTER + 1
      ARROWS.push({
        face, axis: 'row', index: i, dir,
        x: rx, y: midY - 8, w: GUTTER - 2, h: 16,
        move: arrowMove(face, 'row', i, dir),
        indices: [],
      })
      const ry = dir > 0 ? fy + FACE + 1 : fy - GUTTER + 1
      ARROWS.push({
        face, axis: 'col', index: i, dir,
        x: midX - 8, y: ry, w: 16, h: GUTTER - 2,
        move: arrowMove(face, 'col', i, dir),
        indices: [],
      })
    }
  }
}
for (const a of ARROWS) a.indices = layerIndices(a.move.id)

/** 命中某个箭头（逻辑坐标），未命中返回 null。 */
export function arrowAt(x: number, y: number): Arrow | null {
  for (const a of ARROWS) {
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a
  }
  return null
}

/** 全部箭头（index.ts 派发点击用；主要走 {@link arrowAt}）。 */
export function allArrows(): readonly Arrow[] {
  return ARROWS
}

/** 拧动动画描述：受影响贴纸 + 进度 0..1 + 滚动方向 + 对应走法 id（箭头高亮匹配）。 */
export interface AnimInfo {
  indices: ReadonlySet<number>
  /** 0（开始）→ 1（结束）。 */
  phase: number
  dx: number
  dy: number
  /** 正在执行的走法 id。 */
  moveId: string
}

/** 渲染所需的一帧状态快照。 */
export interface RenderState {
  cube: Cube
  level: number
  scrambleLen: number
  moves: number
  hintsLeft: number
  elapsedMs: number
  paused: boolean
  /** 过关副标题；null 表示进行中。 */
  winText: string | null
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return mm + ':' + ss
}

function drawArrow(ctx: CanvasRenderingContext2D, a: Arrow, hot: boolean): void {
  const cx = a.x + a.w / 2
  const cy = a.y + a.h / 2
  const size = 5
  ctx.fillStyle = hot ? THEME.text : THEME.textMuted
  ctx.beginPath()
  if (a.axis === 'row') {
    const s = a.dir > 0 ? size : -size
    ctx.moveTo(cx - s * 0.6, cy - size)
    ctx.lineTo(cx + s * 0.6, cy)
    ctx.lineTo(cx - s * 0.6, cy + size)
  } else {
    const s = a.dir > 0 ? size : -size
    ctx.moveTo(cx - size, cy - s * 0.6)
    ctx.lineTo(cx + size, cy - s * 0.6)
    ctx.lineTo(cx, cy + s * 0.6)
  }
  ctx.closePath()
  ctx.fill()
}

/**
 * 绘制一帧。
 * @param anim - 当前拧动动画（贴纸滚动高亮），无动画传 null。
 */
export function renderRubik(
  ctx: CanvasRenderingContext2D, w: number, h: number, st: RenderState, anim: AnimInfo | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  // HUD：左起 关卡/打乱参考/提示余量；右起 时间/步数。
  const hudY = 22
  hudPair(ctx, EDGE - 12, hudY, '关卡 ', String(st.level))
  hudPair(ctx, EDGE + 70, hudY, '打乱参考 ', String(st.scrambleLen))
  hudPair(ctx, EDGE + 160, hudY, '提示余 ', String(st.hintsLeft), 'left', st.hintsLeft > 0 ? THEME.text : THEME.bad)
  hudPair(ctx, w - EDGE + 12, hudY, '时间 ', fmtTime(st.elapsedMs), 'right')
  hudPair(ctx, w - EDGE - 78, hudY, '步数 ', String(st.moves), 'right', THEME.gold)

  const hotIds = anim === null ? null : anim.indices

  for (const face of FACES) {
    const { x: fx, y: fy } = FACE_POS[face]
    // 面板底色。
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, fx, fy, FACE, FACE, 8)
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    // 角落面标（方位提示）。
    ctx.font = '600 9px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(face, fx + 4, fy + 11)

    const fi = FACE_INDEX[face]
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const idx = fi * 9 + r * 3 + c
        const color = FACE_COLORS[st.cube[idx]!]!
        const sx = fx + PAD + c * (CELL + SGAP)
        const sy = fy + PAD + r * (CELL + SGAP)
        const hot = hotIds !== null && hotIds.has(idx)
        const ox = hot && anim !== null ? anim.dx * Math.sin(Math.PI * Math.min(1, anim.phase)) : 0
        const oy = hot && anim !== null ? anim.dy * Math.sin(Math.PI * Math.min(1, anim.phase)) : 0
        if (hot) glow(ctx, color, 14)
        ctx.fillStyle = color
        roundRectPath(ctx, sx + ox, sy + oy, CELL, CELL, 5)
        ctx.fill()
        noGlow(ctx)
        if (hot && anim !== null) {
          // 滚动高亮：白色扫过，随进度淡出。
          ctx.globalAlpha = 0.5 * (1 - anim.phase)
          ctx.fillStyle = '#ffffff'
          roundRectPath(ctx, sx + ox, sy + oy, CELL, CELL, 5)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
    }
  }

  for (const a of ARROWS) {
    drawArrow(ctx, a, anim !== null && a.move.id === anim.moveId)
  }

  if (st.winText !== null) {
    drawOverlay(ctx, w, h, '过关', st.winText, THEME.good)
  } else if (st.paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
