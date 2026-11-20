/**
 * 迷你爬塔 TowerCard 渲染层：卡牌风画面——左侧塔层进度侧栏、顶部敌我
 * 血条/格挡条与意图图标（telegraph 蓄力警示）、中央能量水晶、底部手牌
 * 扇形、奖励三卡、结束回合按钮与结算/暂停遮罩。布局常量与 hit 检测共用
 * 同一纯函数，保证命中区域与绘制区域逐像素一致；动态文本右侧锚定防
 * 串位。本文件只画不改逻辑。
 */
import {
  TOTAL_FLOORS, cardCost, cardName, enemyIntent, type Card, type TowerState,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

/** 逻辑画布尺寸。 */
export const W = 960
export const H = 640
/** 手牌卡面尺寸。 */
export const CARD_W = 92
export const CARD_H = 120

/** 浮动提示文字（由 index 推进 age）。 */
export interface FloatText {
  text: string
  x: number
  y: number
  color: string
  age: number
  maxAge: number
}

/** 渲染视图参数：逻辑状态 + 动画进度 + 暂停。 */
export interface TowerView {
  state: TowerState
  floats: FloatText[]
  /** 敌人受击抖动 0-1（衰减）。 */
  enemyShake: number
  /** 勇者受击/格挡闪光 0-1（衰减）。 */
  playerFlash: number
  paused: boolean
}

/** 牌面配色。 */
function cardColor(kind: Card['kind']): string {
  if (kind === 'attack') return THEME.bad
  if (kind === 'block') return '#7dcfff'
  if (kind === 'combo') return '#ff9e64'
  if (kind === 'draw') return '#bb9af7'
  if (kind === 'energy') return THEME.gold
  return '#73daco'
}

/** 手牌第 i 张的卡面矩形（扇形布局，n 为手牌数）。 */
export function cardSlot(i: number, n: number): { x: number; y: number; rot: number } {
  const spacing = Math.min(98, 620 / Math.max(1, n - 1 || 1))
  const off = i - (n - 1) / 2
  const x = W / 2 + off * spacing - CARD_W / 2
  const y = 490 + Math.abs(off) * 2
  const rot = off * 0.05
  return { x, y, rot }
}

/** 手牌命中检测：返回卡牌下标，未命中 -1。 */
export function hitCard(px: number, py: number, n: number): number {
  for (let i = 0; i < n; i += 1) {
    const s = cardSlot(i, n)
    if (px >= s.x && px <= s.x + CARD_W && py >= s.y && py <= s.y + CARD_H) return i
  }
  return -1
}

/** 敌人槽位矩形（渲染与命中共用）：x/y/w/h。 */
export function enemySlot(i: number, n: number): { x: number; y: number; w: number; h: number } {
  const gap = n > 1 ? 150 : 0
  const cx = W / 2 + (i - (n - 1) / 2) * (150 + gap)
  return { x: cx - 75, y: 100, w: 150, h: 130 }
}

/** 敌人命中检测：只命中存活敌人，返回其下标，未命中 -1。 */
export function hitEnemy(px: number, py: number, state: TowerState): number {
  const alive = state.enemies.map((e, i) => (e.dead ? -1 : i)).filter((i) => i >= 0)
  for (const i of alive) {
    const r = enemySlot(i, state.enemies.length)
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i
  }
  return -1
}

/** 结束回合按钮矩形。 */
export const END_TURN_RECT = { x: 800, y: 300, w: 148, h: 46 }

/** 按钮命中检测。 */
export function hitEndTurn(px: number, py: number): boolean {
  return px >= END_TURN_RECT.x && px <= END_TURN_RECT.x + END_TURN_RECT.w
    && py >= END_TURN_RECT.y && py <= END_TURN_RECT.y + END_TURN_RECT.h
}

/** 奖励卡矩形（三张，i=0..2）。 */
export function rewardSlot(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 175 + i * 210, y: 160, w: 190, h: 230 }
}

/** 奖励卡命中检测：返回奖励下标，未命中 -1。 */
export function hitReward(px: number, py: number): number {
  for (let i = 0; i < 3; i += 1) {
    const r = rewardSlot(i)
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i
  }
  return -1
}

/** 血条：底槽 + 按比例填充 + 数值文本（右侧锚定防溢出）。 */
function drawBar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  ratio: number, color: string, label: string,
): void {
  roundRectPath(ctx, x, y, w, h, 4)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fill()
  const filled = Math.max(0, Math.min(1, ratio)) * (w - 4)
  if (filled > 0) {
    roundRectPath(ctx, x + 2, y + 2, filled, h - 4, 3)
    ctx.fillStyle = color
    ctx.fill()
  }
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText(label, x + w / 2, y + h - 3)
}

/** 意图图标行：攻击显示伤害数字，蓄力显示警示，防御显示盾，虚弱染紫。 */
function drawIntent(ctx: CanvasRenderingContext2D, cx: number, y: number, intent: { type: string; dmg: number }, weak: boolean): void {
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  if (intent.type === 'charge') {
    ctx.fillStyle = THEME.gold
    glow(ctx, THEME.gold, 8)
    ctx.fillText('⚠ 蓄力', cx, y)
    noGlow(ctx)
  } else if (intent.type === 'big') {
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 8)
    ctx.fillText('⚡ ' + intent.dmg + '!', cx, y)
    noGlow(ctx)
  } else if (intent.type === 'defend') {
    ctx.fillStyle = '#7dcfff'
    ctx.fillText('⛨ 防御', cx, y)
  } else {
    ctx.fillStyle = weak ? '#bb9af7' : THEME.bad
    ctx.fillText('⚔ ' + intent.dmg + (weak ? ' (虚)' : ''), cx, y)
  }
}

/** 敌人立绘：简笔图形（头身块 + 眼），charge 型带蓄力光环。 */
function drawEnemyFigure(ctx: CanvasRenderingContext2D, cx: number, y: number, r: { x: number; y: number; w: number; h: number }, color: string, charging: boolean): void {
  const bx = cx - 34
  const by = y + 34
  if (charging) glow(ctx, THEME.gold, 16)
  ctx.fillStyle = color
  roundRectPath(ctx, bx, by, 68, 62, 12)
  ctx.fill()
  noGlow(ctx)
  // 双眼
  ctx.fillStyle = '#10101a'
  ctx.beginPath()
  ctx.arc(cx - 14, by + 22, 5, 0, Math.PI * 2)
  ctx.arc(cx + 14, by + 22, 5, 0, Math.PI * 2)
  ctx.fill()
  // 嘴
  ctx.strokeStyle = '#10101a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 14, by + 44)
  ctx.lineTo(cx + 14, by + 44)
  ctx.stroke()
  void r
}

/** 一名敌人的完整绘制（意图/立绘/血条/格挡/虚弱标记）。 */
function drawEnemy(ctx: CanvasRenderingContext2D, state: TowerState, i: number, shake: number): void {
  const e = state.enemies[i]!
  const r = enemySlot(i, state.enemies.length)
  if (e.dead) {
    ctx.globalAlpha = 0.28
  }
  const cx = r.x + r.w / 2 + (shake > 0 ? (Math.sin(shake * 40) * 6 * shake) : 0)
  const color = e.pattern === 'charge' ? THEME.gold : accent(i + 2)
  drawIntent(ctx, cx, r.y + 12, enemyIntent(e), e.weakTurns > 0)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText(e.name, cx, r.y + 32)
  drawEnemyFigure(ctx, cx, r.y + 34, r, color, e.charging)
  drawBar(ctx, cx - 60, r.y + 104, 120, 14, e.hp / e.maxHp, THEME.bad, e.hp + '/' + e.maxHp)
  if (e.block > 0) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = '#7dcfff'
    ctx.textAlign = 'center'
    ctx.fillText('盾 ' + e.block, cx, r.y + 128)
  }
  if (e.weakTurns > 0) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = '#bb9af7'
    ctx.textAlign = 'left'
    ctx.fillText('虚' + e.weakTurns, r.x, r.y + 128)
  }
  ctx.globalAlpha = 1
}

/** 一张卡（手牌/奖励卡）：配色边框、牌名、数值、费用点。 */
function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: Card, playable: boolean): void {
  const color = cardColor(card.kind)
  roundRectPath(ctx, x, y, w, h, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  if (!playable) ctx.globalAlpha = 0.45
  glow(ctx, color, 8)
  ctx.stroke()
  noGlow(ctx)
  // 费用点（左上）。
  ctx.beginPath()
  ctx.arc(x + 13, y + 13, 9, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#10101a'
  ctx.fillText(String(cardCost(card.kind)), x + 13, y + 17)
  // 牌名（居中，两段式避免超宽）。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.textAlign = 'center'
  ctx.fillText(cardName(card), x + w / 2, y + h / 2 - 6)
  // 类别注记。
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  const note = card.kind === 'attack' ? '对敌单体'
    : card.kind === 'block' ? '持续到下回合'
      : card.kind === 'combo' ? '两段各 5'
        : card.kind === 'draw' ? '立即抽 2'
          : card.kind === 'energy' ? '0 费'
            : '敌伤 -25%'
  ctx.fillText(note, x + w / 2, y + h / 2 + 14)
  ctx.globalAlpha = 1
}

/** 奖励三卡（文字卡，非牌面）。 */
function drawRewardCard(ctx: CanvasRenderingContext2D, i: number, label: string): void {
  const r = rewardSlot(i)
  const color = [THEME.good, '#7dcfff', '#ff9e64'][i]!
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 12)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  glow(ctx, color, 10)
  ctx.stroke()
  noGlow(ctx)
  // 图形区。
  ctx.fillStyle = color
  const icon = ['✚', '⌫', '✦'][i]!
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(icon, r.x + r.w / 2, r.y + 92)
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  const head = ['新牌入组', '治疗', '删牌'][i]!
  ctx.fillText(head, r.x + r.w / 2, r.y + 132)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(label, r.x + r.w / 2, r.y + 156)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点击选择', r.x + r.w / 2, r.y + r.h - 16)
}

/** 主渲染入口。 */
export function renderTower(ctx: CanvasRenderingContext2D, view: TowerView): void {
  const { state, floats, enemyShake, playerFlash, paused } = view
  drawBackground(ctx, W, H)

  // —— 顶部 HUD：左侧血量/格挡，右侧牌堆与回合（右侧锚定）。
  hudPair(ctx, 16, 24, '血量', state.player.hp + '/' + state.player.maxHp, 'left',
    state.player.hp <= 15 ? THEME.bad : THEME.text)
  hudPair(ctx, 16, 44, '格挡', String(state.player.block), 'left', '#7dcfff')
  hudPair(ctx, W - 16, 24, '牌组', state.deck.length + ' 弃' + state.discard.length, 'right')
  hudPair(ctx, W - 16, 44, '回合', String(state.turn), 'right')

  // —— 左侧塔层进度侧栏。
  roundRectPath(ctx, 12, 64, 104, 548, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText('爬塔', 64, 88)
  for (let f = 1; f <= TOTAL_FLOORS; f += 1) {
    const y = 566 - (f - 1) * 50
    const isBoss = f === 5 || f === TOTAL_FLOORS
    const reached = f <= state.floor
    roundRectPath(ctx, 24, y, 80, 34, 6)
    ctx.fillStyle = reached ? (isBoss ? THEME.gold : THEME.panelEdge) : 'rgba(255,255,255,0.05)'
    ctx.fill()
    ctx.font = (f === state.floor ? 'bold ' : '600 ') + '12px system-ui, sans-serif'
    ctx.fillStyle = reached ? THEME.text : THEME.textMuted
    ctx.fillText((isBoss ? 'BOSS ' : '') + f + ' 层', 64, y + 21)
  }

  // —— 抽牌堆 / 弃牌堆（顶部两角小卡背 + 计数）。
  roundRectPath(ctx, 150, 70, 56, 78, 6)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = accent(1)
  ctx.stroke()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('抽', 178, 114)
  hudPair(ctx, 178, 164, '抽', String(state.deck.length), 'left')
  roundRectPath(ctx, 754, 70, 56, 78, 6)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.textMuted
  ctx.stroke()
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('弃', 782, 114)
  hudPair(ctx, 810, 164, '弃', String(state.discard.length), 'right')

  // —— 消息行。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(state.message, W / 2, 76)

  if (state.phase === 'battle') {
    // —— 敌人。
    for (let i = 0; i < state.enemies.length; i += 1) drawEnemy(ctx, state, i, enemyShake)
    // —— 勇者立绘 + 血条/格挡。
    const flash = playerFlash > 0 ? playerFlash : 0
    const pcx = W / 2
    roundRectPath(ctx, pcx - 30, 306, 60, 54, 10)
    ctx.fillStyle = THEME.good
    if (flash > 0) glow(ctx, '#7dcfff', 14 * flash)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = '#10101a'
    ctx.beginPath()
    ctx.arc(pcx - 10, 324, 4, 0, Math.PI * 2)
    ctx.arc(pcx + 10, 324, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText('勇者', pcx, 300)
    drawBar(ctx, pcx - 80, 368, 160, 14, state.player.hp / state.player.maxHp, THEME.good,
      state.player.hp + '/' + state.player.maxHp)
    if (state.player.block > 0) {
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillStyle = '#7dcfff'
      ctx.textAlign = 'center'
      ctx.fillText('盾 ' + state.player.block, pcx, 392)
    }
    // —— 能量水晶。
    const energyColor = state.player.energy > 0 ? THEME.gold : THEME.textMuted
    glow(ctx, energyColor, 12)
    ctx.fillStyle = energyColor
    ctx.beginPath()
    ctx.moveTo(668, 300)
    ctx.lineTo(690, 326)
    ctx.lineTo(668, 352)
    ctx.lineTo(646, 326)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText(state.player.energy + '/' + state.player.energyMax, 668, 331)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('能量', 668, 370)
    // —— 结束回合按钮。
    roundRectPath(ctx, END_TURN_RECT.x, END_TURN_RECT.y, END_TURN_RECT.w, END_TURN_RECT.h, 10)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = accent(0)
    ctx.stroke()
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText('结束回合', 874, 322)
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('空格', 874, 338)
    // —— 手牌扇形。
    for (let i = 0; i < state.hand.length; i += 1) {
      const card = state.hand[i]!
      const s = cardSlot(i, state.hand.length)
      const playable = state.player.energy >= cardCost(card.kind)
      ctx.save()
      ctx.translate(s.x + CARD_W / 2, s.y + CARD_H / 2)
      ctx.rotate(s.rot)
      drawCard(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, card, playable)
      ctx.restore()
    }
  } else if (state.phase === 'reward') {
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.gold
    ctx.fillText(spaced('选择一项奖励'), W / 2, 130)
    for (let i = 0; i < state.rewards.length && i < 3; i += 1) {
      drawRewardCard(ctx, i, state.rewards[i]!.label)
    }
  } else {
    // dead / won：先画空场再遮罩。
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(state.message, W / 2, H / 2 - 60)
  }

  // —— 浮字。
  for (const f of floats) {
    const t = f.age / f.maxAge
    ctx.globalAlpha = 1 - t
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y - t * 26)
  }
  ctx.globalAlpha = 1

  // —— 常驻玩法速览（一行）。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('每回合3能量：攻击牌打首个敌人(多敌可点击目标) · 格挡持续到下回合 · ⚠蓄力=下回合重击 · ␣结束回合 R重开 P暂停', W / 2, 636)

  if (paused) drawOverlay(ctx, W, H, '已暂停', '按 P 继续', THEME.text)
  else if (state.phase === 'dead') drawOverlay(ctx, W, H, '爬塔失败', state.message + ' · R 重开', THEME.bad)
  else if (state.phase === 'won') drawOverlay(ctx, W, H, '登顶成功', '十层尽破 · R 再爬一次', THEME.gold)
}
