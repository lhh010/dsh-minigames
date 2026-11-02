/**
 * 推金币渲染：游艺厅机台侧视——台面、往复推板、三层币堆、投币下落、
 * 前玻璃反光、掉落结算浮字与粒子（粒子由 index 用 theme.createParticles
 * 驱动），HUD（分数 / 剩余币 / 倒计时）与暂停、结束 overlay。所有绘制
 * 使用 theme 共享视觉件，逻辑坐标 640x480 与 logic.ts 几何常量一致。
 */
import {
  COIN_R, DROP_X0, DROP_X1, EDGE_X, PLAT_Y, PUSH_W, PUSH_H,
  WALL_X, COOLDOWN_MS, ROUND_MS, colX, type CoinPusherState, type CoinType,
} from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

export const LOGICAL_W = 640
export const LOGICAL_H = 480

/** 币种主色（普通铜 / 银 / 金 / 奖励星）。 */
const COIN_COLORS: Readonly<Record<CoinType, { face: string; rim: string }>> = {
  normal: { face: '#cf8a5b', rim: '#8f5734' },
  silver: { face: '#cfd0dc', rim: '#8b8ca0' },
  gold: { face: '#e0af68', rim: '#a97f3a' },
  bonus: { face: '#f7768e', rim: '#a3455a' },
}

/** 浮字（掉落结算 +N）：由 render 持有池，index 在结算事件时 add。 */
export interface Floater {
  x: number
  y: number
  text: string
  color: string
  life: number
}

export interface FloaterSystem {
  /** 在结算点生成一枚上浮文字。 */
  add(x: number, y: number, text: string, color: string): void
  /** 推进并绘制；每帧调用一次。 */
  tick(ctx: CanvasRenderingContext2D, dtMs: number): void
  /** 池是否为空（脏渲染判断用；本游戏为 continuous，仅诊断）。 */
  size(): number
}

/** 创建浮字池（上限 24，超出丢最旧）。 */
export function createFloaters(): FloaterSystem {
  const pool: Floater[] = []
  return {
    add(x, y, text, color): void {
      if (pool.length >= 24) pool.shift()
      pool.push({ x, y, text, color, life: 0 })
    },
    tick(ctx, dtMs): void {
      for (let i = pool.length - 1; i >= 0; i -= 1) {
        const f = pool[i]!
        f.life += dtMs
        if (f.life > 900) { pool.splice(i, 1); continue }
        const a = 1 - f.life / 900
        ctx.globalAlpha = a
        ctx.font = 'bold 15px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = f.color
        glow(ctx, f.color, 8)
        ctx.fillText(f.text, f.x, f.y - (f.life / 900) * 42)
        noGlow(ctx)
      }
      ctx.globalAlpha = 1
    },
    size(): number { return pool.length },
  }
}

/** 机台静态件：背板、侧墙、台面、前沿口与底部收币口辉光。 */
function drawCabinet(ctx: CanvasRenderingContext2D, quakeDx: number): void {
  ctx.save()
  ctx.translate(quakeDx, 0)
  // 背板。
  ctx.fillStyle = '#15151f'
  roundRectPath(ctx, WALL_X - 10, 60, EDGE_X - WALL_X + 34, PLAT_Y - 60, 8)
  ctx.fill()
  // 台面：前沿右侧断开，形成掉落口。
  const slab = ctx.createLinearGradient(0, PLAT_Y, 0, PLAT_Y + 26)
  slab.addColorStop(0, '#3b3b52')
  slab.addColorStop(1, '#23233a')
  ctx.fillStyle = slab
  roundRectPath(ctx, WALL_X - 6, PLAT_Y, EDGE_X - WALL_X + 6, 26, 4)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  // 台沿高亮。
  ctx.fillStyle = 'rgba(226,226,238,0.28)'
  ctx.fillRect(WALL_X - 6, PLAT_Y, EDGE_X - WALL_X + 6, 3)
  // 掉落口与收币区辉光。
  glow(ctx, THEME.gold, 18)
  ctx.fillStyle = 'rgba(224,175,104,0.14)'
  ctx.fillRect(EDGE_X - 8, PLAT_Y + 26, 70, 100)
  noGlow(ctx)
  // 左墙。
  ctx.fillStyle = '#2a2a3e'
  roundRectPath(ctx, WALL_X - 14, 60, 14, PLAT_Y + 26 - 60, 4)
  ctx.fill()
  // 投币滑槽（顶部）。
  ctx.fillStyle = '#22222f'
  roundRectPath(ctx, DROP_X0 - 34, 34, DROP_X1 - DROP_X0 + 68, 30, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

/** 推板：金属渐变板身 + 连接左墙的推杆 + 前缘高光。 */
function drawPusher(ctx: CanvasRenderingContext2D, s: CoinPusherState, quakeDx: number): void {
  ctx.save()
  ctx.translate(quakeDx, 0)
  const top = PLAT_Y - PUSH_H
  // 推杆。
  ctx.fillStyle = '#2e2e44'
  ctx.fillRect(WALL_X - 14, PLAT_Y - 40, s.pusherX - WALL_X + 14, 10)
  // 板身。
  const metal = ctx.createLinearGradient(s.pusherX, 0, s.pusherX + PUSH_W, 0)
  metal.addColorStop(0, '#565678')
  metal.addColorStop(0.5, '#7d7da8')
  metal.addColorStop(1, '#494968')
  ctx.fillStyle = metal
  roundRectPath(ctx, s.pusherX, top, PUSH_W, PUSH_H, 5)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.stroke()
  // 前缘（推面）高亮与警示条纹。
  ctx.fillStyle = 'rgba(226,226,238,0.35)'
  ctx.fillRect(s.pusherX + PUSH_W - 4, top + 4, 3, PUSH_H - 8)
  ctx.fillStyle = 'rgba(224,175,104,0.5)'
  for (let y = top + 10; y < PLAT_Y - 10; y += 18) {
    ctx.fillRect(s.pusherX + 8, y, PUSH_W - 20, 4)
  }
  ctx.restore()
}

/** 一枚币：主面 + 描边 + 高光弧；金/奖励币带辉光，奖励币内嵌星形。 */
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, type: CoinType): void {
  const c = COIN_COLORS[type]
  if (type === 'gold' || type === 'bonus') glow(ctx, c.face, 8)
  ctx.beginPath()
  ctx.arc(x, y, COIN_R, 0, Math.PI * 2)
  ctx.fillStyle = c.face
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = c.rim
  ctx.stroke()
  noGlow(ctx)
  ctx.beginPath()
  ctx.arc(x - 2.5, y - 2.5, COIN_R * 0.55, Math.PI * 0.9, Math.PI * 1.6)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (type === 'bonus') {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('★', x, y + 1)
    ctx.textBaseline = 'alphabetic'
  }
}

/** 前玻璃反光：上半区两道斜向半透明光带。 */
function drawGlass(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(WALL_X - 10, 50, EDGE_X - WALL_X + 40, PLAT_Y - 50)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.beginPath()
  ctx.moveTo(150, 50)
  ctx.lineTo(260, 50)
  ctx.lineTo(170, PLAT_Y)
  ctx.lineTo(60, PLAT_Y)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.035)'
  ctx.beginPath()
  ctx.moveTo(380, 50)
  ctx.lineTo(430, 50)
  ctx.lineTo(340, PLAT_Y)
  ctx.lineTo(290, PLAT_Y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 瞄准列：滑槽下的三角指针 + 虚引导线 + 冷却条。 */
function drawAim(ctx: CanvasRenderingContext2D, s: CoinPusherState): void {
  const x = colX(s.aimCol)
  ctx.fillStyle = THEME.accents[0]!
  ctx.beginPath()
  ctx.moveTo(x - 7, 70)
  ctx.lineTo(x + 7, 70)
  ctx.lineTo(x, 82)
  ctx.closePath()
  ctx.fill()
  ctx.setLineDash([4, 6])
  ctx.strokeStyle = 'rgba(122,162,247,0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, 86)
  ctx.lineTo(x, PLAT_Y - 6)
  ctx.stroke()
  ctx.setLineDash([])
  // 冷却条（滑槽内）。
  const ready = 1 - Math.min(1, s.cooldownMs / COOLDOWN_MS)
  ctx.fillStyle = 'rgba(226,226,238,0.15)'
  ctx.fillRect(DROP_X0 - 26, 40, DROP_X1 - DROP_X0 + 52, 6)
  ctx.fillStyle = ready >= 1 ? THEME.good : THEME.gold
  ctx.fillRect(DROP_X0 - 26, 40, (DROP_X1 - DROP_X0 + 52) * ready, 6)
}

/** HUD：分数 / 剩余币 / 倒计时一行。 */
function drawHud(ctx: CanvasRenderingContext2D, s: CoinPusherState): void {
  const sec = Math.ceil(s.timeLeftMs / 1000)
  const time = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
  const timeColor = s.timeLeftMs < 10000 ? THEME.bad : THEME.text
  hudPair(ctx, 16, 24, '分数', String(s.score))
  hudPair(ctx, LOGICAL_W / 2, 24, '剩余投币', String(s.coinsLeft), 'center')
  hudPair(ctx, LOGICAL_W - 16, 24, '倒计时', time, 'right', timeColor)
  // 进度细线：局时长。
  ctx.fillStyle = 'rgba(226,226,238,0.12)'
  ctx.fillRect(0, 0, LOGICAL_W, 3)
  ctx.fillStyle = timeColor
  ctx.fillRect(0, 0, LOGICAL_W * (s.timeLeftMs / ROUND_MS), 3)
}

export interface CoinPusherRenderProps {
  state: CoinPusherState
  paused: boolean
  floaters: FloaterSystem
}

/**
 * 绘制整帧。
 * @param ctx 逻辑坐标系（640x480）下的画布上下文。
 * @param props 局状态、暂停标记与浮字池。
 */
export function renderCoinPusher(ctx: CanvasRenderingContext2D, props: CoinPusherRenderProps): void {
  const s = props.state
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  // 大堆倾倒余震：随 quakeMs 衰减的确定性左右晃动。
  const quakeDx = s.quakeMs > 0 ? Math.sin(s.quakeMs * 0.06) * (s.quakeMs / 700) * 5 : 0
  drawCabinet(ctx, quakeDx)
  drawPusher(ctx, s, quakeDx)
  ctx.save()
  ctx.translate(quakeDx, 0)
  for (const c of s.coins) drawCoin(ctx, c.x, c.y, c.type)
  ctx.restore()
  drawGlass(ctx)
  if (s.result === 'playing') drawAim(ctx, s)
  drawHud(ctx, s)
  props.floaters.tick(ctx, 16)
  if (s.result === 'ended') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '本局结束',
      '得分 ' + s.score + ' · 按 R 再来一局', THEME.gold)
  } else if (props.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, spaced('暂停中'), '按 P 继续 · 按 R 重开')
  }
}
