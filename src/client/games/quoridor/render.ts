/**
 * 鬼墙渲染器：木纹棋盘（格线 + 目标行高亮）、双方圆形木子、墙槽凹槽
 * 与已放墙（按放置者着色）、侧栏剩余墙堆叠条、悬停幽灵墙预览（合法
 * 绿 / 非法红半透明）、合法落点提示、双方最短路距离与局分 HUD、AI
 * 思考提示及暂停/终局 overlay。纯 canvas 绘制，无 DOM、无状态。
 */
import { BOARD, type Pos, type QuoridorState, type WallOrient } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const CELL = 36
const HUD_H = 46
const MARGIN = 20
const SIDE_W = 132
export const LOGICAL_W = MARGIN + BOARD * CELL + 18 + SIDE_W + MARGIN
export const LOGICAL_H = HUD_H + MARGIN + BOARD * CELL + MARGIN + 4
const BX = MARGIN
const BY = HUD_H + MARGIN

/** 输入模式：走子 / 横墙 / 竖墙（W 循环切换）。 */
export type InputMode = 'move' | 'wallH' | 'wallV'

/** 一次渲染的全部视图数据。 */
export interface QuoridorView {
  state: QuoridorState
  /** 当前输入模式。 */
  mode: InputMode
  /** 当前方合法走子落点。 */
  steps: readonly Pos[]
  /** 悬停格（走子模式）。 */
  hoverCell: Pos | null
  /** 悬停墙锚点（放墙模式）。 */
  hoverWall: { orient: WallOrient; c: number; r: number } | null
  /** 悬停墙是否合法（幽灵着色）。 */
  wallPreviewValid: boolean
  /** AI 思考中提示。 */
  thinking: boolean
  /** 三局两胜的局分。 */
  matchWins: [number, number]
  /** 当前难度级别标签。 */
  levelLabel: string
  /** 双方最短路（步）。 */
  dists: [number, number]
  /** 暂停中。 */
  paused: boolean
  /** 整个 3 局 2 胜已结束。 */
  matchOver: boolean
  /** 玩家（南方）最终是否夺得赛点。 */
  matchWon: boolean
}

/** 棋子/格子几何：格子左上角。 */
export function cellXY(c: number, r: number): { x: number; y: number } {
  return { x: BX + c * CELL, y: BY + r * CELL }
}

/** 墙锚点 (c,r) 的中心点（横竖墙同槽同心）。 */
export function slotCenter(c: number, r: number): { x: number; y: number } {
  return { x: BX + (c + 1) * CELL, y: BY + (r + 1) * CELL }
}

/** 指针位置的格子（不在棋盘内返回 null）。 */
export function cellAt(x: number, y: number): Pos | null {
  const c = Math.floor((x - BX) / CELL)
  const r = Math.floor((y - BY) / CELL)
  if (c < 0 || c >= BOARD || r < 0 || r >= BOARD) return null
  return { c, r }
}

/** 指针位置吸附到的墙锚点（距槽中心超过 0.75 格返回 null）。 */
export function wallSlotAt(x: number, y: number): { c: number; r: number } | null {
  const c = Math.round((x - BX) / CELL) - 1
  const r = Math.round((y - BY) / CELL) - 1
  if (c < 0 || c > BOARD - 2 || r < 0 || r > BOARD - 2) return null
  const center = slotCenter(c, r)
  if (Math.abs(x - center.x) > CELL * 0.75 || Math.abs(y - center.y) > CELL * 0.75) return null
  return { c, r }
}

/** 木纹底色与纹理参数。 */
const WOOD_BASE = '#6e5637'
const WOOD_DARK = '#5b4629'
const WOOD_GRAIN = 'rgba(43,32,16,0.28)'
const GRID = 'rgba(38,27,12,0.55)'

/** 木子配色：南方亮木、北方暗木。 */
const PAWN_COLORS = ['#e8cfa2', '#8a5a33'] as const
const PAWN_RIMS = ['#f5e3bd', '#a97a4b'] as const

/** 画整块木纹棋盘（底色 + 确定性纹理线 + 格线）。 */
function drawWoodBoard(ctx: CanvasRenderingContext2D): void {
  const size = BOARD * CELL
  ctx.fillStyle = WOOD_BASE
  roundRectPath(ctx, BX - 6, BY - 6, size + 12, size + 12, 8)
  ctx.fill()
  ctx.save()
  roundRectPath(ctx, BX - 6, BY - 6, size + 12, size + 12, 8)
  ctx.clip()
  // 木纹：固定相位的水平纹理波（逐帧确定，无随机）。
  ctx.strokeStyle = WOOD_GRAIN
  ctx.lineWidth = 1
  for (let i = 0; i < 14; i += 1) {
    const y0 = BY - 6 + (i + 0.5) * ((size + 12) / 14)
    ctx.beginPath()
    for (let x = BX - 6; x <= BX + size + 6; x += 8) {
      const wave = Math.sin(x * 0.05 + i * 1.7) * 2.4
      if (x === BX - 6) ctx.moveTo(x, y0 + wave)
      else ctx.lineTo(x, y0 + wave)
    }
    ctx.stroke()
  }
  ctx.fillStyle = WOOD_DARK
  ctx.globalAlpha = 0.35
  ctx.fillRect(BX - 6, BY + size * 0.62, size + 12, size * 0.5)
  ctx.globalAlpha = 1
  ctx.restore()
  // 格线。
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= BOARD; i += 1) {
    ctx.moveTo(BX + i * CELL, BY)
    ctx.lineTo(BX + i * CELL, BY + size)
    ctx.moveTo(BX, BY + i * CELL)
    ctx.lineTo(BX + size, BY + i * CELL)
  }
  ctx.stroke()
}

/** 目标行微高亮（双方各自的对岸）。 */
function drawGoals(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 0.1
  ctx.fillStyle = accent(4)
  ctx.fillRect(BX + 1, BY + 1, BOARD * CELL - 2, CELL - 2)
  ctx.fillStyle = accent(0)
  ctx.fillRect(BX + 1, BY + (BOARD - 1) * CELL + 1, BOARD * CELL - 2, CELL - 2)
  ctx.globalAlpha = 1
}

/** 墙槽凹槽：每个锚点画一枚小十字暗槽。 */
function drawSlots(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(30,21,9,0.5)'
  for (let r = 0; r < BOARD - 1; r += 1) {
    for (let c = 0; c < BOARD - 1; c += 1) {
      const { x, y } = slotCenter(c, r)
      ctx.fillRect(x - 6, y - 1, 12, 2)
      ctx.fillRect(x - 1, y - 6, 2, 12)
    }
  }
}

/** 一块墙的矩形（按走向）。 */
function wallRect(orient: WallOrient, c: number, r: number): { x: number; y: number; w: number; h: number } {
  const { x, y } = slotCenter(c, r)
  const t = 7
  if (orient === 'h') return { x: x - CELL, y: y - t / 2, w: CELL * 2, h: t }
  return { x: x - t / 2, y: y - CELL, w: t, h: CELL * 2 }
}

/** 已放墙（按放置者着色：南方蓝、北方红）。 */
function drawWalls(ctx: CanvasRenderingContext2D, state: QuoridorState): void {
  for (let r = 0; r < BOARD - 1; r += 1) {
    for (let c = 0; c < BOARD - 1; c += 1) {
      const i = r * 8 + c
      const owner = state.wallOwners[i]!
      if (state.hWalls[i] === 1) drawWallPiece(ctx, wallRect('h', c, r), accent(owner === 0 ? 0 : 4))
      if (state.vWalls[i] === 1) drawWallPiece(ctx, wallRect('v', c, r), accent(owner === 0 ? 0 : 4))
    }
  }
}

/** 单块墙的立体小条。 */
function drawWallPiece(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, color: string): void {
  ctx.fillStyle = color
  roundRectPath(ctx, rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/** 幽灵墙预览（半透明，合法绿描边 / 非法红）。 */
function drawGhostWall(ctx: CanvasRenderingContext2D, view: QuoridorView): void {
  const hw = view.hoverWall
  if (hw === null || view.state.winner !== null) return
  const rect = wallRect(hw.orient, hw.c, hw.r)
  ctx.globalAlpha = 0.45
  ctx.fillStyle = view.wallPreviewValid ? accent(2) : THEME.bad
  roundRectPath(ctx, rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 3)
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 合法落点提示（空心小圆）与悬停格。 */
function drawSteps(ctx: CanvasRenderingContext2D, view: QuoridorView): void {
  if (view.state.winner !== null || view.mode !== 'move') return
  for (const p of view.steps) {
    const { x, y } = cellXY(p.c, p.r)
    const hover = view.hoverCell !== null && view.hoverCell.c === p.c && view.hoverCell.r === p.r
    ctx.strokeStyle = hover ? accent(2) : accent(0)
    ctx.globalAlpha = hover ? 0.95 : 0.5
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x + CELL / 2, y + CELL / 2, hover ? 12 : 7, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

/** 圆形木子（亮/暗两种木色 + 微光）。 */
function drawPawns(ctx: CanvasRenderingContext2D, state: QuoridorState): void {
  for (const p of [0, 1] as const) {
    const pos = state.pawns[p]!
    const { x, y } = cellXY(pos.c, pos.r)
    const cx = x + CELL / 2
    const cy = y + CELL / 2
    const color = PAWN_COLORS[p]
    const rim = PAWN_RIMS[p]
    glow(ctx, color, 8)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, 13, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = rim
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, cy, 13, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(60,42,20,0.5)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(cx, cy, 8, 0, Math.PI * 2)
    ctx.stroke()
    if (state.turn === p && state.winner === null) {
      ctx.strokeStyle = accent(p === 0 ? 0 : 4)
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(cx, cy, 16.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
}

/** 侧栏：标题、剩余墙堆叠条、距离、局分与提示。 */
function drawSidebar(ctx: CanvasRenderingContext2D, view: QuoridorView): void {
  const s = view.state
  const sx = BX + BOARD * CELL + 18
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('剩余墙', sx, BY + 4)
  const names: [string, string] = ['你', 'AI']
  const colors: [string, string] = [accent(0), accent(4)]
  for (const p of [0, 1] as const) {
    const top = BY + 16 + p * 118
    ctx.fillStyle = THEME.text
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText(names[p] + '（' + s.wallStock[p] + '）', sx, top)
    // 每块墙一根小条，最多画 10 根。
    for (let k = 0; k < s.wallStock[p]; k += 1) {
      ctx.fillStyle = colors[p]
      ctx.globalAlpha = 0.85
      roundRectPath(ctx, sx, top + 8 + k * 8, SIDE_W - 12, 5, 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  const dy = BY + 262
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('最短路', sx, dy)
  ctx.fillStyle = THEME.text
  ctx.fillText('你 ' + view.dists[0] + ' 步', sx, dy + 18)
  ctx.fillText('AI ' + view.dists[1] + ' 步', sx, dy + 36)
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('局分 ' + view.matchWins[0] + ' - ' + view.matchWins[1], sx, dy + 60)
  ctx.fillStyle = THEME.gold
  ctx.fillText(view.levelLabel, sx, dy + 78)
  if (view.thinking && s.winner === null && !view.paused && !view.matchOver) {
    ctx.fillStyle = accent(4)
    ctx.fillText('AI 思考中…', sx, dy + 102)
  }
}

/** HUD 顶栏：标题 + 模式提示。 */
function drawHud(ctx: CanvasRenderingContext2D, view: QuoridorView): void {
  ctx.textAlign = 'left'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText('鬼墙 Quoridor', MARGIN, 26)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const modeText = view.mode === 'move' ? '模式：走子（W 切换放墙）' : view.mode === 'wallH' ? '模式：横墙（W 切换）' : '模式：竖墙（W 切换）'
  ctx.fillText(modeText + ' · 3 局 2 胜 · R 重开 · P 暂停', MARGIN, 42)
}

/** 主渲染入口。 */
export function renderQuoridor(ctx: CanvasRenderingContext2D, view: QuoridorView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawHud(ctx, view)
  drawWoodBoard(ctx)
  drawGoals(ctx)
  drawSlots(ctx)
  drawWalls(ctx, view.state)
  drawGhostWall(ctx, view)
  drawSteps(ctx, view)
  drawPawns(ctx, view.state)
  drawSidebar(ctx, view)
  if (view.matchOver) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, view.matchWon ? '胜 利' : '惜 败',
      '总比分 ' + view.matchWins[0] + ' - ' + view.matchWins[1] + ' · R：再战一届', view.matchWon ? THEME.gold : THEME.bad)
    return
  }
  const w = view.state.winner
  if (w !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, w === 0 ? '本局获胜' : '本局失利',
      '当前局分 ' + view.matchWins[0] + ' - ' + view.matchWins[1], w === 0 ? THEME.good : THEME.bad)
    return
  }
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂 停', '按 P 继续')
  }
}
