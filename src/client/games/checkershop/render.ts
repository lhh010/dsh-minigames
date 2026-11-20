/**
 * 跳棋竞速 CheckersHop 画布渲染：六角菱形星盘（上/下营区三角着色 +
 * 中央六角区）、双色棋子、选中子的全部可达点（一步实心环 + 链跳点连
 * 虚线预览）、顶部局分/行子方/距离和 HUD、底部常驻玩法速览行、暂
 * 停/局终/整场 overlay 与提示 toast。共享 theme 视觉件；本模块无状
 * 态，命中检测为纯函数。
 *
 * 坐标：格心 px = CX + (q + r/2)*SX、py = CY + r*SY（r 向下增大），
 * 盘面在 LOGICAL 空间内水平垂直居中并留边。
 */
import type { CheckersHopPhase, Side } from './logic.ts'
import { CAMP_FLAG, CELLS } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

export const LOGICAL_W = 560
export const LOGICAL_H = 640

const CX = LOGICAL_W / 2
const CY = 322
const SX = 31
const SY = 27
export const CELL_R = 13

const HUD_Y = 24
const HINT_Y = LOGICAL_H - 14

/** 你/AI 的棋子主色（蓝/红）。 */
const YOU_COLOR = accent(0)
const AI_COLOR = THEME.bad
/** 你/AI 的营区底色。 */
const YOU_CAMP_COLOR = 'rgba(122,162,247,0.13)'
const AI_CAMP_COLOR = 'rgba(247,118,142,0.13)'

/** 每格中心的渲染坐标（与 CELLS 同序）。 */
export const CELL_X: number[] = CELLS.map(c => CX + (c.q + c.r / 2) * SX)
export const CELL_Y: number[] = CELLS.map(c => CY + c.r * SY)

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface CheckersHopView {
  /** 每格占用：0 空、1 你、2 AI。 */
  board: number[]
  turn: Side
  phase: CheckersHopPhase
  roundNo: number
  roundWinsYou: number
  roundWinsAi: number
  matchWinner: Side | null
  roundWinner: Side | null
  /** 选中的己方子（-1 无）。 */
  selected: number
  /** 选中子的合法落点（含链跳所有可停点）。 */
  targets: number[]
  /** 双方距离和（HUD 展示）。 */
  distYou: number
  distAi: number
  /** 临时提示文本，空串表示无。 */
  toast: string
  /** 玩家按 P 的手动暂停。 */
  userPaused: boolean
  /** 面板驱动的暂停（实例未运行）。 */
  paused: boolean
}

/**
 * 命中检测：距某格心不超过 CELL_R+5 的最近格；未命中返回 -1。
 * @param x 逻辑坐标 x。
 * @param y 逻辑坐标 y。
 */
export function cellAt(x: number, y: number): number {
  let best = -1
  let bestD = CELL_R + 5
  for (let i = 0; i < CELLS.length; i += 1) {
    const dx = x - CELL_X[i]!
    const dy = y - CELL_Y[i]!
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** 画一格六边形路径（不填充不描边）。 */
function hexPath(ctx: CanvasRenderingContext2D, i: number, radius: number): void {
  const cx = CELL_X[i]!
  const cy = CELL_Y[i]!
  ctx.beginPath()
  for (let k = 0; k < 6; k += 1) {
    const a = Math.PI / 6 + (k * Math.PI) / 3
    const px = cx + Math.cos(a) * radius
    const py = cy + Math.sin(a) * radius
    if (k === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/** 画一枚棋子（带描边；选中时外加高亮环）。 */
function drawPiece(ctx: CanvasRenderingContext2D, i: number, color: string, selected: boolean): void {
  const cx = CELL_X[i]!
  const cy = CELL_Y[i]!
  if (selected) {
    ctx.beginPath()
    ctx.arc(cx, cy, CELL_R + 3, 0, Math.PI * 2)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2
    glow(ctx, THEME.gold, 8)
    ctx.stroke()
    noGlow(ctx)
  }
  ctx.beginPath()
  ctx.arc(cx, cy, CELL_R - 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  glow(ctx, color, selected ? 10 : 5)
  ctx.fill()
  noGlow(ctx)
  ctx.beginPath()
  ctx.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fill()
}

/**
 * 全量重绘一帧（dirty 模式：仅在状态变化或粒子活动时调用）。
 * @param ctx 逻辑坐标系下的 2d 上下文。
 * @param view 当前视图状态。
 */
export function renderCheckersHop(ctx: CanvasRenderingContext2D, view: CheckersHopView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 盘面：营区着色格 + 普通格描边。
  for (let i = 0; i < CELLS.length; i += 1) {
    hexPath(ctx, i, CELL_R)
    const flag = CAMP_FLAG[i]
    if (flag === 1) ctx.fillStyle = AI_CAMP_COLOR
    else if (flag === 2) ctx.fillStyle = YOU_CAMP_COLOR
    else ctx.fillStyle = 'rgba(226,226,238,0.05)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(226,226,238,0.14)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 营区标注（左右两侧留白处，避开盘面左右边界）。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.bad
  ctx.textAlign = 'left'
  ctx.fillText('AI 营区', 14, CY - 7 * SY)
  ctx.fillStyle = YOU_COLOR
  ctx.fillText('你的营区', 14, CY + 8 * SY)
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.bad
  ctx.fillText('你要去这', LOGICAL_W - 14, CY - 7 * SY)
  ctx.fillStyle = YOU_COLOR
  ctx.fillText('AI 要去这', LOGICAL_W - 14, CY + 8 * SY)

  // 选中子的链跳预览：细线连到每个可达点 + 空心环。
  if (view.selected >= 0) {
    const sx = CELL_X[view.selected]!
    const sy = CELL_Y[view.selected]!
    for (const t of view.targets) {
      const tx = CELL_X[t]!
      const ty = CELL_Y[t]!
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
      ctx.strokeStyle = 'rgba(224,175,104,0.4)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(tx, ty, CELL_R - 3, 0, Math.PI * 2)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // 棋子。
  for (let i = 0; i < view.board.length; i += 1) {
    const occ = view.board[i]
    if (occ === 1) drawPiece(ctx, i, YOU_COLOR, i === view.selected)
    else if (occ === 2) drawPiece(ctx, i, AI_COLOR, false)
  }

  // 顶部 HUD：左局分、中行子方、右距离和（右锚防错位）。
  hudPair(ctx, 16, HUD_Y, '局分', '你' + view.roundWinsYou + ':' + view.roundWinsAi + 'AI')
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = view.phase !== 'play'
    ? THEME.textMuted
    : (view.turn === 'you' ? YOU_COLOR : THEME.textMuted)
  const centerText = view.phase !== 'play'
    ? '第' + view.roundNo + '局结束'
    : (view.turn === 'you' ? '轮到你 · 点击棋子移动' : 'AI 思考中…')
  ctx.fillText(centerText, CX, HUD_Y)
  hudPair(
    ctx, LOGICAL_W - 16, HUD_Y, '距离和',
    String(view.distYou), 'right',
    view.turn === 'you' ? YOU_COLOR : THEME.text,
  )

  // 底部常驻玩法速览（单行）。
  ctx.font = '500 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('速览：点子→点高亮点 | 跳过邻子可连环跳可停 | 进对岸营区锁定 | 10子全到对岸胜', CX, HINT_Y)

  // toast（速览行上方，短时显示）。
  if (view.toast !== '') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    ctx.fillText(view.toast, CX, HINT_Y - 22)
  }

  if (view.userPaused || (view.paused && view.phase === 'play')) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续 · R 重开整场')
    return
  }
  if (view.phase === 'roundEnd') {
    const won = view.roundWinner === 'you'
    drawOverlay(
      ctx, LOGICAL_W, LOGICAL_H,
      won ? '本局你先到' : '本局 AI 先到',
      '局分 你' + view.roundWinsYou + ':' + view.roundWinsAi + 'AI · 即将开下一局',
      won ? THEME.good : THEME.bad,
    )
    return
  }
  if (view.phase === 'matchEnd') {
    const won = view.matchWinner === 'you'
    drawOverlay(
      ctx, LOGICAL_W, LOGICAL_H,
      won ? '整场胜利' : '整场告负',
      '3 局 2 胜 · 按 R 再来一场',
      won ? THEME.good : THEME.bad,
    )
  }
}
