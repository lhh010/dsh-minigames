/**
 * 字母矩阵渲染：左列 5×5 字母瓦片（选词链高亮连线、已找出词按词着色
 * 锁定）、右列逐词线索卡（长度→方向→首字母位置逐级揭示，翻页动
 * 画）、顶部 HUD（关卡/尝试/提示/得分）、过关/失败/暂停 overlay。纯
 * canvas 绘制，无状态；全部几何常量导出供命中测试。
 */
import { accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, THEME, spaced } from '../theme.ts'
import { DIRS, LEVELS, MAX_ATTEMPTS, SIZE, startPosText, type TargetWord, type WordGridState } from './logic.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 660
export const LOGICAL_H = 620

/** 顶部 HUD 高度。 */
const HUD_H = 44

/** 盘面几何：格边长、格隙与左上原点。 */
const CELL = 76
const GAP = 10
const BOARD_X = 16
const BOARD_Y = HUD_H + 22
/** 盘面像素边长（5 格 + 4 隙）。 */
const BOARD_PX = CELL * SIZE + GAP * (SIZE - 1)

/** 右列线索卡几何。 */
const CARD_X = BOARD_X + BOARD_PX + 18
const CARD_W = LOGICAL_W - CARD_X - 16
const CARD_H = 92
const CARD_GAP = 10
const CARD_Y = BOARD_Y + 6

/** 传给 renderWordGrid 的一次完整视图。 */
export interface WordGridView {
  /** 关卡状态（盘面/目标词/提示档位/尝试/得分/阶段）。 */
  readonly state: WordGridState
  /** 当前选词链（格子序号序列）。 */
  readonly chain: readonly number[]
  /** 刚揭示的提示：目标词下标与时间戳（翻页动画用），无则 index < 0。 */
  readonly hintIndex: number
  readonly hintAtMs: number
  /** 底部提示文案（空串隐藏）。 */
  readonly message: string
  /** 是否暂停（外部 P 键）。 */
  readonly paused: boolean
}

/** 格子序号 → 瓦片左上角坐标。
 * @param cell - 格子序号。
 * @returns 左上角坐标。 */
export function tileOrigin(cell: number): { x: number; y: number } {
  const step = CELL + GAP
  return { x: BOARD_X + (cell % SIZE) * step, y: BOARD_Y + Math.floor(cell / SIZE) * step }
}

/** 格子序号 → 瓦片中心坐标。
 * @param cell - 格子序号。
 * @returns 中心坐标。 */
export function tileCenter(cell: number): { x: number; y: number } {
  const o = tileOrigin(cell)
  return { x: o.x + CELL / 2, y: o.y + CELL / 2 }
}

/** 逻辑坐标 → 格子序号（点击命中测试）。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 格子序号，格隙或盘外为 -1。 */
export function tileAt(x: number, y: number): number {
  const step = CELL + GAP
  const col = Math.floor((x - BOARD_X) / step)
  const row = Math.floor((y - BOARD_Y) / step)
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return -1
  if (x - BOARD_X - col * step >= CELL || y - BOARD_Y - row * step >= CELL) return -1
  return row * SIZE + col
}

/** 提示卡区域下标（点击卡也可翻提示由 index.ts 决定，这里只给几何）。
 * @param y - 逻辑 y。
 * @returns 目标词下标，卡外为 -1。 */
export function cardAt(y: number): number {
  const idx = Math.floor((y - CARD_Y) / (CARD_H + CARD_GAP))
  if (idx < 0) return -1
  return idx
}

/** 找出词的锁定色（按目标词下标取稳定 accent）。 */
function lockColor(index: number): string {
  return accent(index + 1)
}

/** 画一颗字母瓦片：底色 + 字母，选中/锁定状态变色。 */
function drawTile(
  ctx: CanvasRenderingContext2D, cell: number, letter: string,
  lock: string | null, selected: boolean,
): void {
  const o = tileOrigin(cell)
  const color = lock ?? THEME.panel
  ctx.fillStyle = selected ? accent(0) : color
  if (lock !== null || selected) {
    glow(ctx, selected ? accent(0) : lock!, selected ? 14 : 6)
    ctx.globalAlpha = selected ? 0.95 : 0.92
    roundRectPath(ctx, o.x, o.y, CELL, CELL, 12)
    ctx.fill()
    ctx.globalAlpha = 1
    noGlow(ctx)
  } else {
    roundRectPath(ctx, o.x, o.y, CELL, CELL, 12)
    ctx.fill()
  }
  ctx.strokeStyle = selected ? '#c9d7ff' : THEME.panelEdge
  ctx.lineWidth = selected ? 2.5 : 1.5
  roundRectPath(ctx, o.x, o.y, CELL, CELL, 12)
  ctx.stroke()
  ctx.font = 'bold 32px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = selected || lock !== null ? '#ffffff' : THEME.text
  ctx.fillText(letter, o.x + CELL / 2, o.y + CELL / 2 + 1)
  ctx.textBaseline = 'alphabetic'
}

/** 画选词链连线（依序穿过各瓦片中心的发光折线）。 */
function drawChainLine(ctx: CanvasRenderingContext2D, chain: readonly number[]): void {
  if (chain.length < 2) return
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  glow(ctx, accent(0), 8)
  ctx.beginPath()
  for (let i = 0; i < chain.length; i += 1) {
    const c = tileCenter(chain[i]!)
    if (i === 0) ctx.moveTo(c.x, c.y)
    else ctx.lineTo(c.x, c.y)
  }
  ctx.stroke()
  noGlow(ctx)
}

/** 一张线索卡：已找出→词+勾；未找出→按档位显示 长度/方向/首字母位
 * 置；刚揭示时 400ms 翻页（纵向压缩模拟翻卡）。 */
function drawClueCard(
  ctx: CanvasRenderingContext2D, target: TargetWord, stage: number, index: number,
  hintIndex: number, hintAtMs: number, now: number,
): void {
  const y = CARD_Y + index * (CARD_H + CARD_GAP)
  const isHintCard = hintIndex === index && now - hintAtMs < 400
  let scaleY = 1
  if (isHintCard) {
    const p = Math.min(1, (now - hintAtMs) / 400)
    scaleY = Math.abs(Math.cos(p * Math.PI)) * 0.9 + 0.1
  }
  const color = target.found ? lockColor(index) : THEME.panel
  ctx.save()
  ctx.translate(CARD_X, y)
  if (isHintCard) {
    ctx.translate(CARD_W / 2, CARD_H / 2)
    ctx.scale(1, scaleY)
    ctx.translate(-CARD_W / 2, -CARD_H / 2)
  }
  ctx.fillStyle = color
  roundRectPath(ctx, 0, 0, CARD_W, CARD_H, 10)
  ctx.fill()
  ctx.strokeStyle = target.found ? lockColor(index) : THEME.panelEdge
  ctx.lineWidth = 1.5
  roundRectPath(ctx, 0, 0, CARD_W, CARD_H, 10)
  ctx.stroke()
  const pad = 12
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const tag = target.found ? '词 ' + (index + 1) + ' · 已找出' : '词 ' + (index + 1) + ' · ' + (stage > 0 ? '线索 x' + stage : '未知')
  ctx.fillText(tag, pad, 22)
  if (target.found) {
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillStyle = '#ffffff'
    glow(ctx, lockColor(index), 8)
    ctx.fillText(target.word, pad, 54)
    noGlow(ctx)
  } else if (stage <= 0) {
    ctx.font = 'bold 26px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('？？？', pad, 58)
  } else {
    ctx.font = '600 15px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText('长度 ' + target.word.length, pad, 44)
    if (stage >= 2) {
      ctx.fillStyle = accent(1)
      ctx.fillText('方向 ' + DIRS[target.dirIdx]!.label, pad, 66)
    }
    if (stage >= 3) {
      ctx.fillStyle = accent(3)
      ctx.fillText('首字母 ' + startPosText(target), pad, 86)
    }
  }
  ctx.restore()
}

/** 阶段 3 才显示首字母位置的渲染开关常量（与 logic MAX_HINT_STAGE 对齐）。 */
const MAX_HINT_STAGE_VISIBLE = 3

/** 渲染一帧完整画面。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param view - 当前视图状态。
 * @param now - performance.now() 时间戳（动画计时）。 */
export function renderWordGrid(ctx: CanvasRenderingContext2D, view: WordGridView, now: number): void {
  const s = view.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(LEVELS[s.level]!.label, 16, 28)
  const warn = s.attemptsLeft <= 3
  hudPair(ctx, LOGICAL_W / 2 - 20, 28, '尝试', String(s.attemptsLeft) + '/' + String(MAX_ATTEMPTS), 'right', warn ? THEME.bad : THEME.text)
  hudPair(ctx, LOGICAL_W - 16, 28, '提示 H', String(s.hintBudget), 'right', accent(3))
  hudPair(ctx, LOGICAL_W - 130, 28, '得分', String(s.score), 'right')

  // 盘面
  const lockByCell = new Map<number, string>()
  s.targets.forEach((t, i) => {
    if (!t.found) return
    for (const c of t.cells) if (!lockByCell.has(c)) lockByCell.set(c, lockColor(i))
  })
  for (let cell = 0; cell < SIZE * SIZE; cell += 1) {
    drawTile(ctx, cell, s.grid[cell]!, lockByCell.get(cell) ?? null, view.chain.includes(cell))
  }
  drawChainLine(ctx, view.chain)

  // 线索卡
  s.targets.forEach((t, i) => drawClueCard(ctx, t, s.hintStage[i]!, i, view.hintIndex, view.hintAtMs, now))

  // 底部消息条
  if (view.message !== '') {
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText(view.message, BOARD_X + BOARD_PX / 2, LOGICAL_H - 14)
  }

  // overlay（暂停/过关/失败/通关）
  if (view.paused && s.phase === 'playing') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P：继续 · R：重开')
  } else if (s.phase === 'cleared') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '关卡完成', spaced('找出全部词') + ' · Enter：下一关 · R：重开', accent(2))
  } else if (s.phase === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关', '得分 ' + s.score + ' · R：再来一局', THEME.gold)
  } else if (s.phase === 'failed') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '尝试用尽', 'R：重开 · H 可看线索复盘', THEME.bad)
  }
}
