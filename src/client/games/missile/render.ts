/**
 * 导弹指令渲染层：夜空渐变 + 确定性星空、地面山丘与城市（存活楼群 /
 * 残垣碎块）、来袭弹尾迹（起点到弹头的亮线 + 炽热弹头）、拦截弹与
 * 十字准星、爆炸球发光（径向渐变膨胀-收缩）、波次横幅、分数 / 波次 /
 * 城市 HUD、结束与暂停遮罩。纯绘制，状态全部来自逻辑层。
 */
import {
  W, H, GROUND_Y, CITY_XS, BATTERY_X, BATTERY_Y,
  explosionRadius, enemyPos, mulberry32, WAVES,
  type MissileState,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 确定性星空（固定种子，与对局无关，只为画面稳定）。 */
interface Star { x: number, y: number, r: number, phase: number }
const stars: Star[] = (() => {
  const rng = mulberry32(20241110)
  const out: Star[] = []
  for (let i = 0; i < 70; i += 1) {
    out.push({ x: rng() * W, y: rng() * (GROUND_Y - 40), r: 0.5 + rng() * 1.1, phase: rng() * Math.PI * 2 })
  }
  return out
})()

/** 地面山丘顶点（确定性）。 */
const hills: { x: number, y: number }[] = (() => {
  const rng = mulberry32(777)
  const out: { x: number, y: number }[] = []
  for (let i = 0; i <= 13; i += 1) {
    out.push({ x: (i / 13) * W, y: GROUND_Y - 4 - rng() * 10 })
  }
  return out
})()

/** 每座城市楼群的确定性高度表（城市索引 → 3 栋楼的宽高）。 */
const buildings: { w: number, h: number }[][] = (() => {
  const rng = mulberry32(4242)
  return CITY_XS.map((): { w: number, h: number }[] => {
    const out: { w: number, h: number }[] = []
    for (let k = 0; k < 3; k += 1) out.push({ w: 7 + rng() * 6, h: 10 + rng() * 16 })
    return out
  })
})()

/**
 * 画星空与地面：闪烁星点、山丘折线、地面填充。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSkyAndGround(ctx: CanvasRenderingContext2D, state: MissileState): void {
  drawBackground(ctx, W, H)
  ctx.fillStyle = THEME.text
  for (const s of stars) {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(state.t / 900 + s.phase))
    ctx.globalAlpha = tw * 0.8
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 地面：山丘折线以下整体填充，顶缘描亮。
  ctx.fillStyle = '#1a1f2e'
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (const p of hills) ctx.lineTo(p.x, p.y)
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#34405c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(hills[0]!.x, hills[0]!.y)
  for (let i = 1; i < hills.length; i += 1) ctx.lineTo(hills[i]!.x, hills[i]!.y)
  ctx.stroke()
}

/**
 * 画六座城市：存活画发光楼群（窗户点阵），被毁画残垣碎块。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawCities(ctx: CanvasRenderingContext2D, state: MissileState): void {
  for (let i = 0; i < CITY_XS.length; i += 1) {
    const cx = CITY_XS[i]!
    if (state.cities[i] === true) {
      glow(ctx, accent(2), 8)
      ctx.fillStyle = '#3d4a6b'
      let bx = cx - 15
      for (const b of buildings[i]!) {
        ctx.fillRect(bx, GROUND_Y - b.h, b.w, b.h)
        bx += b.w + 2
      }
      noGlow(ctx)
      ctx.fillStyle = THEME.gold
      for (let wy = 0; wy < 3; wy += 1) {
        ctx.fillRect(cx - 9 + wy * 7, GROUND_Y - 14, 2, 2)
        ctx.fillRect(cx - 6 + wy * 7, GROUND_Y - 20, 2, 2)
      }
    } else {
      // 残垣：几块低矮暗色碎块。
      ctx.fillStyle = '#2a2d3c'
      ctx.fillRect(cx - 12, GROUND_Y - 5, 8, 5)
      ctx.fillRect(cx - 1, GROUND_Y - 8, 5, 8)
      ctx.fillRect(cx + 7, GROUND_Y - 3, 7, 3)
    }
  }
}

/**
 * 画炮台：基座梯形 + 指向准星方向的炮管。
 * @param ctx - 画布上下文。
 * @param aimX - 准星 x。
 * @param aimY - 准星 y。
 */
function drawBattery(ctx: CanvasRenderingContext2D, aimX: number, aimY: number): void {
  const angle = Math.atan2(aimY - BATTERY_Y, aimX - BATTERY_X)
  ctx.save()
  ctx.translate(BATTERY_X, BATTERY_Y)
  // 基座。
  glow(ctx, accent(0), 10)
  ctx.fillStyle = '#4a5a82'
  ctx.beginPath()
  ctx.moveTo(-14, 0)
  ctx.lineTo(-9, -10)
  ctx.lineTo(9, -10)
  ctx.lineTo(14, 0)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  // 炮管。
  ctx.rotate(angle)
  ctx.fillStyle = '#7dcfff'
  ctx.fillRect(0, -2, 18, 4)
  ctx.restore()
}

/**
 * 画来袭弹尾迹：起点到弹头的亮线 + 发光弹头。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawEnemies(ctx: CanvasRenderingContext2D, state: MissileState): void {
  for (const m of state.enemies) {
    const pos = enemyPos(m)
    ctx.strokeStyle = 'rgba(247,118,142,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(m.sx, m.sy)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    glow(ctx, THEME.bad, 8)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
}

/**
 * 画拦截弹轨迹与准星（十字 + 圈）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param aimX - 准星 x。
 * @param aimY - 准星 y。
 */
function drawInterceptors(ctx: CanvasRenderingContext2D, state: MissileState, aimX: number, aimY: number): void {
  for (const it of state.interceptors) {
    ctx.strokeStyle = 'rgba(122,162,247,0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(BATTERY_X, BATTERY_Y - 8)
    ctx.lineTo(it.x, it.y)
    ctx.stroke()
    glow(ctx, accent(0), 6)
    ctx.fillStyle = '#c8d8ff'
    ctx.beginPath()
    ctx.arc(it.x, it.y, 2, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
  // 准星。
  ctx.strokeStyle = accent(5)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(aimX, aimY, 8, 0, Math.PI * 2)
  ctx.moveTo(aimX - 13, aimY)
  ctx.lineTo(aimX - 4, aimY)
  ctx.moveTo(aimX + 4, aimY)
  ctx.lineTo(aimX + 13, aimY)
  ctx.moveTo(aimX, aimY - 13)
  ctx.lineTo(aimX, aimY - 4)
  ctx.moveTo(aimX, aimY + 4)
  ctx.lineTo(aimX, aimY + 13)
  ctx.stroke()
}

/**
 * 画爆炸球：径向渐变白心金边，膨胀-收缩与爆炸半径同步。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawExplosions(ctx: CanvasRenderingContext2D, state: MissileState): void {
  for (const ex of state.explosions) {
    const r = explosionRadius(ex.t)
    if (r <= 1) continue
    const grad = ctx.createRadialGradient(ex.x, ex.y, r * 0.1, ex.x, ex.y, r)
    grad.addColorStop(0, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.55, 'rgba(255,200,120,0.8)')
    grad.addColorStop(1, 'rgba(224,175,104,0)')
    glow(ctx, THEME.gold, 18)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
}

/**
 * 画 HUD 与波次横幅：分数（左）、波次（中）、城市存活数（右）；波初
 * 或波间停顿展示「第 X 波」横幅。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHudAndBanner(ctx: CanvasRenderingContext2D, state: MissileState): void {
  const alive = state.cities.filter((c) => c === true).length
  hudPair(ctx, 10, 18, '分数', state.score + '')
  hudPair(ctx, W / 2, 18, '波次', state.wave + ' / ' + WAVES, 'center')
  hudPair(ctx, W - 10, 18, '城市', alive + ' / 6', 'right', alive > 0 ? THEME.text : THEME.bad)

  if (state.phase === 'playing' && (state.interT > 0 || state.waveT < 1400)) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillStyle = accent(1)
    ctx.fillText('第 ' + state.wave + ' 波', W / 2, H / 2 - 30)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    const total = state.pending.length + state.enemies.length
    ctx.fillText('来袭导弹 × ' + total, W / 2, H / 2 - 10)
  }
}

/**
 * 渲染一帧：夜空、地面、城市、炮台、来袭弹、拦截弹与准星、爆炸球、
 * 粒子、HUD 与横幅，最后按状态盖遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param aimX - 准星 x。
 * @param aimY - 准星 y。
 */
export function renderMissile(ctx: CanvasRenderingContext2D, state: MissileState, paused: boolean, aimX: number, aimY: number): void {
  drawSkyAndGround(ctx, state)
  drawCities(ctx, state)
  drawBattery(ctx, aimX, aimY)
  drawEnemies(ctx, state)
  drawInterceptors(ctx, state, aimX, aimY)
  drawExplosions(ctx, state)

  // 消费逻辑层事件：拦截迸金、城市中弹迸红、落地迸尘。
  for (const ev of state.events) {
    if (ev.type === 'intercept') {
      particles.burst(ev.x, ev.y, THEME.gold, 14, 160)
    } else if (ev.type === 'cityHit') {
      particles.burst(ev.x, ev.y, THEME.bad, 22, 220)
      particles.burst(ev.x, ev.y, '#ff9e64', 12, 150)
    } else if (ev.type === 'groundHit') {
      particles.burst(ev.x, ev.y, '#7dcfff', 8, 110)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHudAndBanner(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '城 陷', '得分 ' + state.score + ' · 按 R 重开', THEME.bad)
  } else if (state.phase === 'won') {
    drawOverlay(ctx, W, H, '防御成功', '六波尽退 · 得分 ' + state.score + ' · 按 R 重开', THEME.good)
  }
}
