/**
 * 小蜜蜂渲染层：星空背景（固定种子确定性生成、随时间闪烁）、三种像素
 * 造型外星人（按行区分配色）、像素炮台（受击无敌时闪烁）、玩家 / 敌方
 * 双色子弹、可蚀掩体方块、击落与受击粒子、HUD（分数 / 波次 / 生命）、
 * 波次横幅与暂停 / 结束遮罩。
 */
import type { InvadersState } from './logic.ts'
import {
  W, H, PLAYER_W, PLAYER_Y, BUNKER_CELL, BUNKER_COLS, BUNKER_ROWS, BUNKER_Y,
  BANNER_MS, CELL, ALIEN_W, ALIEN_H, rowType,
} from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

/** 三种造型各自的 8 列像素图案（'#' 为实心）。 */
const SPRITES: string[][] = [
  // 0 号（底行，10 分）：乌贼。
  [
    '...##...',
    '..####..',
    '.######.',
    '##.##.##',
    '########',
    '..#..#..',
  ],
  // 1 号（中间行，20 分）：螃蟹。
  [
    '..#..#..',
    '.######.',
    '##.##.##',
    '########',
    '.#.##.#.',
    '#......#',
  ],
  // 2 号（顶行，30 分）：章鱼。
  [
    '..####..',
    '.######.',
    '##.##.##',
    '########',
    '.#.##.#.',
    '#.#..#.#',
  ],
]

/** 各造型的主色。 */
const ALIEN_COLORS = [accent(2), accent(4), accent(1)]
const PLAYER_COLOR = accent(0)
const PLAYER_BULLET_COLOR = accent(5)
const ALIEN_BULLET_COLOR = THEME.bad
const BUNKER_COLOR = accent(2)
const BUNKER_DARK = '#3f5a35'

// 渲染层自有的粒子系统与确定性星空（每个画布各一份）。
const particles = createParticles()

/** 一颗背景星。 */
interface Star { x: number, y: number, r: number, phase: number }

/** 用固定种子确定性生成 70 颗星（不随局变化）。 */
function createStars(): Star[] {
  let a = 0x9e3779b9
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const stars: Star[] = []
  for (let i = 0; i < 70; i += 1) {
    stars.push({ x: next() * W, y: next() * (H - 40) + 4, r: 0.6 + next() * 1.2, phase: next() * Math.PI * 2 })
  }
  return stars
}
const stars = createStars()

/**
 * 画星空：暗底亮点，随回合钟按各自相位闪烁。
 * @param ctx - 画布上下文。
 * @param t - 局内毫秒钟。
 */
function drawStars(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = THEME.text
  for (const s of stars) {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.phase))
    ctx.globalAlpha = tw * 0.8
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画一个像素风外星人：图案放大 3px/格并居中于其碰撞盒。
 * @param ctx - 画布上下文。
 * @param x - 碰撞盒左上角 x。
 * @param y - 碰撞盒左上角 y。
 * @param type - 造型编号 0/1/2。
 */
function drawAlien(ctx: CanvasRenderingContext2D, x: number, y: number, type: number): void {
  const pattern = SPRITES[type % SPRITES.length]!
  const color = ALIEN_COLORS[type % ALIEN_COLORS.length]!
  const px = 3
  const w = 8 * px
  const h = pattern.length * px
  const ox = x + (ALIEN_W - w) / 2
  const oy = y + (ALIEN_H - h) / 2
  glow(ctx, color, 6)
  ctx.fillStyle = color
  for (let r = 0; r < pattern.length; r += 1) {
    const row = pattern[r]!
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] === '#') ctx.fillRect(ox + c * px, oy + r * px, px, px)
    }
  }
  noGlow(ctx)
}

/**
 * 画像素炮台：底座 + 双足 + 炮管；无敌期按 100ms 相位闪烁。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: InvadersState): void {
  if (state.invulnMs > 0 && Math.floor(state.t / 100) % 2 === 0) return
  const x = state.playerX - PLAYER_W / 2
  const y = PLAYER_Y
  glow(ctx, PLAYER_COLOR, 8)
  ctx.fillStyle = PLAYER_COLOR
  // 炮管。
  ctx.fillRect(x + PLAYER_W / 2 - 2, y - 6, 4, 8)
  // 底座。
  ctx.fillRect(x + 4, y + 2, PLAYER_W - 8, 5)
  ctx.fillRect(x + 8, y + 7, 3, 4)
  ctx.fillRect(x + PLAYER_W - 11, y + 7, 3, 4)
  ctx.fillStyle = '#c7d6ff'
  ctx.fillRect(x + 6, y, PLAYER_W - 12, 3)
  noGlow(ctx)
}

/**
 * 画一颗子弹：玩家为青色竖条，敌方为红色锯齿弹。
 * @param ctx - 画布上下文。
 * @param b - 子弹实体。
 * @param player - 是否玩家子弹。
 */
function drawBullet(ctx: CanvasRenderingContext2D, b: { x: number, y: number, vy: number }, player: boolean): void {
  const color = player ? PLAYER_BULLET_COLOR : ALIEN_BULLET_COLOR
  glow(ctx, color, 8)
  ctx.fillStyle = color
  if (player) {
    ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10)
  } else {
    ctx.fillRect(b.x - 1.5, b.y - 5, 3, 4)
    ctx.fillRect(b.x - 1.5, b.y + 1, 3, 4)
  }
  noGlow(ctx)
}

/**
 * 画 4 个掩体：存活方块亮绿、带深色描边感（上排略亮）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBunkers(ctx: CanvasRenderingContext2D, state: InvadersState): void {
  for (const b of state.bunkers) {
    for (let r = 0; r < BUNKER_ROWS; r += 1) {
      for (let c = 0; c < BUNKER_COLS; c += 1) {
        const cell = b.cells[r * BUNKER_COLS + c]
        if (cell === undefined || !cell.alive) continue
        ctx.fillStyle = r === 0 ? BUNKER_COLOR : BUNKER_DARK
        ctx.fillRect(b.x + c * BUNKER_CELL, BUNKER_Y + r * BUNKER_CELL, BUNKER_CELL - 1, BUNKER_CELL - 1)
      }
    }
  }
}

/**
 * 渲染一帧：星空、掩体、外星人编队、炮台、子弹、粒子、HUD、横幅、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderInvaders(ctx: CanvasRenderingContext2D, state: InvadersState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawStars(ctx, state.t)
  drawBunkers(ctx, state)

  for (const a of state.aliens) {
    if (!a.alive) continue
    drawAlien(ctx, state.fx + a.col * CELL, state.fy + a.row * CELL, rowType(a.row))
  }
  drawPlayer(ctx, state)
  for (const b of state.playerBullets) drawBullet(ctx, b, true)
  for (const b of state.alienBullets) drawBullet(ctx, b, false)

  // 消费逻辑层事件：击落迸发同色粒子，受击迸发红色粒子。
  for (const ev of state.events) {
    if (ev.type === 'kill') {
      particles.burst(ev.x, ev.y, ALIEN_COLORS[rowType(ev.row) % ALIEN_COLORS.length]!, 14, 160)
    } else if (ev.type === 'hit') {
      particles.burst(ev.x, ev.y, THEME.bad, 24, 220)
    } else if (ev.type === 'bunker') {
      particles.burst(ev.x, ev.y, BUNKER_COLOR, 6, 100)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：分数 / 波次 / 生命。
  const hudY = 18
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('波次', W / 2 - 14, hudY)
  ctx.fillStyle = THEME.gold
  ctx.fillText(String(state.wave), W / 2 + 14, hudY)
  const hearts = state.lives >= 1 ? '❤'.repeat(state.lives) : '♡'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.bad
  ctx.fillText(hearts, W - 10, hudY)

  // 波次横幅。
  if (state.bannerMs > 0 && !state.over) {
    const k = Math.min(1, state.bannerMs / (BANNER_MS * 0.4))
    ctx.globalAlpha = k
    ctx.textAlign = 'center'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText('第 ' + state.wave + ' 波', W / 2, H / 2 - 40)
    ctx.globalAlpha = 1
  }

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 波次 ' + state.wave + ' · 按 R 重开', state.lives <= 0 ? THEME.bad : THEME.text)
  }
}
