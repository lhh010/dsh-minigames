/**
 * 传送带工厂 Factory 渲染层：工厂蓝图风网格盘面、箭头传送带（随朝向
 * 旋转）、配方机器（字形 + 配方角标 + 产出进度条）、出口源 / 需求槽、
 * 物料色点流动、堵死红闪、需求进度条、放置余量与运行 tick HUD、
 * 悬停幽灵预览、过关 / 超时 / 暂停 overlay。全部为纯 canvas 绘制；
 * 状态由 index.ts 持有并注入 FactoryView，本模块不持有可变状态。
 */
import {
  THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair,
  type ParticleSystem,
} from '../theme.ts'
import {
  CELL_ROCK, CELL_SOURCE, CELL_DEMAND, DX, DY,
  type Dir, type FactoryLevel, type FactorySim, type MachineKind, type Mat, type Placement,
} from './logic.ts'

/** 逻辑画布尺寸（720×512，fitCanvas 负责适配宿主）。 */
export const VIEW_W = 720
export const VIEW_H = 512

/** 盘面区域（HUD 之下、需求进度条之上）。 */
const BOARD_TOP = 46
const BOARD_BOTTOM = 386
/** 需求进度条行（盘面与工具面板之间）。 */
const DEMAND_ROW_Y = 396
const DEMAND_ROW_H = 22
/** 工具面板按钮行。 */
const PALETTE_Y = 424
const PALETTE_H = 40
const BTN_W = 108
const BTN_GAP = 8
/** 常驻玩法速览基线。 */
const HINT_Y = 486

/** 物料显示色（点、源、需求槽共用）。 */
export const MAT_COLOR: Readonly<Record<Mat, string>> = {
  A: '#7dcfff', B: '#73daca', A2: '#9ece6a', B2: '#bb9af7', C: '#e0af68', D: '#f7768e',
}

/** 渲染所需的全部游戏状态（index.ts 持有并逐帧注入）。 */
export interface FactoryView {
  /** 当前关卡。 */
  level: FactoryLevel
  /** 玩家放置（带 + 机器）。 */
  placements: Placement[]
  /** 当前工具：'belt' | 'erase' | 机器 id。 */
  tool: string
  /** 放置朝向（幽灵预览与新放置共用）。 */
  cursorDir: Dir
  /** 悬停格（画布坐标换算；无悬停为 null）。 */
  hover: { x: number; y: number } | null
  /** edit=摆盘 / run=模拟中 / won=过关 / fail=超时未达标。 */
  mode: 'edit' | 'run' | 'won' | 'fail'
  /** 暂停中（叠加 overlay）。 */
  paused: boolean
  /** 短暂提示文本与剩余毫秒。 */
  message: string
  messageTtl: number
  /** 关卡总数（HUD 显示 N/总数）。 */
  levelCount: number
  /** 运行中的模拟器（edit 态为 null）。 */
  sim: FactorySim | null
  /** 超时原因文案。 */
  failReason: string
  /** 过关 / 交付粒子。 */
  particles: ParticleSystem
  /** 累计时长 ms（红闪与呼吸相位）。 */
  time: number
}

/** 盘面几何：格边长与原点。 */
export interface BoardMetrics { cell: number; bx: number; by: number }

/**
 * 计算盘面几何（等比缩放居中，含左右与上下边距）。
 * @param level 当前关卡。
 * @returns 格边长与盘面原点。
 */
export function boardMetrics(level: FactoryLevel): BoardMetrics {
  const cell = Math.floor(Math.min((VIEW_W - 32) / level.w, (BOARD_BOTTOM - BOARD_TOP - 8) / level.h))
  const bx = (VIEW_W - cell * level.w) / 2
  const by = BOARD_TOP + (BOARD_BOTTOM - BOARD_TOP - cell * level.h) / 2
  return { cell, bx, by }
}

/**
 * 画布坐标 → 悬停格。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @param level 当前关卡。
 * @returns 格坐标，盘外返回 null。
 */
export function cellAt(px: number, py: number, level: FactoryLevel): { x: number; y: number } | null {
  const m = boardMetrics(level)
  const x = Math.floor((px - m.bx) / m.cell)
  const y = Math.floor((py - m.by) / m.cell)
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null
  return { x, y }
}

/** 工具面板按钮描述。 */
export interface PaletteButton { label: string; tool: string }

/**
 * 工具面板按钮列表（传送带 + 各关机器 + 擦除）。
 * @param level 当前关卡。
 * @returns 按钮描述数组。
 */
export function paletteButtons(level: FactoryLevel): PaletteButton[] {
  const buttons: PaletteButton[] = [{ label: '传送带', tool: 'belt' }]
  for (const m of level.machines) buttons.push({ label: m.glyph + ' ' + m.name, tool: m.id })
  buttons.push({ label: '擦除', tool: 'erase' })
  return buttons
}

/**
 * 第 index 个工具按钮矩形（整行居中）。
 * @param index 按钮序号。
 * @param count 按钮总数。
 * @returns 矩形 {x, y, w, h}。
 */
export function paletteRect(index: number, count: number): { x: number; y: number; w: number; h: number } {
  const total = count * (BTN_W + BTN_GAP) - BTN_GAP
  return { x: (VIEW_W - total) / 2 + index * (BTN_W + BTN_GAP), y: PALETTE_Y, w: BTN_W, h: PALETTE_H }
}

/**
 * 命中测试：点击坐标落在哪个工具按钮。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @param level 当前关卡。
 * @returns 按钮 tool 标识，未命中返回 null。
 */
export function paletteHit(px: number, py: number, level: FactoryLevel): string | null {
  const buttons = paletteButtons(level)
  for (let i = 0; i < buttons.length; i += 1) {
    const r = paletteRect(i, buttons.length)
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return buttons[i]!.tool
  }
  return null
}

/**
 * 第 index 个需求进度条矩形（整行等分居中，间隔 24）。
 * @param index 需求槽序号。
 * @param count 需求槽数。
 * @returns 矩形 {x, y, w, h}。
 */
export function demandRect(index: number, count: number): { x: number; y: number; w: number; h: number } {
  const areaX = 32
  const areaW = VIEW_W - 64
  const w = (areaW - (count - 1) * 24) / count
  return { x: areaX + index * (w + 24), y: DEMAND_ROW_Y, w, h: DEMAND_ROW_H }
}

/** 朝向 → 画布角度（0=向上，顺时针）。 */
function dirAngle(dir: Dir): number {
  return dir * Math.PI / 2
}

/** 在格心画一个朝向 chevron（传送带纹理）。 */
function drawChevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, size: number, color: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(dirAngle(dir))
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  // ∧ 形（局部朝上）：canvas y 向下，原 ∨ 形恰与 dir=0(上) 反向——所有朝向都标反。
  ctx.beginPath()
  ctx.moveTo(-size, size * 0.6)
  ctx.lineTo(0, -size * 0.4)
  ctx.lineTo(size, size * 0.6)
  ctx.stroke()
  ctx.restore()
}

/** 配方角标文案（如 'A+B→C'）。 */
function recipeText(kind: MachineKind): string {
  const ins = (Object.keys(kind.inputs) as Mat[]).map((m) => m).join('+')
  return ins + '→' + kind.output
}

/**
 * 渲染一帧：背景 → HUD → 盘面（格 / 带 / 机器 / 源 / 需求 / 物料 / 红闪 /
 * 幽灵预览）→ 需求进度条 → 工具面板 → 提示 / 速览 → 粒子 → overlay。
 * @param ctx 画布上下文（fitCanvas 已施加逻辑坐标变换）。
 * @param view 游戏状态。
 * @param dtMs 本帧毫秒（粒子推进用）。
 */
export function renderFactory(ctx: CanvasRenderingContext2D, view: FactoryView, dtMs: number): void {
  const level = view.level
  const m = boardMetrics(level)
  drawBackground(ctx, VIEW_W, VIEW_H)
  ctx.textBaseline = 'alphabetic'

  // HUD 三列：关卡（16）/ 放置（300，列距充分防长关名溢出）/ 运行（右缘 704）
  hudPair(ctx, 16, 26, '关卡', String(level.id + 1) + '/' + String(view.levelCount) + ' · ' + level.name)
  hudPair(ctx, 300, 26, '放置', String(view.placements.length) + '/' + String(level.maxPieces), 'left',
    view.placements.length >= level.maxPieces ? THEME.gold : THEME.text)
  const rightLabel = view.mode === 'run' && view.sim !== null ? 'tick' : '限时'
  const rightValue = view.mode === 'run' && view.sim !== null
    ? String(view.sim.tick) + '/' + String(level.ticks)
    : String(level.ticks) + ' tick'
  hudPair(ctx, VIEW_W - 16, 26, rightLabel, rightValue, 'right',
    view.mode === 'run' ? accent(0) : THEME.text)

  // 盘面格子底
  for (let y = 0; y < level.h; y += 1) {
    for (let x = 0; x < level.w; x += 1) {
      const cx = m.bx + x * m.cell
      const cy = m.by + y * m.cell
      const c = level.cells[y * level.w + x]!
      ctx.fillStyle = '#191926'
      ctx.fillRect(cx, cy, m.cell - 1, m.cell - 1)
      if (c === CELL_ROCK) {
        ctx.fillStyle = '#2c2c42'
        ctx.fillRect(cx + 2, cy + 2, m.cell - 5, m.cell - 5)
        ctx.strokeStyle = 'rgba(226,226,238,0.12)'
        ctx.lineWidth = 1
        ctx.strokeRect(cx + 5.5, cy + 5.5, m.cell - 11, m.cell - 11)
      }
    }
  }

  // 固定元素：出口源（物料色块 + 产出朝向箭头）与需求槽
  for (const s of level.sources) {
    const cx = m.bx + s.x * m.cell
    const cy = m.by + s.y * m.cell
    const color = MAT_COLOR[s.kind]
    ctx.fillStyle = '#22222f'
    roundRectPath(ctx, cx + 2, cy + 2, m.cell - 5, m.cell - 5, 5)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    roundRectPath(ctx, cx + 2.5, cy + 2.5, m.cell - 6, m.cell - 6, 5)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = 'bold ' + Math.max(10, Math.floor(m.cell / 3)) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(s.kind, cx + m.cell / 2 - 0.5, cy + m.cell / 2 + Math.floor(m.cell / 10))
    drawChevron(ctx, cx + m.cell / 2 - 0.5 + DX[s.dir]! * m.cell * 0.3,
      cy + m.cell / 2 - 0.5 + DY[s.dir]! * m.cell * 0.3, s.dir, m.cell * 0.1, 'rgba(226,226,238,0.5)')
  }
  for (const d of level.demands) {
    const cx = m.bx + d.x * m.cell
    const cy = m.by + d.y * m.cell
    const color = MAT_COLOR[d.product]
    const got = view.sim !== null ? view.sim.demandCounts[level.demands.indexOf(d)] ?? 0 : 0
    ctx.fillStyle = '#101018'
    roundRectPath(ctx, cx + 2, cy + 2, m.cell - 5, m.cell - 5, 5)
    ctx.fill()
    ctx.strokeStyle = got >= d.quota ? THEME.good : color
    ctx.lineWidth = got >= d.quota ? 2.5 : 1.5
    roundRectPath(ctx, cx + 2.5, cy + 2.5, m.cell - 6, m.cell - 6, 5)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = 'bold ' + Math.max(10, Math.floor(m.cell / 3)) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(d.product, cx + m.cell / 2 - 0.5, cy + m.cell / 2 - Math.floor(m.cell / 12))
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 ' + Math.max(8, Math.floor(m.cell / 4.5)) + 'px system-ui, sans-serif'
    ctx.fillText(String(got) + '/' + String(d.quota), cx + m.cell / 2 - 0.5, cy + m.cell - 5)
  }

  // 玩家放置：传送带（双 chevron 朝向纹理）与机器（字形 + 配方角标 + 进度）
  const machineViews = view.sim !== null ? view.sim.machines() : []
  let machineCursor = 0
  for (const p of view.placements) {
    const cx = m.bx + p.x * m.cell
    const cy = m.by + p.y * m.cell
    if (p.type === 'belt') {
      ctx.fillStyle = '#222230'
      ctx.fillRect(cx + 1, cy + 1, m.cell - 3, m.cell - 3)
      ctx.strokeStyle = 'rgba(122,162,247,0.28)'
      ctx.lineWidth = 1
      ctx.strokeRect(cx + 1.5, cy + 1.5, m.cell - 4, m.cell - 4)
      const half = m.cell / 2 - 0.5
      drawChevron(ctx, cx + half - DX[p.dir]! * m.cell * 0.16, cy + half - DY[p.dir]! * m.cell * 0.16, p.dir, m.cell * 0.14, 'rgba(122,162,247,0.75)')
      drawChevron(ctx, cx + half + DX[p.dir]! * m.cell * 0.16, cy + half + DY[p.dir]! * m.cell * 0.16, p.dir, m.cell * 0.14, 'rgba(122,162,247,0.45)')
    } else {
      const kind = p.machine !== undefined ? level.kindById.get(p.machine) : undefined
      if (kind === undefined) continue
      const mv = machineViews[machineCursor]
      machineCursor += 1
      ctx.fillStyle = '#232335'
      roundRectPath(ctx, cx + 1, cy + 1, m.cell - 3, m.cell - 3, 6)
      ctx.fill()
      ctx.strokeStyle = accent(1)
      ctx.lineWidth = 1.5
      roundRectPath(ctx, cx + 1.5, cy + 1.5, m.cell - 4, m.cell - 4, 6)
      ctx.stroke()
      ctx.fillStyle = accent(1)
      ctx.font = 'bold ' + Math.max(11, Math.floor(m.cell / 2.6)) + 'px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(kind.glyph, cx + m.cell / 2 - 0.5, cy + m.cell / 2)
      ctx.fillStyle = THEME.textMuted
      ctx.font = '600 ' + Math.max(8, Math.floor(m.cell / 5)) + 'px system-ui, sans-serif'
      ctx.fillText(recipeText(kind), cx + m.cell / 2 - 0.5, cy + m.cell - 6)
      // 产出进度条（吞齐原料后倒数）
      if (mv !== undefined && mv.complete) {
        const frac = Math.min(1, mv.progress / mv.period)
        ctx.fillStyle = 'rgba(224,175,104,0.25)'
        ctx.fillRect(cx + 3, cy + 2, m.cell - 7, 3)
        ctx.fillStyle = THEME.gold
        ctx.fillRect(cx + 3, cy + 2, (m.cell - 7) * frac, 3)
      }
      // 出口朝向小箭头
      drawChevron(ctx, cx + m.cell / 2 - 0.5 + DX[p.dir]! * m.cell * 0.36,
        cy + m.cell / 2 - 0.5 + DY[p.dir]! * m.cell * 0.36, p.dir, m.cell * 0.08, 'rgba(226,226,238,0.6)')
    }
  }

  // 物料色点（本 tick 新产出做放大出现动画）
  if (view.sim !== null) {
    for (const it of view.sim.items()) {
      const cx = m.bx + it.x * m.cell + m.cell / 2 - 0.5
      const cy = m.by + it.y * m.cell + m.cell / 2 - 0.5
      const pop = it.fresh ? Math.min(1, (view.time % 1000) / 120) : 1
      const r = m.cell * 0.15 * (0.6 + 0.4 * pop)
      const color = MAT_COLOR[it.kind]
      glow(ctx, color, 7)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    }
    // 堵死红闪
    const flash = 0.35 + 0.25 * Math.sin(view.time / 110)
    for (const i of view.sim.jammed()) {
      const x = i % level.w
      const y = Math.floor(i / level.w)
      ctx.fillStyle = 'rgba(247,118,142,' + flash.toFixed(3) + ')'
      ctx.fillRect(m.bx + x * m.cell + 1, m.by + y * m.cell + 1, m.cell - 3, m.cell - 3)
      ctx.strokeStyle = THEME.bad
      ctx.lineWidth = 1.5
      ctx.strokeRect(m.bx + x * m.cell + 2, m.by + y * m.cell + 2, m.cell - 5, m.cell - 5)
    }
  }

  // 悬停幽灵预览（仅编辑态）
  if (view.mode === 'edit' && view.hover !== null) {
    const i = view.hover.y * level.w + view.hover.x
    const occupied = view.placements.some((p) => p.y * level.w + p.x === i)
    const cx = m.bx + view.hover.x * m.cell
    const cy = m.by + view.hover.y * m.cell
    ctx.setLineDash([4, 3])
    if (view.tool === 'erase') {
      ctx.strokeStyle = occupied ? THEME.bad : 'rgba(226,226,238,0.2)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(cx + 2, cy + 2, m.cell - 5, m.cell - 5)
    } else if (level.cells[i] === 0 && !occupied) {
      ctx.strokeStyle = view.tool === 'belt' ? accent(0) : accent(1)
      ctx.lineWidth = 1.5
      ctx.strokeRect(cx + 2, cy + 2, m.cell - 5, m.cell - 5)
      drawChevron(ctx, cx + m.cell / 2 - 0.5, cy + m.cell / 2 - 0.5, view.cursorDir, m.cell * 0.14, 'rgba(226,226,238,0.6)')
    }
    ctx.setLineDash([])
  }

  // 需求进度条行
  level.demands.forEach((d, di) => {
    const r = demandRect(di, level.demands.length)
    const got = view.sim !== null ? view.sim.demandCounts[di] ?? 0 : 0
    const frac = Math.min(1, got / d.quota)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = got >= d.quota ? THEME.good : THEME.textMuted
    ctx.fillText('订单 ' + d.product + ' ' + String(got) + '/' + String(d.quota), r.x, r.y + 12)
    ctx.fillStyle = 'rgba(226,226,238,0.12)'
    ctx.fillRect(r.x, r.y + 16, r.w, 6)
    ctx.fillStyle = got >= d.quota ? THEME.good : MAT_COLOR[d.product]
    ctx.fillRect(r.x, r.y + 16, r.w * frac, 6)
  })

  // 工具面板按钮（选中高亮）
  const buttons = paletteButtons(level)
  buttons.forEach((btn, i) => {
    const r = paletteRect(i, buttons.length)
    const selected = view.tool === btn.tool
    ctx.fillStyle = selected ? '#2a2a40' : '#22222f'
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 7)
    ctx.fill()
    ctx.strokeStyle = selected ? accent(0) : btn.tool === 'erase' ? 'rgba(247,118,142,0.5)' : 'rgba(122,162,247,0.35)'
    ctx.lineWidth = selected ? 2 : 1
    roundRectPath(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 7)
    ctx.stroke()
    ctx.fillStyle = selected ? THEME.text : THEME.textMuted
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(btn.label, r.x + r.w / 2, r.y + 25)
  })

  // 提示行（有消息时替换速览）
  if (view.message !== '') {
    ctx.fillStyle = THEME.gold
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(view.message, VIEW_W / 2, HINT_Y)
  } else {
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('摆传送带+机器连成线 → Enter 运行 · 需求槽集齐成品过关 · 点击已放件旋转 · 右键移除 · 滚轮转向', VIEW_W / 2, HINT_Y)
  }

  view.particles.tick(ctx, dtMs)

  // overlay：过关 / 超时 / 暂停
  if (view.mode === 'won') {
    drawOverlay(ctx, VIEW_W, VIEW_H, '过关！', '空格：下一关 · R：重开本关', THEME.good)
  } else if (view.mode === 'fail') {
    drawOverlay(ctx, VIEW_W, VIEW_H, '未达标', view.failReason + ' · 空格返回摆盘', THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, VIEW_W, VIEW_H, '已暂停', 'P：继续')
  }
}
