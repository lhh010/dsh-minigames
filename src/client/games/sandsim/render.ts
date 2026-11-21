/**
 * 落沙物语渲染：像素粒子（配色 + 金砂闪光）、水流波动、火烧橙红、
 * 工具栏、桶内金砂计数、用量 / 目标 / 计时 HUD、过关 / 失败 / 暂停 overlay。
 */
import { THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair, createParticles } from '../theme.ts'
import { LOGICAL_W, LOGICAL_H, EMPTY, SAND, WATER, OIL, ROCK, FIRE, GOLD, BUCKET, type SandSimState, type Tool } from './logic.ts'

/** 单格边长（逻辑像素）。 */
export const CELL = 11
/** 棋盘可用区：HUD 底（y=60）到工具栏顶（y=402）之间，动态居中。 */
const AREA_TOP = 60
const AREA_BOTTOM = 402

/** 计算棋盘左上角（按关卡尺寸在可用区内居中，含边距）。
 * @param s - 游戏状态。
 */
export function boardOrigin(s: SandSimState): { x: number; y: number } {
  const bw = s.cols * CELL
  const bh = s.rows * CELL
  const x = (LOGICAL_W - bw) / 2
  const y = AREA_TOP + (AREA_BOTTOM - AREA_TOP - bh) / 2
  return { x, y }
}
/** 工具栏：4 键 92x36，间距 12，底对齐 y=402。 */
const TOOL_W = 92
const TOOL_H = 36
const TOOL_GAP = 12
const TOOL_Y = 402
const TOOL_X0 = (LOGICAL_W - (TOOL_W * 4 + TOOL_GAP * 3)) / 2

/** 物质基础配色。 */
const COLORS: Record<number, string> = {
  [SAND]: '#d4b46a',
  [WATER]: '#5fb3e8',
  [OIL]: '#8a6f3d',
  [ROCK]: '#46465c',
  [FIRE]: '#ff9e64',
  [GOLD]: '#ffd75e',
  [BUCKET]: '#23232f',
}

/** 工具按钮文案与剩余量读取器。 */
const TOOLS: Array<{ key: string; label: string; tool: Tool; left: (s: SandSimState) => number }> = [
  { key: '1', label: '挖掘', tool: 'dig', left: (s) => s.digLeft },
  { key: '2', label: '放岩', tool: 'rock', left: (s) => s.rockLeft },
  { key: '3', label: '放水', tool: 'water', left: (s) => s.waterLeft },
  { key: '4', label: '放沙', tool: 'sand', left: (s) => s.sandLeft },
]

/**
 * 整帧绘制（continuous 每帧调用）。
 * @param ctx - 已套用逻辑坐标变换的 2d 上下文。
 * @param s - 游戏状态。
 * @param t - 累计秒（动画相位）。
 * @param tool - 当前选中工具。
 * @param simPaused - 模拟是否暂停（空格）。
 */
export function renderSandSim(ctx: CanvasRenderingContext2D, s: SandSimState, t: number, tool: Tool, simPaused: boolean): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawBoard(ctx, s, t)
  drawHud(ctx, s)
  drawToolbar(ctx, s, tool)
  drawHint(ctx, simPaused)
  if (s.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', '收集金砂 ' + s.collected + '/' + s.quota + '，按 R 进入下一关', THEME.good)
  } else if (s.over) {
    const why = s.timeLeft <= 0 ? '时间耗尽' : '剩余金砂已不足目标'
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '失败', why + '，按 R 重试本关', THEME.bad)
  } else if (simPaused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按空格继续模拟', THEME.textMuted)
  }
}

/** 画布内一行常驻速览（棋盘下方、工具栏上方之间的底部提示行）。 */
function drawHint(ctx: CanvasRenderingContext2D, simPaused: boolean): void {
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  const tip = simPaused ? '模拟已暂停：空格继续 · 拖拽=连续用工具' : '挖岩引金砂入桶 · 水灭火 · 火烧金砂'
  ctx.fillText(tip, LOGICAL_W / 2, 460)
}

/** 棋盘：面板底 + 逐格像素粒子 + 外框。 */
function drawBoard(ctx: CanvasRenderingContext2D, s: SandSimState, t: number): void {
  const { x: bx, y: by } = boardOrigin(s)
  const bw = s.cols * CELL
  const bh = s.rows * CELL
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, bx - 6, by - 6, bw + 12, bh + 12, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  const phase = Math.floor(t * 8)
  for (let r = 0; r < s.rows; r += 1) {
    for (let c = 0; c < s.cols; c += 1) {
      const v = s.grid[r]![c]!
      if (v === EMPTY) continue
      const x = bx + c * CELL
      const y = by + r * CELL
      if (v === WATER) {
        // 水面波动：按 (行+列+相位) 决定亮度，形成流动感。
        const wave = ((r * 7 + c * 13 + phase) & 7) / 7
        ctx.globalAlpha = 0.72 + wave * 0.28
        ctx.fillStyle = COLORS[WATER]!
        ctx.fillRect(x, y + 2, CELL, CELL - 2)
        ctx.globalAlpha = 1
      } else if (v === FIRE) {
        const flick = ((r * 5 + c * 3 + phase) & 3)
        ctx.fillStyle = flick < 2 ? '#ff9e64' : '#f7768e'
        glow(ctx, '#ff9e64', 7)
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        noGlow(ctx)
      } else if (v === GOLD) {
        ctx.fillStyle = COLORS[GOLD]!
        glow(ctx, COLORS[GOLD]!, 5)
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        noGlow(ctx)
        // 闪光：确定性哈希决定的高亮点。
        if (((r * 31 + c * 17 + phase * 3) & 15) === 0) {
          ctx.fillStyle = '#fff4c2'
          ctx.fillRect(x + 4, y + 3, 3, 3)
        }
      } else if (v === ROCK) {
        ctx.fillStyle = COLORS[ROCK]!
        ctx.fillRect(x, y, CELL, CELL)
        if (((r * 13 + c * 7) & 3) === 0) {
          ctx.fillStyle = '#3a3a4e'
          ctx.fillRect(x + 3, y + 4, 4, 3)
        }
      } else if (v === BUCKET) {
        ctx.fillStyle = COLORS[BUCKET]!
        ctx.fillRect(x, y, CELL, CELL)
        // 桶内金砂填充：按收集进度从左到右点亮。
        const fillCells = Math.min(5, Math.ceil((s.collected / Math.max(1, s.quota)) * 5))
        const startC = Math.floor(s.cols / 2) - 2
        if (c >= startC && c < startC + fillCells && r === s.rows - 1) {
          ctx.fillStyle = COLORS[GOLD]!
          ctx.fillRect(x + 2, y + 4, CELL - 4, CELL - 4)
        }
      } else {
        ctx.fillStyle = COLORS[v]!
        ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1)
        if (v === OIL && ((r * 11 + c * 5 + phase) & 7) === 0) {
          ctx.fillStyle = '#a8894e'
          ctx.fillRect(x + 3, y + 3, 4, 2)
        }
      }
    }
  }
  // 桶口标记（强化版）：醒目发光箭头 + 「收集桶」文字标签——原 ▼▼
  // 小箭头太隐蔽，玩家看不到目标在哪。
  const startC = Math.floor(s.cols / 2) - 2
  const bucketCx = bx + (startC + 2.5) * CELL
  glow(ctx, accent(4), 10)
  ctx.fillStyle = accent(4)
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('\u25BC \u6536\u96C6\u6876 \u25BC', bucketCx, by - 12)
  noGlow(ctx)
  // 桶体描边：围绕桶格画梯形轮廓高亮。
  ctx.strokeStyle = accent(4)
  ctx.lineWidth = 2
  const bLeft = bx + startC * CELL - 2
  const bRight = bx + (startC + 5) * CELL + 2
  const bTop = by + (s.rows - 1) * CELL
  const bBot = by + s.rows * CELL
  ctx.beginPath()
  ctx.moveTo(bLeft, bTop)
  ctx.lineTo(bRight, bTop)
  ctx.lineTo(bRight - 4, bBot)
  ctx.lineTo(bLeft + 4, bBot)
  ctx.closePath()
  ctx.stroke()
  ctx.lineWidth = 1
}

/** 顶栏 HUD：金砂进度 | 用量 | 关卡 | 时间（右锚）。 */
function drawHud(ctx: CanvasRenderingContext2D, s: SandSimState): void {
  hudPair(ctx, 12, 30, '金砂', s.collected + '/' + s.quota, 'left', s.collected >= s.quota ? THEME.good : THEME.text)
  hudPair(ctx, 150, 30, '挖', 'x' + s.digLeft)
  hudPair(ctx, 214, 30, '岩', 'x' + s.rockLeft)
  hudPair(ctx, 278, 30, '水', 'x' + s.waterLeft)
  hudPair(ctx, 342, 30, '沙', 'x' + s.sandLeft)
  hudPair(ctx, 380, 30, '关', String(s.level))
  const sec = Math.ceil(s.timeLeft)
  hudPair(ctx, 548, 30, '时间', (sec / 60 | 0) + ':' + String(sec % 60).padStart(2, '0'), 'right', sec <= 15 ? THEME.bad : THEME.text)
}

/** 底部工具栏：4 个按钮，选中项高亮描边。 */
function drawToolbar(ctx: CanvasRenderingContext2D, s: SandSimState, tool: Tool): void {
  for (let i = 0; i < TOOLS.length; i += 1) {
    const item = TOOLS[i]!
    const x = TOOL_X0 + i * (TOOL_W + TOOL_GAP)
    const selected = item.tool === tool
    ctx.fillStyle = selected ? '#26263a' : THEME.panel
    roundRectPath(ctx, x, TOOL_Y, TOOL_W, TOOL_H, 7)
    ctx.fill()
    ctx.strokeStyle = selected ? accent(0) : THEME.panelEdge
    ctx.lineWidth = selected ? 2 : 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = selected ? THEME.text : THEME.textMuted
    ctx.fillText(item.key + ' ' + item.label, x + TOOL_W / 2, TOOL_Y + 16)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = item.left(s) > 0 ? THEME.textMuted : THEME.bad
    ctx.fillText('余 ' + item.left(s), x + TOOL_W / 2, TOOL_Y + 30)
  }
}