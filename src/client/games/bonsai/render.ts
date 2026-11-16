/**
 * 盆栽大师渲染层：陶盆 + 土壤剖面、枝干（棕色随级变细、节间微弯贝塞尔）、
 * 节点末端叶簇（绿色随健康度渐变）、可拖太阳（方位驱动趋光性）、目标树型
 * 金色虚线轮廓、浇水后的能量流向微光动画、游戏日/健康/评分实时 HUD 与
 * 过关/枯死/暂停遮罩。基于共享主题工具，纯 canvas 绘制；修剪/浇水/过关
 * 由 index 层调用 burstBonsai 触发粒子。
 */
import type { BonsaiNode, BonsaiState } from './logic.ts'
import { DAY_TICKS, LEVELS, ROOT_X, SCORE_PASS, SOIL_Y, growthMult, nodeEndPositions } from './logic.ts'
import {
  THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const LOGICAL_W = 960
export const LOGICAL_H = 640

/** 粒子池（模块级，与 farm 同惯例）。 */
const particles = createParticles()

/** 在画布坐标 (x,y) 触发一簇粒子（index 层动作反馈）。 */
export function burstBonsai(x: number, y: number, color: string, count = 12, speed = 120): void {
  particles.burst(x, y, color, count, speed)
}

/** 太阳把手半径（命中判定与绘制）。 */
const SUN_R = 20

/** 太阳把手中心（画布坐标）。 */
export function sunPosition(state: BonsaiState): { x: number, y: number } {
  return { x: ROOT_X + state.sunAngle * 300, y: 92 }
}

/**
 * 命中判定：距太阳把手 SUN_R 内返回 'sun'，否则返回距鼠标 12px 内的最浅
 * 枝节点 id（根不可剪，故排除），无命中返回 null。
 * @param state - 游戏状态。
 * @param x - 画布 x。
 * @param y - 画布 y。
 * @returns 'sun' | 节点 id | null。
 */
export function pickAt(state: BonsaiState, x: number, y: number): 'sun' | number | null {
  const sun = sunPosition(state)
  if (Math.hypot(x - sun.x, y - sun.y) <= SUN_R + 4) return 'sun'
  const pos = nodeEndPositions(state)
  let best: number | null = null
  let bestD = 12
  for (const n of state.nodes) {
    if (n.parentId === null) continue
    const end = pos.get(n.id)!
    const sx = ROOT_X + end.x
    const sy = SOIL_Y - end.y
    const d = Math.hypot(x - sx, y - sy)
    if (d <= bestD) {
      bestD = d
      best = n.id
    }
  }
  return best
}

/** 目标树型金色虚线轮廓（提示玩家修剪方向）。 */
function drawTargetOutline(ctx: CanvasRenderingContext2D, state: BonsaiState): void {
  const level = LEVELS[state.levelIndex]!
  const hw = level.crownW / 2
  const ch = level.crownH
  ctx.save()
  ctx.translate(ROOT_X, SOIL_Y)
  ctx.scale(1, -1)
  ctx.strokeStyle = THEME.gold
  ctx.globalAlpha = 0.55
  ctx.setLineDash([7, 6])
  ctx.lineWidth = 1.6
  ctx.beginPath()
  switch (level.shape) {
    case 'cone':
      ctx.moveTo(0, ch)
      ctx.lineTo(-hw - 6, -6)
      ctx.lineTo(hw + 6, -6)
      ctx.closePath()
      break
    case 'cloud':
      ctx.ellipse(0, ch * 0.3, hw, ch * 0.16, 0, 0, Math.PI * 2)
      ctx.moveTo(hw * 0.85, ch * 0.58)
      ctx.ellipse(0, ch * 0.58, hw * 0.85, ch * 0.16, 0, 0, Math.PI * 2)
      ctx.moveTo(hw * 0.6, ch * 0.86)
      ctx.ellipse(0, ch * 0.86, hw * 0.6, ch * 0.14, 0, 0, Math.PI * 2)
      break
    case 'slant': {
      const tilt = 0.55
      const cx = Math.sin(tilt) * ch * 0.55
      const cy = Math.cos(tilt) * ch * 0.55
      ctx.ellipse(cx, cy, hw, ch * 0.5, -tilt, 0, Math.PI * 2)
      break
    }
    case 'twin':
      ctx.ellipse(-hw * 0.56, ch * 0.62, hw * 0.52, ch * 0.34, 0, 0, Math.PI * 2)
      ctx.moveTo(hw * 0.56 + hw * 0.52, ch * 0.62)
      ctx.ellipse(hw * 0.56, ch * 0.62, hw * 0.52, ch * 0.34, 0, 0, Math.PI * 2)
      break
    case 'cascade':
      ctx.ellipse(hw * 0.7, -ch * 0.25, hw * 0.6, ch * 0.45, 0, 0, Math.PI * 2)
      ctx.moveTo(34, ch * 0.3)
      ctx.ellipse(0, ch * 0.3, 34, 26, 0, 0, Math.PI * 2)
      break
  }
  ctx.stroke()
  ctx.restore()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

/** 陶盆与土壤剖面。 */
function drawPot(ctx: CanvasRenderingContext2D): void {
  const px = ROOT_X - 110
  const pw = 220
  const topY = SOIL_Y - 8
  const botY = SOIL_Y + 84
  // 盆体（上宽下窄梯形）
  ctx.beginPath()
  ctx.moveTo(px - 10, topY)
  ctx.lineTo(px + pw + 10, topY)
  ctx.lineTo(px + pw - 18, botY)
  ctx.lineTo(px + 18, botY)
  ctx.closePath()
  ctx.fillStyle = '#8a5a3b'
  ctx.fill()
  ctx.strokeStyle = '#5d3a24'
  ctx.lineWidth = 2
  ctx.stroke()
  // 盆沿
  roundRectPath(ctx, px - 16, topY - 10, pw + 32, 16, 6)
  ctx.fillStyle = '#a06a44'
  ctx.fill()
  ctx.strokeStyle = '#5d3a24'
  ctx.stroke()
  // 土壤剖面（盆口内深色土 + 剖面纹理线）
  ctx.beginPath()
  ctx.ellipse(ROOT_X, topY - 2, pw / 2 - 6, 10, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#3b2a1d'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 3; i += 1) {
    ctx.beginPath()
    ctx.ellipse(ROOT_X, topY - 2 + i * 3, (pw / 2 - 6) * (1 - i * 0.12), 10 * (1 - i * 0.12), 0, 0, Math.PI)
    ctx.stroke()
  }
}

/** 健康度 → 叶色（枯黄 → 鲜绿）。 */
function leafColor(health: number): string {
  const t = Math.max(0, Math.min(1, health / 100))
  const r = Math.round(190 - 120 * t)
  const g = Math.round(150 + 50 * t)
  const b = Math.round(70 + 20 * t)
  return 'rgb(' + r + ',' + g + ',' + b + ')'
}

/** 枝干与叶簇：棕色随级变细，节间微弯贝塞尔，叶节点末端画叶簇。 */
function drawTree(ctx: CanvasRenderingContext2D, state: BonsaiState, hoverId: number | null): void {
  const pos = nodeEndPositions(state)
  const leafC = leafColor(state.health)
  for (const n of state.nodes) {
    if (n.parentId === null) continue
    const parent = state.nodes.find((m) => m.id === n.parentId)
    if (parent === undefined) continue
    const start = pos.get(parent.id)!
    const end = pos.get(n.id)!
    const sx = ROOT_X + start.x
    const sy = SOIL_Y - start.y
    const ex = ROOT_X + end.x
    const ey = SOIL_Y - end.y
    // 节间微弯：控制点取中点沿垂直方向偏移
    const mx = (sx + ex) / 2
    const my = (sy + ey) / 2
    const len = Math.hypot(ex - sx, ey - sy) || 1
    const bend = Math.min(6, len * 0.12)
    const nx = -(ey - sy) / len
    const ny = (ex - sx) / len
    const w = Math.max(1.4, 7 - n.depth * 1.2)
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(mx + nx * bend, my + ny * bend, ex, ey)
    ctx.strokeStyle = n.depth <= 1 ? '#6b4a32' : '#7d5a3c'
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.stroke()
    if (n.id === hoverId) {
      ctx.beginPath()
      ctx.arc(ex, ey, 9, 0, Math.PI * 2)
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      ctx.stroke()
    }
    if (n.children.length === 0) {
      // 叶簇：3-5 片小叶椭圆
      glow(ctx, leafC, 6)
      ctx.fillStyle = leafC
      const leaves = 3 + (n.id % 3)
      for (let i = 0; i < leaves; i += 1) {
        const a = (i / leaves) * Math.PI * 2 + n.id
        const ox = Math.cos(a) * 5
        const oy = Math.sin(a) * 5
        ctx.beginPath()
        ctx.ellipse(ex + ox, ey + oy, 4.6, 2.8, a, 0, Math.PI * 2)
        ctx.fill()
      }
      noGlow(ctx)
    }
  }
}

/** 浇水后的能量流向微光：沿枝段从根向叶流动的光点。 */
function drawEnergyFlow(ctx: CanvasRenderingContext2D, state: BonsaiState, timeMs: number): void {
  if (state.waterBoostDays <= 0) return
  const pos = nodeEndPositions(state)
  ctx.save()
  glow(ctx, '#7dcfff', 8)
  ctx.fillStyle = 'rgba(125,207,255,0.85)'
  for (const n of state.nodes) {
    if (n.parentId === null) continue
    const start = pos.get(n.parentId)!
    const end = pos.get(n.id)!
    const phase = ((timeMs * 0.0012 + n.id * 0.37) % 1 + 1) % 1
    const fx = ROOT_X + start.x + (end.x - start.x) * phase
    const fy = SOIL_Y - (start.y + (end.y - start.y) * phase)
    ctx.beginPath()
    ctx.arc(fx, fy, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  noGlow(ctx)
}

/** 施肥增益期的金色闪点：叶簇末端随时间脉动的小星芒（纯 timeMs 驱动，无随机）。 */
function drawFertShimmer(ctx: CanvasRenderingContext2D, state: BonsaiState, timeMs: number): void {
  if (state.fertBoostDays <= 0) return
  const pos = nodeEndPositions(state)
  for (const n of state.nodes) {
    if (n.children.length > 0 || n.parentId === null) continue
    const end = pos.get(n.id)!
    const tw = 0.5 + 0.5 * Math.sin(timeMs * 0.004 + n.id * 2.1)
    if (tw < 0.25) continue
    ctx.globalAlpha = tw * 0.8
    ctx.fillStyle = THEME.gold
    ctx.beginPath()
    ctx.arc(ROOT_X + end.x + 6, SOIL_Y - end.y - 6, 1.6 + tw, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

/** 太阳（可拖把手 + 光晕 + 朝向树根的淡光束）。 */
function drawSun(ctx: CanvasRenderingContext2D, state: BonsaiState): void {
  const sun = sunPosition(state)
  ctx.save()
  // 光束
  const gradient = ctx.createLinearGradient(sun.x, sun.y, ROOT_X, SOIL_Y)
  gradient.addColorStop(0, 'rgba(224,175,104,0.16)')
  gradient.addColorStop(1, 'rgba(224,175,104,0)')
  ctx.beginPath()
  ctx.moveTo(sun.x, sun.y)
  ctx.lineTo(ROOT_X - 90, SOIL_Y)
  ctx.lineTo(ROOT_X + 90, SOIL_Y)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()
  glow(ctx, THEME.gold, 18)
  ctx.fillStyle = THEME.gold
  ctx.beginPath()
  ctx.arc(sun.x, sun.y, SUN_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,244,214,0.9)'
  ctx.beginPath()
  ctx.arc(sun.x, sun.y, SUN_R * 0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 顶部 HUD：关卡/天数、健康条、评分、浇水额度、肥料库存、生长倍率。 */
function drawHud(ctx: CanvasRenderingContext2D, state: BonsaiState): void {
  const level = LEVELS[state.levelIndex]!
  hudPair(ctx, 16, 24, '关卡', '第' + (state.levelIndex + 1) + '关 · ' + level.name + '（≥' + SCORE_PASS + '分过关）')
  hudPair(ctx, 16, 44, '天数', '第 ' + state.day + ' 天 ' + state.dayTicks + '/' + DAY_TICKS)
  // 健康条
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('健康', 16, 64)
  roundRectPath(ctx, 52, 54, 120, 10, 5)
  ctx.fillStyle = 'rgba(226,226,238,0.12)'
  ctx.fill()
  const hw = Math.max(0, Math.min(1, state.health / 100)) * 120
  if (hw > 1) {
    roundRectPath(ctx, 52, 54, hw, 10, 5)
    ctx.fillStyle = state.health > 50 ? THEME.good : THEME.bad
    ctx.fill()
  }
  hudPair(ctx, 16, 84, '评分', String(state.lastScore), 'left', state.lastScore >= SCORE_PASS ? THEME.gold : THEME.text)
  hudPair(ctx, 16, 104, '生长', '×' + growthMult(state).toFixed(2), 'left', '#7dcfff')
  hudPair(ctx, LOGICAL_W - 16, 24, '浇水', state.waterQuota > 0 ? '今日可用（W）' : '已用 · 再浇烂根', 'right', state.waterQuota > 0 ? THEME.good : THEME.bad)
  hudPair(ctx, LOGICAL_W - 16, 44, '施肥', '库存 ×' + state.fertStock + '（F）', 'right', state.fertStock > 0 ? THEME.text : THEME.bad)
  hudPair(ctx, LOGICAL_W - 16, 64, '烂根', String(state.rotCount) + '/3', 'right', state.rotCount > 0 ? THEME.bad : THEME.text)
  hudPair(ctx, LOGICAL_W - 16, 84, '趋光', state.sunAngle === 0 ? '正上' : (state.sunAngle > 0 ? '偏右 ' : '偏左 ') + Math.abs(state.sunAngle).toFixed(2), 'right', THEME.gold)
  // 底部操作提示
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('点枝：修剪（能量转兄弟枝） · 拖太阳：改变光照方向 · 空格：推进 1 天 · W 浇水 · F 施肥 · R 重开 · P 暂停', LOGICAL_W / 2, LOGICAL_H - 10)
}

/**
 * 整帧绘制（纯 canvas，无副作用除粒子推进）。
 * @param ctx - 已套用逻辑坐标变换的 2d 上下文。
 * @param state - 游戏状态。
 * @param paused - 是否处于暂停（画暂停遮罩）。
 * @param timeMs - 累积毫秒（能量微光与施肥闪点动画用）。
 * @param hoverId - 鼠标悬停的枝节点 id（高亮），无则 null。
 * @param dtMs - 本帧间隔毫秒（粒子推进用）。
 */
/** 静态层缓存：背景+目标轮廓+盆+树只在结构/健康/关卡变化时重绘——
 * 原实现每帧全量重绘整棵树（贝塞尔+叶簇+glow 阴影），是卡顿的主因。 */
let sceneCanvas: HTMLCanvasElement | null = null
let sceneKey = ''

function sceneSignature(state: BonsaiState, hoverId: number | null): string {
  return [
    state.levelIndex, Math.round(state.health), state.phase === 'dead' ? 1 : 0, state.phase,
    state.nodes.length, hoverId ?? -1,
    state.nodes.map((n) => Math.round(n.length * 4)).join(','),
  ].join('|')
}

function drawStaticScene(state: BonsaiState, hoverId: number | null): void {
  const sig = sceneSignature(state, hoverId)
  const w = Math.max(1, Math.round(LOGICAL_W))
  const h = Math.max(1, Math.round(LOGICAL_H))
  if (sceneCanvas === null || sceneCanvas.width !== w || sceneCanvas.height !== h) {
    sceneCanvas = document.createElement('canvas')
    sceneCanvas.width = w
    sceneCanvas.height = h
    sceneKey = ''
  }
  if (sig === sceneKey) return
  const sctx = sceneCanvas.getContext('2d')
  if (sctx === null) return
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, w, h)
  drawBackground(sctx, w, h)
  drawTargetOutline(sctx, state)
  drawPot(sctx)
  drawTree(sctx, state, hoverId)
  sceneKey = sig
}

export function renderBonsai(
  ctx: CanvasRenderingContext2D,
  state: BonsaiState,
  paused: boolean,
  timeMs: number,
  hoverId: number | null,
  dtMs: number,
): void {
  drawStaticScene(state, hoverId)
  if (sceneCanvas !== null) ctx.drawImage(sceneCanvas, 0, 0)
  drawEnergyFlow(ctx, state, timeMs)
  drawFertShimmer(ctx, state, timeMs)
  drawSun(ctx, state)
  particles.tick(ctx, Math.min(50, Math.max(0, dtMs)))
  drawHud(ctx, state)
  if (state.phase === 'won') {
    const last = state.levelIndex >= LEVELS.length - 1
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, last ? '全部通关' : '过关', last ? '你已修成五式树型 · R：重开' : '空格：下一关 · R：重开本关', THEME.gold)
  } else if (state.phase === 'dead') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '树已枯死', '烂根不治 · R：重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', 'P：继续')
  }
}
