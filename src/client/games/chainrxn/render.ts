/**
 * 连锁反应 ChainRxN 渲染：深空背景 + 星点、发光 orb 与钢球、扩张圆环
 * 冲击波、引爆计数弹跳、HUD（点击 / 关卡 / 引爆进度 / 总分）与过关
 * overlay。全部为纯 canvas 绘制，状态由 {@link ChainRxnView} 快照传入。
 */
import { drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, THEME, accent } from '../theme.ts'
import { FIELD, H, LEVELS, W, type Blast, type Orb } from './logic.ts'

/** 深空背景星点（一次生成、每关固定）。 */
export interface Star { x: number, y: number, size: number, alpha: number }

/** 渲染一帧所需的全部状态快照。 */
export interface ChainRxnView {
  orbs: Orb[]
  blasts: Blast[]
  levelIndex: number
  clicksLeft: number
  exploded: number
  goal: number
  score: number
  phase: 'aim' | 'chain' | 'won' | 'lost' | 'cleared'
  paused: boolean
  stars: Star[]
  /** 距最近一次引爆的毫秒数（引爆计数弹跳动画）。 */
  sinceIgnitionMs: number
}

/**
 * 生成一组固定星点（seed 确定，重开同关完全一致）。
 * @param seed - 种子。
 * @param count - 星点数量。
 * @returns 星点数组。
 */
export function makeStars(seed: number, count: number): Star[] {
  // 线性同余即可：星点只是装饰，无需复用 mulberry32 的精确分布。
  let a = seed >>> 0
  const next = (): number => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
  const stars: Star[] = []
  for (let i = 0; i < count; i += 1) {
    stars.push({ x: next() * W, y: FIELD.top + next() * (FIELD.bottom - FIELD.top), size: 0.6 + next() * 1.4, alpha: 0.12 + next() * 0.3 })
  }
  return stars
}

/** 画一个发光 orb（可引爆）或暗色钢球（不可引爆、吸收爆波）。 */
function drawOrb(ctx: CanvasRenderingContext2D, o: Orb, nowMs: number): void {
  if (!o.alive) return
  if (o.kind === 'steel') {
    ctx.beginPath()
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2)
    ctx.fillStyle = '#3a3a4c'
    ctx.fill()
    ctx.strokeStyle = '#73738c'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // 中心铆钉点标识钢球。
    ctx.beginPath()
    ctx.arc(o.x, o.y, Math.max(1.5, o.r * 0.22), 0, Math.PI * 2)
    ctx.fillStyle = '#8b8ba6'
    ctx.fill()
    return
  }
  const color = accent(o.id)
  const twinkle = 0.75 + 0.25 * Math.sin(nowMs / 480 + o.id * 1.7)
  glow(ctx, color, 8 * twinkle)
  ctx.beginPath()
  ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.9
  ctx.fill()
  ctx.globalAlpha = 1
  noGlow(ctx)
  ctx.beginPath()
  ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fill()
}

/** 画一个爆波：扩张中的发光圆环冲击波。 */
function drawBlast(ctx: CanvasRenderingContext2D, b: Blast): void {
  if (b.r <= 0.5) return
  const fading = b.r >= b.maxR ? Math.max(0, b.linger / 0.25) : 1
  const color = b.depth === 0 ? THEME.text : accent(b.depth - 1)
  glow(ctx, color, 12)
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5 * fading + 0.5
  ctx.globalAlpha = 0.85 * fading
  ctx.stroke()
  ctx.globalAlpha = 0.12 * fading
  ctx.fillStyle = color
  ctx.fill()
  ctx.globalAlpha = 1
  noGlow(ctx)
}

/** 顶部 HUD 一行 + 底部常驻速览一行 + 场地边框。 */
function drawHud(ctx: CanvasRenderingContext2D, v: ChainRxnView): void {
  ctx.font = '600 13px system-ui, sans-serif'
  hudPair(ctx, 16, 28, '点击', String(v.clicksLeft))
  hudPair(ctx, 150, 28, '关卡', String(v.levelIndex + 1) + '/' + String(LEVELS.length))
  ctx.textAlign = 'center'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = v.exploded >= v.goal ? THEME.good : THEME.text
  ctx.fillText('引爆 ' + String(v.exploded) + '/' + String(v.goal), W / 2, 28)
  hudPair(ctx, W - 16, 28, '总分', String(v.score), 'right')
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  roundRectPath(ctx, FIELD.left - 6, FIELD.top - 6, FIELD.right - FIELD.left + 12, FIELD.bottom - FIELD.top + 12, 8)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点击空处引爆 · 第 n 层连锁得 10×n 分 · 钢球吸收爆波 · R 重开 P 暂停', W / 2, H - 12)
}

/** 场内右上角实时引爆计数（新引爆时弹跳放大）。 */
function drawCounter(ctx: CanvasRenderingContext2D, v: ChainRxnView): void {
  const pop = Math.max(0, 1 - v.sinceIgnitionMs / 320)
  const scale = 1 + pop * 0.45
  ctx.save()
  ctx.translate(FIELD.right - 54, FIELD.top + 34)
  ctx.scale(scale, scale)
  ctx.textAlign = 'center'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.fillStyle = v.exploded >= v.goal ? THEME.good : THEME.gold
  glow(ctx, THEME.gold, 6 * pop)
  ctx.fillText(String(v.exploded), 0, 0)
  noGlow(ctx)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('/ ' + String(v.goal) + ' 引爆', 0, 14)
  ctx.restore()
}

/**
 * 渲染一整帧（背景 → 星点 → 场地 → orb → 爆波 → HUD → 计数 → overlay）。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设好）。
 * @param v - 状态快照。
 * @param nowMs - 挂载起累计毫秒（闪烁动画）。
 */
export function renderScene(ctx: CanvasRenderingContext2D, v: ChainRxnView, nowMs: number): void {
  drawBackground(ctx, W, H)
  for (const s of v.stars) {
    ctx.globalAlpha = s.alpha
    ctx.fillStyle = THEME.text
    ctx.fillRect(s.x, s.y, s.size, s.size)
  }
  ctx.globalAlpha = 1
  drawHud(ctx, v)
  for (const o of v.orbs) drawOrb(ctx, o, nowMs)
  for (const b of v.blasts) drawBlast(ctx, b)
  drawCounter(ctx, v)
  if (v.phase === 'won') {
    drawOverlay(ctx, W, H, '过关', '引爆 ' + String(v.exploded) + ' · 剩余点击 + ' + String(v.clicksLeft * 25) + ' 分 · N 下一关', THEME.good)
  } else if (v.phase === 'lost') {
    drawOverlay(ctx, W, H, '失败', '还差 ' + String(v.goal - v.exploded) + ' 次引爆 · R 重开', THEME.bad)
  } else if (v.phase === 'cleared') {
    drawOverlay(ctx, W, H, '通关', '五关总分 ' + String(v.score) + ' · R 再来一局', THEME.gold)
  } else if (v.paused) {
    drawOverlay(ctx, W, H, '暂停', 'P 继续 · R 重开')
  }
}
