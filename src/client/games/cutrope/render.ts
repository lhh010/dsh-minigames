/**
 * 剪绳喂糖渲染层：卡通风侧视盘面——顶部木钉挂点、麻绳绳索、
 * 条纹高光糖果、张嘴等糖的小怪物、旋转星星、尖刺、气泡、糖果轨迹
 * 拖尾、剪刀划线，以及命/剪数/星星 HUD 与过关 overlay。无状态，
 * 全部状态由调用方传入；复用 theme.ts 公共设施。
 */
import {
  BUBBLE_R, CANDY_R, GROUND_Y, H, LEVELS, MOUTH_R, STAR_R, W,
  type CutRopeState,
} from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 绳索颜色（未剪/已剪）。 */
const ROPE_COLOR = '#9b7b53'
const ROPE_CUT_COLOR = '#6f5738'

/** 五角星路径。 */
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.45
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/** 小怪物：绿身、大眼、随动画张合的嘴（目标捕获圈）。 */
function drawMonster(ctx: CanvasRenderingContext2D, mx: number, my: number, animMs: number, eager: boolean): void {
  const open = eager ? 1 : 0.55 + 0.45 * Math.sin(animMs / 260)
  // 身体。
  glow(ctx, '#7fc95e', 10)
  ctx.fillStyle = '#7fc95e'
  ctx.beginPath()
  ctx.ellipse(mx, my + 26, 34, 30, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#5ea844'
  ctx.beginPath()
  ctx.ellipse(mx, my + 44, 30, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  // 嘴：捕获圈随开合呼吸。
  ctx.fillStyle = '#3c1f2b'
  ctx.beginPath()
  ctx.arc(mx, my, MOUTH_R * (0.72 + 0.28 * open), 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#f3d9a4'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(mx, my, MOUTH_R * (0.72 + 0.28 * open), 0, Math.PI * 2)
  ctx.stroke()
  // 眼睛。
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(mx + side * 14, my - 22, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#222'
    ctx.beginPath()
    ctx.arc(mx + side * 14 + (eager ? 0 : side * 1.5), my - 22, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
  // 角。
  ctx.fillStyle = '#5ea844'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(mx + side * 16, my - 44)
    ctx.lineTo(mx + side * 24, my - 60)
    ctx.lineTo(mx + side * 6, my - 48)
    ctx.closePath()
    ctx.fill()
  }
}

/** 糖果：圆形硬糖 + 条纹 + 高光。 */
function drawCandy(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  glow(ctx, '#f78fb0', 8)
  ctx.fillStyle = '#f2a0c0'
  ctx.beginPath()
  ctx.arc(x, y, CANDY_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, CANDY_R, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#e46a97'
  for (let i = -1; i <= 1; i += 1) {
    ctx.save()
    ctx.translate(x + i * 7, y)
    ctx.rotate(0.6)
    ctx.fillRect(-2.2, -CANDY_R, 4.4, CANDY_R * 2)
    ctx.restore()
  }
  ctx.restore()
  // 糖纸高光。
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.ellipse(x - 4, y - 5, 4, 2.4, -0.6, 0, Math.PI * 2)
  ctx.fill()
}

/** 气泡：半透明圆 + 高光弧。 */
function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, animMs: number): void {
  const w = Math.sin(animMs / 300) * 1.5
  ctx.strokeStyle = 'rgba(160,220,255,0.9)'
  ctx.lineWidth = 2
  ctx.fillStyle = 'rgba(150,210,255,0.16)'
  ctx.beginPath()
  ctx.arc(x, y, BUBBLE_R + w, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(x, y, BUBBLE_R * 0.66 + w, -2.2, -1.2)
  ctx.stroke()
}

/** 尖刺：一排灰色三角。 */
function drawSpikes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#565f73'
  ctx.fillRect(x, y + h - 3, w, 3)
  const n = Math.max(2, Math.round(w / 16))
  const step = w / n
  for (let i = 0; i < n; i += 1) {
    ctx.beginPath()
    ctx.moveTo(x + i * step, y + h)
    ctx.lineTo(x + (i + 0.5) * step, y - 2)
    ctx.lineTo(x + (i + 1) * step, y + h)
    ctx.closePath()
    ctx.fill()
  }
}

export interface RenderExtras {
  /** 糖果轨迹拖尾。 */
  trail: readonly { x: number, y: number }[]
  /** 当前剪刀划线（按下到当前指针）。 */
  swipe: { x1: number, y1: number, x2: number, y2: number } | null
  /** 动画时钟 ms（怪物张嘴/星星旋转/气泡浮动）。 */
  animMs: number
  paused: boolean
}

/** 渲染整帧（无状态：全部输入由参数传入）。 */
export function renderCutRope(ctx: CanvasRenderingContext2D, state: CutRopeState, extras: RenderExtras): void {
  const anim = extras.animMs
  drawBackground(ctx, W, H)
  // 地面。
  ctx.fillStyle = '#2a3b26'
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
  ctx.fillStyle = '#3c5433'
  ctx.fillRect(0, GROUND_Y, W, 5)

  // 怪物嘴捕获圈提示（虚线靶环）。
  ctx.strokeStyle = 'rgba(243,217,164,0.35)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 6])
  ctx.beginPath()
  ctx.arc(state.monster.x, state.monster.y, MOUTH_R + 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // 尖刺。
  for (const s of state.spikes) drawSpikes(ctx, s.x, s.y, s.w, s.h)

  // 轨迹拖尾。
  for (let i = 0; i < extras.trail.length; i += 1) {
    const p = extras.trail[i]!
    ctx.fillStyle = 'rgba(242,160,192,' + (0.05 + (0.3 * i) / extras.trail.length).toFixed(2) + ')'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绳（先画剪断的，再画连接糖果的）。
  for (const rope of state.ropes) {
    if (!rope.cut) continue
    ctx.strokeStyle = ROPE_CUT_COLOR
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(rope.ax, rope.ay)
    for (const p of rope.pts) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  for (const rope of state.ropes) {
    if (rope.cut) continue
    ctx.strokeStyle = ROPE_COLOR
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(rope.ax, rope.ay)
    for (const p of rope.pts) ctx.lineTo(p.x, p.y)
    ctx.lineTo(state.candy.x, state.candy.y)
    ctx.stroke()
  }

  // 挂点木钉。
  for (const rope of state.ropes) {
    ctx.fillStyle = '#8a6b4a'
    ctx.beginPath()
    ctx.arc(rope.ax, rope.ay, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5f4830'
    ctx.beginPath()
    ctx.arc(rope.ax, rope.ay, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // 星星（收集后画淡影）。旋转随 anim。
  for (let i = 0; i < state.stars.length; i += 1) {
    const s = state.stars[i]!
    if (s.got) {
      ctx.fillStyle = 'rgba(224,175,104,0.18)'
      starPath(ctx, s.x, s.y, STAR_R, 0)
      ctx.fill()
      continue
    }
    glow(ctx, THEME.gold, 8)
    ctx.fillStyle = THEME.gold
    starPath(ctx, s.x, s.y, STAR_R, anim / 900 + i * 0.9)
    ctx.fill()
    noGlow(ctx)
  }

  // 气泡（未吸糖时静止；吸糖后跟随糖果）。
  const b = state.bubble
  if (b !== null && !b.popped && !b.onCandy) drawBubble(ctx, b.x, b.y, anim)

  // 怪物（糖果接近时张嘴期待）。
  const near = Math.hypot(state.candy.x - state.monster.x, state.candy.y - state.monster.y) < 110
  drawMonster(ctx, state.monster.x, state.monster.y, anim, near)

  // 糖果（碎裂失败后不再绘制）。
  if (state.phase !== 'lost') {
    drawCandy(ctx, state.candy.x, state.candy.y)
    if (b !== null && b.onCandy && !b.popped) drawBubble(ctx, state.candy.x, state.candy.y, anim)
  }

  // 剪刀划线。
  if (extras.swipe !== null) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(extras.swipe.x1, extras.swipe.y1)
    ctx.lineTo(extras.swipe.x2, extras.swipe.y2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // HUD：左列关卡/命，右列剪数/星星（互不遮挡，画布 640 宽）。
  const hearts = state.lives > 0 ? '❤'.repeat(state.lives) : '0'
  hudPair(ctx, 10, 24, '关卡', String(state.level) + '/' + LEVELS.length)
  hudPair(ctx, 10, 44, '命', hearts, 'left', THEME.bad)
  hudPair(ctx, W - 10, 24, '剪', '✂ ×' + state.cutsLeft, 'right', state.cutsLeft === 0 ? THEME.bad : THEME.text)
  hudPair(ctx, W - 10, 44, '星', String(state.stars.filter(s => s.got).length) + '/' + state.stars.length, 'right', THEME.gold)

  // 底部常驻速览（1 行，与 HUD 相距 380+px）。
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点击/划线剪绳 · 点气泡戳破 · R 重开 · P 暂停', W / 2, H - 8)

  if (state.phase === 'won') {
    const got = state.stars.filter(s => s.got).length
    drawOverlay(ctx, W, H, '过关！', '★'.repeat(got) + '☆'.repeat(state.stars.length - got) + ' · 按空格下一关', THEME.good)
  } else if (state.phase === 'lost') {
    if (state.lives > 0) {
      drawOverlay(ctx, W, H, '糖果没了', '剩 ' + state.lives + ' 命 · 按 R 重试本关', THEME.bad)
    } else {
      drawOverlay(ctx, W, H, '游戏结束', '命用光了 · 按 R 从第 1 关重新开始', THEME.bad)
    }
  } else if (extras.paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续', THEME.text)
  }
  void roundRectPath
}
