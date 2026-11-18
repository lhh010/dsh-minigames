/**
 * 淘金者渲染层：侧视矿洞——深度分层的土色层理、灰纹铆钉硬岩、闪光金块、
 * 斑纹圆石、底部出口门；玩家戴矿工帽灯（朝向光晕）；金块 / 圆石按逻辑
 * 动画队列插值出下落过程；HUD 显示关卡 / 分数 / 金块 / 生命 / 倒计时；
 * 过关 / 通关 / 失败 / 暂停遮罩。全部为纯 canvas 绘制，特效仅为对逻辑
 * 状态的观察（粒子、上一帧分数）。
 */
import type { GoldmineState, FallAnim } from './logic.ts'
import { CELL, FALL_ANIM_S, HUD_H, LOGICAL_W, LOGICAL_H, MAX_COLS, MAX_ROWS, LEVELS, exitOpen } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 深度分层的泥土底色（越深越暗）。 */
const DIRT_BANDS = ['#4d3b28', '#43331f', '#392b1a', '#2f2415']
const DIRT_SPECK = 'rgba(255,235,200,0.08)'
const HARD_FILL = '#3c3c48'
const HARD_VEIN = '#4a4a5c'
const TUNNEL = '#0e0d16'

// 渲染侧特效状态：粒子池、上一帧分数（观察得分事件）。
const particles = createParticles()
let prevScore = 0
let prevGoldTaken = 0

/** 当前关棋盘左上角偏移（居中于第 5 关最大画布）。 */
function boardOffset(state: GoldmineState): { ox: number, oy: number } {
  return {
    ox: Math.floor(((MAX_COLS - state.cols) * CELL) / 2),
    oy: HUD_H + Math.floor(((MAX_ROWS - state.rows) * CELL) / 2),
  }
}

function bandColor(r: number): string {
  return DIRT_BANDS[Math.min(DIRT_BANDS.length - 1, Math.floor(r / 3))]!
}

/** 一条下落动画当前覆盖的格子区间（渲染时跳过静态绘制）。 */
function animCover(anims: FallAnim[], kind: 'boulder' | 'gold', r: number, c: number): FallAnim | undefined {
  return anims.find((a) => a.kind === kind && a.c === c && a.toR === r)
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param t - 累计秒数（闪烁动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderGoldmine(ctx: CanvasRenderingContext2D, state: GoldmineState, t: number, paused: boolean): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const { ox, oy } = boardOffset(state)

  // 得分 / 拾金事件 → 粒子爆发（仅观察逻辑状态，不改逻辑）。
  if (state.score > prevScore) {
    particles.burst(ox + state.player.c * CELL + CELL / 2, oy + state.player.r * CELL + CELL / 2, THEME.gold, 12, 130)
  }
  prevScore = state.score
  const taken = state.goldsTotal - state.goldsLeft
  if (taken > prevGoldTaken) {
    particles.burst(ox + state.player.c * CELL + CELL / 2, oy + state.player.r * CELL + CELL / 2, accent(3), 10, 110)
  }
  prevGoldTaken = taken

  // 棋盘底框。
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  roundRectPath(ctx, ox - 4, oy - 4, state.cols * CELL + 8, state.rows * CELL + 8, 6)
  ctx.fill()

  // 网格：空腔、分层泥土、硬岩灰纹、金块、宝石、出口门。
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const x = ox + c * CELL
      const y = oy + r * CELL
      const cell = state.grid[r]![c]!
      if (cell === 'empty') {
        ctx.fillStyle = TUNNEL
        ctx.fillRect(x, y, CELL, CELL)
      } else if (cell === 'hard') {
        ctx.fillStyle = HARD_FILL
        ctx.fillRect(x, y, CELL, CELL)
        ctx.strokeStyle = HARD_VEIN
        ctx.lineWidth = 1.5
        ctx.beginPath()
        const s = ((r * 31 + c * 17) % 5) - 2
        ctx.moveTo(x + 3, y + CELL / 2 + s)
        ctx.lineTo(x + CELL - 3, y + CELL / 2 - s)
        ctx.stroke()
      } else if (cell === 'exit') {
        const open = exitOpen(state)
        const color = open ? THEME.good : THEME.bad
        ctx.fillStyle = '#101018'
        ctx.fillRect(x, y, CELL, CELL)
        glow(ctx, color, open ? 14 : 4)
        ctx.fillStyle = color
        roundRectPath(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 4)
        ctx.fill()
        noGlow(ctx)
        ctx.fillStyle = '#101018'
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(open ? '出' : '锁', x + CELL / 2, y + CELL / 2 + 4)
      } else {
        // 泥土 / 含金 / 含宝石：分层底色 + 确定性斑点纹理。
        ctx.fillStyle = bandColor(r)
        ctx.fillRect(x, y, CELL, CELL)
        ctx.fillStyle = DIRT_SPECK
        const s1 = ((r * 31 + c * 17) % 7) - 3
        const s2 = ((r * 13 + c * 29) % 9) - 4
        ctx.fillRect(x + CELL / 2 + s1, y + CELL / 2 + s2, 3, 3)
        ctx.fillRect(x + 5 + s2, y + 6 - s1, 2, 2)
        if (cell === 'gold' && animCover(state.anims, 'gold', r, c) === undefined) {
          drawGold(ctx, x, y, t, r, c)
        } else if (cell === 'gem') {
          drawGem(ctx, x, y, t, r, c)
        }
      }
    }
  }

  // 金块下落动画：按动画条目插值绘制（到达格已在上面跳过静态绘制）。
  for (const anim of state.anims) {
    if (anim.kind !== 'gold') continue
    const progress = Math.min(1, anim.t / FALL_ANIM_S / (anim.toR - anim.fromR))
    const y = oy + (anim.fromR + (anim.toR - anim.fromR) * progress) * CELL
    drawGold(ctx, ox + anim.c * CELL, y, t, anim.toR, anim.c)
  }

  // 圆石：斑纹圆石，静止 / 下落（下落画插值位置）。
  for (const b of state.boulders) {
    const anim = state.anims.find((a) => a.kind === 'boulder' && a.c === b.c && a.toR === b.r)
    let y = oy + b.r * CELL
    if (anim !== undefined) {
      const progress = Math.min(1, anim.t / FALL_ANIM_S / (anim.toR - anim.fromR))
      y = oy + (anim.fromR + (anim.toR - anim.fromR) * progress) * CELL
      glow(ctx, '#ffffff', 4)
    }
    const cx = ox + b.c * CELL + CELL / 2
    const cy = y + CELL / 2
    ctx.fillStyle = '#8a8a98'
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 0.44, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = '#6b6b7a'
    ctx.beginPath()
    ctx.arc(cx - 3, cy + 3, CELL * 0.16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#9d9dab'
    ctx.beginPath()
    ctx.arc(cx + 4, cy - 4, CELL * 0.08, 0, Math.PI * 2)
    ctx.fill()
  }

  // 玩家：矿工身体 + 矿工帽灯（朝向光晕）。
  const px = ox + state.player.c * CELL
  const py = oy + state.player.r * CELL
  drawMiner(ctx, px, py, state.player.dir, t)

  particles.tick(ctx, 16)

  // HUD：关卡 / 分数 / 金块进度 / 生命 / 倒计时。
  const timeLow = state.timeLeft <= 15
  hudPair(ctx, 10, 20, '关卡', String(state.level) + '/' + String(LEVELS.length))
  hudPair(ctx, 100, 20, '分数', String(state.score))
  hudPair(ctx, 200, 20, '金块', String(state.goldsTotal - state.goldsLeft) + '/' + String(state.goldsTotal))
  hudPair(ctx, 310, 20, '生命', '♥'.repeat(state.lives), 'left', THEME.bad)
  hudPair(ctx, LOGICAL_W - 10, 20, '限时', Math.ceil(state.timeLeft) + 's', 'right', timeLow ? THEME.bad : THEME.text)

  if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂停', '按 P 继续 · R 重开')
  } else if (state.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '淘金大吉', '五关全部通过 · 得分 ' + String(state.score), THEME.gold)
  } else if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '矿难', '生命耗尽 · R 重新开始', THEME.bad)
  }
}

/** 金块：金色圆粒 + 呼吸闪光。 */
function drawGold(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, r: number, c: number): void {
  const pulse = 0.72 + 0.28 * Math.sin(t * 5 + r * 1.3 + c * 0.7)
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  ctx.globalAlpha = pulse
  glow(ctx, THEME.gold, 9)
  ctx.fillStyle = THEME.gold
  roundRectPath(ctx, cx - 6, cy - 5, 12, 10, 3)
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(cx - 3, cy - 3, 3, 3)
}

/** 宝石：青色菱形闪光。 */
function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, r: number, c: number): void {
  const pulse = 0.7 + 0.3 * Math.sin(t * 6 + r + c)
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  ctx.globalAlpha = pulse
  glow(ctx, accent(6), 8)
  ctx.fillStyle = accent(6)
  ctx.beginPath()
  ctx.moveTo(cx, cy - 7)
  ctx.lineTo(cx + 5, cy)
  ctx.lineTo(cx, cy + 7)
  ctx.lineTo(cx - 5, cy)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
}

/** 矿工：蓝色工装 + 矿工帽，帽灯按朝向打光晕。 */
function drawMiner(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, t: number): void {
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const lampColor = '#ffe9b0'
  const beamX = dir === 1 ? 1 : dir === 3 ? -1 : 0
  const beamY = dir === 2 ? 1 : dir === 0 ? -1 : 0
  // 帽灯光晕（灯头随朝向偏移）。
  glow(ctx, lampColor, 12)
  ctx.fillStyle = lampColor
  ctx.beginPath()
  ctx.arc(cx + beamX * 5, cy + beamY * 5 - 3, 2.4, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 身体。
  ctx.fillStyle = accent(0)
  roundRectPath(ctx, cx - 7, cy - 3, 14, 12, 4)
  ctx.fill()
  // 头 + 矿工帽。
  ctx.fillStyle = '#e8c49a'
  ctx.beginPath()
  ctx.arc(cx, cy - 6, 4.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = THEME.bad
  ctx.beginPath()
  ctx.arc(cx, cy - 7.2, 4.8, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(cx - 6, cy - 7.4, 12, 2)
  // 呼吸灯：帽灯常亮微闪。
  ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 8)
  ctx.fillStyle = lampColor
  ctx.beginPath()
  ctx.arc(cx + beamX * 5, cy + beamY * 5 - 3, 4.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}
