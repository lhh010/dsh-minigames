/**
 * 滑雪大冒险渲染层：晨光→白昼的三段式渐变天空、三层视差雪山（带雪线
 * 与云层）、前景飘雪与高速速度线、折线雪坡（亮/影双描边 + 雪纹扫线 +
 * 木质积雪跳台）、四态玩家（贴地压板扬雪 / 腾空随姿态前倾后仰 / 翻滚
 * 残影 / 骑乘伙伴小动画 + 落地挤压拉伸）、双层错相位锯齿雪崩浪（浪顶
 * 喷雪、逼近红色 vignette 与增强震动、被吞没过渡）、旋转闪光金币、带
 * 阴影的树石与带气泡提示的伙伴、弧形渐变雪崩警告 HUD、上飘缩放特技
 * 浮字与四行统计结算面板；相机 lerp 平滑跟随并在腾空时轻微拉远。
 */
import {
  W,
  H,
  PLAYER_X,
  PLAYER_Y,
  PLAYER_R,
  SEG_W,
  STEP,
  AVA_START_GAP,
  FLOAT_MS,
  BASE_MAX_SPEED,
  avalancheGap,
  displayDistance,
  groundYAt,
  totalScore,
  type AvaState,
  type MountKind,
} from './logic.ts'
import {
  THEME,
  accent,
  createParticles,
  drawOverlay,
  glow,
  hudPair,
  noGlow,
  roundRectPath,
  spaced,
} from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/** 远山三层颜色（远 → 近，由冷灰渐深）。 */
const RIDGE_COLORS = ['#3a4165', '#2c3255', '#232842'] as const
/** 每层视差系数。 */
const RIDGE_PARALLAX = [0.08, 0.16, 0.28] as const
/** 每层山脊基准高度（占 H 比例）。 */
const RIDGE_BASE = [0.46, 0.55, 0.63] as const
/** 每层雪线描边透明度（远淡近浓）。 */
const RIDGE_SNOW_ALPHA = [0.5, 0.68, 0.85] as const
/** 晨光天空三段色（顶/中/底，偏橙紫）。 */
const SKY_MORNING = ['#584a7d', '#a06a8f', '#e8a87c'] as const
/** 正午天空三段色（顶/中/底，偏蓝白）。 */
const SKY_DAY = ['#6f9fd8', '#a8c8ec', '#e6eefb'] as const
/** 晨光→白昼过渡完成所需滑行距离 px。 */
const DAY_DIST = 26000
/** 雪面渐变上/下端色。 */
const SNOW_TOP = '#c9d5ec'
const SNOW_BOTTOM = '#8ea0cd'
/** 雪面棱线高光与阴影描边。 */
const SNOW_EDGE = 'rgba(248,251,255,0.9)'
const SNOW_EDGE_SHADE = 'rgba(90,104,150,0.4)'
/** 雪纹扫线颜色。 */
const SNOW_STREAK = 'rgba(255,255,255,0.28)'
/** 跳台木板色与积雪色。 */
const RAMP_WOOD = '#7a5a3c'
const RAMP_WOOD_DARK = '#5a4028'
const RAMP_SNOW = '#eef3ff'
/** 树冠/树干色。 */
const TREE_DARK = '#243528'
const TREE_LIT = '#38513c'
const TRUNK = '#4a3a2c'
/** 岩石色。 */
const ROCK = '#6a7080'
const ROCK_EDGE = '#4a5062'
/** 地面投影色。 */
const SHADOW = 'rgba(30,36,64,0.3)'
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
/** 雪崩逼近警告阈值 px。 */
const DANGER_GAP = 300
/** 被吞没过渡时长 ms。 */
const SWALLOW_MS = 900

/**
 * 渲染层跨帧状态：平滑相机、镜头缩放、震动/闪帧、落地挤压量、被吞
 * 过渡进度与本局最高速度等（与逻辑层无关，重开局自动重置）。
 */
interface AvaRenderState {
  /** 平滑后的相机世界坐标。 */
  camX: number
  camY: number
  /** 镜头缩放（1 = 贴地，<1 = 腾空拉远）。 */
  zoom: number
  /** 当前震动幅度 px。 */
  shakeAmp: number
  /** 红色闪帧剩余 ms。 */
  flashMs: number
  /** 挤压拉伸量（正 = 落地压扁，负 = 起跳拉长），指数衰减。 */
  deform: number
  /** 被吞没过渡起始时刻（state.t），-1 表示未发生。 */
  swallowAt: number
  /** 本局最高速度 px/s。 */
  maxVx: number
  /** 上一帧 state.t（检测换局重置）。 */
  lastT: number
}

/** 跨帧渲染状态（每画布单例，与粒子池同生命周期）。 */
const rs: AvaRenderState = {
  camX: 0,
  camY: 0,
  zoom: 1,
  shakeAmp: 0,
  flashMs: 0,
  deform: 0,
  swallowAt: -1,
  maxVx: 0,
  lastT: -1,
}

/** 前景雪花粒子（随风向左飘，与前进方向相反）。 */
interface Flake {
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

/** 高速速度线（速度感反馈）。 */
interface SpeedLine {
  x: number
  y: number
  len: number
  life: number
}

/** 前景雪花池。 */
const flakes: Flake[] = []
/** 速度线池。 */
const speedLines: SpeedLine[] = []

/**
 * 钳到 [lo, hi]。
 * @param v - 输入值。
 * @param lo - 下界。
 * @param hi - 上界。
 * @returns 钳制后的值。
 */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * 两个 #rrggbb 颜色按 k 线性混合。
 * @param a - 起始色。
 * @param b - 目标色。
 * @param k - 混合系数 [0,1]。
 * @returns 混合后的 #rrggbb。
 */
function mixHex(a: string, b: string, k: number): string {
  const av = parseInt(a.slice(1), 16)
  const bv = parseInt(b.slice(1), 16)
  const ar = (av >> 16) & 255, ag = (av >> 8) & 255, ab = av & 255
  const br = (bv >> 16) & 255, bg = (bv >> 8) & 255, bb = bv & 255
  const r = Math.round(ar + (br - ar) * k)
  const g = Math.round(ag + (bg - ag) * k)
  const bl = Math.round(ab + (bb - ab) * k)
  const hex = (r << 16) | (g << 8) | bl
  return '#' + hex.toString(16).padStart(6, '0')
}

/**
 * 确定性伪随机 [0,1)（用于云朵/雪纹等装饰布局）。
 * @param n - 种子数。
 * @returns [0,1) 随机数。
 */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

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
 * 画三段式时间渐变天空（晨光 → 白昼随滑行距离推进）与太阳光晕。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSky(ctx: CanvasRenderingContext2D, state: AvaState): void {
  const k = clamp(state.px / DAY_DIST, 0, 1)
  const gradient = ctx.createLinearGradient(0, 0, 0, H * 0.8)
  gradient.addColorStop(0, mixHex(SKY_MORNING[0]!, SKY_DAY[0]!, k))
  gradient.addColorStop(0.55, mixHex(SKY_MORNING[1]!, SKY_DAY[1]!, k))
  gradient.addColorStop(1, mixHex(SKY_MORNING[2]!, SKY_DAY[2]!, k))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)
  // 太阳：晨光偏橙且低垂，随时间升高变白。
  const sunX = W * 0.78
  const sunY = H * (0.26 - 0.1 * k)
  const sunR = 90 + 30 * (1 - k)
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR)
  halo.addColorStop(0, mixHex('#ffd9a0', '#fff6d8', k))
  halo.addColorStop(1, 'rgba(255,220,160,0)')
  ctx.fillStyle = halo
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2)
}

/**
 * 画云层：一组确定性排布的半透明白色椭圆簇，慢速视差滚动。
 * @param ctx - 画布上下文。
 * @param camX - 相机世界 x。
 */
function drawClouds(ctx: CanvasRenderingContext2D, camX: number): void {
  const off = camX * 0.06
  const first = Math.floor(off / 300) - 1
  const last = Math.floor((off + W) / 300) + 1
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  for (let i = first; i <= last; i += 1) {
    const h = hash01(i * 7.3)
    const sx = i * 300 + h * 140 - off
    const sy = 36 + hash01(i * 3.1) * 130
    const scale = 0.7 + h * 0.7
    ctx.beginPath()
    ctx.ellipse(sx, sy, 46 * scale, 13 * scale, 0, 0, Math.PI * 2)
    ctx.ellipse(sx + 30 * scale, sy + 4, 30 * scale, 10 * scale, 0, 0, Math.PI * 2)
    ctx.ellipse(sx - 28 * scale, sy + 5, 26 * scale, 9 * scale, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 画视差雪山背景：三层山脊折线填充并描雪线，层与层用不同视差滚动；
 * 高速时视差整体加速（速度感）。
 * @param ctx - 画布上下文。
 * @param camX - 相机世界 x。
 * @param camY - 相机世界 y。
 * @param speedK - 速度视差加成系数（0 起步，1 满速）。
 */
function drawRidges(ctx: CanvasRenderingContext2D, camX: number, camY: number, speedK: number): void {
  const boost = 0.75 + 0.5 * speedK
  for (let layer = 0; layer < 3; layer += 1) {
    const base = H * RIDGE_BASE[layer]! - camY * 0.04 * (layer + 1)
    ctx.fillStyle = RIDGE_COLORS[layer]!
    ctx.beginPath()
    ctx.moveTo(0, H)
    for (let sx = 0; sx <= W; sx += 24) {
      const wx = camX * RIDGE_PARALLAX[layer]! * boost + sx
      ctx.lineTo(sx, base + ridgeOffset(wx, layer))
    }
    ctx.lineTo(W, H)
    ctx.closePath()
    ctx.fill()
    // 雪线：只描山脊上缘，远淡近浓。
    ctx.strokeStyle = 'rgba(236,243,255,' + RIDGE_SNOW_ALPHA[layer]! + ')'
    ctx.lineWidth = 4 - layer
    ctx.beginPath()
    for (let sx = 0; sx <= W; sx += 24) {
      const wx = camX * RIDGE_PARALLAX[layer]! * boost + sx
      const y = base + ridgeOffset(wx, layer)
      if (sx === 0) ctx.moveTo(sx, y)
      else ctx.lineTo(sx, y)
    }
    ctx.stroke()
  }
}

/**
 * 画起伏雪坡：折线填充雪面渐变，棱线亮/影双描边，坡面叠加确定性雪纹
 * 扫过的细线。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 相机世界 x。
 * @param camY - 相机世界 y。
 */
function drawSlope(ctx: CanvasRenderingContext2D, state: AvaState, camX: number, camY: number): void {
  const gradient = ctx.createLinearGradient(0, H * 0.3, 0, H)
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
  // 棱线阴影面（先画，略向下偏移）。
  ctx.strokeStyle = SNOW_EDGE_SHADE
  ctx.lineWidth = 3
  ctx.beginPath()
  let started = false
  for (let sx = -20; sx <= W + 20; sx += 20) {
    const y = groundYAt(state, camX + sx) - camY + 3
    if (!started) { ctx.moveTo(sx, y); started = true } else ctx.lineTo(sx, y)
  }
  ctx.stroke()
  // 棱线亮面。
  ctx.strokeStyle = SNOW_EDGE
  ctx.lineWidth = 2.5
  ctx.beginPath()
  started = false
  for (let sx = -20; sx <= W + 20; sx += 20) {
    const y = groundYAt(state, camX + sx) - camY
    if (!started) { ctx.moveTo(sx, y); started = true } else ctx.lineTo(sx, y)
  }
  ctx.stroke()
  // 雪纹扫过的细线：确定性分布、顺坡向的短划线。
  ctx.strokeStyle = SNOW_STREAK
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const firstWx = Math.floor(camX / 70) * 70
  for (let wx = firstWx; wx <= camX + W + 70; wx += 70) {
    const h = hash01(wx * 0.37)
    if (h < 0.3) continue
    const sx = wx - camX + h * 30
    const gy = groundYAt(state, wx) - camY
    const grade = (groundYAt(state, wx + 12) - groundYAt(state, wx - 12)) / 24
    const len = 10 + h * 16
    ctx.moveTo(sx, gy + 8 + h * 26)
    ctx.lineTo(sx + len, gy + 8 + h * 26 + len * grade)
  }
  ctx.stroke()
}

/**
 * 画跳台：沿被压低的折线铺一层木板斜台（板体 + 横向板条 + 顶部积雪），
 * 代替裸凸起。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param segX0 - 段起点世界 x。
 * @param rampK - 跳台折线索引。
 * @param camX - 相机世界 x。
 * @param camY - 相机世界 y。
 */
function drawRamp(ctx: CanvasRenderingContext2D, state: AvaState, segX0: number, rampK: number, camX: number, camY: number): void {
  const x0 = segX0 + (rampK - 2) * STEP
  const x1 = segX0 + (rampK + 2) * STEP
  const sx0 = x0 - camX
  const sx1 = x1 - camX
  if (sx1 < -40 || sx0 > W + 40) return
  const y0 = groundYAt(state, x0) - camY
  const y1 = groundYAt(state, x1) - camY
  const steps = 10
  // 板体：沿坡面下移 4~12px 的带状木板。
  ctx.fillStyle = RAMP_WOOD
  ctx.beginPath()
  for (let i = 0; i <= steps; i += 1) {
    const wx = x0 + ((x1 - x0) * i) / steps
    ctx.lineTo(wx - camX, groundYAt(state, wx) - camY + 3)
  }
  for (let i = steps; i >= 0; i -= 1) {
    const wx = x0 + ((x1 - x0) * i) / steps
    ctx.lineTo(wx - camX, groundYAt(state, wx) - camY + 13)
  }
  ctx.closePath()
  ctx.fill()
  // 横向板条。
  ctx.strokeStyle = RAMP_WOOD_DARK
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 1; i < steps; i += 1) {
    const wx = x0 + ((x1 - x0) * i) / steps
    const gy = groundYAt(state, wx) - camY
    ctx.moveTo(wx - camX - 6, gy + 4)
    ctx.lineTo(wx - camX + 6, gy + 12)
  }
  ctx.stroke()
  // 两侧支柱。
  ctx.strokeStyle = RAMP_WOOD_DARK
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(sx0, y0 + 3)
  ctx.lineTo(sx0, y0 + 26)
  ctx.moveTo(sx1, y1 + 3)
  ctx.lineTo(sx1, y1 + 26)
  ctx.stroke()
  // 顶部积雪：沿坡面描一条起伏的白边。
  ctx.strokeStyle = RAMP_SNOW
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i <= steps; i += 1) {
    const wx = x0 + ((x1 - x0) * i) / steps
    const y = groundYAt(state, wx) - camY + 1 + Math.sin(i * 2.1) * 1.5
    if (i === 0) ctx.moveTo(wx - camX, y)
    else ctx.lineTo(wx - camX, y)
  }
  ctx.stroke()
}

/**
 * 画附近段内的全部可见实体：带阴影的树木/岩石、旋转闪光金币（帧动画）、
 * 带 idle 动画与气泡提示的未拾取伙伴，以及木质跳台。
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
    if (seg.rampK >= 0) drawRamp(ctx, state, seg.index * SEG_W, seg.rampK, camX, camY)
    for (const obs of seg.obstacles) {
      const sx = obs.x - camX
      if (sx < -40 || sx > W + 40) continue
      const sy = groundYAt(state, obs.x) - camY
      // 地面阴影。
      ctx.fillStyle = SHADOW
      ctx.beginPath()
      ctx.ellipse(sx + 4, sy + 2, obs.kind === 'tree' ? 14 : 13, 4, 0, 0, Math.PI * 2)
      ctx.fill()
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
      // 旋转帧动画：水平缩放按余弦脉动。
      const spin = Math.abs(Math.cos(state.t * 0.006 + coin.x * 0.05))
      const rw = Math.max(1.6, 7 * spin)
      glow(ctx, THEME.gold, 8)
      ctx.fillStyle = THEME.gold
      ctx.beginPath()
      ctx.ellipse(sx, sy, rw, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
      ctx.fillStyle = '#fff8e6'
      ctx.beginPath()
      ctx.ellipse(sx - rw * 0.25, sy - 2, Math.max(0.7, 2.5 * spin), 2.2, 0, 0, Math.PI * 2)
      ctx.fill()
      // 周期性闪光十字星。
      const glintK = (state.t * 0.001 + coin.x * 0.013) % 1.6
      if (glintK < 0.28) {
        const a = 1 - glintK / 0.28
        ctx.strokeStyle = 'rgba(255,252,235,' + (0.9 * a).toFixed(3) + ')'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(sx - 9, sy - 9)
        ctx.lineTo(sx - 3, sy - 3)
        ctx.moveTo(sx + 11, sy + 5)
        ctx.lineTo(sx + 5, sy + 1)
        ctx.stroke()
      }
    }
    for (const m of seg.mounts) {
      if (m.taken) continue
      const sx = m.x - camX
      if (sx < -40 || sx > W + 40) continue
      const sy = groundYAt(state, m.x) - camY
      // idle 呼吸 + 拍翅/摆臂小动画。
      const bob = Math.sin(state.t * 0.004 + m.x) * 2
      const flap = Math.sin(state.t * 0.012 + m.x)
      ctx.fillStyle = SHADOW
      ctx.beginPath()
      ctx.ellipse(sx + 3, sy + 2, 12, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      drawMount(ctx, m.kind, sx, sy, bob, flap)
      // 头顶气泡提示（渐隐脉动）。
      const pulse = 0.6 + 0.4 * Math.sin(state.t * 0.006)
      ctx.globalAlpha = 0.55 + 0.45 * pulse
      ctx.fillStyle = 'rgba(20,22,34,0.85)'
      roundRectPath(ctx, sx - 26, sy - 52 + bob, 52, 18, 8)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(sx - 4, sy - 34 + bob)
      ctx.lineTo(sx + 4, sy - 34 + bob)
      ctx.lineTo(sx, sy - 29 + bob)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = m.kind === 'penguin' ? accent(5) : accent(0)
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(m.kind === 'penguin' ? '骑我!加速' : '骑我!免撞', sx, sy - 39 + bob)
      ctx.globalAlpha = 1
    }
  }
}

/**
 * 画一只坐骑伙伴（拾取前的坡面摆放与骑乘态共用）；flap 驱动企鹅拍翅 /
 * 雪人摆臂的小动画。
 * @param ctx - 画布上下文。
 * @param kind - 伙伴种类。
 * @param x - 屏幕坐标 x。
 * @param y - 屏幕/本地坐标 y（脚底）。
 * @param bob - 呼吸/颠簸偏移 px。
 * @param flap - 摆动相位 [-1,1]。
 */
function drawMount(
  ctx: CanvasRenderingContext2D,
  kind: Exclude<MountKind, 'none'>,
  x: number,
  y: number,
  bob: number,
  flap: number,
): void {
  if (kind === 'penguin') {
    // 拍翅：两侧翅膀随 flap 上下摆。
    ctx.fillStyle = PENGUIN_BODY
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(x + side * 9, y - 15 + bob)
      ctx.rotate(side * (0.5 + flap * 0.6))
      ctx.beginPath()
      ctx.ellipse(0, 0, 3.2, 8.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
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
    // 摆臂：两只短臂随 flap 前后摆。
    ctx.strokeStyle = YETI_BODY
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const side of [-1, 1]) {
      ctx.moveTo(x + side * 12, y - 20 + bob)
      ctx.lineTo(x + side * (17 + flap * side * 4), y - 10 + bob + flap * 3)
    }
    ctx.stroke()
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
 * 画玩家：贴地压板（板尾持续扬雪由粒子系统负责）、腾空随 tilt 前倾
 * 后仰、翻滚模糊残影、骑乘时伙伴骑在板前带小动画、落地/起跳 squash &
 * stretch 挤压。
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
  const deform = rs.deform

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
    // 伙伴骑在板前，带拍翅/摆臂动画。
    drawMount(ctx, state.mount as Exclude<MountKind, 'none'>, 5, 14, bob, Math.sin(state.t * 0.014))
  }
  // 翻滚残影：三圈衰减的旋转剪影制造模糊感。
  if (state.tumbleMs > 0) {
    for (let g = 1; g <= 3; g += 1) {
      ctx.save()
      ctx.rotate(angle - g * 0.55)
      ctx.globalAlpha = 0.16 - g * 0.035
      ctx.fillStyle = SUIT
      ctx.beginPath()
      ctx.ellipse(0, 0, PLAYER_R, 14, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.rotate(angle)
  if (riding) ctx.translate(0, -14)
  // 落地压扁 / 起跳拉长（沿板轴缩放）。
  ctx.scale(1 + deform, 1 - deform)
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
 * 画雪崩墙：前后两层错相位滚动的锯齿白浪，后体填充半透雪墙；浪顶持续
 * 迸发飞雪粒子。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 相机世界 x。
 * @param dtMs - 帧间隔 ms（控制喷雪频率）。
 */
function drawAvalanche(ctx: CanvasRenderingContext2D, state: AvaState, camX: number, dtMs: number): void {
  const frontX = state.avalancheX - camX
  if (frontX < -240) return
  // 后层浪：错相位、大幅。
  const layer = (phase: number, amp: number, color: string, alpha: number, back: number): void => {
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.moveTo(frontX - back, H + 20)
    ctx.lineTo(frontX - back, -20)
    for (let y = -20; y <= H + 20; y += 30) {
      const wx = frontX + Math.sin(y * 0.045 + state.t * 0.012 + phase) * amp + Math.sin(y * 0.013 - state.t * 0.019 + phase) * amp * 0.7
      ctx.lineTo(wx, y)
    }
    ctx.lineTo(frontX + 20, H + 20)
    ctx.closePath()
    ctx.fill()
  }
  layer(2.4, 30, AVALANCHE_BODY, 0.9, 170)
  layer(0, 18, AVALANCHE_FRONT, 0.95, 60)
  ctx.globalAlpha = 1
  // 浪顶喷雪：前沿顶部持续迸发。
  if (frontX > -60 && frontX < W + 80 && Math.random() < dtMs * 0.05) {
    const n = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i += 1) {
      particles.burst(Math.max(0, frontX - Math.random() * 30), 30 + Math.random() * 120, AVALANCHE_FRONT, 2, 150)
    }
  }
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐；特技/拾取字带弹出缩放
 * （出现瞬间放大回弹）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param camX - 相机世界 x。
 * @param camY - 相机世界 y。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: AvaState, camX: number, camY: number): void {
  ctx.save()
  ctx.textAlign = 'center'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / FLOAT_MS))
    const pop = 1 + 0.5 * Math.pow(1 - k, 3)
    const size = Math.round((fl.text.startsWith('Trick') ? 25 : fl.text.startsWith('+') ? 20 : 17) * pop)
    ctx.globalAlpha = k
    ctx.font = 'bold ' + size + 'px system-ui, sans-serif'
    ctx.fillStyle = fl.text.startsWith('Trick') ? accent(0) : THEME.gold
    const fx = Math.max(40, Math.min(W - 40, fl.x - camX)) + Math.sin(k * 9) * 2
    const fy = Math.max(40, Math.min(H - 20, fl.y - camY))
    ctx.fillText(fl.text, fx, fy)
  }
  ctx.restore()
}

/**
 * 画 HUD：分数 / 距离 / 金币 / 特技 与右上弧形渐变雪崩警告（带距离
 * 数字，<300px 变红闪烁并弹出中央警告）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: AvaState): void {
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(totalScore(state)))
  hudPair(ctx, 110, hudY, '距离', displayDistance(state) + 'm')
  hudPair(ctx, 210, hudY, '金币', String(state.coinScore / 10))
  hudPair(ctx, 290, hudY, '特技', String(state.trickScore))
  // 弧形雪崩警告：半径 30 的顶弧，余量按开局距离折算弧长。
  const gap = avalancheGap(state)
  const cx = W - 52
  const cy = 44
  const r = 30
  const a0 = Math.PI * 1.12
  const a1 = Math.PI * 1.88
  const frac = clamp(gap / AVA_START_GAP, 0, 1)
  const danger = gap < DANGER_GAP
  const flashing = danger && Math.floor(state.t / 150) % 2 === 0
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(cx, cy, r, a0, a1)
  ctx.stroke()
  const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0)
  grad.addColorStop(0, mixHex(THEME.bad, THEME.good, frac))
  grad.addColorStop(1, mixHex(THEME.bad, THEME.good, Math.max(0.35, frac)))
  ctx.strokeStyle = grad
  if (!(danger && flashing)) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac)
    ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.fillStyle = danger ? (flashing ? '#ffb3c0' : THEME.bad) : THEME.text
  ctx.fillText(String(Math.max(0, Math.round(gap / 10))), cx, cy + 4)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('雪崩 m', cx, cy + 17)
  // 逼近中央警告。
  if (danger && state.phase === 'run') {
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.globalAlpha = flashing ? 1 : 0.35
    ctx.fillStyle = THEME.bad
    ctx.fillText('⚠ 雪崩逼近！', W / 2, 46)
    ctx.globalAlpha = 1
  }
  // 骑乘状态提示。
  if (state.mount !== 'none') {
    ctx.textAlign = 'right'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = state.mount === 'penguin' ? accent(5) : accent(0)
    ctx.fillText((state.mount === 'penguin' ? '🐧' : '🧊') + ' 免撞 x' + state.shields, W - 10, hudY + 26)
  }
}

/**
 * 画逼近红色 vignette：屏幕四周径向渐变红雾，越近越浓。
 * @param ctx - 画布上下文。
 * @param k - 危险强度 [0,1]。
 */
function drawVignette(ctx: CanvasRenderingContext2D, k: number): void {
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, W * 0.72)
  grad.addColorStop(0, 'rgba(215,50,70,0)')
  grad.addColorStop(1, 'rgba(215,50,70,' + (0.5 * k).toFixed(3) + ')')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
}

/**
 * 画被吞没过渡：雪浪从画面左侧横扫吞没全屏，随后渐暗交给结算层。
 * @param ctx - 画布上下文。
 * @param k - 过渡进度 [0,1]。
 */
function drawSwallow(ctx: CanvasRenderingContext2D, k: number): void {
  const sweepX = -120 + k * (W + 280)
  ctx.fillStyle = 'rgba(240,245,255,0.96)'
  ctx.beginPath()
  ctx.moveTo(-140, H + 20)
  ctx.lineTo(-140, -20)
  for (let y = -20; y <= H + 20; y += 36) {
    ctx.lineTo(sweepX + Math.sin(y * 0.05 + k * 9) * 26, y)
  }
  ctx.lineTo(sweepX + 40, H + 20)
  ctx.closePath()
  ctx.fill()
  if (k > 0.55) {
    ctx.fillStyle = 'rgba(13,13,20,' + (0.74 * Math.min(1, (k - 0.55) / 0.35)).toFixed(3) + ')'
    ctx.fillRect(0, 0, W, H)
  }
}

/**
 * 画结算面板：标题 + 距离/金币/特技/最高速度四行统计 + 总分与重开提示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawEndOverlay(ctx: CanvasRenderingContext2D, state: AvaState): void {
  ctx.textAlign = 'center'
  ctx.font = 'bold 27px system-ui, sans-serif'
  ctx.fillStyle = THEME.bad
  ctx.fillText(spaced('被雪崩吞没'), W / 2, H / 2 - 96)
  ctx.font = 'bold 34px system-ui, sans-serif'
  glow(ctx, THEME.gold, 12)
  ctx.fillStyle = THEME.gold
  ctx.fillText(String(totalScore(state)), W / 2, H / 2 - 54)
  noGlow(ctx)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('总 分', W / 2, H / 2 - 38)
  const rows: [string, string][] = [
    ['距离', displayDistance(state) + ' m'],
    ['金币', String(state.coinScore / 10) + ' 枚'],
    ['特技', String(state.trickScore) + ' 分'],
    ['最高速度', Math.round(rs.maxVx) + ' px/s'],
  ]
  const rowY0 = H / 2 - 6
  for (let i = 0; i < rows.length; i += 1) {
    const y = rowY0 + i * 30
    const [label, value] = rows[i]!
    ctx.textAlign = 'right'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(label, W / 2 - 14, y)
    ctx.textAlign = 'left'
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(value, W / 2 + 14, y)
  }
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('按 R 重开', W / 2, rowY0 + rows.length * 30 + 16)
}

/**
 * 维护前景雪花池：随风（与前进反向）飘落，速度随玩家速度加成。
 * @param dtMs - 帧间隔 ms。
 * @param speedK - 速度加成系数 [0,1+]。
 */
function tickFlakes(dtMs: number, speedK: number): void {
  if (flakes.length === 0) {
    for (let i = 0; i < 42; i += 1) {
      flakes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: -(30 + Math.random() * 50),
        vy: 26 + Math.random() * 40,
        size: 1.2 + Math.random() * 2.2,
      })
    }
  }
  const dt = dtMs / 1000
  for (const f of flakes) {
    f.x += (f.vx - speedK * 190) * dt
    f.y += f.vy * dt
    if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W }
    if (f.x < -6) f.x = W + 6
    if (f.x > W + 6) f.x = -6
  }
}

/**
 * 画前景雪花。
 * @param ctx - 画布上下文。
 */
function drawFlakes(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  for (const f of flakes) {
    ctx.beginPath()
    ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 维护并画高速速度线：满速附近横向白色流线，强化速度感。
 * @param ctx - 画布上下文。
 * @param dtMs - 帧间隔 ms。
 * @param vx - 玩家水平速度 px/s。
 */
function tickSpeedLines(ctx: CanvasRenderingContext2D, dtMs: number, vx: number): void {
  const over = vx - BASE_MAX_SPEED * 0.88
  if (over > 0 && Math.random() < clamp(over / 120, 0, 1) * dtMs * 0.02) {
    speedLines.push({ x: W + 30, y: 30 + Math.random() * (H - 60), len: 40 + Math.random() * 70, life: 1 })
  }
  const dt = dtMs / 1000
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  for (let i = speedLines.length - 1; i >= 0; i -= 1) {
    const s = speedLines[i]!
    s.x -= (vx * 2.4) * dt
    s.life -= dt * 1.4
    if (s.x + s.len < -10 || s.life <= 0) { speedLines.splice(i, 1); continue }
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(s.x + s.len * s.life, s.y)
  }
  ctx.stroke()
}

/**
 * 渲染一帧。相机 lerp 平滑跟随玩家并腾空拉远；雪崩逼近时叠加渐进震动
 * 与红色 vignette；消费逻辑层事件驱动粒子、闪帧与挤压形变；被吞没时
 * 播放横扫过渡后进入结算面板。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param dtMs - 帧间隔 ms（默认 16；暂停传 0 冻结动画）。
 */
export function renderAvalanche(ctx: CanvasRenderingContext2D, state: AvaState, paused: boolean, dtMs = 16): void {
  // 换局检测：t 回退说明重开，重置所有跨帧状态。
  if (state.t <= rs.lastT) {
    rs.camX = state.px - PLAYER_X
    rs.camY = state.py - PLAYER_Y
    rs.zoom = 1
    rs.shakeAmp = 0
    rs.flashMs = 0
    rs.deform = 0
    rs.swallowAt = -1
    rs.maxVx = state.vx
  }
  const fresh = rs.lastT < 0
  rs.lastT = state.t
  rs.maxVx = Math.max(rs.maxVx, state.vx)

  // 相机 lerp：水平紧、垂直松；腾空时拉远。
  const dt = Math.max(0, dtMs)
  const tgtX = state.px - PLAYER_X
  const tgtY = state.py - PLAYER_Y
  if (fresh) {
    rs.camX = tgtX
    rs.camY = tgtY
  } else {
    const fx = 1 - Math.exp(-dt / 80)
    const fy = 1 - Math.exp(-dt / 220)
    rs.camX += (tgtX - rs.camX) * fx
    rs.camY += (tgtY - rs.camY) * fy
  }
  const tgtZoom = state.onGround ? 1 : 0.9
  rs.zoom += (tgtZoom - rs.zoom) * (1 - Math.exp(-dt / 380))

  // 震动：事件注入 + 雪崩逼近持续增强，指数衰减。
  rs.shakeAmp *= Math.exp(-dt / 130)
  rs.flashMs = Math.max(0, rs.flashMs - dt)
  rs.deform *= Math.exp(-dt / 95)
  const gap = avalancheGap(state)
  if (state.phase === 'run' && gap < DANGER_GAP) {
    rs.shakeAmp = Math.max(rs.shakeAmp, ((DANGER_GAP - gap) / DANGER_GAP) * 5.5)
  }
  const shake = rs.shakeAmp
  const ox = shake > 0.05 ? Math.sin(state.t * 0.05) * shake : 0
  const oy = shake > 0.05 ? Math.cos(state.t * 0.043) * shake : 0

  // 消费逻辑层事件：粒子 + 手感反馈（小震/闪帧/挤压）。
  for (const ev of state.events) {
    const sx = ev.x - rs.camX
    const sy = ev.y - rs.camY
    if (ev.type === 'jump') {
      particles.burst(sx, sy + 10, SNOW_BOTTOM, 10, 120)
      rs.deform = -0.22
      rs.shakeAmp = Math.max(rs.shakeAmp, 1.2)
    } else if (ev.type === 'land') {
      particles.burst(sx, sy + 8, SNOW_BOTTOM, 12, 140)
      rs.deform = 0.3
      rs.shakeAmp = Math.max(rs.shakeAmp, 2.4)
    } else if (ev.type === 'crash') {
      particles.burst(sx, sy, THEME.bad, 18, 180)
      rs.flashMs = 130
      rs.shakeAmp = Math.max(rs.shakeAmp, 7)
    } else if (ev.type === 'shield') {
      particles.burst(sx, sy, accent(5), 14, 160)
      rs.shakeAmp = Math.max(rs.shakeAmp, 3)
    } else if (ev.type === 'coin') {
      particles.burst(sx, sy, THEME.gold, 10, 130)
      rs.shakeAmp = Math.max(rs.shakeAmp, 1)
    } else if (ev.type === 'trick') {
      particles.burst(sx, sy - 20, accent(0), 16, 170)
      rs.shakeAmp = Math.max(rs.shakeAmp, 2)
    } else if (ev.type === 'mount') {
      particles.burst(sx, sy - 10, ev.kind === 'penguin' ? accent(5) : accent(0), 16, 160)
      rs.shakeAmp = Math.max(rs.shakeAmp, 2)
    } else if (ev.type === 'over') {
      particles.burst(sx, sy, AVALANCHE_FRONT, 26, 220)
      rs.shakeAmp = Math.max(rs.shakeAmp, 9)
      rs.swallowAt = state.t
    }
  }

  // 贴地滑行：板尾持续扬雪。
  if (state.phase === 'run' && state.onGround && !paused && Math.random() < dt * 0.02) {
    particles.burst(PLAYER_X - 13, PLAYER_Y + 9, 'rgba(238,243,255,0.95)', 1, 70)
  }

  const speedK = clamp(state.vx / BASE_MAX_SPEED, 0, 1.2)
  tickFlakes(paused ? 0 : dt, speedK)

  drawSky(ctx, state)
  ctx.save()
  ctx.translate(ox, oy)
  // 镜头缩放（腾空拉远）围绕画面中心。
  ctx.translate(W / 2, H / 2)
  ctx.scale(rs.zoom, rs.zoom)
  ctx.translate(-W / 2, -H / 2)
  drawClouds(ctx, rs.camX)
  drawRidges(ctx, rs.camX, rs.camY, speedK)
  drawSlope(ctx, state, rs.camX, rs.camY)
  drawEntities(ctx, state, rs.camX, rs.camY)
  drawPlayer(ctx, state)
  drawAvalanche(ctx, state, rs.camX, paused ? 0 : dt)
  ctx.restore()

  particles.tick(ctx, paused ? 0 : dt)
  drawFlakes(ctx)
  if (!paused) tickSpeedLines(ctx, dt, state.vx)

  // 逼近红色 vignette（仅滑行阶段）。
  if (state.phase === 'run' && gap < DANGER_GAP) drawVignette(ctx, (DANGER_GAP - gap) / DANGER_GAP)
  // 撞击红闪帧。
  if (rs.flashMs > 0) {
    ctx.fillStyle = 'rgba(247,118,142,' + (0.28 * rs.flashMs / 130).toFixed(3) + ')'
    ctx.fillRect(0, 0, W, H)
  }

  drawFloats(ctx, state, rs.camX, rs.camY)
  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'over') {
    // 被吞没横扫过渡，随后浮现结算面板。
    const k = rs.swallowAt < 0 ? 1 : clamp((state.t - rs.swallowAt) / SWALLOW_MS, 0, 1)
    if (k < 1) drawSwallow(ctx, k)
    if (k > 0.55) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, (k - 0.55) / 0.35)
      drawEndOverlay(ctx, state)
      ctx.restore()
    }
  }
}
