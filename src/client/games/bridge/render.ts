/**
 * 过桥难题 Bridge 画布渲染：夜色两岸 + 中间木桥，人物槽位带速度数字，
 * 手电光斑跟随持灯岸 / 过桥队伍，底部用时条逼近限时变红，关卡 HUD 与
 * 过关 / 超时 / 暂停 overlay。渲染器无状态（全部信息由调用方通过
 * {@link BridgeView} 传入），同一输入绘制结果确定。
 */
import { mulberry32, type BridgeLevel, type BridgeState, type Side } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 560
export const LOGICAL_H = 380
const HUD_H = 30
/** 左右岸面板。 */
const BANK_W = 150
const BANK_TOP = HUD_H + 16
const BANK_H = 238
/** 桥面（可点击过桥）。 */
const DECK_X0 = 16 + BANK_W + 14
const DECK_X1 = LOGICAL_W - 16 - BANK_W - 14
const DECK_Y = 152
const DECK_H = 26
/** 岸上人物槽位（竖排列表）。 */
const SLOT_W = BANK_W - 24
const SLOT_H = 30
const SLOT_GAP = 34
/** 用时条。 */
const BAR_X = 16
const BAR_Y = LOGICAL_H - 36
const BAR_W = LOGICAL_W - 32
const BAR_H = 10

/**
 * 岸上第 i 个人的槽位矩形（与绘制严格一致，供命中检测复用）。
 * @param side 岸侧。
 * @param i 岸内序号。
 */
export function bankSlotRect(side: Side, i: number): { x: number, y: number, w: number, h: number } {
  const bankX = side === 'left' ? 16 : LOGICAL_W - 16 - BANK_W
  return { x: bankX + 12, y: BANK_TOP + 26 + i * SLOT_GAP, w: SLOT_W, h: SLOT_H }
}

/**
 * 命中检测：逻辑坐标落在哪个人物槽位上。
 * @returns 命中人员的 { side, id }；落空返回 null。
 */
export function hitPerson(x: number, y: number, state: BridgeState): { side: Side, id: string } | null {
  const scan = (side: Side, ids: string[]): { side: Side, id: string } | null => {
    for (let i = 0; i < ids.length; i += 1) {
      const r = bankSlotRect(side, i)
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { side, id: ids[i]! }
      }
    }
    return null
  }
  return scan('left', state.left) ?? scan('right', state.right)
}

/** 桥面（含引导箭头区域）是否被点中——即「点桥过桥」。 */
export function hitBridge(x: number, y: number): boolean {
  return x >= DECK_X0 - 6 && x <= DECK_X1 + 6 && y >= DECK_Y - 18 && y <= DECK_Y + DECK_H + 18
}

/** 夜空星点：seed 派生自关卡下标，位置稳定。 */
function stars(levelIndex: number): Array<{ x: number, y: number, s: number }> {
  const rand = mulberry32(0x1d2c + levelIndex * 613)
  return Array.from({ length: 26 }, () => ({
    x: 16 + rand() * (LOGICAL_W - 32),
    y: HUD_H + 4 + rand() * (LOGICAL_H - HUD_H - 60),
    s: 0.6 + rand() * 1.4,
  }))
}

/** 一帧的全部绘制输入（由 index 持有并驱动）。 */
export interface BridgeView {
  /** 当前逻辑状态（cross 阶段仍是出发前快照）。 */
  state: BridgeState
  /** 关卡定义。 */
  level: BridgeLevel
  /** 0 起关卡下标。 */
  levelIndex: number
  /** play=选人操作；cross=过桥动画；fail=超时；won=过关；paused=暂停。 */
  phase: 'play' | 'cross' | 'won' | 'fail' | 'paused'
  /** 已选中待过桥的人员 id（仅 play 阶段）。 */
  selected: string[]
  /** 过桥队伍 id（仅 cross 阶段）。 */
  movers: string[]
  /** 过桥进度 0..1（仅 cross 阶段）。 */
  crossProgress: number
  /** 全部通关（第 5 关也完成）。 */
  allClear: boolean
}

function drawNight(ctx: CanvasRenderingContext2D, view: BridgeView): void {
  for (const p of stars(view.levelIndex)) {
    ctx.fillStyle = 'rgba(226,226,238,' + String(0.22 + p.s * 0.12).slice(0, 4) + ')'
    ctx.fillRect(p.x, p.y, p.s, p.s)
  }
}

function drawBank(ctx: CanvasRenderingContext2D, view: BridgeView, side: Side, ids: string[]): void {
  const bankX = side === 'left' ? 16 : LOGICAL_W - 16 - BANK_W
  const lit = view.state.flashlight === side
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, bankX, BANK_TOP, BANK_W, BANK_H, 12)
  ctx.fill()
  ctx.strokeStyle = lit ? accent(1) : THEME.panelEdge
  ctx.lineWidth = lit ? 1.6 : 1
  if (lit) glow(ctx, accent(1), 8)
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = lit ? THEME.text : THEME.textMuted
  ctx.fillText(side === 'left' ? '左岸 · 起点' : '右岸 · 终点', bankX + BANK_W / 2, BANK_TOP + 16)
  const speedOf = new Map(view.level.people.map(p => [p.id, p.speed]))
  const selectable = lit && view.phase === 'play'
  ids.forEach((id, i) => {
    const r = bankSlotRect(side, i)
    const speed = speedOf.get(id) ?? 0
    const chosen = view.selected.includes(id)
    ctx.fillStyle = THEME.bgBottom
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 8)
    ctx.fill()
    ctx.strokeStyle = chosen ? THEME.text : accent(speed)
    ctx.lineWidth = chosen ? 2 : 1
    if (chosen) glow(ctx, THEME.text, 8)
    ctx.stroke()
    noGlow(ctx)
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = chosen ? THEME.text : accent(speed)
    ctx.fillText(String(speed) + 's', r.x + 12, r.y + 20)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = chosen ? THEME.text : THEME.textMuted
    ctx.fillText(chosen ? '已选' : selectable ? '可点选' : '', r.x + r.w - 14, r.y + 20, r.w - 52)
  })
}

/** 持灯岸的手电：图标 + 径向光斑（视觉上「灯在谁手里」）。 */
function drawFlashlight(ctx: CanvasRenderingContext2D, view: BridgeView): void {
  if (view.phase === 'cross') return
  const side = view.state.flashlight
  const bankX = side === 'left' ? 16 : LOGICAL_W - 16 - BANK_W
  const cx = bankX + BANK_W / 2
  const cy = BANK_TOP + BANK_H - 22
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 64)
  grad.addColorStop(0, 'rgba(224,175,104,0.30)')
  grad.addColorStop(1, 'rgba(224,175,104,0)')
  ctx.fillStyle = grad
  ctx.fillRect(cx - 64, cy - 64, 128, 128)
  ctx.font = '16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🔦', cx, cy)
  ctx.textBaseline = 'alphabetic'
}

function drawBridge(ctx: CanvasRenderingContext2D, view: BridgeView): void {
  // 桥板：横向主梁 + 竖板条。
  ctx.fillStyle = '#3a2f22'
  roundRectPath(ctx, DECK_X0 - 4, DECK_Y - 2, DECK_X1 - DECK_X0 + 8, DECK_H + 4, 6)
  ctx.fill()
  for (let x = DECK_X0 + 4; x < DECK_X1; x += 18) {
    ctx.fillStyle = (x / 18) % 2 < 1 ? '#5b4a33' : '#4e3f2b'
    ctx.fillRect(x, DECK_Y, 12, DECK_H)
  }
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(DECK_X0 - 4, DECK_Y - 2, DECK_X1 - DECK_X0 + 8, DECK_H + 4)
  if (view.phase !== 'play') return
  // 引导：选了人则桥面中央给出方向箭头（方向 = 手电去向）。
  const ready = view.selected.length > 0
  const toRight = view.state.flashlight === 'left'
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = ready ? accent(4) : THEME.textMuted
  ctx.fillText(ready ? (toRight ? '→ 过桥' : '← 过桥') : '桥 · 至多两人', (DECK_X0 + DECK_X1) / 2, DECK_Y + DECK_H / 2)
  ctx.textBaseline = 'alphabetic'
}

/** 过桥队伍：沿桥面插值移动，手电随行。 */
function drawMovers(ctx: CanvasRenderingContext2D, view: BridgeView): void {
  if (view.phase !== 'cross') return
  const p = view.crossProgress
  const from = view.state.flashlight === 'left' ? DECK_X0 + 10 : DECK_X1 - 10
  const to = view.state.flashlight === 'left' ? DECK_X1 - 10 : DECK_X0 + 10
  const cx = from + (to - from) * p
  const cy = DECK_Y + DECK_H / 2
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 52)
  grad.addColorStop(0, 'rgba(224,175,104,0.32)')
  grad.addColorStop(1, 'rgba(224,175,104,0)')
  ctx.fillStyle = grad
  ctx.fillRect(cx - 52, cy - 52, 104, 104)
  const speedOf = new Map(view.level.people.map(pp => [pp.id, pp.speed]))
  view.movers.forEach((id, i) => {
    const bx = cx - (view.movers.length - 1) * 14 + i * 28
    ctx.fillStyle = THEME.bgBottom
    roundRectPath(ctx, bx - 13, cy - 12, 26, 24, 7)
    ctx.fill()
    ctx.strokeStyle = accent(speedOf.get(id) ?? 0)
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = accent(speedOf.get(id) ?? 0)
    ctx.fillText(String(speedOf.get(id) ?? 0) + 's', bx, cy + 1)
  })
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText('🔦', cx, cy - 20)
  ctx.textBaseline = 'alphabetic'
}

/** 用时条：进度按 elapsed/limit，逼近限时由绿转橙再转红。 */
function drawTimeBar(ctx: CanvasRenderingContext2D, view: BridgeView): void {
  const ratio = Math.min(1, view.state.elapsed / view.level.limit)
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, 5)
  ctx.fill()
  const color = ratio >= 0.85 ? THEME.bad : ratio >= 0.6 ? '#ff9e64' : THEME.good
  if (ratio > 0) {
    if (ratio >= 0.85) glow(ctx, THEME.bad, 8)
    roundRectPath(ctx, BAR_X + 1, BAR_Y + 1, Math.max(4, (BAR_W - 2) * ratio), BAR_H - 2, 4)
    ctx.fillStyle = color
    ctx.fill()
    noGlow(ctx)
  }
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ctx.fillText('用时 ' + String(view.state.elapsed) + 's / ' + String(view.level.limit) + 's', BAR_X, BAR_Y - 6)
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点选 1-2 人 · 点桥或空格过桥 · U 撤回', BAR_X + BAR_W, BAR_Y - 6)
}

/**
 * 绘制一整帧：夜空 → HUD → 两岸 → 木桥 → 手电 → 过桥队伍 → 用时条 →
 * 结算 overlay。
 * @param view 见 {@link BridgeView}。
 */
export function renderBridgeScene(ctx: CanvasRenderingContext2D, view: BridgeView): void {
  const w = LOGICAL_W
  const h = LOGICAL_H
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)
  drawNight(ctx, view)

  hudPair(ctx, 12, 20, '关卡 ', String(view.levelIndex + 1) + '/5 · ' + view.level.name)
  hudPair(ctx, w - 12, 20, '左岸 ', String(view.state.left.length) + ' 人', 'right')

  drawBank(ctx, view, 'left', view.state.left)
  drawBank(ctx, view, 'right', view.state.right)
  drawBridge(ctx, view)
  drawFlashlight(ctx, view)
  drawMovers(ctx, view)
  drawTimeBar(ctx, view)

  if (view.phase === 'fail') {
    drawOverlay(ctx, w, h, '超时', '累计 ' + String(view.state.elapsed) + 's 超过限时 ' + String(view.level.limit) + 's · 按 R 重来', THEME.bad)
  } else if (view.phase === 'won') {
    const subtitle = view.allClear
      ? '五关全部通关'
      : '用时 ' + String(view.state.elapsed) + 's（限时 ' + String(view.level.limit) + 's）'
    drawOverlay(ctx, w, h, view.allClear ? '全部通关' : '过关', subtitle, THEME.good)
  } else if (view.phase === 'paused') {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
