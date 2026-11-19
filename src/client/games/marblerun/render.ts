/**
 * 滚珠轨道 MarbleRun 渲染层：科技蓝图风网格盘面 + 轨道件（带旋转纹
 * 理）+ 金属滚珠拖尾 + 尖刺 / 目标杯 / 库存栏 HUD + 过关覆盖层。全部
 * 为纯 canvas 绘制（无 DOM、无自身状态），由 index.ts 持状态并按
 * dirty / 逐帧调度调用。
 */
import {
  CELL,
  COLS,
  LEVELS,
  MARBLE_R,
  PIECE_KINDS,
  PIECE_LABEL,
  PIECE_ORIENTATIONS,
  ROWS,
  cupSegments,
  cupWinZone,
  mulberry32,
  pieceSegments,
  type LevelDef,
  type PieceKind,
  type Placement,
  type RunWorld,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布宽（网格区）。 */
export const LOGICAL_W = COLS * CELL
/** 网格区高。 */
export const BOARD_H = ROWS * CELL
/** 底部库存栏高。 */
export const BAR_H = 54
/** 逻辑画布总高（网格 + 库存栏）。 */
export const LOGICAL_H = BOARD_H + BAR_H

/** 渲染视图快照（index.ts 每帧组装，渲染层只读）。 */
export interface RenderView {
  /** 关卡定义。 */
  level: LevelDef
  /** 已放置轨道件。 */
  placements: readonly Placement[]
  /** 剩余库存。 */
  inventory: Readonly<Record<PieceKind, number>>
  /** 释放中的物理世界（建造期为 null）。 */
  run: RunWorld | null
  /** 关卡序号（0 起）。 */
  levelIndex: number
  /** 建造 / 释放阶段。 */
  mode: 'build' | 'run'
  /** 已定格的结果（won 或失败类型；running 期间为 null）。 */
  outcome: 'won' | 'out' | 'stuck' | 'shattered' | null
  /** 暂停中。 */
  paused: boolean
  /** 当前选中件种类（建造光标）。 */
  selectedKind: PieceKind
  /** 待放置旋转档位。 */
  pendingRot: number
  /** 悬停格（逻辑像素→格；无则为 null）。 */
  hoverCell: { x: number; y: number } | null
  /** 悬停格是否可放（库存 / 封锁判定后的提示色）。 */
  hoverValid: boolean
  /** 本关得分（未过关为 null）。 */
  score: number | null
}

/**
 * 逻辑像素 → 网格格坐标（含建造光标吸附；网格区外返回 null）。
 * @param x - 逻辑像素横坐标。
 * @param y - 逻辑像素纵坐标。
 */
export function pickCell(x: number, y: number): { x: number; y: number } | null {
  const cx = Math.floor(x / CELL)
  const cy = Math.floor(y / CELL)
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return null
  return { x: cx, y: cy }
}

/**
 * 逻辑像素 → 库存栏槽位序号（PIECE_KINDS 下标；栏外返回 null）。
 * @param x - 逻辑像素横坐标。
 * @param y - 逻辑像素纵坐标。
 */
export function inventorySlotAt(x: number, y: number): number | null {
  if (y < BOARD_H || y > LOGICAL_H) return null
  const slotW = LOGICAL_W / PIECE_KINDS.length
  const i = Math.floor(x / slotW)
  if (i < 0 || i >= PIECE_KINDS.length) return null
  return i
}

/** 蓝图网格 + 种子噪声星点（关卡 seed 决定，帧间稳定）。 */
function drawGrid(ctx: CanvasRenderingContext2D, seed: number): void {
  ctx.strokeStyle = 'rgba(122,162,247,0.10)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= COLS; x += 1) {
    ctx.moveTo(x * CELL + 0.5, 0)
    ctx.lineTo(x * CELL + 0.5, BOARD_H)
  }
  for (let y = 0; y <= ROWS; y += 1) {
    ctx.moveTo(0, y * CELL + 0.5)
    ctx.lineTo(LOGICAL_W, y * CELL + 0.5)
  }
  ctx.stroke()
  // 种子噪声：远景星点，蓝图氛围。
  const rand = mulberry32(seed)
  ctx.fillStyle = 'rgba(122,162,247,0.16)'
  for (let i = 0; i < 90; i += 1) {
    const px = rand() * LOGICAL_W
    const py = rand() * BOARD_H
    const s = rand() * 1.6 + 0.4
    ctx.fillRect(px, py, s, s)
  }
}

/** 出珠口：斜槽 + 出口箭头 + 待发滚珠轮廓。 */
function drawSpawner(ctx: CanvasRenderingContext2D, spawnX: number, spawnY: number, spawnVX: number): void {
  const c = accent(0)
  glow(ctx, c, 8)
  ctx.fillStyle = c
  ctx.fillRect(spawnX - 14, spawnY - 22, 28, 14)
  noGlow(ctx)
  ctx.strokeStyle = c
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(spawnX, spawnY, MARBLE_R + 2, 0, Math.PI * 2)
  ctx.stroke()
  // 出口方向箭头。
  const dir = spawnVX >= 0 ? 1 : -1
  ctx.beginPath()
  ctx.moveTo(spawnX + dir * 16, spawnY)
  ctx.lineTo(spawnX + dir * 8, spawnY - 5)
  ctx.lineTo(spawnX + dir * 8, spawnY + 5)
  ctx.closePath()
  ctx.fillStyle = c
  ctx.fill()
}

/** 目标杯：杯壁线段加金色描边 + 杯内获胜区微光。 */
function drawCup(ctx: CanvasRenderingContext2D, level: LevelDef): void {
  const segs = cupSegments(level)
  const gold = THEME.gold
  glow(ctx, gold, 10)
  ctx.strokeStyle = gold
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const s of segs) {
    ctx.moveTo(s.ax, s.ay)
    ctx.lineTo(s.bx, s.by)
  }
  ctx.stroke()
  noGlow(ctx)
  const zone = cupWinZone(level)
  ctx.fillStyle = 'rgba(224,175,104,0.10)'
  ctx.fillRect(zone.x0, zone.y0, zone.x1 - zone.x0, zone.y1 - zone.y0)
}

/** 尖刺格：三枚三角形棘刺（朝上）。 */
function drawSpike(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const x0 = sx * CELL
  const y0 = sy * CELL
  const bad = THEME.bad
  glow(ctx, bad, 6)
  ctx.fillStyle = bad
  for (let i = 0; i < 3; i += 1) {
    const cx = x0 + 7 + i * 11
    ctx.beginPath()
    ctx.moveTo(cx - 5, y0 + CELL - 2)
    ctx.lineTo(cx, y0 + CELL - 20)
    ctx.lineTo(cx + 5, y0 + CELL - 2)
    ctx.closePath()
    ctx.fill()
  }
  noGlow(ctx)
}

/** 件种类的主题色索引。 */
const KIND_ACCENT: Record<PieceKind, number> = {
  straight: 0,
  curveL: 1,
  curveR: 2,
  booster: 3,
  bumper: 4,
}

/**
 * 画一件轨道件：折线主体 + 按种类的旋转纹理（加速带箭头羽纹、弹板
 * 斜纹、弯板弧光）。
 * @param ctx - 画布上下文。
 * @param p - 放置信息。
 * @param ghost - 幻影预览模式（半透明、无纹理细节）。
 */
function drawPiece(ctx: CanvasRenderingContext2D, p: Placement, ghost: boolean): void {
  const segs = pieceSegments(p)
  if (segs.length === 0) return
  const color = accent(KIND_ACCENT[p.kind])
  ctx.globalAlpha = ghost ? 0.45 : 1
  ctx.strokeStyle = color
  ctx.lineWidth = p.kind === 'bumper' ? 7 : 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  glow(ctx, color, ghost ? 4 : 7)
  ctx.beginPath()
  ctx.moveTo(segs[0]!.ax, segs[0]!.ay)
  for (const s of segs) ctx.lineTo(s.bx, s.by)
  ctx.stroke()
  noGlow(ctx)
  if (ghost) {
    ctx.globalAlpha = 1
    return
  }
  // 纹理：沿折线的短刻度（旋转档位越多视觉越密，玩家可读）。
  const first = segs[0]!
  const last = segs[segs.length - 1]!
  const mx = (first.ax + last.bx) / 2
  const my = (first.ay + last.by) / 2
  if (p.kind === 'booster') {
    // 加速带：沿主方向的 Chevron 羽纹（指向加速方向——恒向右）。
    let dx = last.bx - first.ax
    let dy = last.by - first.ay
    const dl = Math.hypot(dx, dy) || 1
    dx /= dl
    dy /= dl
    if (dx < 0) { dx = -dx; dy = -dy }
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 2
    for (const off of [-7, 0, 7]) {
      const qx = mx + dx * off
      const qy = my + dy * off
      ctx.beginPath()
      ctx.moveTo(qx - dx * 4 - dy * 4, qy - dy * 4 + dx * 4)
      ctx.lineTo(qx + dx * 3, qy + dy * 3)
      ctx.lineTo(qx - dx * 4 + dy * 4, qy - dy * 4 - dx * 4)
      ctx.stroke()
    }
  } else if (p.kind === 'bumper') {
    // 弹板：中点双斜纹警示。
    ctx.strokeStyle = THEME.text
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(mx - 4, my - 5)
    ctx.lineTo(mx + 4, my + 5)
    ctx.moveTo(mx + 4, my - 5)
    ctx.lineTo(mx - 4, my + 5)
    ctx.stroke()
  } else if (p.kind === 'curveL' || p.kind === 'curveR') {
    // 弯板：弧顶亮点。
    ctx.fillStyle = THEME.text
    ctx.beginPath()
    ctx.arc(mx, my, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** 金属滚珠：径向渐变球体 + 高光点 + 拖尾。 */
function drawMarble(ctx: CanvasRenderingContext2D, run: RunWorld): void {
  // 拖尾：旧→新渐亮。
  const n = run.trail.length
  for (let i = 0; i < n; i += 1) {
    const t = run.trail[i]!
    const a = ((i + 1) / n) * 0.35
    ctx.globalAlpha = a
    ctx.fillStyle = accent(5)
    ctx.beginPath()
    ctx.arc(t.x, t.y, MARBLE_R * (0.3 + 0.6 * (i / n)), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  const grad = ctx.createRadialGradient(run.px - 2.5, run.py - 2.5, 1, run.px, run.py, MARBLE_R)
  grad.addColorStop(0, '#f4f6ff')
  grad.addColorStop(0.45, '#b6c2e6')
  grad.addColorStop(1, '#5b6a94')
  glow(ctx, '#9db4f5', 8)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(run.px, run.py, MARBLE_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(run.px - 2.4, run.py - 2.6, 1.8, 0, Math.PI * 2)
  ctx.fill()
}

/** 顶部 HUD：关卡名 / 序号 / 剩余库存合计 / 得分。 */
function drawHud(ctx: CanvasRenderingContext2D, view: RenderView, leftover: number): void {
  hudPair(ctx, 12, 20, '关卡', (view.levelIndex + 1) + '/' + LEVELS.length + ' · ' + LEVELS[view.levelIndex]!.name)
  hudPair(ctx, LOGICAL_W - 12, 20, '得分', view.score === null ? '--' : String(view.score), 'right', THEME.gold)
  hudPair(ctx, LOGICAL_W / 2, 20, '剩余件', String(leftover), 'center')
}

/** 底部库存栏：五个槽位（图标刻度 + 名称 + 余量），选中高亮。 */
function drawInventoryBar(
  ctx: CanvasRenderingContext2D,
  inventory: Readonly<Record<PieceKind, number>>,
  selected: PieceKind,
  pendingRot: number,
): void {
  const slotW = LOGICAL_W / PIECE_KINDS.length
  ctx.fillStyle = 'rgba(30,30,42,0.92)'
  ctx.fillRect(0, BOARD_H, LOGICAL_W, BAR_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, BOARD_H + 0.5)
  ctx.lineTo(LOGICAL_W, BOARD_H + 0.5)
  ctx.stroke()
  for (let i = 0; i < PIECE_KINDS.length; i += 1) {
    const kind = PIECE_KINDS[i]!
    const x = i * slotW
    const count = inventory[kind] ?? 0
    const active = kind === selected && count > 0
    const color = accent(KIND_ACCENT[kind])
    if (active) {
      glow(ctx, color, 8)
      ctx.fillStyle = 'rgba(122,162,247,0.10)'
      ctx.fillRect(x + 3, BOARD_H + 5, slotW - 6, BAR_H - 10)
      noGlow(ctx)
    }
    ctx.strokeStyle = active ? color : THEME.panelEdge
    ctx.lineWidth = active ? 2 : 1
    roundRectPath(ctx, x + 3, BOARD_H + 5, slotW - 6, BAR_H - 10, 6)
    ctx.stroke()
    ctx.globalAlpha = count > 0 ? 1 : 0.35
    // 槽内迷你预览：该件该档位的折线缩略。
    const preview: Placement = { x: 0, y: 0, kind, rot: kind === selected ? pendingRot % PIECE_ORIENTATIONS[kind] : 0 }
    const segs = pieceSegments(preview)
    const sx = x + slotW / 2 - CELL / 2 + 6
    const sy = BOARD_H + 9
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx + segs[0]!.ax * 0.6, sy + segs[0]!.ay * 0.6)
    for (const s of segs) ctx.lineTo(sx + s.bx * 0.6, sy + s.by * 0.6)
    ctx.stroke()
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(PIECE_LABEL[kind], x + 10, BOARD_H + 40)
    hudPair(ctx, x + slotW - 10, BOARD_H + 40, '×', String(count), 'right', count > 0 ? THEME.text : THEME.bad)
    ctx.globalAlpha = 1
  }
}

/** 失败结果的中文短评（覆盖层副标题）。 */
function failText(outcome: 'out' | 'stuck' | 'shattered'): string {
  if (outcome === 'out') return '滚珠飞出了盘面 · 空格回收重搭'
  if (outcome === 'shattered') return '滚珠撞上了尖刺 · 空格回收重搭'
  return '滚珠停住了 · 空格回收重搭'
}

/**
 * 主渲染入口：画完整一帧（网格 / 出珠口 / 杯 / 尖刺 / 轨道件 / 幻影
 * 光标 / 滚珠 / HUD / 库存栏 / 覆盖层）。纯函数，无副作用。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param view - 视图快照。
 * @param leftover - 剩余库存件总数（HUD 用，index 传入避免重复计算）。
 */
export function renderScene(ctx: CanvasRenderingContext2D, view: RenderView, leftover: number): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const level = view.level
  drawGrid(ctx, level.seed)
  drawSpawner(ctx, level.spawnX, level.spawnY, level.spawnVX)
  drawCup(ctx, level)
  for (const s of level.spikes) drawSpike(ctx, s.x, s.y)
  for (const p of view.placements) drawPiece(ctx, p, false)
  // 建造期：悬停格幻影预览（可放为主题色、不可放为警示红）。
  if (view.mode === 'build' && !view.paused && view.hoverCell !== null) {
    const ghost: Placement = { x: view.hoverCell.x, y: view.hoverCell.y, kind: view.selectedKind, rot: view.pendingRot % PIECE_ORIENTATIONS[view.selectedKind] }
    const c = view.hoverValid ? accent(KIND_ACCENT[view.selectedKind]) : THEME.bad
    ctx.strokeStyle = c
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(ghost.x * CELL + 1.5, ghost.y * CELL + 1.5, CELL - 3, CELL - 3)
    ctx.setLineDash([])
    if (view.hoverValid) drawPiece(ctx, ghost, true)
  }
  if (view.run !== null && view.outcome !== 'shattered') drawMarble(ctx, view.run)
  drawHud(ctx, view, leftover)
  drawInventoryBar(ctx, view.inventory, view.selectedKind, view.pendingRot)
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', 'P：继续 · R：重开', THEME.gold)
  } else if (view.outcome === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '入杯！', '得分 ' + (view.score ?? 0) + ' · N：下一关', THEME.good)
  } else if (view.outcome !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '回收滚珠', failText(view.outcome), THEME.bad)
  }
}
