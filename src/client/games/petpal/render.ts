/**
 * 电子宠物 PetPal 的绘制层：像素风房间（窝/食盆/玩具/窗）、按生长阶段
 * 与进化形态程序绘制的宠物精灵（圆滚身体 + 眨眼 + 心情嘴 + 污垢点 +
 * 睡姿 Zzz + 形态差异的角/耳/尾/天线）、四维变色属性条、操作按钮栏、
 * 成长阶段 HUD、追逐光点场地与睡觉关灯遮罩。纯 canvas 绘制，无状态。
 */

import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'
import {
  DAY_SECONDS, FOOD_NAMES, FORM_NAMES, QUIRK_NAMES, careScore, gameHour, isNightHour,
  quirkOf, stageOf, favoriteFoodOf,
} from './logic.ts'
import type { AdultForm, PetState, StageId } from './logic.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 960
export const LOGICAL_H = 600

/** 底部操作按钮栏的按钮标识。 */
export const BUTTON_IDS = ['meal', 'snack', 'feast', 'play', 'clean', 'sleep'] as const
export type ButtonId = (typeof BUTTON_IDS)[number]

/** 按钮中文名。 */
export const BUTTON_NAMES: Record<ButtonId, string> = {
  meal: '饲料',
  snack: '零食',
  feast: '盛宴',
  play: '玩耍',
  clean: '清洁',
  sleep: '睡觉',
}

/** 一个按钮的矩形布局。 */
export interface ButtonRect {
  id: ButtonId
  x: number
  y: number
  w: number
  h: number
}

/** 底部按钮栏布局（6 个等宽圆角按钮）。 */
export function buttonRects(): ButtonRect[] {
  const rects: ButtonRect[] = []
  const w = 128
  const h = 40
  const gap = 16
  const total = BUTTON_IDS.length * w + (BUTTON_IDS.length - 1) * gap
  let x = (LOGICAL_W - total) / 2
  for (const id of BUTTON_IDS) {
    rects.push({ id, x, y: 542, w, h })
    x += w + gap
  }
  return rects
}

/** 命中测试：逻辑坐标落在哪个按钮上（无命中返回 null）。 */
export function buttonAt(x: number, y: number): ButtonId | null {
  for (const rect of buttonRects()) {
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return rect.id
  }
  return null
}

/** 追逐光点小游戏的场地矩形（logic 内坐标归一化到该矩形）。 */
export const PLAY_ARENA = { x: 180, y: 100, w: 600, h: 340 }

/** 宠物身体中心的基准位置（像素）。 */
const PET_X = 480
const PET_BASE_Y = 400

/** 各阶段身体半径。 */
const STAGE_RADIUS: Record<StageId, number> = { egg: 30, baby: 34, child: 44, teen: 54, adult: 62 }

/** 进化形态的配色（身体/点缀）。 */
const FORM_COLORS: Record<AdultForm, { body: string; trim: string }> = {
  dragon: { body: '#7ee081', trim: '#f6d860' },
  cat: { body: '#f7b267', trim: '#fde8cd' },
  robot: { body: '#9aa5b1', trim: '#7dcfff' },
  slime: { body: '#6fd3c7', trim: '#3fa89c' },
}

/** 幼年阶段的默认配色（未进化前的奶黄）。 */
const YOUNG_COLORS = { body: '#f5d76e', trim: '#fbf0c4' }

/** 宠物当前身体中心（含呼吸浮动）。 */
export function petCenter(state: PetState, timeMs: number): { x: number; y: number; r: number } {
  const stage = stageOf(state)
  const r = STAGE_RADIUS[stage]
  const bob = state.sleeping ? 0 : Math.sin(timeMs / 420) * 2.5
  return { x: PET_X, y: PET_BASE_Y + bob - (stage === 'egg' ? 6 : 0), r }
}

/** 属性条颜色：健康绿 → 警戒金 → 危险红。 */
function statColor(v: number): string {
  if (v >= 60) return THEME.good
  if (v >= 30) return THEME.gold
  return THEME.bad
}

/** 画一条像素属性条。 */
function drawStatBar(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, v: number): void {
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(label, x, y + 11)
  const bx = x + 40
  const bw = 130
  roundRectPath(ctx, bx, y, bw, 12, 4)
  ctx.fillStyle = THEME.panelEdge
  ctx.fill()
  const fillW = (bw - 4) * (v / 100)
  if (fillW > 0) {
    roundRectPath(ctx, bx + 2, y + 2, fillW, 8, 3)
    ctx.fillStyle = statColor(v)
    glow(ctx, statColor(v), 5)
    ctx.fill()
    noGlow(ctx)
  }
}

/** 画像素风房间：墙、地板、窗（昼夜）、窝、食盆、玩具球。 */
function drawRoom(ctx: CanvasRenderingContext2D, state: PetState): void {
  const hour = gameHour(state)
  const night = isNightHour(hour)
  // 墙
  ctx.fillStyle = night ? '#191926' : '#222233'
  ctx.fillRect(0, 60, LOGICAL_W, 350)
  // 地板
  ctx.fillStyle = night ? '#241d20' : '#2e2430'
  ctx.fillRect(0, 410, LOGICAL_W, 130)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < 12; i += 1) ctx.fillRect(i * 84, 430 + (i % 2) * 36, 60, 4)
  // 窗（昼夜颜色 + 太阳/月亮）
  roundRectPath(ctx, 700, 100, 150, 130, 8)
  ctx.fillStyle = night ? '#101024' : '#3a4a6b'
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(775, 165, 34, 0, Math.PI * 2)
  ctx.fillStyle = night ? '#c8cbe0' : '#f6d860'
  glow(ctx, night ? '#c8cbe0' : '#f6d860', 12)
  ctx.fill()
  noGlow(ctx)
  ctx.beginPath()
  ctx.moveTo(700, 165)
  ctx.lineTo(850, 165)
  ctx.moveTo(775, 100)
  ctx.lineTo(775, 230)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 3
  ctx.stroke()
  // 窝（左侧软垫 + 耳朵）
  roundRectPath(ctx, 300, 430, 130, 44, 18)
  ctx.fillStyle = '#8a5a3b'
  ctx.fill()
  roundRectPath(ctx, 312, 420, 106, 30, 14)
  ctx.fillStyle = '#a87448'
  ctx.fill()
  // 食盆（右侧）
  ctx.beginPath()
  ctx.ellipse(640, 462, 42, 14, 0, 0, Math.PI)
  ctx.fillStyle = '#5b6b8c'
  ctx.fill()
  ctx.fillRect(598, 462, 84, 10)
  // 玩具球
  ctx.beginPath()
  ctx.arc(240, 486, 14, 0, Math.PI * 2)
  ctx.fillStyle = THEME.accents[1]
  glow(ctx, THEME.accents[1], 8)
  ctx.fill()
  noGlow(ctx)
}

/** 画宠物精灵（按阶段/形态/睡眠/污垢/表情）。 */
function drawPet(ctx: CanvasRenderingContext2D, state: PetState, timeMs: number): void {
  const stage = stageOf(state)
  const { x, y, r } = petCenter(state, timeMs)
  // 阴影
  ctx.beginPath()
  ctx.ellipse(x, 486, r * 1.1, 10, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fill()
  if (stage === 'egg') {
    drawEgg(ctx, x, y, r, state)
    return
  }
  const colors = state.form !== null ? FORM_COLORS[state.form] : YOUNG_COLORS
  // 尾巴（灵猫/闪光龙上翘尾巴）
  if (state.form === 'cat' || state.form === 'dragon') {
    ctx.strokeStyle = colors.body
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x + r * 0.8, y + r * 0.4)
    ctx.quadraticCurveTo(x + r * 1.5, y, x + r * 1.3, y - r * 0.9)
    ctx.stroke()
  }
  // 身体
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = colors.body
  glow(ctx, colors.body, 14)
  ctx.fill()
  noGlow(ctx)
  // 机械兽：面板缝线 + 天线
  if (state.form === 'robot') {
    ctx.strokeStyle = colors.trim
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - r * 0.6, y - r * 0.2)
    ctx.lineTo(x + r * 0.6, y - r * 0.2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y - r)
    ctx.lineTo(x, y - r - 16)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y - r - 20, 5, 0, Math.PI * 2)
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 8)
    ctx.fill()
    noGlow(ctx)
  }
  // 闪光龙：双角 + 小翅膀
  if (state.form === 'dragon') {
    ctx.fillStyle = colors.trim
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(x + side * r * 0.45, y - r * 0.75)
      ctx.lineTo(x + side * r * 0.7, y - r * 1.35)
      ctx.lineTo(x + side * r * 0.15, y - r * 0.95)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x + side * r * 0.9, y - r * 0.1)
      ctx.lineTo(x + side * r * 1.5, y - r * 0.5)
      ctx.lineTo(x + side * r * 1.4, y + r * 0.3)
      ctx.closePath()
      ctx.fill()
    }
  }
  // 灵猫：三角耳
  if (state.form === 'cat') {
    ctx.fillStyle = colors.body
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(x + side * r * 0.35, y - r * 0.7)
      ctx.lineTo(x + side * r * 0.75, y - r * 1.25)
      ctx.lineTo(x + side * r * 0.8, y - r * 0.55)
      ctx.closePath()
      ctx.fill()
    }
  }
  // 史莱姆：头顶滴落
  if (state.form === 'slime') {
    ctx.beginPath()
    ctx.arc(x - r * 0.4, y - r * 0.85, r * 0.22, 0, Math.PI * 2)
    ctx.arc(x + r * 0.3, y - r * 0.95, r * 0.16, 0, Math.PI * 2)
    ctx.fillStyle = colors.body
    ctx.fill()
  }
  drawFace(ctx, state, x, y, r, timeMs)
  // 污垢点（身上棕点）
  ctx.fillStyle = 'rgba(94,66,40,0.9)'
  const spots = state.dirtCount
  for (let i = 0; i < spots; i += 1) {
    const angle = (i * 2.4) + 1
    ctx.beginPath()
    ctx.arc(x + Math.cos(angle) * r * 0.62, y + Math.sin(angle) * r * 0.55, 5 + (i % 2) * 2, 0, Math.PI * 2)
    ctx.fill()
  }
  // 睡姿 Zzz
  if (state.sleeping) {
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    for (let i = 0; i < 3; i += 1) {
      const phase = ((timeMs / 900) + i / 3) % 1
      ctx.globalAlpha = 1 - phase
      ctx.font = 'bold ' + (14 + i * 6) + 'px system-ui, sans-serif'
      ctx.fillText('Z', x + r + 12 + phase * 26, y - r - 10 - phase * 34)
    }
    ctx.globalAlpha = 1
  }
}

/** 画蛋壳：裂纹数随点击次数增加，将孵化时发光。 */
function drawEgg(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, state: PetState): void {
  ctx.beginPath()
  ctx.ellipse(x, y, r * 0.85, r * 1.05, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#f3ead2'
  glow(ctx, '#f3ead2', state.eggClicks >= 8 ? 16 : 6)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = '#c9b98f'
  ctx.lineWidth = 2
  // 裂纹
  ctx.beginPath()
  const cracks = state.eggClicks
  for (let i = 0; i < cracks; i += 1) {
    const a = (i / Math.max(1, cracks)) * Math.PI * 2
    ctx.moveTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 1.05)
    ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.6)
  }
  ctx.stroke()
  // 斑点装饰
  ctx.fillStyle = 'rgba(200,170,110,0.5)'
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.2, 5, 0, Math.PI * 2)
  ctx.arc(x + r * 0.35, y + r * 0.3, 4, 0, Math.PI * 2)
  ctx.fill()
}

/** 画脸：眨眼动画 + 心情嘴（史莱姆垂眼、机械兽visor）。 */
function drawFace(ctx: CanvasRenderingContext2D, state: PetState, x: number, y: number, r: number, timeMs: number): void {
  const joy = state.stats.joy
  const blink = state.sleeping || (timeMs % 3200) < 140
  const eyeY = y - r * 0.15
  const eyeDx = r * 0.38
  const eyeR = Math.max(4, r * 0.14)
  ctx.strokeStyle = '#2b2b36'
  ctx.fillStyle = '#2b2b36'
  if (state.form === 'robot') {
    // 机械兽：一体护目镜
    roundRectPath(ctx, x - eyeDx - eyeR, eyeY - eyeR, (eyeDx + eyeR) * 2, eyeR * 2, eyeR)
    ctx.fillStyle = 'rgba(30,40,60,0.9)'
    ctx.fill()
    ctx.fillStyle = THEME.accents[5]
    ctx.beginPath()
    ctx.arc(x - eyeDx * 0.5, eyeY, eyeR * 0.5, 0, Math.PI * 2)
    ctx.arc(x + eyeDx * 0.5, eyeY, eyeR * 0.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (blink) {
    ctx.lineWidth = 2.5
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(x + side * eyeDx - eyeR, eyeY)
      ctx.lineTo(x + side * eyeDx + eyeR, eyeY)
      ctx.stroke()
    }
  } else {
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(x + side * eyeDx, eyeY, eyeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x + side * eyeDx + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.32, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2b2b36'
    }
  }
  // 心情嘴
  ctx.lineWidth = 2.5
  ctx.beginPath()
  if (state.form === 'slime' && !state.sleeping) {
    // 史莱姆：波浪嘴
    ctx.moveTo(x - r * 0.2, y + r * 0.3)
    ctx.quadraticCurveTo(x, y + r * 0.2, x + r * 0.2, y + r * 0.3)
  } else if (joy > 70) {
    ctx.arc(x, y + r * 0.22, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI)
  } else if (joy >= 40) {
    ctx.moveTo(x - r * 0.16, y + r * 0.3)
    ctx.lineTo(x + r * 0.16, y + r * 0.3)
  } else {
    ctx.arc(x, y + r * 0.5, r * 0.2, 1.15 * Math.PI, 1.85 * Math.PI)
  }
  ctx.stroke()
}

/** 画四维属性条面板。 */
function drawStatsPanel(ctx: CanvasRenderingContext2D, state: PetState): void {
  roundRectPath(ctx, 16, 76, 196, 108, 8)
  ctx.fillStyle = 'rgba(20,20,30,0.72)'
  ctx.fill()
  drawStatBar(ctx, 26, 88, '饱食', state.stats.hunger)
  drawStatBar(ctx, 26, 108, '心情', state.stats.joy)
  drawStatBar(ctx, 26, 128, '清洁', state.stats.clean)
  drawStatBar(ctx, 26, 148, '精力', state.stats.energy)
}

/** 画成长阶段 HUD（右上）：阶段、游戏日、照料分、健康与个性。 */
function drawStageHud(ctx: CanvasRenderingContext2D, state: PetState): void {
  const stage = stageOf(state)
  const stageName: Record<StageId, string> = { egg: '蛋', baby: '幼体', child: '童年', teen: '少年', adult: '成年' }
  const day = Math.floor(state.clockSec / DAY_SECONDS) + 1
  const score = Math.round(careScore(state))
  let formText = ''
  if (state.form !== null) formText = ' · ' + FORM_NAMES[state.form]
  hudPair(ctx, LOGICAL_W - 20, 92, '阶段', stageName[stage] + formText, 'right', THEME.accents[0])
  hudPair(ctx, LOGICAL_W - 20, 112, '游戏日', '第 ' + day + ' 天', 'right')
  hudPair(ctx, LOGICAL_W - 20, 132, '照料', score + ' 分', 'right', score >= 60 ? THEME.good : THEME.gold)
  const hearts = '♥'.repeat(Math.max(0, 3 - state.sickCount)) + '♡'.repeat(Math.min(3, state.sickCount))
  hudPair(ctx, LOGICAL_W - 20, 152, '健康', hearts, 'right', state.sickCount >= 2 ? THEME.bad : THEME.good)
  const personality = '偏好 ' + FOOD_NAMES[favoriteFoodOf(state.seed)] + ' · ' + QUIRK_NAMES[quirkOf(state.seed)]
  hudPair(ctx, LOGICAL_W - 20, 172, '个性', personality, 'right', THEME.accents[3])
}

/** 画底部操作按钮栏（冷却中置灰并显示秒数）。 */
function drawButtons(ctx: CanvasRenderingContext2D, state: PetState): void {
  for (const rect of buttonRects()) {
    const cd = rect.id === 'meal' || rect.id === 'snack' || rect.id === 'feast' ? state.cooldowns[rect.id] : 0
    const disabled = state.dead || (state.eggLeftSec > 0 && rect.id !== 'play') ||
      (state.sleeping && rect.id !== 'sleep')
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8)
    ctx.fillStyle = disabled ? 'rgba(40,40,55,0.6)' : THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '600 14px system-ui, sans-serif'
    let label = BUTTON_NAMES[rect.id]
    if (rect.id === 'sleep' && state.sleeping) label = '叫醒'
    if (cd > 0) label = label + ' ' + Math.ceil(cd) + 's'
    ctx.fillStyle = disabled ? THEME.textMuted : THEME.text
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + 26)
  }
}

/** 画追逐光点场地（玩耍中）。 */
function drawPlayArena(ctx: CanvasRenderingContext2D, state: PetState, timeMs: number): void {
  roundRectPath(ctx, PLAY_ARENA.x, PLAY_ARENA.y, PLAY_ARENA.w, PLAY_ARENA.h, 12)
  ctx.fillStyle = 'rgba(12,12,22,0.85)'
  ctx.fill()
  ctx.strokeStyle = THEME.accents[5]
  ctx.lineWidth = 2
  ctx.stroke()
  const play = state.play
  if (play === null) return
  const dx = PLAY_ARENA.x + play.dotX * PLAY_ARENA.w
  const dy = PLAY_ARENA.y + play.dotY * PLAY_ARENA.h
  const pulse = 1 + Math.sin(timeMs / 160) * 0.15
  ctx.beginPath()
  ctx.arc(dx, dy, 14 * pulse, 0, Math.PI * 2)
  ctx.fillStyle = THEME.accents[4]
  glow(ctx, THEME.accents[4], 18)
  ctx.fill()
  noGlow(ctx)
  ctx.beginPath()
  ctx.arc(dx, dy, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  // 倒计时与捕获数
  hudPair(ctx, PLAY_ARENA.x + 14, PLAY_ARENA.y + 24, '剩余', Math.ceil(play.tLeft) + ' 秒', 'left', THEME.accents[5])
  hudPair(ctx, PLAY_ARENA.x + PLAY_ARENA.w - 14, PLAY_ARENA.y + 24, '捕获', String(play.catches), 'right', THEME.gold)
}

/** 关灯遮罩（睡眠中）：深蓝夜色 + 月亮。 */
function drawNightVeil(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(8,10,30,0.62)'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.beginPath()
  ctx.arc(880, 110, 26, 0, Math.PI * 2)
  ctx.fillStyle = '#dfe3f5'
  glow(ctx, '#dfe3f5', 14)
  ctx.fill()
  noGlow(ctx)
}

/** 一帧渲染入口：场景 → 宠物 → UI → 遮罩/覆盖层。 */
export function renderPet(ctx: CanvasRenderingContext2D, state: PetState, timeMs: number, paused: boolean): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawRoom(ctx, state)
  drawPet(ctx, state, timeMs)
  drawStatsPanel(ctx, state)
  drawStageHud(ctx, state)
  drawButtons(ctx, state)
  if (state.play !== null) drawPlayArena(ctx, state, timeMs)
  if (state.sleeping && state.play === null) drawNightVeil(ctx)
  if (state.dead) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '它回到了宠物星球', '按 R 重新领养一颗蛋', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续照料', THEME.accents[0])
  }
}
