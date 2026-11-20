/**
 * 蚁群引路渲染：草地纹理、信息素可视化（糖水淡蓝晕染扩散）、障碍石、
 * 食物源/蚁巢图标、蚂蚁（小黑点 + 扛食显食粒）、瓢虫（红底黑点）、
 * 达标数/配额/倒计时 HUD 与过关/失败/暂停 overlay。纯绘制，不触碰
 * 游戏逻辑。
 */
import { THEME, glow, noGlow, drawBackground, drawOverlay, hudPair } from '../theme.ts'
import {
  W, H, HUD_H, CELL, SUGAR_LIFE_MS, LEVELS,
  type AntTrailState, type Ant, type Ladybug,
} from './logic.ts'

/** 草地基色与条纹（与牧羊犬同一草地家族，偏冷绿）。 */
const GRASS_BASE = '#3c5638'
const GRASS_STRIPE = '#425e3d'
const FIELD_EDGE = '#2a4128'
/** 障碍石配色。 */
const STONE_FILL = '#7a7a88'
const STONE_EDGE = '#4a4a58'
const STONE_TOP = '#9a9aa8'
/** 信息素晕染色（淡蓝）。 */
const PHER_COLOR = '122,162,247'
/** 食物源（面包屑堆）与蚁巢配色。 */
const FOOD_FILL = '#e0af68'
const FOOD_EDGE = '#8a6a34'
const NEST_FILL = '#6b4f35'
const NEST_EDGE = '#43301f'
const NEST_HOLE = '#241a12'
/** 蚂蚁与瓢虫配色。 */
const ANT_BODY = '#1c1c22'
const FOOD_GRAIN = '#e0af68'
const LADY_BODY = '#e0455a'
const LADY_HEAD = '#26262e'
const LADY_DOT = '#26262e'

/**
 * 画草地：条纹底 + 由 seed 派生位置固定的草簇暗斑（用位置哈希代替
 * 随机，渲染零状态）。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 */
function drawGrass(ctx: CanvasRenderingContext2D, st: AntTrailState): void {
  const f = st.field
  ctx.fillStyle = GRASS_BASE
  ctx.fillRect(f.x, f.y, f.w, f.h)
  ctx.fillStyle = GRASS_STRIPE
  const stripe = CELL * 2
  for (let y = f.y; y < f.y + f.h; y += stripe) {
    for (let x = f.x + ((Math.floor(y / stripe) % 2) * stripe) / 2; x < f.x + f.w; x += stripe * 2) {
      ctx.fillRect(x, y, stripe, stripe)
    }
  }
  // 草簇暗斑：位置由格子下标哈希，稳定不闪。
  ctx.fillStyle = 'rgba(20,32,18,0.30)'
  for (let row = 0; row < st.rows; row += 1) {
    for (let col = 0; col < st.cols; col += 1) {
      const h = ((col * 73856093) ^ (row * 19349663)) >>> 0
      if (h % 5 === 0) {
        const cx = f.x + col * CELL + (h % CELL)
        const cy = f.y + row * CELL + ((h >> 8) % CELL)
        ctx.beginPath()
        ctx.arc(cx, cy, 2 + (h % 3), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.strokeStyle = FIELD_EDGE
  ctx.lineWidth = 2
  ctx.strokeRect(f.x - 1, f.y - 1, f.w + 2, f.h + 2)
}

/**
 * 画信息素晕染：每格按浓度铺淡蓝，越浓越亮（糖水的扩散痕迹）。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 */
function drawPheromone(ctx: CanvasRenderingContext2D, st: AntTrailState): void {
  const f = st.field
  for (let row = 0; row < st.rows; row += 1) {
    for (let col = 0; col < st.cols; col += 1) {
      const i = col + row * st.cols
      const v = st.pher[i] ?? 0
      if (v < 0.03) continue
      const alpha = Math.min(0.5, v * 0.16)
      ctx.fillStyle = 'rgba(' + PHER_COLOR + ',' + alpha.toFixed(3) + ')'
      ctx.fillRect(f.x + col * CELL, f.y + row * CELL, CELL, CELL)
    }
  }
}

/**
 * 画障碍石：圆润灰石，顶面高光。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 */
function drawStones(ctx: CanvasRenderingContext2D, st: AntTrailState): void {
  const f = st.field
  for (let row = 0; row < st.rows; row += 1) {
    for (let col = 0; col < st.cols; col += 1) {
      if (st.stones[col + row * st.cols] !== true) continue
      const x = f.x + col * CELL + 2
      const y = f.y + row * CELL + 2
      ctx.fillStyle = STONE_FILL
      ctx.strokeStyle = STONE_EDGE
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(x, y, CELL - 4, CELL - 4, 5)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = STONE_TOP
      ctx.beginPath()
      ctx.roundRect(x + 3, y + 2, CELL - 10, (CELL - 4) / 2.6, 3)
      ctx.fill()
    }
  }
}

/**
 * 画一滴糖水：蓝色发光圆，随剩余时长收缩脉动。
 * @param ctx - 画布上下文。
 * @param x - 中心 x。
 * @param y - 中心 y。
 * @param lifeFrac - 剩余时长占比（1 → 0）。
 */
function drawSugarDrop(ctx: CanvasRenderingContext2D, x: number, y: number, lifeFrac: number): void {
  const r = 5 + 3 * lifeFrac
  glow(ctx, 'rgb(' + PHER_COLOR + ')', 12)
  ctx.fillStyle = 'rgba(' + PHER_COLOR + ',0.85)'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(230,242,255,0.9)'
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画食物源：面包屑堆（琥珀色颗粒簇）。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 */
function drawFood(ctx: CanvasRenderingContext2D, st: AntTrailState): void {
  const { x, y } = st.food
  glow(ctx, FOOD_FILL, 14)
  ctx.fillStyle = FOOD_FILL
  ctx.strokeStyle = FOOD_EDGE
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = FOOD_EDGE
  for (let i = 0; i < 5; i += 1) {
    const a = i * 1.256 + 0.6
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.font = 'bold 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('食物', x, y + 26)
}

/**
 * 画蚁巢：土丘 + 黑洞口。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 */
function drawNest(ctx: CanvasRenderingContext2D, st: AntTrailState): void {
  const { x, y } = st.nest
  glow(ctx, NEST_FILL, 10)
  ctx.fillStyle = NEST_FILL
  ctx.strokeStyle = NEST_EDGE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(x, y, 16, 13, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  noGlow(ctx)
  ctx.fillStyle = NEST_HOLE
  ctx.beginPath()
  ctx.ellipse(x, y + 1, 7, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = 'bold 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('蚁巢', x, y + 28)
}

/**
 * 画一只蚂蚁：小黑点，扛食时前方亮一颗食粒。
 * @param ctx - 画布上下文。
 * @param a - 蚂蚁。
 */
function drawAnt(ctx: CanvasRenderingContext2D, a: Ant): void {
  ctx.fillStyle = ANT_BODY
  ctx.beginPath()
  ctx.arc(a.x, a.y, 2.6, 0, Math.PI * 2)
  ctx.fill()
  if (a.carrying) {
    ctx.fillStyle = FOOD_GRAIN
    ctx.beginPath()
    ctx.arc(a.x + Math.cos(a.heading) * 3.6, a.y + Math.sin(a.heading) * 3.6, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 画一只瓢虫：红底圆身 + 黑头 + 黑点。
 * @param ctx - 画布上下文。
 * @param b - 瓢虫。
 */
function drawLadybug(ctx: CanvasRenderingContext2D, b: Ladybug): void {
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.fillStyle = LADY_HEAD
  ctx.beginPath()
  ctx.arc(0, -5, 3.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = LADY_BODY
  ctx.strokeStyle = '#8f2334'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.ellipse(0, 1.5, 6.4, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = LADY_DOT
  ctx.beginPath()
  ctx.arc(-3, 0.5, 1.5, 0, Math.PI * 2)
  ctx.arc(3, 0.5, 1.5, 0, Math.PI * 2)
  ctx.arc(0, 5, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画顶部 HUD：关卡、回巢达标数、障碍石/糖水配额、倒计时与当前工具。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 * @param toolMode - 当前工具（障碍石 / 糖水）。
 */
function drawHud(ctx: CanvasRenderingContext2D, st: AntTrailState, toolMode: 'stone' | 'sugar'): void {
  const level = LEVELS[st.levelIndex]!
  ctx.fillStyle = 'rgba(13,13,20,0.55)'
  ctx.fillRect(0, 0, W, HUD_H)
  ctx.textAlign = 'left'
  hudPair(ctx, 10, 20, '关卡', String(st.levelIndex + 1) + '/5')
  hudPair(ctx, 70, 20, '回巢', st.delivered + '/' + level.need, 'left', st.delivered >= level.need ? THEME.good : THEME.text)
  hudPair(ctx, 130, 20, '蚁', String(st.ants.length), 'left', st.ants.length === 0 ? THEME.bad : THEME.text)
  hudPair(ctx, 170, 20, '石', st.stonesUsed + '/' + level.stoneQuota)
  hudPair(ctx, 225, 20, '糖', st.sugarsUsed + '/' + level.sugarQuota)
  const seconds = Math.max(0, Math.ceil(st.timeLeftMs / 1000))
  hudPair(ctx, W - 100, 20, '时间', String(seconds) + 's', 'left', seconds <= 10 ? THEME.bad : THEME.text)
  hudPair(ctx, W - 10, 20, '分', String(st.score), 'right', THEME.gold)
  ctx.textAlign = 'right'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = toolMode === 'stone' ? '#9ece6a' : '#7aa2f7'
  ctx.fillText(toolMode === 'stone' ? '工具：障碍石 Z' : '工具：糖水 Z', W - 10, 44)
}

/**
 * 渲染整帧。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param toolMode - 当前工具（障碍石 / 糖水），HUD 展示用。
 */
export function renderAntTrail(ctx: CanvasRenderingContext2D, st: AntTrailState, paused: boolean, toolMode: 'stone' | 'sugar'): void {
  drawBackground(ctx, W, H)
  drawGrass(ctx, st)
  drawPheromone(ctx, st)
  for (const d of st.drops) drawSugarDrop(ctx, d.x, d.y, Math.max(0, d.lifeMs / SUGAR_LIFE_MS))
  drawFood(ctx, st)
  drawNest(ctx, st)
  drawStones(ctx, st)
  for (const a of st.ants) drawAnt(ctx, a)
  for (const b of st.ladybugs) drawLadybug(ctx, b)
  drawHud(ctx, st, toolMode)

  if (st.phase === 'won') {
    drawOverlay(ctx, W, H, '蚁群达标！', '即将进入第 ' + (st.levelIndex + 2) + ' 关…', THEME.good)
  } else if (st.phase === 'lost') {
    drawOverlay(ctx, W, H, '任务失败', 'R：重试本局', THEME.bad)
  } else if (st.phase === 'campaign-won') {
    drawOverlay(ctx, W, H, '五关全通！', '蚁群找到了回家的路 · R：再来一局', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, W, H, '暂停', 'P：继续 · R：重开')
  }
}
