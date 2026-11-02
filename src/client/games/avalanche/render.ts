/**
 * 滑雪大冒险渲染层：多层视差雪山背景、折线起伏雪坡（跳台凸起）、树木/
 * 岩石障碍、金币、企鹅与雪人伙伴、四态玩家（贴地滑行/腾空姿态/翻滚失控/
 * 骑乘描边）、特技与拾取飘字、身后雪崩墙（锯齿白浪 + 飞雪粒子 + 逼近时
 * 屏幕震动）、HUD（分数/距离/雪崩警告条）、暂停与结束遮罩。
 */
import {
  W,
  H,
  PLAYER_X,
  PLAYER_Y,
  PLAYER_R,
  SEG_W,
  AVA_START_GAP,
  FLOAT_MS,
  avalancheGap,
  displayDistance,
  groundYAt,
  totalScore,
  type AvaState,
  type MountKind,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 远山三层颜色（远 → 近，由冷灰渐深）。 */
const RIDGE_COLORS = ['#333a58', '#2a3050', '#222741'] as const
/** 每层视差系数。 */
const RIDGE_PARALLAX = [0.08, 0.16, 0.28] as const
/** 每层山脊基准高度（占 H 比例）。 */
const RIDGE_BASE = [0.46, 0.55, 0.63] as const
/** 雪面渐变上/下端色。 */
const SNOW_TOP = '#c3cfe8'
const SNOW_BOTTOM = '#8ea0cd'
/** 雪面棱线高光。 */
const SNOW_EDGE = 'rgba(245,248,255,0.75)'
/** 树冠/树干色。 */
const TREE_DARK = '#243528'
const TREE_LIT = '#38513c'
const TRUNK = '#4a3a2c'
/** 岩石色。 */
const ROCK = '#6a7080'
const ROCK_EDGE = '#4a5062'
/** 玩家服色与围巾色。 */
const SUIT = '#e8e8f0'
const SCARF = THEME.bad
/** 雪板色。 */
const BOARD = accent(5)
/** 企鹅色。 */
const PENGUIN_BODY = '#232735'
const PENGUIN_BELLY = '#eef1fa'
const PENGUIN_BEAK = '#e0af68'
/** 雪人色。 */
const YETI_BODY = '#dfe6f5'
const YETI_FACE = '#5a6280'
/** 雪崩墙体色（前浪亮、后体稍暗）。 */
const AVALANCHE_FRONT = '#eef3ff'
const AVALANCHE_BODY = '#c9d4ee'

/**
 * 第 layer 层山脊在世界 x 处的起伏（多层正弦叠加，确定性）。
 * @param worldX - 世界 x。
 * @param layer - 层号 0~2。
 * @returns 相对基准高度的偏移 px。
 */
function ridgeOffset(worldX: number, layer: number): number {
  const f = 0.0016 + layer * 0.0007
  return Math.sin(worldX * f) * 36 + Math.sin(worldX * f * 2.7 + layer * 13) * 18 + Math.sin(worldX * f * 5.3 + layer * 7) * 8
}

/**
 * 画视差雪山背景：三层山脊折线填充，层与层用不同视差系数滚动。
 * @param ctx - 画布上下文。
 * @param camX - 相机世界 x。
 */
function drawRidges(ctx: CanvasRenderingContext2D, camX: number): void {
  for (let layer = 0; layer < 3; layer += 1) {
    const base = H * RIDGE_BASE[layer]!
    ctx.fillStyle = RIDGE_COLORS[layer]!
    ctx.beginPath()
    ctx.moveTo(0, H)
    for (let sx = 0; sx <= W; sx += 24) {
      const wx = camX * RIDGE_PARALLAX[layer]! + sx
      ctx.lineTo(sx, base + ridgeOffset(wx, layer))
    }
    ctx.lineTo(W, H)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * 画起伏雪坡：按屏幕每 20px 采样地面折线，向下填充雪面渐变，棱线描高光。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 相机世界 x。
 * @param camY - 相机世界 y。
 */
function drawSlope(ctx: CanvasRenderingContext2D, state: AvaState, camX: number, camY: number): void {
  const gradient = ctx.createLinearGradient(0, H * 0.35, 0, H)
  gradient.addColorStop(0, SNOW_TOP)
  gradient.addColorStop(1, SNOW_BOTTOM)
  ctx.beginPath()
  ctx.moveTo(-20, H + 20)
  for (let sx = -20; sx <= W + 20; sx += 20) {
    ctx.lineTo(sx, groundYAt(state, camX + sx) - camY)
  }
  ctx.lineTo(W + 20, H + 20)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.strokeStyle = SNOW_EDGE
  ctx.lineWidth = 2.5
  ctx.beginPath()
  let started = false
  for (let sx = -20; sx <= W + 20; sx += 20) {
    const y = groundYAt(state, camX + sx) - camY
    if (!started) {
      ctx.moveTo(sx, y)
      started = true
    } else {
      ctx.lineTo(sx, y)
    }
  }
  ctx.stroke()
}

/**
 * 画附近段内的全部可见实体：障碍、金币、未拾取伙伴。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 相机世界 x。
 * @param camY - 相机世界 y。
 */
function drawEntities(ctx: CanvasRenderingContext2D, state: AvaState, camX: number, camY: number): void {
  const first = Math.max(0, Math.floor((camX - 80) / SEG_W))
  const last = Math.floor((camX + W + 80) / SEG_W)
  for (let i = first; i <= last && i <= state.maxSeg; i += 1) {
    const seg = state.segments.get(i)
    if (seg === undefined) continue
    for (const obs of seg.obstacles) {
      const sx = obs.x - camX
      if (sx < -40 || sx > W + 40) continue
      const sy = groundYAt(state, obs.x) - camY
      if (obs.kind === 'tree') {
        ctx.fillStyle = TRUNK
        ctx.fillRect(sx - 2.5, sy - 4, 5, 8)
        glow(ctx, TREE_LIT, 5)
        ctx.fillStyle = TREE_DARK
        ctx.beginPath()
        ctx.moveTo(sx, sy - 32)
        ctx.lineTo(sx + 12, sy - 6)
        ctx.lineTo(sx - 12, sy - 6)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = TREE_LIT
        ctx.beginPath()
        ctx.moveTo(sx, sy - 25)
        ctx.lineTo(sx + 9, sy - 4)
        ctx.lineTo(sx - 9, sy - 4)
        ctx.closePath()
        ctx.fill()
        noGlow(ctx)
      } else {
        ctx.fillStyle = ROCK
        ctx.strokeStyle = ROCK_EDGE
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(sx, sy - 6, 13, 9, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.ellipse(sx - 5, sy - 11, 7, 5, -0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
    for (const coin of seg.coins) {
      if (coin.taken) continue
      const sx = coin.x - camX
      if (sx < -30 || sx > W + 30) continue
      const sy = coin.y - camY
      glow(ctx, THEME.gold, 8)
      ctx.fillStyle = THEME.gold
      ctx.beginPath()
      ctx.arc(sx, sy, 7, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
      ctx.fillStyle = '#fff8e6'
      ctx.beginPath()
      ctx.arc(sx - 2, sy - 2, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const m of seg.mounts) {
      if (m.taken) continue
      const sx = m.x - camX
      if (sx < -40 || sx > W + 40) continue
      const sy = groundYAt(state, m.x) - camY
      drawMount(ctx, m.kind, sx, sy, 0)
    }
  }
}

/**
 * 画一只坐骑伙伴（拾取前的坡面摆放与骑乘态共用）。
 * @param ctx - 画布上下文。
 * @param kind - 伙伴种类。
 * @param x - 屏幕坐标 x。
 * @param y - 屏幕/本地坐标 y（脚底）。
 * @param bob - 呼吸/颠簸偏移 px。
 */
function drawMount(ctx: CanvasRenderingContext2D, kind: Exclude<MountKind, 'none'>, x: number, y: number, bob: number): void {
  if (kind === 'penguin') {
    ctx.fillStyle = PENGUIN_BODY
    ctx.beginPath()
    ctx.ellipse(x, y - 13 + bob, 11, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PENGUIN_BELLY
    ctx.beginPath()
    ctx.ellipse(x, y - 11 + bob, 6.5, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PENGUIN_BODY
    ctx.beginPath()
    ctx.arc(x, y - 25 + bob, 6.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PENGUIN_BEAK
    ctx.beginPath()
    ctx.moveTo(x + 5, y - 25 + bob)
    ctx.lineTo(x + 11, y - 23.5 + bob)
    ctx.lineTo(x + 5, y - 22 + bob)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x + 2, y - 26.5 + bob, 1.6, 0, Math.PI * 2)
    ctx.fill()
  } else {
    glow(ctx, YETI_BODY, 6)
    ctx.fillStyle = YETI_BODY
    ctx.beginPath()
    ctx.ellipse(x, y - 16 + bob, 14, 17, 0, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = YETI_FACE
    ctx.beginPath()
    ctx.arc(x - 4.5, y - 22 + bob, 1.8, 0, Math.PI * 2)
    ctx.arc(x + 4.5, y - 22 + bob, 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = YETI_FACE
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(x, y - 19 + bob, 3.5, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }
}

/**
 * 画玩家：按状态分四态——贴地滑行（雪板贴合坡度）、腾空（随姿态倾角
 * 旋转收腿）、翻滚失控（随时间快速旋转）、骑乘（坐骑 + 变色描边）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: AvaState): void {
  if (state.phase === 'over') return
  const riding = state.mount !== 'none'
  const grade = state.onGround ? (groundYAt(state, state.px + 10) - groundYAt(state, state.px - 10)) / 20 : 0
  const spin = state.tumbleMs > 0 ? state.t * 0.02 : 0
  const angle = state.onGround ? Math.atan(grade) * 0.8 : (state.tumbleMs > 0 ? spin : state.tilt)
  const bob = Math.sin(state.t * 0.02) * 1.5

  ctx.save()
  ctx.translate(PLAYER_X, PLAYER_Y)
  // 骑乘态：先画坐骑，再给整体一圈变色描边光晕。
  if (riding) {
    const rideColor = state.mount === 'penguin' ? accent(5) : accent(0)
    glow(ctx, rideColor, 14)
    ctx.strokeStyle = rideColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 6, 20, 22, 0, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
    drawMount(ctx, state.mount as Exclude<MountKind, 'none'>, 0, 14, bob)
  }
  ctx.rotate(angle)
  if (riding) ctx.translate(0, -14)
  const crouch = state.onGround ? 2 : (state.tumbleMs > 0 ? 0 : -3)
  // 雪板（腾空/翻滚时收短）。
  ctx.strokeStyle = BOARD
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  const boardLen = state.onGround ? 15 : 9
  ctx.beginPath()
  ctx.moveTo(-boardLen, 9)
  ctx.lineTo(boardLen, 11)
  ctx.stroke()
  // 身体与头。
  glow(ctx, SUIT, 8)
  ctx.fillStyle = SUIT
  ctx.beginPath()
  ctx.ellipse(0, crouch, PLAYER_R, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = accent(0)
  ctx.beginPath()
  ctx.arc(2, crouch - 12, 6, 0, Math.PI * 2)
  ctx.fill()
  // 围巾向后飘。
  ctx.strokeStyle = SCARF
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-2, crouch - 6)
  ctx.quadraticCurveTo(-12, crouch - 2, -18, crouch + 4)
  ctx.stroke()
  ctx.restore()
}

/**
 * 画雪崩墙：位于其前沿屏幕 x 的锯齿白浪（动画相位由 t 驱动，确定性），
 * 后体填充半透雪墙；前沿迸发飞雪粒子；逼近（<300px）时叠加画面震动。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 相机世界 x。
 */
function drawAvalanche(ctx: CanvasRenderingContext2D, state: AvaState, camX: number): void {
  const frontX = state.avalancheX - camX
  if (frontX < -240) return
  const phase = Math.floor(state.t / 120)
  // 后体：从画面左缘铺到前沿。
  ctx.fillStyle = AVALANCHE_BODY
  ctx.globalAlpha = 0.92
  ctx.beginPath()
  ctx.moveTo(-240, H + 20)
  ctx.lineTo(-240, -20)
  const jag = (k: number): number => ((Math.sin(k * 12.9898 + phase * 78.233) * 43758.5453) % 1 + 1) % 1
  for (let y = -20; y <= H + 20; y += 34) {
    ctx.lineTo(frontX - 26 + jag(Math.floor(y / 34)) * 40, y)
  }
  ctx.lineTo(frontX, H + 20)
  ctx.closePath()
  ctx.fill()
  // 前沿亮白锯齿浪。
  ctx.fillStyle = AVALANCHE_FRONT
  ctx.globalAlpha = 0.95
  ctx.beginPath()
  ctx.moveTo(frontX - 90, H + 20)
  ctx.lineTo(frontX - 90, -20)
  for (let y = -20; y <= H + 20; y += 26) {
    const k = Math.floor(y / 26)
    ctx.lineTo(frontX - 14 + jag(k + 7) * 30 + Math.sin(state.t * 0.01 + k) * 6, y)
  }
  ctx.lineTo(frontX, H + 20)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  // 前沿飞雪（渲染层非确定粒子）。
  if (frontX > -60 && Math.random() < 0.6) {
    particles.burst(Math.max(0, frontX), 80 + Math.random() * (H - 160), AVALANCHE_FRONT, 3, 120)
  }
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 相机世界 x。
 * @param camY - 相机世界 y。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: AvaState, camX: number, camY: number): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = 'bold 18px system-ui, sans-serif'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / FLOAT_MS))
    ctx.globalAlpha = k
    ctx.fillStyle = THEME.gold
    ctx.fillText(fl.text, Math.max(40, Math.min(W - 40, fl.x - camX)), Math.max(40, Math.min(H - 20, fl.y - camY)))
  }
  ctx.restore()
}

/**
 * 画 HUD：分数 / 距离 / 金币 / 特技 与右上雪崩警告条（余量按开局距离
 * 折算宽度；<300px 变红闪烁）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: AvaState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(totalScore(state)))
  hudPair(ctx, 110, hudY, '距离', displayDistance(state) + 'm')
  hudPair(ctx, 210, hudY, '金币', String(state.coinScore / 10))
  hudPair(ctx, 290, hudY, '特技', String(state.trickScore))
  // 雪崩警告条。
  const gap = avalancheGap(state)
  const barMax = 150
  const barW = Math.max(0, Math.min(1, gap / AVA_START_GAP)) * barMax
  const danger = gap < 300
  const flashing = danger && Math.floor(state.t / 150) % 2 === 0
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = danger ? (flashing ? '#ffb3c0' : THEME.bad) : THEME.textMuted
  ctx.fillText('雪崩 ' + Math.max(0, Math.round(gap)) + 'px', W - 10, hudY)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(W - 10 - barMax, hudY + 6, barMax, 5)
  ctx.fillStyle = danger ? THEME.bad : THEME.good
  if (!(danger && flashing)) ctx.fillRect(W - 10 - barMax, hudY + 6, barW, 5)
  // 骑乘状态提示。
  if (state.mount !== 'none') {
    ctx.textAlign = 'right'
    ctx.fillStyle = state.mount === 'penguin' ? accent(5) : accent(0)
    ctx.fillText((state.mount === 'penguin' ? '🐧' : '🧊') + ' 免撞 x' + state.shields, W - 10, hudY + 26)
  }
}

/**
 * 渲染一帧。相机锁定玩家于 (PLAYER_X, PLAYER_Y)；雪崩逼近时叠加确定性
 * 屏幕震动。消费逻辑层事件驱动粒子。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderAvalanche(ctx: CanvasRenderingContext2D, state: AvaState, paused: boolean): void {
  const camX = state.px - PLAYER_X
  const camY = state.py - PLAYER_Y
  const gap = avalancheGap(state)
  const shake = gap < 300 && state.phase === 'run' ? ((300 - gap) / 300) * 5 : 0
  const ox = shake > 0 ? Math.sin(state.t * 0.05) * shake : 0
  const oy = shake > 0 ? Math.cos(state.t * 0.043) * shake : 0

  drawBackground(ctx, W, H)
  ctx.save()
  ctx.translate(ox, oy)
  drawRidges(ctx, camX)
  drawSlope(ctx, state, camX, camY)
  drawEntities(ctx, state, camX, camY)
  drawPlayer(ctx, state)
  drawAvalanche(ctx, state, camX)
  ctx.restore()

  // 消费逻辑层事件：起跳/落地雪屑、撞击红屑、金币金屑、特技蓝屑。
  for (const ev of state.events) {
    const sx = ev.x - camX
    const sy = ev.y - camY
    if (ev.type === 'jump') particles.burst(sx, sy + 10, SNOW_BOTTOM, 10, 120)
    else if (ev.type === 'land') particles.burst(sx, sy + 8, SNOW_BOTTOM, 12, 140)
    else if (ev.type === 'crash') particles.burst(sx, sy, THEME.bad, 18, 180)
    else if (ev.type === 'shield') particles.burst(sx, sy, accent(5), 14, 160)
    else if (ev.type === 'coin') particles.burst(sx, sy, THEME.gold, 10, 130)
    else if (ev.type === 'trick') particles.burst(sx, sy - 20, accent(0), 16, 170)
    else if (ev.type === 'mount') particles.burst(sx, sy - 10, ev.kind === 'penguin' ? accent(5) : accent(0), 16, 160)
    else if (ev.type === 'over') particles.burst(sx, sy, AVALANCHE_FRONT, 26, 220)
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawFloats(ctx, state, camX, camY)
  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'over') {
    drawOverlay(ctx, W, H, '被雪崩吞没', '跑了 ' + displayDistance(state) + 'm · 得分 ' + totalScore(state) + ' · 按 R 重开', THEME.bad)
  }
}
