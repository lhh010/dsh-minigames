/**
 * 海战棋渲染层：双海图（左侧敌方雾区、右侧己方舰队能见）、命中 ✕ 与
 * miss ○ 标记、沉舰轮廓浮现、布舰预览（合法绿 / 非法红）、AI 思考指示、
 * 低难度热图提示（己方被猜概率半透明叠加）、局分 HUD 与胜负暂停 overlay。
 * 纯绘制无状态；命中爆炸粒子由 index 持有并在场景之后叠加。
 */
import {
  FLEET,
  BOARD,
  shipCells,
  sunkFlags,
  type Battle,
  type Placement,
} from './logic.ts'
import {
  THEME,
  accent,
  drawBackground,
  drawOverlay,
  glow,
  noGlow,
  roundRectPath,
  hudPair,
} from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 820
export const LOGICAL_H = 520

const CELL = 34
const GAP = 20
/** 左（敌方）海图原点。 */
const ENEMY_X = 60
/** 右（己方）海图原点。 */
const OWN_X = ENEMY_X + BOARD * CELL + GAP
const BOARD_Y = 120
const BOARD_PX = BOARD * CELL

/** 布置期给 index 的预览信息。 */
export interface PlacingView {
  /** 已布好的舰（与 FLEET 前缀对齐）。 */
  placed: Placement[]
  /** 当前待布舰的预览锚点（null = 未悬停）。 */
  preview: Placement | null
  /** 预览是否合法。 */
  previewOk: boolean
  /** 当前待布舰在 FLEET 中的下标。 */
  shipIndex: number
}

/** 渲染一帧所需的全部视图状态。 */
export interface BattleView {
  /** placing 布舰期 / battle 战斗期 / over 本局结束。 */
  mode: 'placing' | 'battle' | 'over'
  /** 布舰期信息；战斗期为 null。 */
  placing: PlacingView | null
  /** 对局状态；布舰期为 null。 */
  battle: Battle | null
  /** AI 回合思考中（玩家等待提示）。 */
  aiThinking: boolean
  /** 热图提示开关：显示己方海域被 AI 猜中的概率叠加。 */
  heatOn: boolean
  /** heatOn 时由 index 计算的 AI 视角己方热图。 */
  playerHeat: number[][] | null
  /** 当前挑战局数（1 起）。 */
  round: number
  /** 总局数（5）。 */
  totalRounds: number
  /** 挑战积分。 */
  score: number
  /** 底部短提示（空串 = 无）。 */
  message: string
  /** 本局胜负（over 模式）。 */
  over: 'won' | 'lost' | null
  /** 暂停遮罩。 */
  paused: boolean
}

/**
 * 命中测试：逻辑坐标落在哪块海图哪个格。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 目标海图与行列；越界返回 null。
 */
export function boardAt(x: number, y: number): { target: 'enemy' | 'own', row: number, col: number } | null {
  for (const target of ['enemy', 'own'] as const) {
    const ox = target === 'enemy' ? ENEMY_X : OWN_X
    const col = Math.floor((x - ox) / CELL)
    const row = Math.floor((y - BOARD_Y) / CELL)
    if (col >= 0 && col < BOARD && row >= 0 && row < BOARD) {
      return { target, row, col }
    }
  }
  return null
}

/**
 * 敌方海图某格中心（粒子落点）。
 * @param row - 行。
 * @param col - 列。
 * @returns 中心坐标。
 */
export function enemyCellCenter(row: number, col: number): { x: number, y: number } {
  return { x: ENEMY_X + col * CELL + CELL / 2, y: BOARD_Y + row * CELL + CELL / 2 }
}

/**
 * 己方海图某格中心（粒子落点）。
 * @param row - 行。
 * @param col - 列。
 * @returns 中心坐标。
 */
export function ownCellCenter(row: number, col: number): { x: number, y: number } {
  return { x: OWN_X + col * CELL + CELL / 2, y: BOARD_Y + row * CELL + CELL / 2 }
}

function drawGrid(ctx: CanvasRenderingContext2D, ox: number, title: string, accentColor: string, dimmed: boolean): void {
  ctx.globalAlpha = dimmed ? 0.35 : 1
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = accentColor
  ctx.fillText(title, ox + BOARD_PX / 2, BOARD_Y - 26)
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, ox - 4, BOARD_Y - 4, BOARD_PX + 8, BOARD_PX + 8, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = 'rgba(122,162,247,0.16)'
  for (let i = 0; i <= BOARD; i += 1) {
    const p = i * CELL
    ctx.beginPath()
    ctx.moveTo(ox + p, BOARD_Y)
    ctx.lineTo(ox + p, BOARD_Y + BOARD_PX)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(ox, BOARD_Y + p)
    ctx.lineTo(ox + BOARD_PX, BOARD_Y + p)
    ctx.stroke()
  }
  // 边缘坐标：列 A-J、行 1-10。
  ctx.font = '500 10px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  for (let i = 0; i < BOARD; i += 1) {
    ctx.fillText(String.fromCharCode(65 + i), ox + i * CELL + CELL / 2, BOARD_Y - 8)
    ctx.fillText(String(i + 1), ox - 14, BOARD_Y + i * CELL + CELL / 2 + 4)
  }
  ctx.globalAlpha = 1
}

function drawShipShape(ctx: CanvasRenderingContext2D, ox: number, p: Placement, size: number, color: string, edge: string): void {
  const x = ox + p.col * CELL + 3
  const y = BOARD_Y + p.row * CELL + 3
  const w = (p.horizontal ? size : 1) * CELL - 6
  const h = (p.horizontal ? 1 : size) * CELL - 6
  roundRectPath(ctx, x, y, w, h, 7)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, kind: 'miss' | 'hit'): void {
  if (kind === 'miss') {
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.strokeStyle = THEME.textMuted
    ctx.lineWidth = 2
    ctx.stroke()
    return
  }
  ctx.strokeStyle = THEME.bad
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 7, cy - 7)
  ctx.lineTo(cx + 7, cy + 7)
  ctx.moveTo(cx + 7, cy - 7)
  ctx.lineTo(cx - 7, cy + 7)
  ctx.stroke()
}

function drawShots(ctx: CanvasRenderingContext2D, ox: number, shots: number[][], splash: boolean): void {
  for (let r = 0; r < BOARD; r += 1) {
    for (let c = 0; c < BOARD; c += 1) {
      const v = shots[r]![c]!
      if (v === 0) continue
      const cx = ox + c * CELL + CELL / 2
      const cy = BOARD_Y + r * CELL + CELL / 2
      drawMark(ctx, cx, cy, v === 1 ? 'miss' : 'hit')
      if (splash && v === 1) {
        ctx.beginPath()
        ctx.arc(cx, cy + 8, 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(125,207,255,0.35)'
        ctx.fill()
      }
    }
  }
}

/**
 * 绘制一帧完整场景（背景、双海图、标记、热图、HUD、overlay）。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param view - 视图状态。
 */
export function renderBattle(ctx: CanvasRenderingContext2D, view: BattleView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  const shipColor = accent(6)
  const shipEdge = accent(0)
  drawGrid(ctx, ENEMY_X, '敌方海域', accent(5), view.mode === 'placing')
  drawGrid(ctx, OWN_X, '我方海域', accent(0), false)

  if (view.mode === 'placing') {
    const placing = view.placing
    if (placing !== null) {
      for (let i = 0; i < placing.placed.length; i += 1) {
        drawShipShape(ctx, OWN_X, placing.placed[i]!, FLEET[i]!.size, shipColor, shipEdge)
      }
      if (placing.preview !== null) {
        const color = placing.previewOk ? THEME.good : THEME.bad
        glow(ctx, color, 8)
        drawShipShape(ctx, OWN_X, placing.preview, FLEET[placing.shipIndex]!.size, color, color)
        noGlow(ctx)
      }
    }
  } else if (view.battle !== null) {
    const b = view.battle
    // 己方舰队 + AI 的炮击落点。
    for (let i = 0; i < b.player.fleet.length; i += 1) {
      const sunk = sunkFlags(b.player)[i] === true
      drawShipShape(ctx, OWN_X, b.player.fleet[i]!, FLEET[i]!.size, sunk ? 'rgba(247,118,142,0.45)' : shipColor, sunk ? THEME.bad : shipEdge)
    }
    drawShots(ctx, OWN_X, b.player.shots, true)
    // 敌方雾区：只有炮击结果；沉舰轮廓浮现。
    const aiSunk = sunkFlags(b.ai)
    for (let i = 0; i < b.ai.fleet.length; i += 1) {
      if (aiSunk[i] !== true) continue
      const cells = shipCells(b.ai.fleet[i]!, FLEET[i]!.size)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      glow(ctx, THEME.gold, 10)
      for (const [r, c] of cells) {
        roundRectPath(ctx, ENEMY_X + c * CELL + 4, BOARD_Y + r * CELL + 4, CELL - 8, CELL - 8, 5)
        ctx.stroke()
      }
      noGlow(ctx)
    }
    drawShots(ctx, ENEMY_X, b.ai.shots, false)
    // 热图提示：AI 视角己方被猜概率，半透明红叠加。
    if (view.heatOn && view.playerHeat !== null) {
      const heat = view.playerHeat
      let max = 0
      for (const row of heat) for (const v of row) if (v > max) max = v
      if (max > 0) {
        for (let r = 0; r < BOARD; r += 1) {
          for (let c = 0; c < BOARD; c += 1) {
            const v = heat[r]![c]!
            if (v <= 0) continue
            ctx.fillStyle = 'rgba(247,118,142,' + (0.08 + (0.34 * v) / max).toFixed(3) + ')'
            ctx.fillRect(OWN_X + c * CELL + 1, BOARD_Y + r * CELL + 1, CELL - 2, CELL - 2)
          }
        }
      }
    }
    // AI 思考指示。
    if (view.aiThinking && b.phase === 'battle') {
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = accent(4)
      ctx.fillText('敌舰索敌中 ▸▸▸', OWN_X + BOARD_PX / 2, BOARD_Y + BOARD_PX + 30)
    }
  }

  // HUD。
  const b = view.battle
  const enemyLeft = b === null ? FLEET.length : sunkFlags(b.ai).filter(s => !s).length
  hudPair(ctx, 24, 34, '海战棋', '局 ' + view.round + '/' + view.totalRounds)
  hudPair(ctx, 210, 34, '难度', view.mode === 'placing' ? 'L' + view.round : 'L' + (b === null ? view.round : b.difficulty))
  hudPair(ctx, LOGICAL_W - 24, 34, '积分', String(view.score), 'right', THEME.gold)
  hudPair(ctx, LOGICAL_W - 210, 34, '敌舰', enemyLeft + ' 艘', 'right', enemyLeft === 0 ? THEME.good : THEME.text)
  hudPair(ctx, 420, 34, '热图提示', view.heatOn ? '开' : '关', 'left', view.heatOn ? THEME.bad : THEME.textMuted)

  if (view.mode === 'placing') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    const name = view.placing === null ? '' : FLEET[view.placing.shipIndex]!.name
    ctx.fillText(
      view.placing === null ? '布舰完成 —— 空格开战' : '布舰：' + name + '（' + FLEET[view.placing.shipIndex]!.size + ' 格） · 点击放置 · X 旋转',
      LOGICAL_W / 2,
      LOGICAL_H - 40,
    )
  }
  if (view.message !== '') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    ctx.fillText(view.message, LOGICAL_W / 2, LOGICAL_H - 16)
  }

  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续')
    return
  }
  if (view.mode === 'over' && view.over !== null) {
    const won = view.over === 'won'
    drawOverlay(
      ctx,
      LOGICAL_W,
      LOGICAL_H,
      won ? '本局胜利' : '本局失利',
      won ? '空格进入下一局 · R 重开挑战' : '空格进入下一局 · R 重开挑战',
      won ? THEME.good : THEME.bad,
    )
  }
}
