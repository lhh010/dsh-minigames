/**
 * 噗呦噗呦渲染层：井、圆滚滚双色带眼睛的噗呦、落点虚影、消除爆裂粒子、
 * 连锁浮字、NEXT 预览与 HUD。所有绘制都在固定逻辑坐标系内进行。
 */
import { THEME, drawBackground, drawOverlay, glow, noGlow, hudPair, roundRectPath, type ParticleSystem } from '../theme.ts'
import { COLS, ROWS, FX_MS, childOffset, dropDistance, pieceCells, type PuyoState } from './logic.ts'

/** 逻辑画布尺寸。 */
export const W = 372
export const H = 468
/** 单格边长。 */
export const CELL = 30
/** 井左上角。 */
export const BOARD_X = (W - COLS * CELL) / 2
export const BOARD_Y = 66

/** 四色噗呦主体色（与逻辑层 1..4 对应）。 */
const PUYO_COLORS = ['#f7768e', '#9ece6a', '#7aa2f7', '#e0af68'] as const

/** 噗呦颜色索引转主色。 */
export function puyoColor(idx: number): string {
  return PUYO_COLORS[(idx - 1 + PUYO_COLORS.length) % PUYO_COLORS.length]!
}

/** 格心像素坐标。 */
function cellCenter(x: number, y: number): [number, number] {
  return [BOARD_X + x * CELL + CELL / 2, BOARD_Y + y * CELL + CELL / 2]
}

/**
 * 画一只圆滚滚噗呦：主体色 + 上半高光（双色）+ 一对眼睛。
 * @param ctx - 画布上下文。
 * @param cx - 圆心 x。
 * @param cy - 圆心 y。
 * @param r - 半径。
 * @param colorIdx - 颜色索引（1..4）。
 */
export function drawPuyo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, colorIdx: number): void {
  const main = puyoColor(colorIdx)
  glow(ctx, main, 7)
  ctx.fillStyle = main
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 上半高光 → 双色观感。
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r - 0.5, Math.PI, 0)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.fillRect(cx - r, cy - r, r * 2, r)
  ctx.restore()
  // 眼睛：两个白眼球 + 深色瞳孔。
  const ex = r * 0.36
  const ey = cy - r * 0.1
  const er = r * 0.26
  ctx.fillStyle = '#f4f4fa'
  for (const dx of [-ex, ex]) {
    ctx.beginPath()
    ctx.arc(cx + dx, ey, er, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#181822'
  for (const dx of [-ex, ex]) {
    ctx.beginPath()
    ctx.arc(cx + dx, ey + er * 0.35, er * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(10,10,16,0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2)
  ctx.stroke()
}

/** 井背景与网格底纹。 */
function drawWell(ctx: CanvasRenderingContext2D): void {
  roundRectPath(ctx, BOARD_X - 8, BOARD_Y - 8, COLS * CELL + 16, ROWS * CELL + 16, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.035)'
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      ctx.fillRect(BOARD_X + x * CELL + 2, BOARD_Y + y * CELL + 2, CELL - 4, CELL - 4)
    }
  }
  // 溢出警戒线：井顶第一行。
  ctx.strokeStyle = 'rgba(247,118,142,0.35)'
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(BOARD_X, BOARD_Y + CELL)
  ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + CELL)
  ctx.stroke()
  ctx.setLineDash([])
}

/** NEXT 预览：HUD 右上角一对竖排小噗呦。 */
function drawNext(ctx: CanvasRenderingContext2D, state: PuyoState): void {
  const cx = W - 34
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('NEXT', cx, 24)
  drawPuyo(ctx, cx, 42, 10, state.next.a)
  drawPuyo(ctx, cx, 42 + 21, 10, state.next.b)
}

/**
 * 整帧渲染。
 * @param ctx - 画布上下文（已按逻辑坐标变换）。
 * @param state - 局状态（只读；clearFx.spawned 标记一次性粒子）。
 * @param paused - 暂停蒙层。
 * @param dtMs - 帧间隔（驱动粒子系统）。
 * @param particles - 宿主持有的粒子系统。
 */
export function renderPuyo(
  ctx: CanvasRenderingContext2D, state: PuyoState, paused: boolean, dtMs: number, particles: ParticleSystem,
): void {
  drawBackground(ctx, W, H)
  hudPair(ctx, 14, 28, '分数', String(state.score))
  hudPair(ctx, 14, 50, '连锁', state.maxChain >= 2 ? '×' + state.maxChain : '—', 'left', state.maxChain >= 2 ? THEME.gold : THEME.text)
  hudPair(ctx, W - 14, 28, '块数', String(state.pieces), 'right')
  drawNext(ctx, state)
  drawWell(ctx)

  // 落定的噗呦。
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const v = state.board[y]![x]!
      if (v === 0) continue
      const [cx, cy] = cellCenter(x, y)
      drawPuyo(ctx, cx, cy, CELL * 0.44, v)
    }
  }

  // 下落中的对 + 落点虚影。
  const p = state.piece
  if (p !== null && state.phase === 'playing') {
    const dist = dropDistance(state.board, p)
    const [dx, dy] = childOffset(p.rot)
    ctx.strokeStyle = 'rgba(226,226,238,0.28)'
    ctx.lineWidth = 2
    for (const [x, y] of pieceCells(p)) {
      if (y + dist < 0) continue
      const [cx, cy] = cellCenter(x, y + dist)
      ctx.beginPath()
      ctx.arc(cx, cy, CELL * 0.36, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (p.y >= 0) drawPuyo(ctx, ...cellCenter(p.x, p.y), CELL * 0.44, p.a)
    if (p.y + dy >= 0) drawPuyo(ctx, ...cellCenter(p.x + dx, p.y + dy), CELL * 0.44, p.b)
  }

  // 消除爆裂：一次性喷粒子 + 白色扩散环。
  for (const fx of state.clearFx) {
    const [cx, cy] = cellCenter(fx.x, fx.y)
    if (!fx.spawned) {
      fx.spawned = true
      particles.burst(cx, cy, puyoColor(fx.color), 12, 150)
    }
    const t = fx.life / FX_MS
    ctx.strokeStyle = 'rgba(255,255,255,' + String(0.7 * (1 - t)) + ')'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 0.3 + CELL * 0.55 * t, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 连锁浮字：上浮渐隐。
  for (const f of state.floats) {
    const [cx, cy] = cellCenter(f.x, f.y)
    const t = f.life / f.maxLife
    ctx.globalAlpha = 1 - t
    ctx.font = 'bold ' + (f.text.startsWith('CHAIN') ? '17px' : '14px') + ' system-ui, sans-serif'
    ctx.textAlign = 'center'
    glow(ctx, f.color, 8)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, cx, cy - 8 - 30 * t)
    noGlow(ctx)
    ctx.globalAlpha = 1
  }

  particles.tick(ctx, dtMs)

  if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + String(state.score) + ' · 按 R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  }
}
