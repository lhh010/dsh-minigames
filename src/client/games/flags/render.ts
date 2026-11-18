/**
 * 旗帜竞猜画布渲染：题区居中大号程序化旗帜（或国名）+ 2×2 选项卡片
 * （国名或旗）、倒计时进度环、连击火花提示、答错红显与正确答案绿显、
 * 知识卡（答完即出该国冷知识）、节末小结（错题列表 + 冷知识）与结束 /
 * 暂停 overlay。旗帜全部由 drawFlag 按题库 stripes 字段程序化绘制，
 * 不依赖 emoji 字体（Windows 无彩色旗绘字形）。渲染器无状态，所有状态
 * 由 index.ts 传入。
 */
import type { FlagEntry, FlagsState, FlagsQuestion } from './logic.ts'
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

/** 旗面圆角边框色：深底上勾勒旗面边缘。 */
const FLAG_EDGE = 'rgba(226,226,238,0.28)'

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

/** 五角星路径（外接圆半径 r，尖角朝上）。 */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.42
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const px = cx + Math.cos(a) * rad
    const py = cy + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/**
 * 程序化绘制一面国旗：圆角裁剪内按 stripes 描述依次画条纹、canton、
 * 斜线/十字/三角/星月/圆点，最后描边。完全不依赖 emoji 字体，Windows
 * 上旗面与任何平台渲染一致。十字/斜线/星在有 canton 时画在 canton 内
 * （希腊十字、澳新小米字、智利星），圆点与月牙始终按全旗坐标绘制。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param entry - 题库条目（取其 stripes 描述）。
 * @param x - 旗面左上角横坐标。
 * @param y - 旗面左上角纵坐标。
 * @param w - 旗面宽度。
 * @param h - 旗面高度。
 */
export function drawFlag(ctx: CanvasRenderingContext2D, entry: FlagEntry, x: number, y: number, w: number, h: number): void {
  const s = entry.stripes
  ctx.save()
  roundRectPath(ctx, x, y, w, h, Math.min(8, h * 0.12))
  ctx.clip()

  // 条纹：等分横条或竖条；重复同色即调整比例（西班牙 1:2:1、美国 13 道）。
  const n = s.colors.length
  for (let i = 0; i < n; i += 1) {
    ctx.fillStyle = s.colors[i] as string
    if (s.dir === 'h') ctx.fillRect(x, y + (h * i) / n, w, h / n + 1)
    else ctx.fillRect(x + (w * i) / n, y, w / n + 1, h)
  }

  // canton：左上角矩形；十字/斜线/星随之画在其内，否则画满全旗。
  const hasCanton = s.canton !== undefined
  if (s.canton !== undefined) {
    ctx.fillStyle = s.canton
    ctx.fillRect(x, y, w * 0.4, h * 0.5)
  }
  const ex = x
  const ey = y
  const ew = hasCanton ? w * 0.4 : w
  const eh = hasCanton ? h * 0.5 : h

  // 对角斜线（英国米字；澳/新/斐济 canton 内的小米字）。
  if (s.saltire !== undefined) {
    ctx.strokeStyle = s.saltire
    ctx.lineWidth = eh * 0.18
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex + ew, ey + eh)
    ctx.moveTo(ex, ey + eh)
    ctx.lineTo(ex + ew, ey)
    ctx.stroke()
  }
  // 十字：瑞士居中、北欧偏左（crossX）；cross2 为叠在上面的细十字
  // （挪威/英国的红心或红十字）。
  if (s.cross !== undefined) {
    const cxp = ex + ew * (s.crossX ?? 0.5)
    const t = eh * 0.22
    ctx.fillStyle = s.cross
    ctx.fillRect(cxp - t / 2, ey, t, eh)
    ctx.fillRect(ex, ey + eh / 2 - t / 2, ew, t)
    if (s.cross2 !== undefined) {
      const t2 = t * 0.5
      ctx.fillStyle = s.cross2
      ctx.fillRect(cxp - t2 / 2, ey, t2, eh)
      ctx.fillRect(ex, ey + eh / 2 - t2 / 2, ew, t2)
    }
  }

  // 旗杆侧三角形（捷克/古巴）。
  if (s.wedge !== undefined) {
    ctx.fillStyle = s.wedge
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + h)
    ctx.lineTo(x + w * 0.42, y + h / 2)
    ctx.closePath()
    ctx.fill()
  }

  // 月牙（土耳其/巴基斯坦）：开口朝旗尾侧，底色盖出月牙形。
  const crescentR = Math.min(w, h) * 0.26
  if (s.crescent !== undefined) {
    const ccx = x + w * 0.45
    const ccy = y + h * 0.5
    ctx.fillStyle = s.crescent
    ctx.beginPath()
    ctx.arc(ccx, ccy, crescentR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = s.colors[0] as string
    ctx.beginPath()
    ctx.arc(ccx + crescentR * 0.55, ccy, crescentR * 0.82, 0, Math.PI * 2)
    ctx.fill()
  }

  // 星：有 canton 时画在 canton 中心（智利/中国），有月牙时跟在月牙
  // 右侧（土耳其/巴基斯坦），否则居中（越南/摩洛哥等）。
  if (s.star !== undefined) {
    let sx = x + w * 0.5
    const sy = y + h * 0.5
    let sr = Math.min(w, h) * 0.2
    if (hasCanton) {
      sx = ex + ew * 0.5
      sr = Math.min(ew, eh) * 0.28
    } else if (s.crescent !== undefined) {
      sx = x + w * 0.45 + crescentR * 0.95
      sr = crescentR * 0.5
    }
    starPath(ctx, sx, sy, sr)
    ctx.fillStyle = s.star
    ctx.fill()
  }

  // 中心圆（日本/印度/阿根廷太阳等）与内层小圆（巴西蓝心）。
  if (s.disc !== undefined) {
    const dx = x + w * (s.discX ?? 0.5)
    const dy = y + h * (s.discY ?? 0.5)
    const dr = Math.min(w, h) * 0.26
    ctx.fillStyle = s.disc
    ctx.beginPath()
    ctx.arc(dx, dy, dr, 0, Math.PI * 2)
    ctx.fill()
    if (s.inner !== undefined) {
      ctx.fillStyle = s.inner
      ctx.beginPath()
      ctx.arc(dx, dy, dr * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
  // 圆角边框：深底上勾勒旗面边缘。
  roundRectPath(ctx, x, y, w, h, Math.min(8, h * 0.12))
  ctx.lineWidth = Math.max(1, h * 0.03)
  ctx.strokeStyle = FLAG_EDGE
  ctx.stroke()
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
  } else if (entry !== undefined) {
    drawFlag(ctx, entry, x + (OPT_W - 70) / 2, y + (OPT_H - 48) / 2, 70, 48)
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
  drawFlag(ctx, entry, 40, y + 12, 44, 30)
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText(entry.name, 92, y + 26)
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
      ctx.textBaseline = 'middle'
      drawFlag(ctx, entry, 40, y - 14, 40, 27)
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
    glow(ctx, accent(4), 16)
    if (prompt !== undefined) drawFlag(ctx, prompt, LOGICAL_W / 2 - 85, 93, 170, 115)
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
