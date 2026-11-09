/**
 * 过河 River Crossing 画布渲染：左岸 / 河面（水波）/ 右岸三段布局，角色
 * emoji 网格、渡船往返动画、冲突岸红闪警示、HUD 与过关 / 失败 / 暂停
 * overlay。渲染器无状态（全部信息由调用方通过 {@link RiverView} 传入），
 * 水波相位由注入 seed 的 mulberry32 确定，同一关卡波形稳定。
 */
import { mulberry32, type RiverLevel, type RiverState, type Side } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 560
export const LOGICAL_H = 380
const HUD_H = 30
/** 左右岸面板。 */
const BANK_W = 138
const BANK_TOP = HUD_H + 14
const BANK_H = LOGICAL_H - BANK_TOP - 18
/** 河面竖直通道。 */
const RIVER_L = BANK_W + 24
const RIVER_R = LOGICAL_W - BANK_W - 24
/** 角色槽位（岸上 2 列网格）。 */
const SLOT_W = 60
const SLOT_H = 52
/** 船的停泊 x（按岸侧）与船体尺寸。 */
const DOCK_X: Record<Side, number> = { left: RIVER_L + 34, right: RIVER_R - 34 }
const BOAT_W = 76
const BOAT_H = 30
/** 河面基准水线。 */
const WATER_Y = 258
/** 开船按钮。 */
export const SAIL_RECT = { x: LOGICAL_W / 2 - 52, y: LOGICAL_H - 44, w: 104, h: 30 }

/** 水波相位：每关 4 条波纹线，seed 派生自关卡下标，稳定可测。 */
function wavePhases(levelIndex: number): number[] {
  const rand = mulberry32(0x5f37 + levelIndex * 977)
  return [0, 1, 2, 3].map(() => rand() * Math.PI * 2)
}

/** 岸上第 i 个角色的槽位外框矩形。 */
export function bankSlotRect(side: Side, i: number): { x: number, y: number, w: number, h: number } {
  const bankX = side === 'left' ? 16 : LOGICAL_W - 16 - BANK_W
  const col = i % 2
  const row = Math.floor(i / 2)
  const offsetX = (BANK_W - SLOT_W * 2) / 2
  const rows = Math.max(1, Math.ceil((i + 1) / 2))
  const gridH = Math.min(BANK_H - 30, Math.max(SLOT_H, rows * SLOT_H))
  const offsetY = 26 + (BANK_H - 30 - gridH) / 2
  return { x: bankX + offsetX + col * SLOT_W, y: BANK_TOP + offsetY + row * SLOT_H, w: SLOT_W - 6, h: SLOT_H - 8 }
}

/**
 * 渡船当前中心 x：停泊在 boatSide 一侧，渡河途中按进度线性插值。
 * @param state 当前状态（渡河中 boatSide 仍为出发岸）。
 * @param progress 渡河进度 0..1（非渡河阶段传 0）。
 */
export function boatCenterX(state: RiverState, progress: number): number {
  const from = DOCK_X[state.boatSide]
  const to = DOCK_X[state.boatSide === 'left' ? 'right' : 'left']
  return from + (to - from) * progress
}

/**
 * 命中检测：逻辑坐标落在哪个可点击角色上。
 * @returns { where: 'left' | 'right' | 'boat', id } 或 null。
 */
export function hitChar(
  x: number, y: number, state: RiverState, level: RiverLevel,
): { where: 'left' | 'right' | 'boat', id: string } | null {
  const boatCx = boatCenterX(state, 0)
  // 与乘客绘制坐标严格一致（农夫左侧 -24 偏移、22px 间距、船身中线）——
  // 此前命中框偏了 24px 且 y 差了半船高，点击可见乘客落空导致无法下船。
  for (let i = 0; i < state.boat.length; i += 1) {
    const bx = boatCx - ((state.boat.length - 1) * 22) / 2 + i * 22 - 24
    if (Math.abs(x - bx) <= 15 && Math.abs(y - (WATER_Y + BOAT_H / 2)) <= 15) {
      return { where: 'boat', id: state.boat[i]! }
    }
  }
  const scan = (side: Side, ids: string[]): { where: 'left' | 'right' | 'boat', id: string } | null => {
    for (let i = 0; i < ids.length; i += 1) {
      const r = bankSlotRect(side, i)
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { where: side, id: ids[i]! }
      }
    }
    return null
  }
  return scan('left', state.left) ?? scan('right', state.right)
}

/** 开船按钮是否被点中。 */
export function hitSail(x: number, y: number): boolean {
  return x >= SAIL_RECT.x && x <= SAIL_RECT.x + SAIL_RECT.w && y >= SAIL_RECT.y && y <= SAIL_RECT.y + SAIL_RECT.h
}

/** 一帧的全部绘制输入（由 index 持有并驱动）。 */
export interface RiverView {
  state: RiverState
  level: RiverLevel
  levelIndex: number
  crossings: number
  par: number
  /** play=停泊操作；cross=渡河动画；fail=失败红闪；won=过关；paused=暂停。 */
  phase: 'play' | 'cross' | 'fail' | 'won' | 'paused'
  /** 渡河进度 0..1（仅 cross 阶段有意义）。 */
  crossProgress: number
  /** 动画累计毫秒（水波流动 / 红闪脉冲），仅动画阶段推进。 */
  animT: number
  /** 失败信息（仅 fail 阶段）。 */
  fail: { bank: Side, pair: readonly [string, string] } | null
  /** 全部通关（第 5 关也完成）。 */
  allClear: boolean
}

function drawCharSlot(ctx: CanvasRenderingContext2D, rect: { x: number, y: number, w: number, h: number }, emoji: string, hot: boolean): void {
  const color = hot ? THEME.text : THEME.panelEdge
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 10)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = hot ? 2 : 1
  if (hot) glow(ctx, THEME.text, 8)
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '24px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = THEME.text
  ctx.fillText(emoji, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
}

function drawBank(
  ctx: CanvasRenderingContext2D, view: RiverView, side: Side, ids: string[],
): void {
  const bankX = side === 'left' ? 16 : LOGICAL_W - 16 - BANK_W
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, bankX, BANK_TOP, BANK_W, BANK_H, 12)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = side === 'left' ? THEME.textMuted : accent(view.levelIndex)
  ctx.fillText(side === 'left' ? '左岸 · 起点' : '右岸 · 终点', bankX + BANK_W / 2, BANK_TOP + 16)
  const emojiOf = new Map(view.level.characters.map(c => [c.id, c.emoji]))
  const docked = view.state.boatSide === side && view.phase === 'play'
  ids.forEach((id, i) => {
    const rect = bankSlotRect(side, i)
    drawCharSlot(ctx, rect, emojiOf.get(id) ?? '?', docked)
  })
  // 失败红闪：事发岸整块脉冲。
  if (view.phase === 'fail' && view.fail !== null && view.fail.bank === side) {
    const pulse = 0.18 + 0.14 * Math.sin(view.animT / 90)
    ctx.fillStyle = 'rgba(247,118,142,' + Math.max(0.05, pulse).toFixed(3) + ')'
    roundRectPath(ctx, bankX, BANK_TOP, BANK_W, BANK_H, 12)
    ctx.fill()
  }
}

function drawRiver(ctx: CanvasRenderingContext2D, view: RiverView): void {
  const x0 = RIVER_L - 10
  const x1 = RIVER_R + 10
  const y0 = BANK_TOP
  const y1 = BANK_TOP + BANK_H
  const grad = ctx.createLinearGradient(0, y0, 0, y1)
  grad.addColorStop(0, '#1b2b3a')
  grad.addColorStop(1, '#12202e')
  ctx.fillStyle = grad
  roundRectPath(ctx, x0, y0, x1 - x0, y1 - y0, 14)
  ctx.fill()
  // 4 条水波线：seed 相位 + animT 流动（动画阶段才推进，静止时波形稳定）。
  const phases = wavePhases(view.levelIndex)
  for (let line = 0; line < phases.length; line += 1) {
    const phase = phases[line]!
    const yBase = y0 + 36 + line * ((y1 - y0 - 60) / (phases.length - 1))
    ctx.strokeStyle = line % 2 === 0 ? 'rgba(125,207,255,0.30)' : 'rgba(122,162,247,0.22)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = x0 + 6; x <= x1 - 6; x += 6) {
      const y = yBase + Math.sin(phase + x / 46 + view.animT / 320) * 5
      if (x === x0 + 6) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

function drawBoat(ctx: CanvasRenderingContext2D, view: RiverView): void {
  const cx = boatCenterX(view.state, view.phase === 'cross' ? view.crossProgress : 0)
  const y = WATER_Y
  const moving = view.phase === 'cross'
  // 船身。
  ctx.fillStyle = accent(6)
  glow(ctx, accent(6), moving ? 14 : 6)
  roundRectPath(ctx, cx - BOAT_W / 2, y, BOAT_W, BOAT_H, 12)
  ctx.fill()
  noGlow(ctx)
  // 农夫恒在船上。
  ctx.font = '18px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🧑‍🌾', cx, y + BOAT_H / 2)
  // 乘客。
  const emojiOf = new Map(view.level.characters.map(c => [c.id, c.emoji]))
  for (let i = 0; i < view.state.boat.length; i += 1) {
    const bx = cx - ((view.state.boat.length - 1) * 22) / 2 + i * 22 - 24
    ctx.fillText(emojiOf.get(view.state.boat[i]!) ?? '?', bx, y + BOAT_H / 2)
  }
  ctx.textBaseline = 'alphabetic'
  // 舱位指示点。
  for (let s = 0; s < view.level.passengerSlots; s += 1) {
    const filled = s < view.state.boat.length
    ctx.beginPath()
    ctx.arc(cx + BOAT_W / 2 - 8 - s * 10, y + BOAT_H + 8, 3, 0, Math.PI * 2)
    ctx.fillStyle = filled ? THEME.gold : THEME.panelEdge
    ctx.fill()
  }
}

/** 开船按钮（渡河 / 结算阶段隐藏）。 */
function drawSailButton(ctx: CanvasRenderingContext2D, view: RiverView): void {
  if (view.phase !== 'play') return
  const enabled = true
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, SAIL_RECT.x, SAIL_RECT.y, SAIL_RECT.w, SAIL_RECT.h, 8)
  ctx.fill()
  ctx.strokeStyle = enabled ? accent(6) : THEME.panelEdge
  ctx.lineWidth = 1.5
  glow(ctx, accent(6), 6)
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText('开船 ⛵', SAIL_RECT.x + SAIL_RECT.w / 2, SAIL_RECT.y + 20)
}

/**
 * 绘制一整帧：背景 → HUD → 河面 → 两岸 → 船 → 开船按钮 → 结算 overlay。
 * @param view 见 {@link RiverView}。
 */
export function renderRiver(ctx: CanvasRenderingContext2D, view: RiverView): void {
  const w = LOGICAL_W
  const h = LOGICAL_H
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, 12, 20, '关卡 ', String(view.levelIndex + 1) + '/5 · ' + view.level.name)
  hudPair(ctx, w / 2, 20, '渡河 ', String(view.crossings) + ' / 最少 ' + String(view.par), 'left', THEME.gold)
  hudPair(ctx, w - 12, 20, '待运 ', String(view.state.left.length + view.state.boat.length), 'right')

  drawRiver(ctx, view)
  drawBank(ctx, view, 'left', view.state.left)
  drawBank(ctx, view, 'right', view.state.right)
  drawBoat(ctx, view)
  drawSailButton(ctx, view)

  if (view.phase === 'fail' && view.fail !== null) {
    const nameOf = new Map(view.level.characters.map(c => [c.id, c.name]))
    const pred = nameOf.get(view.fail.pair[0]) ?? view.fail.pair[0]
    const prey = nameOf.get(view.fail.pair[1]) ?? view.fail.pair[1]
    drawOverlay(ctx, w, h, '失败', pred + ' 吃掉了 ' + prey + '！', THEME.bad)
  } else if (view.phase === 'won') {
    const subtitle = view.allClear
      ? '五关全部通关 · 共 ' + String(view.crossings) + ' 次渡河'
      : '本关 ' + String(view.crossings) + ' 次渡河（最少 ' + String(view.par) + '）'
    drawOverlay(ctx, w, h, view.allClear ? '全部通关' : '过关', subtitle, THEME.good)
  } else if (view.phase === 'paused') {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
