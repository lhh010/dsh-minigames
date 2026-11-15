/**
 * 逻辑网格渲染层：木质桌面风格。左侧人名列（行即 1..N 号房），中间 2×2
 * 类别块（块头=类别名，列头=属性值名），右侧线索卡列表（编号+中文文本），
 * ✓ 绿 ✗ 红，推演格淡入，矛盾行高亮，HUD（关卡/用时/提示余量），过关
 * overlay 展示真实解对照。纯绘制，无游戏状态修改。
 */
import {
  CAT_COUNT, CATEGORY_LABELS, COLOR_VALUES, DRINK_VALUES, HOBBY_VALUES, MARK_NO, MARK_YES,
  PET_VALUES, PERSON_NAMES, cellIndex, clueThings, renderClue,
  type PlayerState,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawOverlay, hudPair, roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = 960
export const LOGICAL_H = 640
/** 顶部 HUD 高度。 */
export const HUD_H = 32

/** 木质桌面调色（暖棕系，与面板深色壳对比）。 */
const WOOD = {
  top: '#8a5a33',
  bottom: '#57351c',
  plank: 'rgba(46,26,10,0.35)',
  panel: '#3c2614',
  panelEdge: '#6f4a28',
  header: '#2c1b0c',
  cellA: '#4c3118',
  cellB: '#46290f',
  text: '#f4e8d2',
  muted: 'rgba(244,232,210,0.62)',
  namePlate: '#33200f',
} as const

const CAT_VALUE_NAMES: readonly (readonly string[])[] = [COLOR_VALUES, PET_VALUES, DRINK_VALUES, HOBBY_VALUES]

/** 一个类别块的布局。 */
export interface BlockLayout {
  /** 类别下标。 */
  cat: number
  x: number
  y: number
  w: number
  h: number
  /** 单元格边长。 */
  cell: number
  /** 格区左上角（块内偏移后）。 */
  gridX: number
  gridY: number
}

/** 整帧布局（由人数决定，index 点击命中与 render 共用）。 */
export interface LogiLayout {
  /** 人数。 */
  n: number
  blocks: BlockLayout[]
  /** 人名列参数。 */
  nameX: number
  nameY: number
  rowH: number
  /** 线索面板参数。 */
  clueX: number
  clueY: number
  clueW: number
  clueH: number
}

const GRID_X = 116
const CAT_HEAD = 22
const COL_HEAD = 18
const BLOCK_GAP = 16

/** 计算一帧布局（n≤4 用大格，n=5 用小格以适配 960 宽）。 */
export function getLayout(n: number): LogiLayout {
  const cell = n <= 4 ? 36 : 30
  const blockW = n * cell + 12
  const blockH = CAT_HEAD + COL_HEAD + n * cell + 10
  const blocks: BlockLayout[] = []
  for (let cat = 0; cat < CAT_COUNT; cat += 1) {
    const col = cat % 2
    const row = Math.floor(cat / 2)
    const x = GRID_X + col * (blockW + BLOCK_GAP)
    const y = HUD_H + 10 + row * (blockH + BLOCK_GAP)
    blocks.push({ cat, x, y, w: blockW, h: blockH, cell, gridX: x + 6, gridY: y + CAT_HEAD + COL_HEAD })
  }
  const clueX = GRID_X + 2 * blockW + BLOCK_GAP + 18
  return {
    n,
    blocks,
    nameX: 12,
    nameY: HUD_H + 10 + CAT_HEAD + COL_HEAD,
    rowH: cell,
    clueX,
    clueY: HUD_H + 10,
    clueW: LOGICAL_W - clueX - 12,
    clueH: LOGICAL_H - HUD_H - 22,
  }
}

/** 逻辑坐标命中单元格；未命中返回 null。 */
export function cellAtPoint(layout: LogiLayout, x: number, y: number): { cat: number; p: number; v: number } | null {
  for (const b of layout.blocks) {
    const lx = x - b.gridX
    const ly = y - b.gridY
    if (lx < 0 || ly < 0 || lx >= layout.n * b.cell || ly >= layout.n * b.cell) continue
    return { cat: b.cat, p: Math.floor(ly / b.cell), v: Math.floor(lx / b.cell) }
  }
  return null
}

/** 一帧所需的 UI 状态（index 持有，render 只读）。 */
export interface LogiUi {
  /** 关卡号。 */
  level: number
  /** 已用秒。 */
  elapsed: number
  /** 暂停 overlay。 */
  paused: boolean
  /** 数字键选中的线索下标（-1 无）。 */
  selectedClue: number
  /** 推演格淡入：cellIndex -> 起始 ms。 */
  fade: ReadonlyMap<number, number>
  /** 提示闪烁：cellIndex + 结束 ms。 */
  hintFlash: { index: number; until: number } | null
}

/** 渲染侧效果：过关粒子。 */
const particles = createParticles()
let prevWon = false

/** 木质背景：纵向渐变 + 横向木板缝。 */
function drawWood(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, WOOD.top)
  g.addColorStop(1, WOOD.bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = WOOD.plank
  for (let y = 64; y < h; y += 96) ctx.fillRect(0, y, w, 2)
}

/** 线索卡文本按宽度折行（逐字累加测量）。 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    if (cur !== '' && ctx.measureText(cur + ch).width > maxW) {
      lines.push(cur)
      cur = ch
    } else {
      cur += ch
    }
  }
  if (cur !== '') lines.push(cur)
  return lines
}

/** 画一格 ✓ / ✗。 */
function drawMark(ctx: CanvasRenderingContext2D, mark: number, cx: number, cy: number, alpha: number): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (mark === MARK_YES) {
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillStyle = THEME.good
    ctx.shadowColor = THEME.good
    ctx.shadowBlur = 8
    ctx.fillText('✓', cx, cy + 1)
  } else if (mark === MARK_NO) {
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    ctx.shadowColor = THEME.bad
    ctx.shadowBlur = 6
    ctx.fillText('✗', cx, cy)
  }
  ctx.restore()
}

/** 画完整一帧。 */
export function renderLogigrid(ctx: CanvasRenderingContext2D, st: PlayerState, ui: LogiUi): void {
  const n = st.n
  const layout = getLayout(n)
  const now = performance.now()
  drawWood(ctx, LOGICAL_W, LOGICAL_H)

  // HUD。
  const sec = Math.floor(ui.elapsed)
  const clock = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
  hudPair(ctx, 12, 21, '关卡', String(ui.level) + ' / 5')
  hudPair(ctx, 128, 21, '用时', clock)
  hudPair(ctx, LOGICAL_W - 12, 21, '提示', '✦'.repeat(Math.max(0, st.hintsLeft)) || '无', 'right', st.hintsLeft > 0 ? THEME.gold : THEME.textMuted)

  // 选中线索涉及的事物 → 相关值列高亮集合。
  const litCols = new Set<string>()
  if (ui.selectedClue >= 0 && ui.selectedClue < st.puzzle.clues.length) {
    for (const t of clueThings(st.puzzle.clues[ui.selectedClue]!)) {
      litCols.add(String(t.cat) + ':' + String(t.val))
    }
  }
  // 矛盾行人集合。
  const badRows = new Set<string>()
  for (const c of st.conflicts) badRows.add(String(c.cat) + ':' + String(c.p))

  // 人名列。
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let p = 0; p < n; p += 1) {
    const y = layout.nameY + p * layout.rowH
    const isBad = [...badRows].some((key) => key.split(':')[1] === String(p))
    ctx.fillStyle = isBad ? 'rgba(247,118,142,0.22)' : WOOD.namePlate
    roundRectPath(ctx, layout.nameX, y + 3, 92, layout.rowH - 6, 6)
    ctx.fill()
    ctx.fillStyle = WOOD.muted
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.fillText(String(p + 1) + ' 号房', layout.nameX + 7, y - 5)
    ctx.fillStyle = WOOD.text
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText(PERSON_NAMES[p]!, layout.nameX + 7, y + 6)
  }

  // 类别块。
  for (const b of layout.blocks) {
    ctx.fillStyle = WOOD.panel
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 8)
    ctx.fill()
    ctx.strokeStyle = WOOD.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    // 块头：类别名。
    ctx.fillStyle = WOOD.header
    roundRectPath(ctx, b.x, b.y, b.w, CAT_HEAD, 8)
    ctx.fill()
    ctx.fillStyle = accent(b.cat)
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(CATEGORY_LABELS[b.cat]!, b.x + b.w / 2, b.y + CAT_HEAD / 2 + 1)
    // 列头：属性值名。
    ctx.font = '600 10px system-ui, sans-serif'
    for (let v = 0; v < n; v += 1) {
      const cx = b.gridX + v * b.cell + b.cell / 2
      ctx.fillStyle = litCols.has(String(b.cat) + ':' + String(v)) ? accent(b.cat) : WOOD.muted
      ctx.fillText(CAT_VALUE_NAMES[b.cat]![v]!, cx, b.y + CAT_HEAD + COL_HEAD / 2 + 1)
    }
    // 相关值列底色。
    for (let v = 0; v < n; v += 1) {
      if (!litCols.has(String(b.cat) + ':' + String(v))) continue
      ctx.fillStyle = 'rgba(122,162,247,0.10)'
      ctx.fillRect(b.gridX + v * b.cell, b.gridY, b.cell, n * b.cell)
    }
    // 矛盾行底色。
    for (let p = 0; p < n; p += 1) {
      if (!badRows.has(String(b.cat) + ':' + String(p))) continue
      ctx.fillStyle = 'rgba(247,118,142,0.20)'
      ctx.fillRect(b.gridX, b.gridY + p * b.cell, n * b.cell, b.cell)
    }
    // 单元格棋盘纹 + 标记。
    for (let p = 0; p < n; p += 1) {
      for (let v = 0; v < n; v += 1) {
        const x = b.gridX + v * b.cell
        const y = b.gridY + p * b.cell
        ctx.fillStyle = (p + v) % 2 === 0 ? WOOD.cellA : WOOD.cellB
        ctx.fillRect(x + 1, y + 1, b.cell - 2, b.cell - 2)
        const mark = st.marks[cellIndex(n, b.cat, p, v)]!
        if (mark === 0) continue
        const idx = cellIndex(n, b.cat, p, v)
        let alpha = 1
        const start = ui.fade.get(idx)
        if (start !== undefined && now - start < 260) alpha = Math.max(0.15, (now - start) / 260)
        drawMark(ctx, mark, x + b.cell / 2, y + b.cell / 2, alpha)
      }
    }
    // 格线。
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1
    for (let i = 0; i <= n; i += 1) {
      ctx.beginPath()
      ctx.moveTo(b.gridX + i * b.cell, b.gridY)
      ctx.lineTo(b.gridX + i * b.cell, b.gridY + n * b.cell)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(b.gridX, b.gridY + i * b.cell)
      ctx.lineTo(b.gridX + n * b.cell, b.gridY + i * b.cell)
      ctx.stroke()
    }
  }

  // 提示闪烁环。
  if (ui.hintFlash !== null && now < ui.hintFlash.until) {
    const idx = ui.hintFlash.index
    const cat = Math.floor(idx / (n * n))
    const rest = idx % (n * n)
    const p = Math.floor(rest / n)
    const v = rest % n
    const b = layout.blocks[cat]!
    const pulse = 0.5 + 0.5 * Math.sin(now / 120)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.4 + 0.6 * pulse
    roundRectPath(ctx, b.gridX + v * b.cell + 2, b.gridY + p * b.cell + 2, b.cell - 4, b.cell - 4, 6)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // 线索面板。
  const px = layout.clueX
  const py = layout.clueY
  ctx.fillStyle = WOOD.panel
  roundRectPath(ctx, px, py, layout.clueW, layout.clueH, 8)
  ctx.fill()
  ctx.strokeStyle = WOOD.panelEdge
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.fillStyle = WOOD.text
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.fillText('线索（' + String(st.puzzle.clues.length) + '）', px + 10, py + 16)
  ctx.font = '600 11px system-ui, sans-serif'
  const cardX = px + 8
  let cardY = py + 26
  const cardW = layout.clueW - 16
  st.puzzle.clues.forEach((clue, i) => {
    const text = String(i + 1) + '. ' + renderClue(clue)
    const lines = wrapText(ctx, text, cardW - 14)
    const cardH = 10 + lines.length * 15
    if (i === ui.selectedClue) {
      ctx.fillStyle = 'rgba(122,162,247,0.16)'
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 6)
      ctx.fill()
      ctx.strokeStyle = accent(0)
      ctx.stroke()
      ctx.fillStyle = accent(0)
      ctx.font = 'bold 11px system-ui, sans-serif'
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 6)
      ctx.fill()
      ctx.fillStyle = WOOD.text
      ctx.font = '600 11px system-ui, sans-serif'
    }
    lines.forEach((line, li) => {
      ctx.fillText(line, cardX + 8, cardY + 14 + li * 15)
    })
    cardY += cardH + 5
  })
  ctx.textBaseline = 'alphabetic'

  // 暂停遮罩。
  if (ui.paused && !st.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续推理')
  }

  // 过关：粒子 + overlay + 真实解对照。
  if (st.won) {
    if (!prevWon) particles.burst(LOGICAL_W / 2, LOGICAL_H / 3, THEME.gold, 26, 170)
    particles.tick(ctx, 16)
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '推理完成', '用时 ' + clock + ' · 点击进入下一关')
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    for (let p = 0; p < n; p += 1) {
      const parts: string[] = []
      for (let cat = 0; cat < CAT_COUNT; cat += 1) {
        parts.push(CAT_VALUE_NAMES[cat]![st.puzzle.solution[cat]![p]!]!)
      }
      const line = String(p + 1) + ' 号房 ' + PERSON_NAMES[p]! + '：' + parts.join(' · ')
      ctx.fillStyle = p % 2 === 0 ? WOOD.text : WOOD.muted
      ctx.fillText(line, LOGICAL_W / 2, LOGICAL_H / 2 + 46 + p * 17)
    }
  } else {
    particles.tick(ctx, 16)
  }
  prevWon = st.won
}
