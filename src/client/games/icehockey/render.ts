/**
 * 桌上冰球渲染器：冰蓝渐变台面（中线 + 中圈弧、两端发光球门开口）、
 * 手柄感圆形推杆（玩家 accent(0) 蓝、AI accent(4) 红）、带拖尾的冰球、
 * 进球闪屏 + 粒子、居中大字比分 HUD（比分 / 局分 / 难度），终场用共
 * 享 overlay。纯 canvas 绘制，状态由 logic.ts 提供。
 */
import type { IceHockeyState } from './logic.ts'
import {
  W, H, HUD_H, TOP, BOT, CENTER_Y, PUCK_R, MALLET_R, GOAL_HALF, WIN_SCORE,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

/** 渲染层逻辑宽（供宿主对齐）。 */
export const ICEHOCKEY_W = W
/** 渲染层逻辑高。 */
export const ICEHOCKEY_H = H

const PLAYER_COLOR = accent(0)
const AI_COLOR = accent(4)
const PUCK_COLOR = '#c7d3e8'
const RINK_LINE = 'rgba(125,207,255,0.35)'

// 单画布单实例：模块级粒子系统、拖尾与闪屏时钟。
const particles = createParticles()
const trail: { x: number; y: number }[] = []
let prevNow = 0
let prevPlayerScore = 0
let prevAiScore = 0
let flashMs = 0
let flashColor: string = THEME.good

/** 绘制一帧。 */
export function renderIcehockey(ctx: CanvasRenderingContext2D, state: IceHockeyState): void {
  const now = performance.now()
  const dt = Math.min(50, Math.max(0, now - prevNow))
  prevNow = now

  drawBackground(ctx, W, H)
  drawRink(ctx)
  drawGoalMouth(ctx, TOP, AI_COLOR)
  drawGoalMouth(ctx, BOT, PLAYER_COLOR)
  drawMallet(ctx, state.ai.x, state.ai.y, AI_COLOR)
  drawMallet(ctx, state.player.x, state.player.y, PLAYER_COLOR)
  drawPuck(ctx, state)

  // 进球检测：闪屏 + 球门口粒子爆发。
  if (state.playerScore !== prevPlayerScore) {
    flashMs = 320
    flashColor = THEME.good
    particles.burst(state.puck.x, TOP, THEME.good, 22, 220)
  }
  if (state.aiScore !== prevAiScore) {
    flashMs = 320
    flashColor = THEME.bad
    particles.burst(state.puck.x, BOT, THEME.bad, 22, 220)
  }
  prevPlayerScore = state.playerScore
  prevAiScore = state.aiScore
  particles.tick(ctx, dt)
  if (flashMs > 0) {
    ctx.globalAlpha = 0.22 * (flashMs / 320)
    ctx.fillStyle = flashColor
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
    flashMs -= dt
  }

  drawHud(ctx, state)

  if (state.over === 'player') {
    drawOverlay(ctx, W, H, '你赢了 ' + state.playerGames + ':' + state.aiGames, '点击或按空格重新开始', THEME.good)
  } else if (state.over === 'ai') {
    drawOverlay(ctx, W, H, '你输了 ' + state.playerGames + ':' + state.aiGames, '点击或按空格重新开始', THEME.bad)
  } else if (state.serveCd > 0) {
    ctx.textAlign = 'center'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(state.serveSide === 'player' ? '你方发球…' : '对方发球…', W / 2, CENTER_Y - 10)
  }
}

/** 冰面球台：半透明冰蓝填充 + 描边 + 中线 + 中圈。 */
function drawRink(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(125,207,255,0.06)'
  roundRectPath(ctx, 6, TOP - 8, W - 12, BOT - TOP + 16, 18)
  ctx.fill()
  ctx.strokeStyle = RINK_LINE
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.strokeStyle = THEME.panelEdge
  ctx.beginPath()
  ctx.moveTo(10, CENTER_Y)
  ctx.lineTo(W - 10, CENTER_Y)
  ctx.stroke()

  ctx.strokeStyle = RINK_LINE
  ctx.beginPath()
  ctx.arc(W / 2, CENTER_Y, 62, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = RINK_LINE
  ctx.beginPath()
  ctx.arc(W / 2, CENTER_Y, 5, 0, Math.PI * 2)
  ctx.fill()
}

/** 球门开口：发光粗线横跨门宽。 */
function drawGoalMouth(ctx: CanvasRenderingContext2D, y: number, color: string): void {
  glow(ctx, color, 16)
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(W / 2 - GOAL_HALF, y)
  ctx.lineTo(W / 2 + GOAL_HALF, y)
  ctx.stroke()
  noGlow(ctx)
}

/** 圆形推杆：外圈主体 + 内圈手柄 + 高光点。 */
function drawMallet(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  glow(ctx, color, 14)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, MALLET_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(13,13,20,0.45)'
  ctx.beginPath()
  ctx.arc(x, y, MALLET_R * 0.62, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.arc(x, y, MALLET_R * 0.22, 0, Math.PI * 2)
  ctx.fill()
}

/** 冰球：拖尾渐隐圆 + 主体与高光。 */
function drawPuck(ctx: CanvasRenderingContext2D, state: IceHockeyState): void {
  trail.push({ x: state.puck.x, y: state.puck.y })
  if (trail.length > 10) trail.shift()
  for (let i = 0; i < trail.length - 1; i += 1) {
    const t = trail[i]!
    ctx.globalAlpha = 0.05 + (0.2 * i) / trail.length
    ctx.fillStyle = PUCK_COLOR
    ctx.beginPath()
    ctx.arc(t.x, t.y, PUCK_R * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  glow(ctx, PUCK_COLOR, 12)
  ctx.fillStyle = '#2a2f3d'
  ctx.beginPath()
  ctx.arc(state.puck.x, state.puck.y, PUCK_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = PUCK_COLOR
  ctx.lineWidth = 2.5
  ctx.stroke()
}

/** 顶部 HUD：大字比分居中，局分居左，难度与目标分居右。 */
function drawHud(ctx: CanvasRenderingContext2D, state: IceHockeyState): void {
  ctx.fillStyle = 'rgba(13,13,20,0.45)'
  ctx.fillRect(0, 0, W, HUD_H)
  hudPair(ctx, 10, 26, '局分', state.playerGames + '-' + state.aiGames, 'left', THEME.gold)
  ctx.textAlign = 'center'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillStyle = THEME.good
  ctx.fillText(String(state.playerScore), W / 2 - 46, 30)
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(':', W / 2, 30)
  ctx.fillStyle = THEME.bad
  ctx.fillText(String(state.aiScore), W / 2 + 46, 30)
  hudPair(ctx, W - 10, 26, '难度', 'L' + state.level, 'right', THEME.text)
  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('先到 ' + WIN_SCORE + ' 分胜一局 · 3 局 2 胜', W / 2, 40)
}
