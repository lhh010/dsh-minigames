/**
 * 镜面光线渲染：暗色科技盘面 + 发光激光束（粗辉光线 + 白色流光虚线动
 * 画）、两种斜向高亮条镜面（hover 时旋转预览）、菱形分光镜、被照亮的
 * 水晶彩色脉冲、光源、关卡 HUD 与过关 / 暂停 overlay。纯 canvas 绘制，
 * 无 DOM、无状态（流光相位由调用方传入 nowMs）。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'
import { BOARD_X, BOARD_Y, CELL, H, SIZE, W, type BeamSegment, type LightPathState, type LightResult, type Mirror } from './logic.ts'

/** 格子中心点（逻辑坐标 px）。 */
export function cellCenter(row: number, col: number): { x: number, y: number } {
  return { x: BOARD_X + col * CELL + CELL / 2, y: BOARD_Y + row * CELL + CELL / 2 }
}

/** 激光主色。 */
const BEAM = '#7dcfff'

/**
 * 命中测试：逻辑坐标 (x,y) 落在哪面镜的格子上。
 * @param state - 当前状态。
 * @param x - 逻辑 x px。
 * @param y - 逻辑 y px。
 * @returns 镜数组索引；不在盘面或该格无镜返回 -1。
 */
export function hitMirror(state: LightPathState, x: number, y: number): number {
  const col = Math.floor((x - BOARD_X) / CELL)
  const row = Math.floor((y - BOARD_Y) / CELL)
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return -1
  return state.mirrors.findIndex((m) => m.row === row && m.col === col)
}

/** 盘面底板 + 细网格线。 */
function drawBoard(ctx: CanvasRenderingContext2D): void {
  roundRectPath(ctx, BOARD_X - 8, BOARD_Y - 8, SIZE * CELL + 16, SIZE * CELL + 16, 12)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.strokeStyle = 'rgba(52,52,74,0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i < SIZE; i += 1) {
    ctx.moveTo(BOARD_X + i * CELL, BOARD_Y)
    ctx.lineTo(BOARD_X + i * CELL, BOARD_Y + SIZE * CELL)
    ctx.moveTo(BOARD_X, BOARD_Y + i * CELL)
    ctx.lineTo(BOARD_X + SIZE * CELL, BOARD_Y + i * CELL)
  }
  ctx.stroke()
}

/** 墙块：实心深色砖 + 亮边。 */
function drawWalls(ctx: CanvasRenderingContext2D, state: LightPathState): void {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!state.walls[r]![c]) continue
      const { x, y } = cellCenter(r, c)
      roundRectPath(ctx, x - CELL / 2 + 3, y - CELL / 2 + 3, CELL - 6, CELL - 6, 5)
      ctx.fillStyle = '#2a2a3c'
      ctx.fill()
      ctx.strokeStyle = THEME.panelEdge
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}

/** 一面镜：斜向高亮条（'/' 或 '\\'），hover 时画旋转预览弧。 */
function drawMirror(ctx: CanvasRenderingContext2D, mirror: Mirror, hovered: boolean): void {
  const { x, y } = cellCenter(mirror.row, mirror.col)
  const half = CELL * 0.32
  ctx.save()
  ctx.translate(x, y)
  // 画布 y 向下：rotate(+45°) 顺时针把竖条转成 /（右上-左下），rotate(-45°)
  // 得 \.原实现两者对调——显示与逻辑朝向相反，玩家看到的光路对不上。
  if (mirror.kind === '/') ctx.rotate(Math.PI / 4)
  else ctx.rotate(-Math.PI / 4)
  ctx.fillStyle = hovered ? '#e2e2ee' : '#b7c6f2'
  glow(ctx, hovered ? '#ffffff' : BEAM, hovered ? 14 : 8)
  roundRectPath(ctx, -4, -half, 8, half * 2, 4)
  ctx.fill()
  noGlow(ctx)
  ctx.restore()
  if (hovered) {
    // 旋转预览：绕格中心的浅色虚线圆弧。
    ctx.strokeStyle = 'rgba(226,226,238,0.5)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.arc(x, y, CELL * 0.44, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** 分光镜：菱形轮廓 + 中心亮点。 */
function drawSplitter(ctx: CanvasRenderingContext2D, row: number, col: number, nowMs: number): void {
  const { x, y } = cellCenter(row, col)
  const r = CELL * 0.3
  const pulse = 0.6 + 0.4 * Math.sin(nowMs / 380)
  ctx.strokeStyle = '#bb9af7'
  ctx.lineWidth = 2.5
  glow(ctx, '#bb9af7', 8 + pulse * 6)
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r, y)
  ctx.closePath()
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = '#bb9af7'
  ctx.beginPath()
  ctx.arc(x, y, 3 + pulse * 2, 0, Math.PI * 2)
  ctx.fill()
}

/** 水晶：菱形宝石；被照亮时彩色脉冲 + 辉光，否则暗色轮廓。 */
function drawCrystal(ctx: CanvasRenderingContext2D, state: LightPathState, result: LightResult, index: number, nowMs: number): void {
  const crystal = state.crystals[index]!
  const { x, y } = cellCenter(crystal.row, crystal.col)
  const color = accent(index)
  const isLit = result.lit.has(crystal.row * SIZE + crystal.col)
  const r = CELL * 0.26 + (isLit ? Math.sin(nowMs / 220 + index) * 2.5 : 0)
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.75, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.75, y)
  ctx.closePath()
  if (isLit) {
    ctx.fillStyle = color
    glow(ctx, color, 16)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else {
    ctx.fillStyle = 'rgba(30,30,42,0.9)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(226,226,238,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

/** 激光源：底座方块 + 朝向箭头。 */
function drawSource(ctx: CanvasRenderingContext2D, state: LightPathState): void {
  const { x, y } = cellCenter(state.source.row, state.source.col)
  const angles: Record<string, number> = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }
  roundRectPath(ctx, x - CELL * 0.3, y - CELL * 0.3, CELL * 0.6, CELL * 0.6, 6)
  ctx.fillStyle = '#34344a'
  ctx.fill()
  ctx.strokeStyle = BEAM
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angles[state.source.dir] ?? 0)
  ctx.fillStyle = BEAM
  glow(ctx, BEAM, 10)
  ctx.beginPath()
  ctx.moveTo(CELL * 0.2, 0)
  ctx.lineTo(CELL * 0.04, -6)
  ctx.lineTo(CELL * 0.04, 6)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.restore()
}

/** 一段光束：辉光粗线 + 白色流光虚线（相位随 nowMs 滚动）。 */
function drawSegment(ctx: CanvasRenderingContext2D, seg: BeamSegment, nowMs: number): void {
  const a = cellCenter(seg.r0, seg.c0)
  const b = cellCenter(seg.r1, seg.c1)
  ctx.lineCap = 'round'
  ctx.strokeStyle = BEAM
  glow(ctx, BEAM, 12)
  ctx.lineWidth = 5
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.globalAlpha = 1
  noGlow(ctx)
  // 流光：沿光束滚动的亮色短划。
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.9
  ctx.setLineDash([10, 26])
  ctx.lineDashOffset = -((nowMs / 24) % 36)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

export interface RenderOptions {
  /** 性能时钟（流光 / 脉冲相位）。 */
  nowMs: number
  /** 是否暂停（画暂停 overlay）。 */
  paused: boolean
  /** hover 中的镜索引（null 无）。 */
  hover: number | null
}

/**
 * 整帧绘制：背景 → 盘面 → 光束 → 实体 → HUD → overlay。
 * @param ctx - 逻辑坐标变换后的 2d 上下文。
 * @param state - 当前状态。
 * @param result - 最近一次光路求值结果。
 * @param options - 渲染选项。
 */
export function renderLightPath(
  ctx: CanvasRenderingContext2D, state: LightPathState, result: LightResult, options: RenderOptions,
): void {
  drawBackground(ctx, W, H)
  hudPair(ctx, BOARD_X, 34, '关卡', String(state.level))
  hudPair(ctx, W / 2 - 30, 34, '水晶', result.litCrystals + ' / ' + state.crystals.length, 'left',
    result.litCrystals === state.crystals.length ? THEME.good : THEME.text)
  hudPair(ctx, W - BOARD_X, 34, '翻转', String(state.moves), 'right')
  drawBoard(ctx)
  for (const seg of result.segments) drawSegment(ctx, seg, options.nowMs)
  drawWalls(ctx, state)
  drawSource(ctx, state)
  for (const s of state.splitters) drawSplitter(ctx, s.row, s.col, options.nowMs)
  state.mirrors.forEach((m, i) => { drawMirror(ctx, m, options.hover === i) })
  state.crystals.forEach((_, i) => { drawCrystal(ctx, state, result, i, options.nowMs) })
  if (state.won) {
    drawOverlay(ctx, W, H, '全 部 点 亮', '得分 ' + state.score + ' · Enter 进入下一关', THEME.gold)
  } else if (options.paused) {
    drawOverlay(ctx, W, H, '暂 停', '按 P 继续 · R 重开本关')
  }
}
