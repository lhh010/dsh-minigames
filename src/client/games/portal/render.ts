/**
 * 传送门渲染层：科技风关卡（发光网格 + 描边墙体）、蓝橙门（椭圆漩涡 +
 * 确定性粒子流）、小方块角色（带朝向眼睛）、入出门轨迹残影、尖刺 /
 * 激光、出口旗帜（挥动）、关卡 HUD、过关 / 失败 / 暂停遮罩。全部动画
 * 由 state.t 与注入 seed 派生，无 Math.random。
 */
import {
  W,
  H,
  TILE,
  COLS,
  ROWS,
  PORTAL_HALF_H,
  PLAYER_HALF_W,
  PLAYER_HALF_H,
  mulberry32,
  type PortalState,
  type Portal,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 蓝门 / 橙门专属色（脱离主题色带，保证双门语义稳定可辨）。 */
const BLUE = '#7aa2f7'
const ORANGE = '#ff9e64'

/** 渲染层自有的粒子系统（每个画布一个实例）。 */
const particles = createParticles()

/** 关卡事件的可视爆点（index 每帧在 step 之后调用）。 */
export function spawnPortalFx(state: PortalState): void {
  for (const e of state.events) {
    if (e.type === 'warp') particles.burst(e.x, e.y, e.color === 'blue' ? ORANGE : BLUE, 14, 170)
    else if (e.type === 'die') particles.burst(e.x, e.y, THEME.bad, 18, 190)
    else if (e.type === 'win') particles.burst(e.x, e.y, THEME.good, 20, 200)
  }
}

/**
 * 背景：主题渐变 + 发光网格。
 * @param ctx - 画布上下文。
 */
function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(122,162,247,0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let col = 1; col < COLS; col += 1) {
    ctx.moveTo(col * TILE, 0)
    ctx.lineTo(col * TILE, H)
  }
  for (let row = 1; row < ROWS; row += 1) {
    ctx.moveTo(0, row * TILE)
    ctx.lineTo(W, row * TILE)
  }
  ctx.stroke()
}

/**
 * 画墙体：面板底色 + 微亮描边（顶面高一线，读出可站立面）。
 * @param ctx - 画布上下文。
 * @param col - 瓦片列。
 * @param row - 瓦片行。
 */
function drawWall(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const x = col * TILE
  const y = row * TILE
  ctx.fillStyle = '#22222f'
  ctx.fillRect(x, y, TILE, TILE)
  ctx.strokeStyle = 'rgba(122,162,247,0.16)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
  ctx.fillStyle = 'rgba(122,162,247,0.22)'
  ctx.fillRect(x + 1, y, TILE - 2, 2)
}

/**
 * 画尖刺（红三角排）。
 * @param ctx - 画布上下文。
 * @param col - 瓦片列。
 * @param row - 瓦片行。
 */
function drawSpike(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const x = col * TILE
  const y = row * TILE
  glow(ctx, THEME.bad, 6)
  ctx.fillStyle = THEME.bad
  ctx.beginPath()
  const n = 4
  const step = TILE / n
  for (let i = 0; i < n; i += 1) {
    ctx.moveTo(x + i * step, y + TILE)
    ctx.lineTo(x + (i + 0.5) * step, y + 4)
    ctx.lineTo(x + (i + 1) * step, y + TILE)
  }
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画激光瓦片（横向光束，竖向叠成光幕）。
 * @param ctx - 画布上下文。
 * @param col - 瓦片列。
 * @param row - 瓦片行。
 * @param t - 对局毫秒（呼吸动画）。
 */
function drawLaser(ctx: CanvasRenderingContext2D, col: number, row: number, t: number): void {
  const x = col * TILE
  const y = row * TILE + TILE / 2
  const pulse = 0.65 + 0.35 * Math.sin(t / 180 + col)
  glow(ctx, THEME.bad, 12 * pulse)
  ctx.strokeStyle = 'rgba(247,118,142,' + pulse.toFixed(3) + ')'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x - 1, y)
  ctx.lineTo(x + TILE + 1, y)
  ctx.stroke()
  noGlow(ctx)
}

/**
 * 画一扇传送门：贴墙椭圆漩涡（旋转弧环）+ 沿门面流动的确定性粒子。
 * @param ctx - 画布上下文。
 * @param portal - 门数据。
 * @param color - 门色。
 * @param state - 对局状态（动画时钟与种子）。
 */
function drawPortal(ctx: CanvasRenderingContext2D, portal: Portal, color: string, state: PortalState): void {
  const cx = portal.x
  const cy = portal.y
  const spin = state.t / 420 + portal.col + portal.row
  glow(ctx, color, 14)
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(cx, cy, 6, PORTAL_HALF_H, 0, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  // 旋转内环：两层相位差半圈的开口弧，形成漩涡感。
  ctx.lineWidth = 2
  for (let i = 0; i < 2; i += 1) {
    const a = spin * (i === 0 ? 1 : -1.4) + i * Math.PI
    glow(ctx, color, 8)
    ctx.beginPath()
    ctx.ellipse(cx, cy, 3.2, PORTAL_HALF_H - 7 - i * 3, 0, a, a + Math.PI * 1.2)
    ctx.stroke()
    noGlow(ctx)
  }
  // 粒子流：seed + 门位确定性生成，沿门面纵向流动。
  const rng = mulberry32((state.seed * 131 + portal.col * 31 + portal.row * 7 + portal.dir) >>> 0)
  for (let i = 0; i < 7; i += 1) {
    const phase = rng()
    const speed = 60 + rng() * 90
    const life = ((state.t / 1000 * speed + phase * 56) % 56) / 56
    const py = cy + PORTAL_HALF_H - life * PORTAL_HALF_H * 2
    const px = cx + portal.dir * (2 + rng() * 3)
    ctx.globalAlpha = Math.sin(life * Math.PI)
    ctx.fillStyle = color
    glow(ctx, color, 5)
    ctx.beginPath()
    ctx.arc(px, py, 1.6, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.globalAlpha = 1
}

/**
 * 画出口旗帜：旗杆 + 随时间挥动的三角旗。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 */
function drawFlag(ctx: CanvasRenderingContext2D, state: PortalState): void {
  const info = state.info
  const x = info.flagCol * TILE + TILE / 2
  const y = info.flagRow * TILE
  const wave = Math.sin(state.t / 220)
  ctx.strokeStyle = THEME.textMuted
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y + TILE)
  ctx.stroke()
  glow(ctx, THEME.good, 8)
  ctx.fillStyle = THEME.good
  ctx.beginPath()
  ctx.moveTo(x, y + 2)
  ctx.lineTo(x + 20 + wave * 3, y + 8 + wave * 2)
  ctx.lineTo(x, y + 15)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画角色轨迹残影（最近采样在最前，透明度递减）。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 */
function drawTrail(ctx: CanvasRenderingContext2D, state: PortalState): void {
  for (let i = state.trail.length - 1; i >= 0; i -= 1) {
    const p = state.trail[i]!
    const k = 1 - i / state.trail.length
    ctx.globalAlpha = 0.06 + 0.22 * k
    ctx.fillStyle = k > 0.5 ? ORANGE : BLUE
    const s = 4 + 5 * k
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
  }
  ctx.globalAlpha = 1
}

/**
 * 画角色：小方块 + 朝移动方向偏移的双眼。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: PortalState): void {
  const eye = state.vx >= 0 ? 1 : -1
  glow(ctx, THEME.accents[5]!, 10)
  ctx.fillStyle = THEME.accents[5]!
  roundRectPath(ctx, state.x - PLAYER_HALF_W, state.y - PLAYER_HALF_H, PLAYER_HALF_W * 2, PLAYER_HALF_H * 2, 6)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#10101a'
  ctx.beginPath()
  ctx.arc(state.x + eye * 3 - 2.5, state.y - 3, 2, 0, Math.PI * 2)
  ctx.arc(state.x + eye * 3 + 2.5, state.y - 3, 2, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 渲染整帧：背景 → 网格 → 瓦片 → 门 → 旗 → 残影 → 角色 → 粒子 → HUD
 * → 遮罩。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export function renderPortal(ctx: CanvasRenderingContext2D, state: PortalState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawGrid(ctx)
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const kind = state.info.tiles[row]![col]!
      if (kind === 'wall') drawWall(ctx, col, row)
      else if (kind === 'spike') drawSpike(ctx, col, row)
      else if (kind === 'laser') drawLaser(ctx, col, row, state.t)
    }
  }
  if (state.blue !== null) drawPortal(ctx, state.blue, BLUE, state)
  if (state.orange !== null) drawPortal(ctx, state.orange, ORANGE, state)
  drawFlag(ctx, state)
  drawTrail(ctx, state)
  drawPlayer(ctx, state)
  particles.tick(ctx, 16)
  // HUD：关卡进度 / 关名 / 死亡数 / 操作提示。
  hudPair(ctx, 12, 22, '关卡', (state.levelIndex + 1) + '/5 · ' + state.info.name)
  hudPair(ctx, W - 12, 22, '死亡', String(state.deaths), 'right')
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('左键蓝门 · 右键/Shift+点橙门 · 只能贴竖直墙', W / 2, H - 12)
  // 第一关教学提示：直接点名解法，避免「门放歪了走不过去」的挫败。
  if (state.levelIndex === 0 && state.phase === 'playing') {
    glow(ctx, THEME.accents[0]!, 6)
    ctx.fillStyle = THEME.accents[0]!
    ctx.fillText('提示：蓝门贴墙的左侧面（点墙左半），橙门贴墙的右侧面（点墙右半），然后向右走过去', W / 2, 44)
    noGlow(ctx)
  }
  const last = state.levelIndex === 4
  if (paused && state.phase === 'playing') {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开本关')
  } else if (state.phase === 'dead') {
    drawOverlay(ctx, W, H, '重来', '尖刺 / 激光 / 坠落 = 重开本关', THEME.bad)
  } else if (state.phase === 'won') {
    if (last) drawOverlay(ctx, W, H, '通关', '蓝橙之门已被你掌握', THEME.gold)
    else drawOverlay(ctx, W, H, '过关', '进入下一关…', THEME.good)
  }
}
