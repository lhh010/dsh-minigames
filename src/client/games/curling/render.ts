/**
 * 冰壶渲染层：微噪点冰面、红蓝同心营垒圈、带手柄的旋转壶身、方向
 * 摆针 + 力度条 + 擦冰余量 UI、局分/总分计分板、局间与胜负遮罩。
 * 只做绘制，不改状态；全部绘制在固定逻辑坐标系（LOGICAL_W x
 * LOGICAL_H）内完成，赛道世界坐标 1:1 映射进冰面矩形。
 */
import {
  HACK_X, HACK_Y, HOUSE_X, HOUSE_Y, RINGS, SHEET_LEN, SHEET_WID, STONE_R,
  SWEEP_CHARGES, type CurlingState, type Stone,
} from './logic.ts'
import { mulberry32 } from './logic.ts'
import {
  THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = 680
export const LOGICAL_H = 380
const MARGIN = 26
/** 世界单位 → 逻辑像素比例。 */
const SCALE = (LOGICAL_W - MARGIN * 2) / SHEET_LEN
const SHEET_X = MARGIN
const SHEET_Y = 96
const ICE_W = SHEET_LEN * SCALE
const ICE_H = SHEET_WID * SCALE

const PLAYER_COLOR = '#f7768e'
const AI_COLOR = '#7aa2f7'

/** 冰面噪点（种子固定，静态纹理）。 */
interface Speck { x: number; y: number; r: number; a: number }
const SPECKS: Speck[] = (() => {
  const rng = mulberry32(0x51ee7)
  const out: Speck[] = []
  for (let i = 0; i < 240; i += 1) {
    out.push({ x: rng() * SHEET_LEN, y: rng() * SHEET_WID, r: 0.3 + rng() * 0.5, a: 0.04 + rng() * 0.06 })
  }
  return out
})()

export interface CurlingView {
  state: CurlingState
  paused: boolean
}

/** 世界坐标 → 逻辑画布坐标。 */
export function worldToLogical(x: number, y: number): { x: number; y: number } {
  return { x: SHEET_X + x * SCALE, y: SHEET_Y + y * SCALE }
}

/** 逻辑画布坐标 → 世界坐标。 */
export function logicalToWorld(x: number, y: number): { x: number; y: number } {
  return { x: (x - SHEET_X) / SCALE, y: (y - SHEET_Y) / SCALE }
}

function drawIce(ctx: CanvasRenderingContext2D): void {
  roundRectPath(ctx, SHEET_X - 8, SHEET_Y - 8, ICE_W + 16, ICE_H + 16, 10)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  const g = ctx.createLinearGradient(SHEET_X, SHEET_Y, SHEET_X + ICE_W, SHEET_Y + ICE_H)
  g.addColorStop(0, '#e6eef7')
  g.addColorStop(0.5, '#d5e1ee')
  g.addColorStop(1, '#c3d3e4')
  roundRectPath(ctx, SHEET_X, SHEET_Y, ICE_W, ICE_H, 4)
  ctx.fillStyle = g
  ctx.fill()
  // 微噪点：冰晶颗粒的静态纹理。
  for (const sp of SPECKS) {
    const p = worldToLogical(sp.x, sp.y)
    ctx.fillStyle = 'rgba(90,110,140,' + sp.a.toFixed(3) + ')'
    ctx.beginPath()
    ctx.arc(p.x, p.y, sp.r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 前卫线（hog）与丁字线（tee）。
  const hog = worldToLogical(45, 0)
  const tee = worldToLogical(HOUSE_X, 0)
  ctx.strokeStyle = 'rgba(70,110,190,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(hog.x, SHEET_Y)
  ctx.lineTo(hog.x, SHEET_Y + ICE_H)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(60,60,70,0.35)'
  ctx.beginPath()
  ctx.moveTo(tee.x, SHEET_Y)
  ctx.lineTo(tee.x, SHEET_Y + ICE_H)
  ctx.stroke()
}

function drawHouse(ctx: CanvasRenderingContext2D): void {
  const c = worldToLogical(HOUSE_X, HOUSE_Y)
  const colors = ['#3b6fd4', '#eef3f9', '#d64550']
  for (let i = 0; i < RINGS.length; i += 1) {
    ctx.beginPath()
    ctx.arc(c.x, c.y, RINGS[i]! * SCALE, 0, Math.PI * 2)
    ctx.fillStyle = colors[i]!
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,55,80,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function drawStone(ctx: CanvasRenderingContext2D, st: Stone, isThrown: boolean): void {
  const p = worldToLogical(st.x, st.y)
  const r = STONE_R * SCALE
  const color = st.side === 'P' ? PLAYER_COLOR : AI_COLOR
  if (isThrown) glow(ctx, color, 9)
  // 花岗岩壶身。
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.15, p.x, p.y, r)
  g.addColorStop(0, '#6b6f78')
  g.addColorStop(1, '#33363e')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
  if (isThrown) noGlow(ctx)
  // 队伍色环。
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2)
  ctx.stroke()
  // 手柄：随 rot 旋转的横杆 + 两端把手。
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(st.rot)
  ctx.strokeStyle = '#d8dce4'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(-r * 0.62, 0)
  ctx.lineTo(r * 0.62, 0)
  ctx.stroke()
  ctx.fillStyle = color
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(dir * r * 0.62, 0, r * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawAim(ctx: CanvasRenderingContext2D, state: CurlingState): void {
  const from = worldToLogical(HACK_X, HACK_Y)
  const angle = state.aimAngle
  if (state.phase === 'aimDir') {
    // 摆针：虚线预瞄 + 底部弧形摆动指示。
    ctx.strokeStyle = 'rgba(226,226,238,0.7)'
    ctx.lineWidth = 1.6
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(from.x + Math.cos(angle) * 90 * SCALE / 3, from.y + Math.sin(angle) * 90 * SCALE / 3)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(from.x, from.y, 26, angle - 0.5, angle + 0.5)
    ctx.stroke()
  }
  // 出发点标记。
  ctx.fillStyle = 'rgba(40,55,80,0.5)'
  ctx.beginPath()
  ctx.arc(from.x, from.y, 4, 0, Math.PI * 2)
  ctx.fill()
}

function drawPowerBar(ctx: CanvasRenderingContext2D, state: CurlingState): void {
  if (state.phase !== 'aimPower' && state.phase !== 'aimDir') return
  const w = 200
  const x = (LOGICAL_W - w) / 2
  const y = LOGICAL_H - 18
  roundRectPath(ctx, x, y - 9, w, 11, 5)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  const p = state.phase === 'aimPower' ? state.power : 0
  roundRectPath(ctx, x + 1.5, y - 7.5, Math.max(0, (w - 3) * p), 8, 4)
  ctx.fillStyle = p > 0.85 ? THEME.bad : p > 0.6 ? THEME.gold : THEME.good
  ctx.fill()
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(state.phase === 'aimDir' ? '点击锁定方向' : '点击锁定力度', LOGICAL_W / 2, y - 16)
}

function drawSweepUI(ctx: CanvasRenderingContext2D, state: CurlingState): void {
  if (state.phase !== 'sliding' || state.thrownStone === null || state.thrownStone.side !== 'P') return
  const x = LOGICAL_W / 2
  const y = LOGICAL_H - 18
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('擦冰', x, y - 4)
  for (let i = 0; i < SWEEP_CHARGES; i += 1) {
    const dx = x + (i - (SWEEP_CHARGES - 1) / 2) * 20
    ctx.beginPath()
    ctx.arc(dx, y + 9, 5, 0, Math.PI * 2)
    if (i < state.sweepCharges) {
      ctx.fillStyle = state.sweepActive ? THEME.gold : THEME.good
      ctx.fill()
    } else {
      ctx.strokeStyle = THEME.panelEdge
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}

function drawScoreboard(ctx: CanvasRenderingContext2D, state: CurlingState): void {
  hudPair(ctx, 14, 24, '我方', String(state.playerTotal), 'left', PLAYER_COLOR)
  hudPair(ctx, LOGICAL_W - 14, 24, 'AI', String(state.aiTotal), 'right', AI_COLOR)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText('第 ' + Math.min(state.end, 3) + ' / 3 局', LOGICAL_W / 2, 24)
  // 局分历史 + 剩壶数。
  const hist = state.endScores.map(s => s.p + ':' + s.a).join('  ')
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(hist.length > 0 ? '局分 ' + hist : '局分 —', LOGICAL_W / 2, 42)
  const leftP = 4 - state.thrownP
  const leftA = 4 - state.thrownA
  ctx.textAlign = 'left'
  ctx.fillText('剩壶 x' + leftP, 14, 44)
  ctx.textAlign = 'right'
  ctx.fillText('剩壶 x' + leftA, LOGICAL_W - 14, 44)
}

/** 渲染冰壶一帧（纯绘制）。 */
export function renderCurling(ctx: CanvasRenderingContext2D, view: CurlingView): void {
  const { state } = view
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawScoreboard(ctx, state)
  drawIce(ctx)
  drawHouse(ctx)
  if (state.phase === 'aimDir' || state.phase === 'aimPower') drawAim(ctx, state)
  for (const st of state.stones) drawStone(ctx, st, st === state.thrownStone)
  drawPowerBar(ctx, state)
  drawSweepUI(ctx, state)
  // 状态提示行。
  if (state.phase === 'sliding' || state.phase === 'endScore' || state.phase === 'gameOver') {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(state.msg, LOGICAL_W / 2, 78)
  }
  if (state.phase === 'endScore') {
    const last = state.endScores[state.endScores.length - 1]
    const p = last?.p ?? 0
    const a = last?.a ?? 0
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H,
      '第 ' + state.end + ' 局 ' + (p > a ? '我方 ' + p + ' 分' : a > p ? 'AI ' + a + ' 分' : '双方 0 分'),
      '累计 ' + state.playerTotal + ' : ' + state.aiTotal + ' · 点击继续')
  } else if (state.phase === 'gameOver') {
    const win = state.playerTotal > state.aiTotal
    const tie = state.playerTotal === state.aiTotal
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H,
      tie ? '平 局' : win ? '胜 利' : '惜 败',
      '总分 ' + state.playerTotal + ' : ' + state.aiTotal + ' · 点击或 R 重开',
      tie ? THEME.text : win ? THEME.good : THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂 停', '按 P 继续')
  }
}
