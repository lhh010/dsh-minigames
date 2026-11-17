/**
 * 炮台对决渲染层：黄昏渐变天空 + 落日与漂云、随高度场实时变化的剪影山丘
 * （弹坑销毁即时可见）、炮管随角度旋转并带开火后坐的炮台、飞行拖尾与
 * 只演前段的弹道预测虚线、爆炸土块粒子 + 屏幕震动、风向旗与力度条、
 * 血量/局数/风力 HUD、暂停/单局/整场遮罩。
 */
import {
  W,
  H,
  TERRAIN_STEP,
  TERRAIN_SAMPLES,
  TURRET_R,
  PIVOT_DY,
  BARREL_LEN,
  WIND_MAX,
  HP,
  ROUNDS,
  GRAVITY,
  terrainYAt,
  muzzleVelocity,
  type ArtilleryState,
  type Turret,
  type Side,
} from './logic.ts'
import { THEME, accent, createParticles, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

/** 渲染层自有的粒子系统（每个画布一个实例）。 */
const particles = createParticles()

/** 黄昏天空自上而下的色带。 */
const SKY_STOPS: [number, string][] = [
  [0, '#1a1530'],
  [0.45, '#3a2545'],
  [0.8, '#6e3b52'],
  [1, '#9c5a56'],
]
/** 剪影山丘前景色与受光面描边色。 */
const HILL_FILL = '#171226'
const HILL_EDGE = 'rgba(226,140,120,0.28)'
/** 炮台配色（玩家蓝、AI 红）。 */
const SIDE_COLOR: Record<Side, string> = { player: THEME.accents[0]!, ai: THEME.bad }
/** 炮管色。 */
const BARREL = '#4a4a5e'
/** 拖尾与炮弹色。 */
const SHELL = THEME.gold

/** 屏幕震动剩余强度（爆炸事件驱动，指数衰减）。 */
let shake = 0
/** 玩家/AI 后坐剩余 ms。 */
let recoilPlayer = 0
let recoilAi = 0
/** 云的水平漂移累计（视觉用）。 */
let drift = 0

/**
 * 画黄昏天空、落日与漂云（纯装饰，位置随时间缓慢漂移）。
 * @param ctx - 画布上下文。
 * @param dtMs - 帧间隔 ms（云漂移用）。
 */
function drawSky(ctx: CanvasRenderingContext2D, dtMs: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.85)
  for (const [k, c] of SKY_STOPS) g.addColorStop(k, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  drift = (drift + dtMs * 0.004) % (W + 200)
  // 落日：半浸在地平线之上的暖色圆盘。
  const sunY = H * 0.62
  glow(ctx, '#e8956a', 40)
  ctx.fillStyle = '#e8956a'
  ctx.beginPath()
  ctx.arc(W * 0.68, sunY, 42, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 三朵剪影云随 drift 循环漂移。
  ctx.fillStyle = 'rgba(26,18,40,0.55)'
  for (let i = 0; i < 3; i += 1) {
    const cx = ((drift + i * 260) % (W + 200)) - 100
    const cy = 54 + i * 34
    for (const [ox, oy, r] of [[-26, 4, 14], [0, 0, 20], [26, 5, 13]] as const) {
      ctx.beginPath()
      ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/**
 * 画剪影山丘：沿高度场描边填充，弹坑销毁后实时变化。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTerrain(ctx: CanvasRenderingContext2D, state: ArtilleryState): void {
  ctx.beginPath()
  ctx.moveTo(0, state.terrain[0]!)
  for (let i = 1; i < TERRAIN_SAMPLES; i += 1) {
    ctx.lineTo(i * TERRAIN_STEP, state.terrain[i]!)
  }
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fillStyle = HILL_FILL
  ctx.fill()
  ctx.strokeStyle = HILL_EDGE
  ctx.lineWidth = 2
  ctx.stroke()
}

/**
 * 画一门炮台：基座圆堡 + 血量刻点 + 随角度旋转的炮管（带后坐内缩）。
 * @param ctx - 画布上下文。
 * @param t - 炮台。
 * @param side - 侧别。
 * @param recoil - 后坐剩余 ms。
 */
function drawTurret(ctx: CanvasRenderingContext2D, t: Turret, side: Side, recoil: number): void {
  if (t.hp <= 0) {
    // 残骸：塌在原地的暗色碎块。
    ctx.fillStyle = '#2a2438'
    ctx.beginPath()
    ctx.ellipse(t.x, t.y, TURRET_R, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const dir = side === 'player' ? 1 : -1
  const a = (t.angle * Math.PI) / 180
  const px = t.x
  const py = t.y - PIVOT_DY
  // 炮管：自转轴起的长矩形，后坐沿管轴内缩。
  const back = Math.min(1, recoil / 180) * 7
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(-a * dir)
  ctx.fillStyle = BARREL
  // 玩家炮管自转轴向右伸出，AI 向左（本地负 x），后坐沿管轴缩回。
  const x0 = side === 'player' ? -3 - back : -BARREL_LEN + 3 + back
  ctx.fillRect(x0, -3.5, BARREL_LEN, 7)
  ctx.restore()
  // 基座圆堡 + 侧色描边。
  glow(ctx, SIDE_COLOR[side], 8)
  ctx.fillStyle = '#241f33'
  ctx.beginPath()
  ctx.arc(px, t.y - PIVOT_DY + 2, TURRET_R, Math.PI, 0)
  ctx.lineTo(px + TURRET_R, t.y)
  ctx.lineTo(px - TURRET_R, t.y)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = SIDE_COLOR[side]
  ctx.lineWidth = 2
  ctx.stroke()
  noGlow(ctx)
  // 血量刻点。
  for (let i = 0; i < HP; i += 1) {
    ctx.fillStyle = i < t.hp ? SIDE_COLOR[side] : 'rgba(226,226,238,0.18)'
    ctx.beginPath()
    ctx.arc(px - 12 + i * 12, t.y - PIVOT_DY - 22, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 画飞行炮弹与渐隐拖尾。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawProjectile(ctx: CanvasRenderingContext2D, state: ArtilleryState): void {
  const n = state.trail.length
  for (let i = 0; i < n; i += 1) {
    const q = state.trail[i]!
    ctx.globalAlpha = 0.05 + (i / n) * 0.45
    ctx.fillStyle = SHELL
    ctx.beginPath()
    ctx.arc(q.x, q.y, 1.6 + (i / n) * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  const p = state.projectile
  if (p !== null) {
    glow(ctx, SHELL, 10)
    ctx.fillStyle = SHELL
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
}

/**
 * 画玩家瞄准反馈：只演前段的弹道预测虚线（含风，快速淡出，不全额剧透）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawAimPreview(ctx: CanvasRenderingContext2D, state: ArtilleryState): void {
  if (state.phase !== 'aim' || state.turn !== 'player') return
  const m = muzzleVelocity(state.player, 'player', state.player.angle, state.power)
  const dt = 0.05
  let x = m.x, y = m.y, vx = m.vx, vy = m.vy
  ctx.fillStyle = accent(0)
  for (let i = 0; i < 12; i += 1) {
    vy += GRAVITY * dt
    vx += state.wind * dt
    x += vx * dt
    y += vy * dt
    if (y >= terrainYAt(state.terrain, x) || x > W || x < 0) break
    ctx.globalAlpha = 0.75 - i * 0.055
    ctx.beginPath()
    ctx.arc(x, y, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画风向旗：顶栏中央旗杆 + 随风向翻飞的三角旗 + 风力数值。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawWindFlag(ctx: CanvasRenderingContext2D, state: ArtilleryState): void {
  const cx = W / 2
  const top = 30
  ctx.strokeStyle = '#4a4a5e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.lineTo(cx, top + 26)
  ctx.stroke()
  const k = Math.abs(state.wind) / WIND_MAX
  const dir = state.wind >= 0 ? 1 : -1
  const len = 12 + k * 34
  const color = k > 0.66 ? THEME.bad : accent(6)
  glow(ctx, color, 6)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.lineTo(cx + dir * len, top + 6)
  ctx.lineTo(cx, top + 12)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  const txt = '风 ' + (state.wind >= 0 ? '→' : '←') + ' ' + Math.round(k * 100) + '%'
  ctx.fillText(txt, cx, top + 34)
}

/**
 * 画底部力度条：可点击/拖拽设定 1-100 力度。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
export const POWER_BAR = { x: W / 2 - 140, y: H - 24, w: 280, h: 12 }

function drawPowerBar(ctx: CanvasRenderingContext2D, state: ArtilleryState): void {
  const { x, y, w, h } = POWER_BAR
  ctx.fillStyle = 'rgba(30,30,42,0.9)'
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8)
  ctx.fillStyle = '#2a2a3a'
  ctx.fillRect(x, y, w, h)
  const k = state.power / 100
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, accent(0))
  g.addColorStop(1, k > 0.8 ? THEME.bad : THEME.gold)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w * k, h)
  hudPair(ctx, x - 10, y + 10, '力度', String(Math.round(state.power)), 'right')
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(String(Math.round(state.power)), x + w + 10, y + 10)
}

/**
 * 画 HUD：血量 / 比分 / 局数（风力旗与力度条单画）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: ArtilleryState): void {
  const y = 18
  hudPair(ctx, 10, y, '我方', '❤'.repeat(state.player.hp) || '—', 'left', SIDE_COLOR.player)
  hudPair(ctx, 100, y, '比分', state.pointsPlayer + ':' + state.pointsAi, 'left', THEME.text)
  hudPair(ctx, W - 10, y, '敌方', '❤'.repeat(state.ai.hp) || '—', 'right', SIDE_COLOR.ai)
  hudPair(ctx, W - 100, y, '局数', state.round + '/' + ROUNDS, 'right')
  if (state.turn === 'ai' && state.phase === 'aiThink') {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('敌方瞄准中…', W / 2, 76)
  }
}

/**
 * 渲染一帧：震动偏移包裹全部场景，事件驱动粒子/后坐/震动。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param dtMs - 帧间隔 ms（云漂移与震动衰减）。
 */
export function renderArtillery(ctx: CanvasRenderingContext2D, state: ArtilleryState, paused: boolean, dtMs: number): void {
  const stepMs = paused ? 0 : dtMs
  for (const ev of state.events) {
    if (ev.type === 'explode') {
      particles.burst(ev.x, ev.y, '#5a4a3a', 18, 170)
      particles.burst(ev.x, ev.y, THEME.bad, 10, 130)
      shake = 1
      const near: Side[] = []
      if (Math.abs(ev.x - state.player.x) < 160) near.push('player')
      if (Math.abs(ev.x - state.ai.x) < 160) near.push('ai')
      for (const s of near) {
        if (s === 'player') recoilPlayer = 220
        else recoilAi = 220
      }
    } else if (ev.type === 'fire') {
      if (ev.side === 'player') recoilPlayer = 180
      else recoilAi = 180
    }
  }
  shake = Math.max(0, shake - stepMs / 320)
  recoilPlayer = Math.max(0, recoilPlayer - stepMs)
  recoilAi = Math.max(0, recoilAi - stepMs)

  ctx.save()
  if (shake > 0.01) {
    ctx.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 7 * shake)
  }
  drawSky(ctx, stepMs)
  drawTerrain(ctx, state)
  drawTurret(ctx, state.player, 'player', recoilPlayer)
  drawTurret(ctx, state.ai, 'ai', recoilAi)
  drawAimPreview(ctx, state)
  drawProjectile(ctx, state)
  particles.tick(ctx, stepMs)
  drawWindFlag(ctx, state)
  drawPowerBar(ctx, state)
  drawHud(ctx, state)
  ctx.restore()

  const roundEv = state.events.find((ev): boolean => ev.type === 'roundEnd')
  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'matchOver') {
    const sub = state.winner === 'player' ? '胜利！' : state.winner === 'ai' ? '惜败' : '平分秋色'
    drawOverlay(ctx, W, H, '比赛结束', sub + ' ' + state.pointsPlayer + ':' + state.pointsAi + ' · 按 R 重开', state.winner === 'player' ? THEME.good : THEME.text)
  } else if (state.phase === 'roundOver') {
    if (roundEv !== undefined && roundEv.type === 'roundEnd') {
      const t = roundEv.winner === 'player' ? '本局获胜' : roundEv.winner === 'ai' ? '本局失利' : '本局平局'
      drawOverlay(ctx, W, H, t, '比分 ' + state.pointsPlayer + ':' + state.pointsAi)
    }
  }
}
