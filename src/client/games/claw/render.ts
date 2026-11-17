/**
 * 抓娃娃机 Claw 渲染层：玻璃柜（反光渐变 + 高光）、按纵深缩小的毛绒
 * 娃娃、导轨与台车、缆绳钟摆摆动、三指开合爪、夹中提升 / 滑落 / 入洞
 * 粒子、币数 / 分数 / 轮次 HUD、暂停与结束遮罩。无状态：只读逻辑态，
 * 事件转粒子爆发（logic 每帧开头清空事件）。
 */
import {
  W, H, CABINET, COINS_PER_ROUND, TOTAL_ROUNDS, DROP_DEPTH,
  dollY, swingDx, type ClawState, type Doll,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 机柜外框（含出口仓）。 */
const CASE = { x: 30, y: 46, w: 590, h: 416 } as const

/**
 * 画机柜：木纹侧板、玻璃反光渐变、对角高光、地面与出口仓。
 * @param ctx - 画布上下文。
 */
function drawCabinet(ctx: CanvasRenderingContext2D): void {
  // 外框
  roundRectPath(ctx, CASE.x, CASE.y, CASE.w, CASE.h, 14)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 3
  ctx.stroke()
  // 玻璃面：竖向反光渐变
  const glass = ctx.createLinearGradient(0, CASE.y, 0, CASE.y + CASE.h)
  glass.addColorStop(0, 'rgba(190,210,255,0.10)')
  glass.addColorStop(0.45, 'rgba(120,140,200,0.04)')
  glass.addColorStop(1, 'rgba(60,80,140,0.09)')
  ctx.fillStyle = glass
  ctx.fillRect(CASE.x + 4, CASE.y + 4, CASE.w - 8, CASE.h - 8)
  // 对角高光条
  ctx.fillStyle = 'rgba(230,240,255,0.06)'
  ctx.beginPath()
  ctx.moveTo(CASE.x + 70, CASE.y + 6)
  ctx.lineTo(CASE.x + 150, CASE.y + 6)
  ctx.lineTo(CASE.x + 60, CASE.y + CASE.h - 10)
  ctx.lineTo(CASE.x + 6, CASE.y + CASE.h - 10)
  ctx.closePath()
  ctx.fill()
  // 地面
  const floor = ctx.createLinearGradient(0, CABINET.floorY, 0, CABINET.floorY + 40)
  floor.addColorStop(0, '#2a2a3c')
  floor.addColorStop(1, '#20202e')
  ctx.fillStyle = floor
  ctx.fillRect(CASE.x + 4, CABINET.floorY, CASE.w - 8, CASE.y + CASE.h - CABINET.floorY - 4)
  ctx.strokeStyle = 'rgba(122,162,247,0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(CASE.x + 6, CABINET.floorY)
  ctx.lineTo(CASE.w + CASE.x - 6, CABINET.floorY)
  ctx.stroke()
  // 出口仓：黑洞 + 金光标签
  const cx = CABINET.chuteX
  roundRectPath(ctx, cx - 34, CABINET.floorY - 58, 68, 56, 10)
  ctx.fillStyle = '#12121c'
  ctx.fill()
  glow(ctx, THEME.gold, 9)
  ctx.strokeStyle = 'rgba(224,175,104,0.8)'
  ctx.lineWidth = 2
  ctx.stroke()
  noGlow(ctx)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.gold
  ctx.fillText('出口', cx, CABINET.floorY - 66)
}

/**
 * 画导轨与台车（台车跟随爪的基准横向位置）。
 * @param ctx - 画布上下文。
 * @param trolleyX - 台车 x（px）。
 */
function drawRail(ctx: CanvasRenderingContext2D, trolleyX: number): void {
  glow(ctx, '#7dcfff', 6)
  ctx.strokeStyle = 'rgba(125,207,255,0.55)'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(CASE.x + 10, CABINET.railY)
  ctx.lineTo(CASE.w + CASE.x - 10, CABINET.railY)
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = '#3a3a52'
  roundRectPath(ctx, trolleyX - 16, CABINET.railY - 10, 32, 14, 4)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/**
 * 画一只毛绒娃娃：耳朵 + 圆头 + 圆滚身体 + 肚皮与眼睛，随纵深缩小，
 * 颜色按档次取稳定强调色。
 * @param ctx - 画布上下文。
 * @param doll - 娃娃数据。
 * @param t - 装饰时钟（ms，轻微呼吸浮动）。
 */
function drawDoll(ctx: CanvasRenderingContext2D, doll: Doll, t: number, yOverride: number | null = null): void {
  const depthScale = 1 - 0.3 * doll.z
  const s = doll.size * depthScale
  const bob = yOverride === null ? Math.sin(t / 820 + doll.id * 1.7) * 2 : 0
  // yOverride：携带时挂点固定（不呼吸浮动），地面娃娃走 dollY+bob。
  const y = yOverride ?? (dollY(doll) + bob)
  const color = accent(doll.kind + 2)
  glow(ctx, color, 8)
  ctx.fillStyle = color
  // 耳朵
  ctx.beginPath()
  ctx.arc(doll.x - s * 0.5, y - s * 1.18, s * 0.26, 0, Math.PI * 2)
  ctx.arc(doll.x + s * 0.5, y - s * 1.18, s * 0.26, 0, Math.PI * 2)
  ctx.fill()
  // 头 + 身体
  ctx.beginPath()
  ctx.arc(doll.x, y - s * 0.82, s * 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(doll.x, y, s * 0.72, s, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 肚皮高光
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.beginPath()
  ctx.ellipse(doll.x, y + s * 0.18, s * 0.38, s * 0.52, 0, 0, Math.PI * 2)
  ctx.fill()
  // 眼睛
  ctx.fillStyle = '#16161f'
  ctx.beginPath()
  ctx.arc(doll.x - s * 0.17, y - s * 0.88, s * 0.07, 0, Math.PI * 2)
  ctx.arc(doll.x + s * 0.17, y - s * 0.88, s * 0.07, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画爪：缆绳（钟摆倾角）、爪头与三指（下爪张开、携带收拢），携带的
 * 娃娃挂在爪下。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawClaw(ctx: CanvasRenderingContext2D, state: ClawState): void {
  const trolleyX = trolleyXOf(state)
  let clawX = trolleyX
  if (state.phase === 'drop') {
    const frac = 0.35 + 0.65 * Math.min(1, state.dropY / DROP_DEPTH)
    clawX = state.lockedX + swingDx(state) * frac
  } else if (state.phase === 'carry' && state.dropY > 0) {
    clawX = state.clawX + swingDx(state) * 0.3
  }
  const depth = state.phase === 'aimX' ? state.clawZ : state.lockedZ
  const scale = 1 - 0.24 * depth
  const clawY = CABINET.railY + 22 + state.dropY
  // 缆绳：台车 → 爪头（倾斜即钟摆）
  ctx.strokeStyle = 'rgba(226,226,238,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(trolleyX, CABINET.railY + 4)
  ctx.lineTo(clawX, clawY - 12 * scale)
  ctx.stroke()
  // 爪头
  glow(ctx, '#7dcfff', 7)
  ctx.fillStyle = '#9aa5c8'
  ctx.beginPath()
  ctx.arc(clawX, clawY - 8 * scale, 7 * scale, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 三指：携带收拢，其余阶段张开呼吸
  const openBase = state.carrying !== null ? 0.32 : 0.9
  const open = openBase + Math.sin(state.animMs / 260) * 0.08
  ctx.strokeStyle = '#c8cfe8'
  ctx.lineWidth = 3 * scale
  ctx.lineCap = 'round'
  for (let i = -1; i <= 1; i += 1) {
    const angle = Math.PI / 2 + i * open * 0.75
    const len = 22 * scale
    ctx.beginPath()
    ctx.moveTo(clawX, clawY - 8 * scale)
    ctx.lineTo(clawX + Math.cos(angle) * len, clawY - 8 * scale + Math.sin(angle) * len)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  // 携带的娃娃挂在爪下
  if (state.carrying !== null) {
    // 携带娃娃完全跟随爪尖：横=clawX、纵=爪下挂点（clawY+指尖），并按
    // 爪的纵深缩放——原实现纵向仍画在地面 dollY，提升时娃娃不跟爪。
    // 挂点：爪指尖下方、随爪深度缩放——娃娃真正跟着爪走。
    drawDoll(ctx, { ...state.carrying, x: clawX, z: depth }, state.animMs, clawY + 12 * scale)
  }
}

/** 台车基准横向位置：定位阶段随扫描，下落/提升用锁定值，平移跟随爪。 */
function trolleyXOf(state: ClawState): number {
  if (state.phase === 'aimX' || state.phase === 'aimZ') return state.clawX
  if (state.phase === 'carry' && state.dropY === 0) return state.clawX
  return state.lockedX
}

/** 按阶段给出底部操作提示。 */
function hintText(state: ClawState): string {
  if (state.phase === 'aimX') return '左右扫描中 · 点击 / 空格锁定水平位置'
  if (state.phase === 'aimZ') return '前后微调 · 再点一次锁定并下爪'
  if (state.phase === 'drop') return '下爪中……稳住摆动！'
  if (state.phase === 'carry') return state.carrying !== null ? '夹住了！护送出口……' : '空爪返回'
  return '本局结束 · 按 R 重开'
}

/**
 * 整帧渲染：背景 → 机柜 → 娃娃（后排在先）→ 导轨与爪 → 事件粒子 →
 * HUD → 提示 / 遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前逻辑态。
 * @param paused - 是否暂停（暂停时粒子冻结、盖遮罩）。
 */
export function renderClaw(ctx: CanvasRenderingContext2D, state: ClawState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawCabinet(ctx)
  const sorted = [...state.dolls].sort((a, b) => b.z - a.z)
  for (const doll of sorted) drawDoll(ctx, doll, state.animMs)
  drawRail(ctx, trolleyXOf(state))
  drawClaw(ctx, state)
  // 事件 → 粒子
  for (const ev of state.events) {
    if (ev.type === 'grab') particles.burst(ev.x, ev.y, accent(2), 14, 150)
    else if (ev.type === 'miss') particles.burst(ev.x, ev.y, THEME.textMuted, 8, 100)
    else if (ev.type === 'slip') particles.burst(ev.x, ev.y, THEME.bad, 18, 190)
    else if (ev.type === 'score') particles.burst(ev.x, ev.y, THEME.gold, 26, 230)
    else if (ev.type === 'roundStart') particles.burst(W / 2, CABINET.floorY - 90, accent(5), 16, 140)
  }
  particles.tick(ctx, paused ? 0 : 16)
  // HUD
  hudPair(ctx, 40, 28, '分数', String(state.score))
  hudPair(ctx, W / 2, 28, '币', state.coinsLeft + ' / ' + COINS_PER_ROUND, 'center')
  hudPair(ctx, W - 40, 28, '轮次', (state.round + 1) + ' / ' + TOTAL_ROUNDS, 'right')
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(hintText(state), W / 2, H - 14)
  if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '游戏结束', '总分 ' + state.score + ' · 累计夹中 ' + state.totalGrabs + ' 只', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续 · R 重开')
  }
}
