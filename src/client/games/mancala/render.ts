/**
 * 播棋渲染器：木质棋盘（两排坑 + 两端粮仓）、种子堆纹路、播种高亮、
 * 回合指示、粮仓大字计数与胜负/暂停遮罩。使用共享视觉套件（../theme.ts）。
 */
import { PLAYER_STORE, AI_STORE, type MancalaState, type Side } from './logic.ts'
import { THEME, drawBackground, glow, noGlow, roundRectPath, hudPair, drawOverlay } from '../theme.ts'

const MARGIN = 18
const HUD_H = 34
/** 坑直径。 */
const CELL = 68
/** 行间距（坑之间的空隙）。 */
const ROW_GAP = 14
/** 粮仓宽度。 */
const STORE_W = 96
/** 粮仓与坑排的空隙。 */
const STORE_GAP = 12
export const LOGICAL_W = MARGIN * 2 + STORE_W * 2 + STORE_GAP * 2 + CELL * 6
export const LOGICAL_H = HUD_H + MARGIN * 2 + CELL * 2 + ROW_GAP

const BOARD_X = MARGIN
const BOARD_Y = HUD_H + MARGIN / 2
const BOARD_W = LOGICAL_W - MARGIN * 2
const BOARD_H = LOGICAL_H - HUD_H - MARGIN
const ROW_TOP = BOARD_Y + 12
const ROW_BOTTOM = ROW_TOP + CELL + ROW_GAP

/** 玩家坑索引 0-5 自左向右显示为 5..0（逆时针视觉）。 */
export function pitCenter(index: number): { x: number, y: number } {
  if (index === PLAYER_STORE) return { x: BOARD_X + STORE_W / 2, y: BOARD_Y + BOARD_H / 2 }
  if (index === AI_STORE) return { x: BOARD_X + BOARD_W - STORE_W / 2, y: BOARD_Y + BOARD_H / 2 }
  const col = index <= 5 ? 5 - index : index - 7
  const x = BOARD_X + STORE_W + STORE_GAP + col * CELL + CELL / 2
  const y = index <= 5 ? ROW_BOTTOM + CELL / 2 : ROW_TOP + CELL / 2
  return { x, y }
}

/** 命中检测：逻辑坐标下的坑/粮仓索引，未命中为 -1。 */
export function pitAt(x: number, y: number): number {
  for (let i = 0; i <= 13; i += 1) {
    const c = pitCenter(i)
    const dx = x - c.x
    const dy = y - c.y
    if (i === PLAYER_STORE || i === AI_STORE) {
      if (Math.abs(dx) <= STORE_W / 2 && Math.abs(dy) <= BOARD_H / 2) return i
    } else if (dx * dx + dy * dy <= (CELL / 2) * (CELL / 2)) {
      return i
    }
  }
  return -1
}

/** 渲染视图状态（index.ts 组装）。 */
export interface MancalaView {
  /** 14 槽籽数（动画期间为逐帧中间态）。 */
  pits: number[]
  /** 悬停坑索引，或 -1。 */
  hover: number
  /** 当前回合方。 */
  turn: Side
  /** 动画高亮槽索引，或 -1。 */
  highlight: number
  /** 最近走子的起始坑，或 -1。 */
  lastMove: number
  /** 第几局（1 起）与总局数。 */
  round: number
  totalRounds: number
  /** 三局积分（玩家, AI）。 */
  points: [number, number]
  /** 遮罩：null 无 / 'paused' / 本局结果文本键。 */
  overlay: null | 'paused' | 'win' | 'lose' | 'draw' | 'match'
  /** match 遮罩副标题。 */
  matchSubtitle: string
}

/** 由槽索引与序号生成稳定的种子落点（环形堆叠，无需随机）。 */
function seedOffset(index: number, k: number): { dx: number, dy: number } {
  const ring = Math.floor(k / 6)
  const pos = k % 6
  const ang = (pos / 6) * Math.PI * 2 + ring * 0.9 + index
  const r = 3 + ring * 7
  return { dx: Math.cos(ang) * r, dy: Math.sin(ang) * r * 0.8 }
}

/** 画一堆种子（坑内或粮仓内）。 */
function drawSeeds(ctx: CanvasRenderingContext2D, cx: number, cy: number, count: number, slot: number, scale: number): void {
  const shown = Math.min(count, 24)
  for (let k = 0; k < shown; k += 1) {
    const off = seedOffset(slot, k)
    ctx.beginPath()
    ctx.ellipse(cx + off.dx * scale, cy + off.dy * scale, 4.2 * scale, 3.2 * scale, k * 1.3, 0, Math.PI * 2)
    ctx.fillStyle = k % 3 === 0 ? '#e7c98f' : k % 3 === 1 ? '#d9b878' : '#c9a665'
    ctx.fill()
    ctx.strokeStyle = 'rgba(60,40,18,0.55)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
}

/** 渲染一帧播棋盘面。 */
export function renderMancala(ctx: CanvasRenderingContext2D, view: MancalaView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 木质棋盘主体。
  const wood = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X, BOARD_Y + BOARD_H)
  wood.addColorStop(0, '#6b4a2b')
  wood.addColorStop(0.5, '#825a34')
  wood.addColorStop(1, '#5d3f24')
  roundRectPath(ctx, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 26)
  ctx.fillStyle = wood
  ctx.fill()
  ctx.strokeStyle = '#3d2814'
  ctx.lineWidth = 3
  ctx.stroke()
  roundRectPath(ctx, BOARD_X + 6, BOARD_Y + 6, BOARD_W - 12, BOARD_H - 12, 20)
  ctx.strokeStyle = 'rgba(255,220,170,0.18)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const humanTurn = view.turn === 'human'
  for (let i = 0; i <= 13; i += 1) {
    const isStore = i === PLAYER_STORE || i === AI_STORE
    const c = pitCenter(i)
    const active = !humanTurn ? i >= 7 && i <= 13 : i <= 6
    const rim = humanTurn ? THEME.accents[0]! : THEME.accents[4]!
    if (active) glow(ctx, rim, i === view.highlight ? 16 : 7)
    if (isStore) {
      roundRectPath(ctx, c.x - STORE_W / 2 + 8, c.y - BOARD_H / 2 + 12, STORE_W - 16, BOARD_H - 24, 18)
    } else {
      ctx.beginPath()
      ctx.arc(c.x, c.y, CELL / 2 - 7, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#3a2412'
    ctx.fill()
    noGlow(ctx)
    if (isStore) {
      roundRectPath(ctx, c.x - STORE_W / 2 + 8, c.y - BOARD_H / 2 + 12, STORE_W - 16, BOARD_H - 24, 18)
    } else {
      ctx.beginPath()
      ctx.arc(c.x, c.y, CELL / 2 - 7, 0, Math.PI * 2)
    }
    ctx.strokeStyle = active ? rim : '#2c1b0c'
    ctx.lineWidth = i === view.highlight ? 4 : 2
    ctx.stroke()

    const count = view.pits[i] ?? 0
    if (isStore) {
      drawSeeds(ctx, c.x, c.y + 14, count, i, 0.9)
      ctx.textAlign = 'center'
      ctx.font = 'bold 30px system-ui, sans-serif'
      ctx.fillStyle = THEME.gold
      glow(ctx, THEME.gold, 8)
      ctx.fillText(String(count), c.x, c.y - 16)
      noGlow(ctx)
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText(i === PLAYER_STORE ? '你' : 'AI', c.x, c.y - BOARD_H / 2 + 26)
    } else {
      drawSeeds(ctx, c.x, c.y, count, i, 1)
      ctx.textAlign = 'center'
      ctx.font = '600 14px system-ui, sans-serif'
      ctx.fillStyle = count > 0 ? '#f3e3c2' : 'rgba(243,227,194,0.35)'
      ctx.fillText(String(count), c.x, c.y + CELL / 2 - 10)
    }
    if (i === view.hover && humanTurn && i <= 5 && (view.pits[i] ?? 0) > 0) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, CELL / 2 - 3, 0, Math.PI * 2)
      ctx.strokeStyle = THEME.text
      ctx.setLineDash([6, 5])
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (i === view.lastMove) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, CELL / 2 + 2, 0, Math.PI * 2)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // 回合指示。
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = humanTurn ? THEME.accents[0]! : THEME.accents[4]!
  glow(ctx, humanTurn ? THEME.accents[0]! : THEME.accents[4]!, 8)
  ctx.fillText(humanTurn ? '▶ 你的回合（下排）' : '◀ AI 思考中（上排）', MARGIN, 22)
  noGlow(ctx)
  hudPair(ctx, LOGICAL_W - MARGIN, 22, '积分 ' + view.points[0] + ':' + view.points[1], '第 ' + view.round + '/' + view.totalRounds + ' 局', 'right', THEME.gold)

  // 常驻规则速览：新手第一局往往不知道为何能连走/怎么吃子。
  ctx.font = '500 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('末籽入自己粮仓=再走一次 · 末籽落自己空坑=连对面一起吃 · 六坑全空收局子多者胜', MARGIN, 40)

  if (view.overlay === 'paused') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P 继续 · R 重开')
  } else if (view.overlay === 'win') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '本局获胜！', '即将开始下一局', THEME.good)
  } else if (view.overlay === 'lose') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '本局失利', '即将开始下一局', THEME.bad)
  } else if (view.overlay === 'draw') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '本局平局', '即将开始下一局')
  } else if (view.overlay === 'match') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '比赛结束', view.matchSubtitle, THEME.gold)
  }
}

/** 终局判定文案用：本局结果转遮罩键。
 * @param state - 终局状态。
 * @returns 遮罩键。
 */
export function resultOverlay(state: MancalaState): 'win' | 'lose' | 'draw' | null {
  if (!state.finished) return null
  if (state.winner === 'human') return 'win'
  if (state.winner === 'ai') return 'lose'
  return 'draw'
}

/** 粮仓计数快捷读取（测试/调试）。
 * @param pits - 14 槽籽数。
 * @returns [玩家粮仓, AI 粮仓]。
 */
export function stores(pits: number[]): [number, number] {
  return [pits[PLAYER_STORE]!, pits[AI_STORE]!]
}

