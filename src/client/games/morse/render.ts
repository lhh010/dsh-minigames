/**
 * 摩斯电码画布渲染：电台面板（指示灯 + 按键时长波形条）、目标词槽位、
 * 候选字母网格、可开关的对照表侧栏、关卡/生命/得分 HUD 与结束遮罩。
 * 全部为无状态绘制：亮灯、按压时长、闪烁反馈由调用方（index.ts）传入。
 */
import type { MorseState, MorseLevelConfig } from './logic.ts'
import { LEVELS, MORSE_TABLE } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 680
export const LOGICAL_H = 500

const MAIN_X = 16
const MAIN_W = 492
const PANEL_Y = 44
const PANEL_H = 96
const SLOT_Y = 162
const SLOT_SIZE = 38
const GRID_Y = 224
const GRID_COLS = 8
const CELL_W = 56
const CELL_H = 42
const CELL_GAP = 6
const SIDEBAR_X = 524
const SIDEBAR_W = 140

/** 渲染所需的运行时输入（由 index.ts 持有）。 */
export interface MorseRenderOpts {
  paused: boolean
  hintVisible: boolean
  /** 电台指示灯是否点亮（播放信号或正在按键）。 */
  lampOn: boolean
  /** 当前按压持续毫秒数（未按键为 null），驱动波形条。 */
  pressMs: number | null
  /** 答题反馈闪烁：'none' 无，'good' 绿，'bad' 红。 */
  flash: 'none' | 'good' | 'bad'
}

/** 电台面板区域（点击 = 解码重播 / 编码按下电键）。 */
export function radioAt(x: number, y: number): boolean {
  return x >= MAIN_X && x <= MAIN_X + MAIN_W && y >= PANEL_Y && y <= PANEL_Y + PANEL_H
}

/**
 * 命中候选字母网格。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param alphabet - 本关字符集（决定网格内容）。
 * @returns 命中的字符，格外来 null。
 */
export function letterAt(x: number, y: number, alphabet: string): string | null {
  const chars = [...alphabet]
  for (let i = 0; i < chars.length; i += 1) {
    const cx = MAIN_X + (i % GRID_COLS) * (CELL_W + CELL_GAP)
    const cy = GRID_Y + Math.floor(i / GRID_COLS) * (CELL_H + CELL_GAP)
    if (x >= cx && x <= cx + CELL_W && y >= cy && y <= cy + CELL_H) return chars[i]!
  }
  return null
}

/** 电码字符串转显示符（'.'→'·'，'-'→'−'）。 */
function prettyCode(code: string): string {
  return code.replaceAll('.', '·').replaceAll('-', '−')
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param state - 游戏状态。
 * @param opts - 运行时渲染输入。
 */
export function renderMorse(ctx: CanvasRenderingContext2D, state: MorseState, opts: MorseRenderOpts): void {
  const cfg: MorseLevelConfig = LEVELS[state.level] ?? LEVELS[0]!
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：关卡 / 生命 / 得分。
  hudPair(ctx, MAIN_X, 26, '关卡 ', (state.level + 1) + '/' + LEVELS.length)
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = state.lives > 1 ? THEME.bad : THEME.gold
  ctx.fillText('❤'.repeat(Math.max(0, state.lives)), 150, 27)
  hudPair(ctx, LOGICAL_W - 16, 26, '得分 ', String(state.score), 'right', THEME.gold)

  drawRadioPanel(ctx, state, opts)
  drawSlots(ctx, state)
  if (state.mode === 'decode') drawCandidateGrid(ctx, state, cfg)
  else drawEncodeHelp(ctx, state)
  drawSidebar(ctx, cfg, opts.hintVisible)

  ctx.textBaseline = 'alphabetic'
  if (state.phase === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '通讯中断', '得分 ' + state.score + ' · 按 R 重开', THEME.bad)
  } else if (state.phase === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '通讯成功', '满分穿越 5 关 · 得分 ' + state.score + ' · 按 R 重开', THEME.gold)
  } else if (opts.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}

/** 电台面板：指示灯、状态行、按键时长波形条与已发电码。 */
function drawRadioPanel(ctx: CanvasRenderingContext2D, state: MorseState, opts: MorseRenderOpts): void {
  const edge = opts.flash === 'good' ? THEME.good : opts.flash === 'bad' ? THEME.bad : THEME.panelEdge
  glow(ctx, edge, opts.flash === 'none' ? 4 : 14)
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, MAIN_X, PANEL_Y, MAIN_W, PANEL_H, 12)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 指示灯。
  const lampColor = opts.lampOn ? THEME.gold : '#3b3b52'
  glow(ctx, opts.lampOn ? THEME.gold : 'transparent', opts.lampOn ? 20 : 0)
  ctx.beginPath()
  ctx.arc(MAIN_X + 34, PANEL_Y + PANEL_H / 2, 13, 0, Math.PI * 2)
  ctx.fillStyle = lampColor
  ctx.fill()
  noGlow(ctx)

  const barX = MAIN_X + 60
  const barW = MAIN_W - 76
  const barY = PANEL_Y + 22

  // 状态行。
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const status = state.mode === 'decode'
    ? (state.phase === 'playback' ? '正在发报…听声辨码' : 'SPACE / 点击面板重播 · 点击字母作答')
    : '电键：点 <180ms · 划 ≥180ms · 停顿结束字母'
  ctx.fillText(status, barX, PANEL_Y + 16)

  // 波形条：当前按压时长（0..600ms 满幅），180ms 处画点/划阈值刻度。
  ctx.fillStyle = '#26263a'
  roundRectPath(ctx, barX, barY, barW, 14, 7)
  ctx.fill()
  const thresholdX = barX + (barW * 180) / 600
  ctx.strokeStyle = 'rgba(226,226,238,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(thresholdX, barY - 3)
  ctx.lineTo(thresholdX, barY + 17)
  ctx.stroke()
  if (opts.pressMs !== null) {
    const fillW = Math.max(4, (Math.min(opts.pressMs, 600) / 600) * barW)
    const color = opts.pressMs < 180 ? accent(0) : accent(4)
    glow(ctx, color, 8)
    ctx.fillStyle = color
    roundRectPath(ctx, barX, barY, fillW, 14, 7)
    ctx.fill()
    noGlow(ctx)
  }

  // 已发电码 / 已填进度（点划显示）。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.textAlign = 'left'
  const shown = state.mode === 'encode'
    ? prettyCode(state.encodeBuffer)
    : prettyCode([...state.word.slice(0, state.filled)].map((c) => MORSE_TABLE[c] ?? '').join(' '))
  ctx.fillText(shown === '' ? '— — —' : shown, barX, PANEL_Y + PANEL_H - 14)
}

/** 目标词槽位：解码模式隐藏未填字母；编码模式显示字母与完成态。 */
function drawSlots(ctx: CanvasRenderingContext2D, state: MorseState): void {
  const chars = [...state.word]
  const total = Math.max(chars.length, 1)
  const step = SLOT_SIZE + 10
  const startX = MAIN_X + (MAIN_W - total * step + 10) / 2
  for (let i = 0; i < chars.length; i += 1) {
    const x = startX + i * step
    const currentIdx = state.mode === 'decode' ? state.filled : state.encodeIndex
    const done = state.mode === 'decode' ? i < state.filled : i < state.encodeIndex
    const current = i === currentIdx && !done
    const color = done ? THEME.good : current ? THEME.gold : THEME.panelEdge
    glow(ctx, color, current ? 10 : 3)
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, x, SLOT_Y, SLOT_SIZE, SLOT_SIZE, 8)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = color
    ctx.lineWidth = current ? 2 : 1.2
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 19px system-ui, sans-serif'
    const reveal = state.mode === 'encode' || done
    ctx.fillStyle = done ? THEME.good : current ? THEME.gold : THEME.textMuted
    ctx.fillText(reveal ? chars[i]! : '·', x + SLOT_SIZE / 2, SLOT_Y + SLOT_SIZE / 2 + 1)
  }
  ctx.textBaseline = 'alphabetic'
}

/** 解码模式候选字母网格（已填字母呈选中态）。 */
function drawCandidateGrid(ctx: CanvasRenderingContext2D, state: MorseState, cfg: MorseLevelConfig): void {
  const chars = [...cfg.alphabet]
  const filledSet = new Set([...state.word.slice(0, state.filled)])
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!
    const x = MAIN_X + (i % GRID_COLS) * (CELL_W + CELL_GAP)
    const y = GRID_Y + Math.floor(i / GRID_COLS) * (CELL_H + CELL_GAP)
    const selected = filledSet.has(ch)
    const color = selected ? THEME.good : accent(i % 8)
    glow(ctx, color, selected ? 10 : 3)
    ctx.fillStyle = selected ? 'rgba(158,206,106,0.16)' : THEME.panel
    roundRectPath(ctx, x, y, CELL_W, CELL_H, 8)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = color
    ctx.lineWidth = selected ? 2 : 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillStyle = selected ? THEME.good : THEME.text
    ctx.fillText(ch, x + CELL_W / 2, y + CELL_H / 2 + 1)
  }
  ctx.textBaseline = 'alphabetic'
}

/** 编码模式提示区（替代字母网格）。 */
function drawEncodeHelp(ctx: CanvasRenderingContext2D, state: MorseState): void {
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const done = state.encodeIndex >= state.word.length
  const lines = [
    '按住 SPACE / 按住面板 = 发报：轻出点，重出划。',
    '抬键停顿约 0.4s 结束一个字母，发对自动前进。',
    done ? '本轮完成！' : '对照表可查电码（H 开关）',
  ]
  lines.forEach((line, i) => {
    ctx.fillText(line, MAIN_X + 4, GRID_Y + 18 + i * 22)
  })
}

/** 对照表侧栏（可开关）：字符 + 电码双列。 */
function drawSidebar(ctx: CanvasRenderingContext2D, cfg: MorseLevelConfig, visible: boolean): void {
  const y0 = PANEL_Y
  const h = LOGICAL_H - 16 - y0
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, SIDEBAR_X, y0, SIDEBAR_W, h, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText('对照表', SIDEBAR_X + 12, y0 + 22)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('H 开关', SIDEBAR_X + SIDEBAR_W - 40, y0 + 22)
  if (!visible) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('已关闭', SIDEBAR_X + 12, y0 + 46)
    return
  }
  const chars = [...cfg.alphabet]
  const rows = Math.ceil(chars.length / 2)
  ctx.font = '600 12px system-ui, sans-serif'
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!
    const col = Math.floor(i / rows)
    const row = i % rows
    const x = SIDEBAR_X + 12 + col * 64
    const y = y0 + 46 + row * (h - 56) / Math.max(1, rows - 1 || 1)
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(ch, x, y)
    ctx.fillStyle = THEME.text
    ctx.fillText(prettyCode(MORSE_TABLE[ch] ?? ''), x + 14, y)
  }
}
