/**
 * 炼金工坊画布渲染：左侧分类元素架（可滚动）、中央工作台两槽与合成
 * 聚合动画（两元素旋转靠拢 + 新元素粒子迸发）、图鉴网格（未发现灰剪影
 * + 编号，已提示元素角标显示已揭示原料）、发现数/里程碑 HUD、过关与
 * 暂停覆盖层。共享 theme 视觉件；渲染本身无状态，全部状态由调用方经
 * AlchemyView 传入。命中检测函数与布局常量同文件导出，供 index 接线。
 */
import { CATEGORY_LABELS, ELEMENTS, ELEMENT_BY_ID, MILESTONES, iconOf, milestoneLevel, nameOf, type ElementCategory } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

export const LOGICAL_W = 640
export const LOGICAL_H = 460
export const HUD_H = 30

/** 元素总数（图鉴计数与 HUD 用）。 */
export const TOTAL_ELEMENTS = ELEMENTS.length

/** 类别展示色（元素架分组标题与格子描边）。 */
const CATEGORY_COLOR: Readonly<Record<ElementCategory, string>> = {
  basic: THEME.gold,
  nature: accent(0),
  material: accent(4),
  life: accent(2),
  civ: accent(1),
}

/* ---------- 元素架（左栏，分类分组 + 滚动） ---------- */

export const SHELF_RECT = { x: 8, y: 38, w: 176, h: LOGICAL_H - 46 } as const
const HEADER_H = 20
const ITEM_H = 24
const ITEM_PAD = 4

/** 元素架的一行（分组标题或元素项）。 */
export interface ShelfRow {
  kind: 'header' | 'item'
  /** 标题文本或元素 id。 */
  key: string
  /** 行顶 y（未滚动坐标）。 */
  y: number
}

/**
 * 计算元素架行布局：按类别分段，段内按发现顺序（state.discovered 的
 * 顺序即库声明顺序的子序列，基本元素总在前）。
 * @param discovered - 已发现元素 id 列表。
 */
export function shelfRows(discovered: readonly string[]): ShelfRow[] {
  const rows: ShelfRow[] = []
  let y = 0
  for (const category of ['basic', 'nature', 'material', 'life', 'civ'] as const) {
    const items = discovered.filter(id => ELEMENT_BY_ID.get(id)?.category === category)
    if (items.length === 0) continue
    rows.push({ kind: 'header', key: category, y })
    y += HEADER_H
    for (const id of items) {
      rows.push({ kind: 'item', key: id, y })
      y += ITEM_H
    }
    y += ITEM_PAD
  }
  return rows
}

/** 元素架最大滚动量（内容不足一屏时为 0）。 */
export function shelfMaxScroll(discovered: readonly string[]): number {
  const rows = shelfRows(discovered)
  const last = rows[rows.length - 1]
  const contentH = last === undefined ? 0 : last.y + ITEM_H
  return Math.max(0, contentH - SHELF_RECT.h)
}

/**
 * 元素架命中检测。
 * @returns 命中的元素 id；空白或未命中返回 null。
 */
export function shelfItemAt(x: number, y: number, scroll: number, discovered: readonly string[]): string | null {
  if (x < SHELF_RECT.x || x > SHELF_RECT.x + SHELF_RECT.w || y < SHELF_RECT.y || y > SHELF_RECT.y + SHELF_RECT.h) return null
  const localY = y - SHELF_RECT.y + scroll
  for (const row of shelfRows(discovered)) {
    if (row.kind !== 'item') continue
    if (localY >= row.y && localY < row.y + ITEM_H) return row.key
  }
  return null
}

/* ---------- 工作台（中央两槽 + 合成） ---------- */

export const SLOT_RECTS = [
  { x: 214, y: 120, w: 86, h: 86 },
  { x: 340, y: 120, w: 86, h: 86 },
] as const
export const RESULT_RECT = { x: 285, y: 252, w: 70, h: 70 } as const

/* ---------- 右列按钮 ---------- */

export interface ButtonRect { x: number; y: number; w: number; h: number; key: 'clear' | 'codex' | 'hint' }
export const BUTTONS: readonly ButtonRect[] = [
  { x: 484, y: 120, w: 148, h: 34, key: 'clear' },
  { x: 484, y: 162, w: 148, h: 34, key: 'codex' },
  { x: 484, y: 204, w: 148, h: 34, key: 'hint' },
]

/** 工作台/按钮命中：返回命中的按钮 key 或槽位下标，未命中 null。 */
export function hitUi(x: number, y: number): 'clear' | 'codex' | 'hint' | 0 | 1 | null {
  for (const btn of BUTTONS) {
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) return btn.key
  }
  for (let i = 0; i < SLOT_RECTS.length; i += 1) {
    const s = SLOT_RECTS[i]!
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return i as 0 | 1
  }
  return null
}

/* ---------- 图鉴网格 ---------- */

export const CODEX_COLS = 8
export const CODEX_CELL_W = 72
export const CODEX_CELL_H = 58
export const CODEX_TOP = 64
/** 图鉴可滚动的最大量。 */
export function codexMaxScroll(): number {
  const rows = Math.ceil(ELEMENTS.length / CODEX_COLS)
  return Math.max(0, rows * CODEX_CELL_H - (LOGICAL_H - CODEX_TOP - 10))
}

/* ---------- 视图状态 ---------- */

/** 渲染一帧所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface AlchemyView {
  /** 已发现元素 id（发现顺序）。 */
  discovered: string[]
  /** 工作台两槽内容（null = 空）。 */
  slots: Array<string | null>
  /** 最近一次合成/提示的结果提示文案。 */
  message: string
  /** 文案情绪：good=发现，bad=无反应，info=其余。 */
  messageKind: 'good' | 'bad' | 'info'
  /** 进行中的合成动画（t: 0..1）；result 为 null 表示无配方（消散动画）。 */
  merge: { a: string; b: string; result: string | null; t: number } | null
  shelfScroll: number
  codexOpen: boolean
  codexScroll: number
  paused: boolean
  /** 刚达成的里程碑关卡（1..5），显示过关覆盖层，空格继续。 */
  clearedLevel: number | null
  /** 第 5 里程碑达成（通关）。 */
  complete: boolean
  /** 剩余提示次数。 */
  hintBudget: number
  /** 已揭示的半提示（元素 id → 原料 id）。 */
  hints: Record<string, string>
  score: number
}

/* ---------- 绘制 ---------- */

function drawHud(ctx: CanvasRenderingContext2D, view: AlchemyView): void {
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  const count = view.discovered.length
  const level = milestoneLevel(count)
  hudPair(ctx, 10, 20, '发现 ', count + '/' + TOTAL_ELEMENTS)
  const next = MILESTONES[level]
  const milestoneText = next === undefined ? '已通关' : 'L' + level + ' → ' + next + ' 种'
  hudPair(ctx, 150, 20, '里程碑 ', milestoneText, 'left', level > 0 ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W - 10, 20, ' 分数 ', String(view.score), 'right')
}

function drawShelf(ctx: CanvasRenderingContext2D, view: AlchemyView): void {
  const rect = SHELF_RECT
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
  ctx.clip()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const inSlot0 = view.slots[0]
  const inSlot1 = view.slots[1]
  for (const row of shelfRows(view.discovered)) {
    const y = rect.y + row.y - view.shelfScroll
    if (y < rect.y - ITEM_H || y > rect.y + rect.h) continue
    if (row.kind === 'header') {
      const category = row.key as ElementCategory
      ctx.fillStyle = CATEGORY_COLOR[category]
      ctx.fillText(CATEGORY_LABELS[category], rect.x + 10, y + HEADER_H / 2)
      continue
    }
    const def = ELEMENT_BY_ID.get(row.key)
    if (def === undefined) continue
    const selected = inSlot0 === row.key || inSlot1 === row.key
    roundRectPath(ctx, rect.x + 6, y + 1, rect.w - 12, ITEM_H - 3, 6)
    ctx.fillStyle = selected ? 'rgba(122,162,247,0.16)' : 'rgba(255,255,255,0.03)'
    ctx.fill()
    if (selected) {
      ctx.strokeStyle = accent(0)
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.font = '15px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(def.icon, rect.x + 12, y + ITEM_H / 2)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = selected ? accent(0) : THEME.text
    ctx.fillText(def.name, rect.x + 36, y + ITEM_H / 2)
  }
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('元素架 · 滚轮翻动', rect.x + 8, rect.y + rect.h - 6)
}

/** 单个元素卡（槽位/结果）：图标居中 + 名字居下；空槽画虚线框。 */
function drawSlotBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, id: string | null, label: string, highlight: string | null): void {
  roundRectPath(ctx, x, y, w, h, 12)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = highlight ?? THEME.panelEdge
  ctx.lineWidth = highlight === null ? 1.5 : 2
  if (highlight !== null) glow(ctx, highlight, 8)
  ctx.stroke()
  noGlow(ctx)
  if (id === null) {
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = THEME.panelEdge
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.textAlign = 'center'
    ctx.fillText(label, x + w / 2, y + h / 2 + 4)
    return
  }
  const def = ELEMENT_BY_ID.get(id)
  ctx.textAlign = 'center'
  ctx.font = Math.round(h * 0.42) + 'px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(def?.icon ?? '❓', x + w / 2, y + h * 0.52)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(def?.name ?? '?', x + w / 2, y + h - 9)
}

/** 合成动画：两元素从槽位旋转靠拢聚合（无配方则中点消散）。 */
function drawMerge(ctx: CanvasRenderingContext2D, view: AlchemyView): void {
  if (view.merge === null) return
  const merge = view.merge
  const t = Math.min(1, merge.t)
  const ease = t * t * (3 - 2 * t)
  const cx = (SLOT_RECTS[0].x + SLOT_RECTS[1].x + SLOT_RECTS[1].w) / 2
  const cy = SLOT_RECTS[0].y + SLOT_RECTS[0].h / 2
  const angle = ease * Math.PI * 2
  const spiral = 0.42 + 0.58 * (1 - ease)
  const drawOrb = (id: string, side: number): void => {
    const baseX = (side === 0 ? SLOT_RECTS[0].x + SLOT_RECTS[0].w / 2 : SLOT_RECTS[1].x + SLOT_RECTS[1].w / 2)
    const x = cx + (baseX - cx) * spiral
    const y = cy + Math.sin(angle + side * Math.PI) * 26 * spiral
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle * (side === 0 ? 1 : -1))
    ctx.font = Math.round(26 + 10 * ease) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = 1 - ease * 0.85
    ctx.fillText(iconOf(id), 0, 0)
    ctx.restore()
  }
  drawOrb(merge.a, 0)
  drawOrb(merge.b, 1)
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = 1
}

function drawBench(ctx: CanvasRenderingContext2D, view: AlchemyView): void {
  // 区块底板。
  roundRectPath(ctx, 200, 60, 240, 280, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.02)'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText('⚗ 炼金工作台', 320, 84)
  drawSlotBox(ctx, SLOT_RECTS[0].x, SLOT_RECTS[0].y, SLOT_RECTS[0].w, SLOT_RECTS[0].h, view.slots[0] ?? null, '原料 1', accent(0))
  drawSlotBox(ctx, SLOT_RECTS[1].x, SLOT_RECTS[1].y, SLOT_RECTS[1].w, SLOT_RECTS[1].h, view.slots[1] ?? null, '原料 2', accent(1))
  ctx.font = '700 24px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('+', 320, 172)
  drawMerge(ctx, view)
  // 结果位：动画结束且成功时定格新元素。
  const resultId = view.merge === null && view.messageKind === 'good' ? lastDiscoveredPreview(view) : null
  drawSlotBox(ctx, RESULT_RECT.x, RESULT_RECT.y, RESULT_RECT.w, RESULT_RECT.h, resultId, '产物', null)
  if (resultId !== null) {
    glow(ctx, THEME.good, 10)
    ctx.strokeStyle = THEME.good
    ctx.lineWidth = 2
    roundRectPath(ctx, RESULT_RECT.x, RESULT_RECT.y, RESULT_RECT.w, RESULT_RECT.h, 12)
    ctx.stroke()
    noGlow(ctx)
  }
  // 结果文案。
  const kindColor = view.messageKind === 'good' ? THEME.good : view.messageKind === 'bad' ? THEME.bad : THEME.textMuted
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = kindColor
  ctx.fillText(view.message, 320, 344)
}

/** 产物位预览：最近发现的元素（仅 message 为发现时调用）。 */
function lastDiscoveredPreview(view: AlchemyView): string | null {
  if (view.discovered.length === 0) return null
  return view.discovered[view.discovered.length - 1] ?? null
}

function drawButtons(ctx: CanvasRenderingContext2D, view: AlchemyView): void {
  const labels: Partial<Record<ButtonRect['key'], string>> = {
    clear: '清空两槽 ✕',
    codex: view.codexOpen ? '关闭图鉴 Tab' : '元素图鉴 Tab',
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 14px system-ui, sans-serif'
  for (const btn of BUTTONS) {
    roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 8)
    const isHint = btn.key === 'hint'
    const active = !isHint || view.hintBudget > 0
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = active ? accent(5) : THEME.panelEdge
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.globalAlpha = active ? 1 : 0.55
    ctx.fillStyle = THEME.text
    const text = isHint ? '提示 H（剩 ' + view.hintBudget + '）' : labels[btn.key] ?? ''
    ctx.fillText(text, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1)
    ctx.globalAlpha = 1
  }
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('R 重开 · P 暂停', 484, 262)
  ctx.fillText('点元素入槽 · 两槽齐自动合成', 484, 280)
  // 已揭示的提示列表。
  const entries = Object.entries(view.hints)
  let y = 302
  ctx.fillText('已获提示：', 484, y)
  y += 18
  for (const [element, ingredient] of entries) {
    if (y > LOGICAL_H - 14) break
    ctx.fillText(iconOf(ingredient) + ' → ❔ ' + '(第' + (ELEMENTS.findIndex(e => e.id === element) + 1) + '号)', 492, y)
    y += 17
  }
}

/** 图鉴覆盖层：全部元素稳定网格；未发现灰剪影 + 编号；已提示角标原料。 */
function drawCodex(ctx: CanvasRenderingContext2D, view: AlchemyView): void {
  ctx.fillStyle = 'rgba(13,13,20,0.9)'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.textAlign = 'center'
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(spaced('元素图鉴'), LOGICAL_W / 2, 34)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(view.discovered.length + ' / ' + TOTAL_ELEMENTS + ' · Tab 关闭 · 滚轮翻动', LOGICAL_W / 2, 52)
  const discovered = new Set(view.discovered)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, CODEX_TOP, LOGICAL_W, LOGICAL_H - CODEX_TOP)
  ctx.clip()
  ctx.textBaseline = 'middle'
  for (let i = 0; i < ELEMENTS.length; i += 1) {
    const def = ELEMENTS[i]!
    const col = i % CODEX_COLS
    const row = Math.floor(i / CODEX_COLS)
    const x = 12 + col * CODEX_CELL_W
    const y = CODEX_TOP + row * CODEX_CELL_H - view.codexScroll
    if (y < CODEX_TOP - CODEX_CELL_H || y > LOGICAL_H) continue
    const found = discovered.has(def.id)
    roundRectPath(ctx, x, y, CODEX_CELL_W - 6, CODEX_CELL_H - 6, 8)
    ctx.fillStyle = found ? 'rgba(122,162,247,0.10)' : 'rgba(255,255,255,0.02)'
    ctx.fill()
    ctx.strokeStyle = found ? CATEGORY_COLOR[def.category] : THEME.panelEdge
    ctx.lineWidth = found ? 1.5 : 1
    ctx.stroke()
    if (found) {
      ctx.font = '20px system-ui, sans-serif'
      ctx.fillStyle = THEME.text
      ctx.fillText(def.icon, x + (CODEX_CELL_W - 6) / 2, y + 18)
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.fillText(def.name, x + (CODEX_CELL_W - 6) / 2, y + 38)
    } else {
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText('?', x + (CODEX_CELL_W - 6) / 2, y + 16)
      ctx.fillText('#' + (i + 1), x + (CODEX_CELL_W - 6) / 2, y + 36)
      const hint = view.hints[def.id]
      if (hint !== undefined) {
        ctx.font = '13px system-ui, sans-serif'
        ctx.fillText(iconOf(hint), x + CODEX_CELL_W - 18, y + 12)
      }
    }
  }
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
}

/**
 * 绘制一帧主场景（图鉴开启时画图鉴覆盖层，否则工作台）。
 * @param ctx - 逻辑坐标系下的 2d 上下文（fitCanvas 已设 transform）。
 * @param view - 当前视图状态。
 */
export function renderAlchemy(ctx: CanvasRenderingContext2D, view: AlchemyView): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawHud(ctx, view)
  if (view.codexOpen) {
    drawCodex(ctx, view)
  } else {
    drawShelf(ctx, view)
    drawBench(ctx, view)
    drawButtons(ctx, view)
  }
  if (view.complete) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '图鉴大成', '五段里程碑全部达成 · 空格再来一局', THEME.gold)
    return
  }
  if (view.clearedLevel !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '里程碑 ' + view.clearedLevel, '发现 ' + MILESTONES[view.clearedLevel - 1]! + ' 种元素 · 空格继续', THEME.gold)
    return
  }
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P 继续 · R 重开', THEME.text)
  }
}