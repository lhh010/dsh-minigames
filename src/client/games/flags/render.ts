/**
 * 旗帜竞猜画布渲染：题区居中大号旗帜 emoji（或国名）+ 2×2 选项卡片
 * （国名或旗）、倒计时进度环、连击火花提示、答错红显与正确答案绿显、
 * 知识卡（答完即出该国冷知识）、节末小结（错题列表 + 冷知识）与结束 /
 * 暂停 overlay。渲染器无状态，所有状态由 index.ts 传入。
 */
import type { FlagsState, FlagsQuestion } from './logic.ts'
import {
  FLAG_BANK, OPTION_COUNT, QUESTION_TIME_MS, QUESTIONS_PER_ROUND, TOTAL_ROUNDS,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair,
  noGlow, roundRectPath,
} from '../theme.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 480
export const LOGICAL_H = 640

/** 选项卡片 2×2 网格布局。 */
const OPT_W = 210
const OPT_H = 92
const OPT_GAP_X = (LOGICAL_W - OPT_W * 2 - 32) / 1
const OPT_Y = 356

/** 进度环几何（题区右上角）。 */
const RING_CX = LOGICAL_W - 48
const RING_CY = 64
const RING_R = 22

/** 大号旗帜 emoji 的字体栈（跨平台的彩色 emoji 字体）。 */
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui'

/** 各选项卡片的矩形。 */
function optionRect(i: number): { x: number; y: number } {
  const col = i % 2
  const row = Math.floor(i / 2)
  const x0 = (LOGICAL_W - (OPT_W * 2 + OPT_GAP_X)) / 2
  return { x: x0 + col * (OPT_W + OPT_GAP_X), y: OPT_Y + row * (OPT_H + 14) }
}

/**
 * 命中测试：逻辑坐标落在哪个选项卡片上。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 选项位次 0-3，或 null（未命中）。
 */
export function optionAt(x: number, y: number): number | null {
  for (let i = 0; i < OPTION_COUNT; i += 1) {
    const { x: bx, y: by } = optionRect(i)
    if (x >= bx && x <= bx + OPT_W && y >= by && y <= by + OPT_H) return i
  }
  return null
}

/** 画倒计时进度环：剩余比例越高越绿，末段转红。 */
function drawRing(ctx: CanvasRenderingContext2D, remainingMs: number): void {
  const frac = Math.max(0, Math.min(1, remainingMs / QUESTION_TIME_MS))
  ctx.lineWidth = 6
  ctx.strokeStyle = THEME.panelEdge
  ctx.beginPath()
  ctx.arc(RING_CX, RING_CY, RING_R, 0, Math.PI * 2)
  ctx.stroke()
  if (frac > 0) {
    const color = frac > 0.35 ? THEME.good : THEME.bad
    glow(ctx, color, 6)
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(RING_CX, RING_CY, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
    ctx.stroke()
    noGlow(ctx)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(String(Math.ceil(frac * QUESTION_TIME_MS / 1000)), RING_CX, RING_CY + 1)
}

/**
 * 画一张选项卡片：国名（看旗选国名）或旗帜 emoji（看国名选旗），
 * 左上角标按键序号；feedback 阶段绿显正确、红显错选。
 */
function drawOption(
  ctx: CanvasRenderingContext2D, question: FlagsQuestion, i: number,
  chosenPos: number | null, lastResult: 'correct' | 'wrong' | null, revealed: boolean,
): void {
  const { x, y } = optionRect(i)
  const bankIndex = question.options[i] ?? 0
  const entry = FLAG_BANK[bankIndex]
  const isAnswer = i === question.answerPos
  let edge: string = THEME.panelEdge
  let fill: string = THEME.panel
  if (revealed && isAnswer && lastResult === 'correct') { edge = THEME.good; fill = 'rgba(158,206,106,0.14)' }
  if (revealed && isAnswer && lastResult === 'wrong') { edge = THEME.good; fill = 'rgba(158,206,106,0.14)' }
  if (revealed && lastResult === 'wrong' && i === chosenPos) { edge = THEME.bad; fill = 'rgba(247,118,142,0.14)' }
  roundRectPath(ctx, x, y, OPT_W, OPT_H, 12)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = edge
  if (edge !== THEME.panelEdge) glow(ctx, edge, 8)
  ctx.stroke()
  noGlow(ctx)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (question.kind === 'flag-to-name') {
    ctx.font = '600 24px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(entry?.name ?? '?', x + OPT_W / 2, y + OPT_H / 2)
  } else {
    ctx.font = '48px ' + EMOJI_FONT
    ctx.fillText(entry?.emoji ?? '?', x + OPT_W / 2, y + OPT_H / 2)
  }
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.textAlign = 'left'
  ctx.fillText(String(i + 1), x + 8, y + 14)
}

/** 画知识卡：prompt 旗帜 + 国名 + 一句话冷知识。 */
function drawFactCard(ctx: CanvasRenderingContext2D, promptIndex: number): void {
  const entry = FLAG_BANK[promptIndex]
  if (entry === undefined) return
  const y = OPT_Y + (OPT_H + 14) * 2 + 12
  roundRectPath(ctx, 24, y, LOGICAL_W - 48, 74, 10)
  ctx.fillStyle = 'rgba(122,162,247,0.10)'
  ctx.fill()
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '28px ' + EMOJI_FONT
  ctx.fillText(entry.emoji, 40, y + 26)
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(entry.name, 80, y + 26)
  ctx.font = '500 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const line = '💡 ' + entry.fact
  // 简单两行折行：每行最多 ~30 个全角位。
  if (line.length > 30) {
    ctx.fillText(line.slice(0, 30), 40, y + 52)
    ctx.fillText(line.slice(30), 40, y + 68)
  } else {
    ctx.fillText(line, 40, y + 56)
  }
}

/**
 * 画一帧。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param state - 游戏状态。
 * @param particles - 连击火花粒子系统（场景绘制后、overlay 前 tick）。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param dtMs - 本帧毫秒数（供粒子 tick）。
 */
export function renderFlags(
  ctx: CanvasRenderingContext2D,
  state: FlagsState,
  particles: { tick(ctx: CanvasRenderingContext2D, dtMs: number): void; burst(x: number, y: number, color: string, count?: number, speed?: number): void },
  paused: boolean,
  dtMs: number,
): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：节 / 题号（左上），得分（右上，避开进度环再下移一行）。
  hudPair(ctx, 16, 24, '节', String(Math.min(state.round + 1, TOTAL_ROUNDS)) + '/' + String(TOTAL_ROUNDS))
  hudPair(ctx, 90, 24, '题', String(Math.min(state.indexInRound + 1, QUESTIONS_PER_ROUND)) + '/' + String(QUESTIONS_PER_ROUND))
  hudPair(ctx, LOGICAL_W - 16, 50, '得分', String(state.score), 'right', THEME.gold)
  if (state.combo >= 2) {
    hudPair(ctx, 170, 24, '连击', '🔥x' + String(state.combo), 'left', THEME.gold)
  }

  if (state.phase === 'over') {
    particles.tick(ctx, dtMs)
    const grade = state.score >= 2400 ? '世界通！' : state.score >= 1500 ? '博览环球' : '继续环游'
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '挑战结束',
      '总分 ' + String(state.score) + ' · 最高连击 x' + String(state.bestCombo) + ' · 错题 ' + String(state.wrongs.length) + ' 道 · ' + grade)
    return
  }

  if (state.phase === 'review') {
    // 节末小结：本玩法错题跨节累计，展示至今全部错题的旗 + 国名 + 冷知识。
    ctx.textAlign = 'center'
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText('第 ' + String(state.round + 1) + ' 节结束 · 错题回顾', LOGICAL_W / 2, 60)
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('按 空格 进入下一节', LOGICAL_W / 2, 84)
    const list = state.wrongs.slice(0, 8)
    if (list.length === 0) {
      ctx.font = 'bold 18px system-ui, sans-serif'
      ctx.fillStyle = THEME.good
      ctx.fillText('🎉 目前全对，没有错题！', LOGICAL_W / 2, 150)
    }
    ctx.textAlign = 'left'
    list.forEach((wrong, i) => {
      const entry = FLAG_BANK[wrong.promptIndex]
      if (entry === undefined) return
      const y = 130 + i * 62
      ctx.font = '30px ' + EMOJI_FONT
      ctx.textBaseline = 'middle'
      ctx.fillStyle = THEME.bad
      ctx.fillText(entry.emoji, 40, y)
      ctx.font = 'bold 15px system-ui, sans-serif'
      ctx.fillStyle = THEME.text
      ctx.textAlign = 'left'
      ctx.fillText('✓ ' + entry.name, 84, y - 8)
      ctx.font = '500 12px system-ui, sans-serif'
      ctx.fillStyle = THEME.textMuted
      const fact = entry.fact.length > 28 ? entry.fact.slice(0, 28) + '…' : entry.fact
      ctx.fillText(fact, 84, y + 12)
    })
    particles.tick(ctx, dtMs)
    if (paused) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续')
    return
  }

  // 题区：看旗选国名显示大旗，看国名选旗显示国名。
  const prompt = FLAG_BANK[state.question.promptIndex]
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (state.question.kind === 'flag-to-name') {
    ctx.font = '104px ' + EMOJI_FONT
    glow(ctx, accent(4), 16)
    ctx.fillText(prompt?.emoji ?? '?', LOGICAL_W / 2, 150)
    noGlow(ctx)
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('这面旗是哪个国家？', LOGICAL_W / 2, 232)
  } else {
    ctx.font = 'bold 52px system-ui, sans-serif'
    glow(ctx, accent(0), 14)
    ctx.fillStyle = THEME.text
    ctx.fillText(prompt?.name ?? '?', LOGICAL_W / 2, 150)
    noGlow(ctx)
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('哪面旗是这个国家？', LOGICAL_W / 2, 232)
  }
  drawRing(ctx, state.remainingMs)

  // 选项卡片：feedback 阶段揭晓对错（错选红显 + 正确绿显）。
  const revealed = state.phase === 'feedback'
  const chosenPos = revealed && state.lastResult === 'wrong'
    ? state.question.options.indexOf(state.wrongs[state.wrongs.length - 1]?.chosenIndex ?? -1)
    : null
  for (let i = 0; i < OPTION_COUNT; i += 1) {
    drawOption(ctx, state.question, i, chosenPos, state.lastResult, revealed)
  }

  // feedback：知识卡 + 继续提示。
  if (state.phase === 'feedback') {
    drawFactCard(ctx, state.question.promptIndex)
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('按 空格 下一题', LOGICAL_W / 2, LOGICAL_H - 12)
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillStyle = state.lastResult === 'correct' ? THEME.good : THEME.bad
    ctx.fillText(state.lastResult === 'correct' ? '✔ 答对了' : '✘ 答错了', LOGICAL_W / 2, 128)
  }

  particles.tick(ctx, dtMs)
  if (paused) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续')
}

/** 连击火花粒子系统（复用共享粒子池）。 */
export function createFlagsParticles(): ReturnType<typeof createParticles> {
  return createParticles()
}
