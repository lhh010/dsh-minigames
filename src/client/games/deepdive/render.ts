/**
 * 深海潜水渲染层：竖直卷轴海洋（浅蓝 → 深黑分层渐变，随深度变暗）、
 * 上浮气泡粒子、船与水面线、发光宝物（珍珠/金币/沉箱）、正弦漂浮水母、
 * 暗流箭头带、戴氧气表的潜水员与照明灯锥、深度计/氧气条（低氧红警）/
 * 本趟收获 HUD、船上商店面板（升级按钮 + 出发）与暂停/通关遮罩。全部为
 * 纯 canvas 绘制，特效（气泡、收获闪光）只观察逻辑状态，不改逻辑。
 */
import type { DeepDiveState, Treasure, UpgradeKey } from './logic.ts'
import { SEA_W, LEVELS, MAX_TIER, upgradeCost, tankCapacity } from './logic.ts'
import { THEME, accent, createParticles, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 顶部 HUD 高度（逻辑像素）。 */
export const HUD_H = 46
/** 逻辑画布尺寸。 */
export const LOGICAL_W = SEA_W
export const LOGICAL_H = 600
/** 每米深度的像素比例（卷轴滚动用）。 */
export const PX_PER_M = 3

/** 商店升级按钮矩形（index 层点击命中用，顺序 = UPGRADE_KEYS）。 */
export const UPGRADE_KEYS: readonly UpgradeKey[] = ['tank', 'fins', 'lamp']
export interface ButtonRect { x: number, y: number, w: number, h: number }
export const SHOP_BTNS: Readonly<Record<UpgradeKey, ButtonRect>> = {
  tank: { x: 30, y: 210, w: 300, h: 56 },
  fins: { x: 30, y: 274, w: 300, h: 56 },
  lamp: { x: 30, y: 338, w: 300, h: 56 },
}
export const DIVE_BTN: ButtonRect = { x: 80, y: 420, w: 200, h: 48 }
const UPGRADE_NAME: Readonly<Record<UpgradeKey, string>> = { tank: '氧气瓶', fins: '脚蹼', lamp: '照明灯' }

/** 深度 → 水色（浅蓝 → 深黑三段插值）。 */
function waterColor(depth: number, alpha = 1): string {
  const maxD = LEVELS[LEVELS.length - 1]!.depth
  const k = Math.min(1, Math.max(0, depth / maxD))
  const stops: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
    [0, [64, 140, 190]],
    [0.45, [20, 54, 96]],
    [1, [4, 7, 16]],
  ]
  let i = 0
  while (i < stops.length - 2 && k > stops[i + 1]![0]) i += 1
  const [k0, c0] = stops[i]!
  const [k1, c1] = stops[i + 1]!
  const u = (k - k0) / (k1 - k0)
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * u)
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * u)
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * u)
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
}

/** 气泡粒子池（渲染层私有，随机漂移不影响逻辑确定性）。 */
interface Bubble { x: number, y: number, v: number, r: number, wob: number }
const bubbles: Bubble[] = []
const particles = createParticles()
let prevHaul = 0
let facing = 1

function drawTreasure(ctx: CanvasRenderingContext2D, t: Treasure, sy: (m: number) => number, time: number): void {
  if (t.taken) return
  const cx = t.x
  const cy = sy(t.d)
  const pulse = 0.7 + 0.3 * Math.sin(time * 5 + t.x)
  const color = t.kind === 'pearl' ? '#cfe8ff' : t.kind === 'coin' ? THEME.gold : accent(4)
  ctx.globalAlpha = pulse
  glow(ctx, color, 10)
  ctx.fillStyle = color
  if (t.kind === 'pearl') {
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fill()
  } else if (t.kind === 'coin') {
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#101018'
    ctx.font = 'bold 8px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('$', cx, cy + 3)
  } else {
    roundRectPath(ctx, cx - 9, cy - 6, 18, 12, 3)
    ctx.fill()
    ctx.fillStyle = '#101018'
    ctx.fillRect(cx - 2, cy - 6, 4, 12)
  }
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设置）。
 * @param state - 游戏状态。
 * @param t - 累计秒数（动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderDeepDive(ctx: CanvasRenderingContext2D, state: DeepDiveState, t: number, paused: boolean): void {
  if (state.inputX !== 0) facing = state.inputX > 0 ? 1 : -1
  const diving = state.phase === 'dive'
  const viewH = LOGICAL_H - HUD_H
  // 相机：潜水时跟随深度，船上停在水面。
  const camD = diving ? state.depth - viewH / PX_PER_M / 2.5 : -viewH / PX_PER_M / 2.5
  const camTop = Math.max(-40, camD)
  const sy = (m: number): number => HUD_H + (m - camTop) * PX_PER_M
  const maxDepth = LEVELS[state.level - 1]!.depth

  // 海水：逐深度条带插值（竖直分层渐变）。
  const bandM = 6
  for (let m = Math.floor(camTop / bandM) * bandM; ; m += bandM) {
    const y0 = sy(m)
    if (y0 > LOGICAL_H) break
    const y1 = Math.max(y0, sy(m + bandM))
    ctx.fillStyle = waterColor(m)
    ctx.fillRect(0, y0, LOGICAL_W, y1 - y0 + 1)
    if (y1 > LOGICAL_H) break
  }

  if (diving) {
    // 暗流带：半透明箭头纹理。
    for (const cur of state.currents) {
      const y0 = sy(cur.from)
      const y1 = sy(cur.to)
      ctx.fillStyle = 'rgba(122,162,247,0.10)'
      ctx.fillRect(0, y0, LOGICAL_W, y1 - y0)
      ctx.strokeStyle = 'rgba(122,162,247,0.35)'
      ctx.lineWidth = 1.5
      const dir = cur.vx > 0 ? 1 : -1
      for (let yy = y0 + 10; yy < y1 - 4; yy += 22) {
        ctx.beginPath()
        ctx.moveTo(LOGICAL_W / 2 - 26 * dir, yy)
        ctx.lineTo(LOGICAL_W / 2 + 26 * dir, yy)
        ctx.lineTo(LOGICAL_W / 2 + 18 * dir, yy - 5)
        ctx.stroke()
      }
    }
    // 海床。
    const bedY = sy(maxDepth)
    if (bedY < LOGICAL_H) {
      ctx.fillStyle = '#2a2018'
      ctx.fillRect(0, bedY, LOGICAL_W, LOGICAL_H - bedY)
    }
    // 宝物与水母。
    for (const tr of state.treasures) drawTreasure(ctx, tr, sy, t)
    for (const j of state.jellies) {
      const jx = j.x + Math.sin(state.time * j.spd + j.phase) * j.ampX
      const jy = sy(j.d)
      const bob = Math.sin(state.time * 1.7 + j.phase) * 3
      glow(ctx, '#f7768e', 8)
      ctx.fillStyle = 'rgba(247,118,142,0.85)'
      ctx.beginPath()
      ctx.arc(jx, jy + bob, 9, Math.PI, 0)
      ctx.fill()
      noGlow(ctx)
      ctx.strokeStyle = 'rgba(247,118,142,0.6)'
      ctx.lineWidth = 1.5
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath()
        ctx.moveTo(jx + i * 3.4, jy + bob)
        ctx.quadraticCurveTo(jx + i * 3.4 + Math.sin(t * 4 + i) * 3, jy + bob + 8, jx + i * 3.4 + Math.sin(t * 3 + i) * 4, jy + bob + 15)
        ctx.stroke()
      }
    }

    // 气泡：潜水员呼出 + 环境气泡，上浮消散。
    if (bubbles.length < 40 && Math.random() < 0.5) {
      bubbles.push({
        x: state.x + (Math.random() - 0.5) * 26,
        y: sy(state.depth) + Math.random() * 10,
        v: 26 + Math.random() * 34,
        r: 1.5 + Math.random() * 2.6,
        wob: Math.random() * Math.PI * 2,
      })
    }
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i]!
      b.y -= b.v * 0.016
      if (b.y < HUD_H) { bubbles.splice(i, 1); continue }
      ctx.strokeStyle = 'rgba(200,230,255,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(b.x + Math.sin(t * 3 + b.wob) * 3, b.y, b.r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 收获入袋闪光。
    if (state.haul > prevHaul) {
      particles.burst(state.x, sy(state.depth), THEME.gold, 12, 130)
    }
    prevHaul = state.haul

    // 深水黑暗与浑浊：两层遮罩——①绝对深度越深越黑（原有）；②**离潜水员
    // 垂直/水平距离越远越浑浊**（半径 220px 外近全黑）：在水面也能一眼望穿
    // 深底是原实现的漏洞，浑浊层保证只有靠近（照明灯范围）才看得清宝物。
    const darkK = Math.min(0.86, Math.max(0, (state.depth - 40) / 160))
    const py = sy(state.depth)
    if (darkK > 0.02) {
      const lightR = 95 + state.upgrades.lamp * 45
      const grad = ctx.createRadialGradient(state.x, py, lightR * 0.35, state.x, py, lightR)
      grad.addColorStop(0, 'rgba(2,4,10,0)')
      grad.addColorStop(1, 'rgba(2,4,10,' + darkK + ')')
      ctx.fillStyle = grad
      ctx.fillRect(0, HUD_H, LOGICAL_W, viewH)
    }
    const murkR = 220 + state.upgrades.lamp * 30
    const murk = ctx.createRadialGradient(state.x, py, murkR * 0.4, state.x, py, murkR)
    murk.addColorStop(0, 'rgba(6,14,24,0)')
    murk.addColorStop(1, 'rgba(6,14,24,0.92)')
    ctx.fillStyle = murk
    ctx.fillRect(0, HUD_H, LOGICAL_W, viewH)

    // 潜水员：灯锥 + 身体 + 氧气表（py 已在上方遮罩段声明，此处复用）。
    glow(ctx, '#7dcfff', 10)
    ctx.fillStyle = '#7dcfff'
    ctx.beginPath()
    ctx.arc(state.x, py, 8, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, state.x - facing * 14 - 4, py - 9, 8, 18, 3)
    ctx.fill()
    // 照明灯锥（朝向移动方向）。
    ctx.fillStyle = 'rgba(255,236,170,0.16)'
    ctx.beginPath()
    ctx.moveTo(state.x + facing * 8, py - 4)
    ctx.lineTo(state.x + facing * 62, py - 20)
    ctx.lineTo(state.x + facing * 62, py + 20)
    ctx.closePath()
    ctx.fill()
    // 氧气表（头顶小圆表）。
    const cap = tankCapacity(state.upgrades)
    const o2k = Math.max(0, state.oxygen / cap)
    ctx.fillStyle = '#101018'
    ctx.beginPath()
    ctx.arc(state.x, py - 15, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = o2k < 0.25 ? THEME.bad : THEME.good
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(state.x, py - 15, 5, -Math.PI / 2, -Math.PI / 2 + o2k * Math.PI * 2)
    ctx.stroke()
    if (state.ascending) {
      ctx.fillStyle = THEME.good
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('▲ 上浮', state.x, py - 26)
    }
  } else {
    bubbles.length = 0
  }

  // 水面与船（可见时画）。
  const surfY = sy(0)
  if (surfY > HUD_H - 40 && surfY < LOGICAL_H + 60) {
    ctx.fillStyle = 'rgba(200,235,255,0.25)'
    ctx.fillRect(0, surfY, LOGICAL_W, 3)
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, LOGICAL_W / 2 - 46, surfY - 16, 92, 14, 4)
    ctx.fill()
    ctx.fillStyle = THEME.panelEdge
    ctx.fillRect(LOGICAL_W / 2 - 30, surfY - 26, 60, 10)
  }

  particles.tick(ctx, 16)

  drawHud(ctx, state)
  if (!diving) drawShop(ctx, state)
  if (paused) drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂 停', '按 P 继续 · R 重开')
  if (state.won && !paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全 潜 通 关', '五大深渊尽收囊中 · R 再来一局', THEME.gold)
  }
}

/** 顶部 HUD：关卡/目标、深度计、氧气条（红警）、本趟收获、回合数。 */
function drawHud(ctx: CanvasRenderingContext2D, state: DeepDiveState): void {
  const cap = tankCapacity(state.upgrades)
  const o2k = Math.max(0, state.oxygen / cap)
  const warn = o2k < 0.25 && Math.floor(state.time * 3) % 2 === 0
  ctx.fillStyle = 'rgba(13,13,20,0.72)'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  hudPair(ctx, 10, 18, '第' + state.level + '关', '目标 ' + state.target)
  hudPair(ctx, 10, 36, '回合', String(state.dives))
  hudPair(ctx, LOGICAL_W - 10, 18, '资产', String(state.assets), 'right', THEME.gold)
  hudPair(ctx, LOGICAL_W - 10, 36, '本趟', String(state.haul), 'right')
  // 深度计 + 氧气条（中部）。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('深度 ' + Math.round(state.depth) + 'm', LOGICAL_W / 2, 16)
  const barW = 120
  ctx.fillStyle = '#101018'
  roundRectPath(ctx, LOGICAL_W / 2 - barW / 2, 24, barW, 10, 5)
  ctx.fill()
  ctx.fillStyle = warn ? THEME.bad : o2k < 0.5 ? THEME.gold : THEME.good
  glow(ctx, warn ? THEME.bad : THEME.good, warn ? 10 : 4)
  roundRectPath(ctx, LOGICAL_W / 2 - barW / 2 + 1, 25, Math.max(0, (barW - 2) * o2k), 8, 4)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillText('氧气', LOGICAL_W / 2, 46)
}

/** 船上商店面板：结局提示、三项升级按钮、出发按钮。 */
function drawShop(ctx: CanvasRenderingContext2D, state: DeepDiveState): void {
  ctx.fillStyle = 'rgba(13,13,20,0.80)'
  ctx.fillRect(0, HUD_H, LOGICAL_W, LOGICAL_H - HUD_H)
  ctx.textAlign = 'center'
  let msg = '船上整备 · 第 ' + state.level + ' 关海域'
  if (state.lastResult === 'banked') msg = '满载而归！收获已入袋'
  if (state.lastResult === 'drowned') msg = '氧气耗尽——本趟收获沉了海（人没事）'
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillStyle = state.lastResult === 'drowned' ? THEME.bad : THEME.text
  ctx.fillText(msg, LOGICAL_W / 2, HUD_H + 40)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('资产 ' + state.assets + ' / 目标 ' + state.target, LOGICAL_W / 2, HUD_H + 64)

  const desc: Readonly<Record<UpgradeKey, string>> = {
    tank: '氧气容量 ' + tankCapacity(state.upgrades) + ' 升',
    fins: '游速 ' + (95 + state.upgrades.fins * 26) + ' 像素/秒',
    lamp: '照明拾取半径 ' + (15 + state.upgrades.lamp * 9) + ' 像素',
  }
  for (const key of UPGRADE_KEYS) {
    const tier = state.upgrades[key]
    const maxed = tier >= MAX_TIER
    const cost = maxed ? 0 : upgradeCost(key, tier)
    const afford = !maxed && state.assets >= cost
    const rect = SHOP_BTNS[key]
    ctx.fillStyle = afford ? THEME.panel : '#191922'
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8)
    ctx.fill()
    ctx.strokeStyle = afford ? accent(2) : THEME.panelEdge
    ctx.lineWidth = 1.5
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8)
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText(UPGRADE_NAME[key] + ' Lv.' + tier, rect.x + 14, rect.y + 22)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(desc[key], rect.x + 14, rect.y + 42)
    ctx.textAlign = 'right'
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillStyle = maxed ? THEME.textMuted : afford ? THEME.gold : THEME.bad
    ctx.fillText(maxed ? '已满档' : String(cost), rect.x + rect.w - 14, rect.y + 32)
  }

  const diveRect = DIVE_BTN
  ctx.fillStyle = accent(0)
  glow(ctx, accent(0), 10)
  roundRectPath(ctx, diveRect.x, diveRect.y, diveRect.w, diveRect.h, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.textAlign = 'center'
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillStyle = '#101018'
  ctx.fillText('出 发 潜 水（空格）', LOGICAL_W / 2, diveRect.y + 30)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('越深宝越贵，氧气也烧得越凶——想好回头深度', LOGICAL_W / 2, diveRect.y + 76)
}
