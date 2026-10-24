/**
 * Tank battle canvas renderer on the shared theme kit: gradient field,
 * themed brick/steel tiles, glowing rounded tanks and tracers, explosion
 * particles (observed from score/effects), a hudPair HUD, and themed
 * end-of-round overlay.
 */
import {
  TILE, GRID_W, GRID_H, DIR_DX, DIR_DY, WAVES,
  type Tank, type WorldState,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

const BRICK = '#8a5a3a'
const BRICK_LIGHT = '#9c6a46'
const BRICK_DARK = '#5f3c26'
const STEEL = '#8a8a98'
const STEEL_DARK = '#5c5c68'
const TREAD = '#3a3a44'
const BULLET_CORE = '#ffffff'

const PLAYER = accent(0)
const ENEMY = accent(4)

export const TANK_W = GRID_W * TILE
export const TANK_H = GRID_H * TILE

// Render-side explosion particles, observed from score/effects deltas.
const particles = createParticles()
let prevScore = -1
let prevEffects = 0
let lastFrame = 0

function drawTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, tile: number): void {
  const x = tx * TILE
  const y = ty * TILE
  if (tile === 1) {
    // Brick: two-tone blocks with mortar lines; alternate shade for texture.
    const light = (tx + ty) % 2 === 0
    ctx.fillStyle = light ? BRICK : BRICK_DARK
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = BRICK_LIGHT
    ctx.fillRect(x, y, TILE, 3)
    ctx.strokeStyle = BRICK_DARK
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath()
      ctx.moveTo(x, y + (TILE / 4) * i + 0.5)
      ctx.lineTo(x + TILE, y + (TILE / 4) * i + 0.5)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(x + TILE / 2 + 0.5, y)
    ctx.lineTo(x + TILE / 2 + 0.5, y + TILE)
    ctx.stroke()
  } else if (tile === 2) {
    // Steel: light plate with a dark border and corner rivets.
    roundRectPath(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 4)
    ctx.fillStyle = STEEL
    ctx.fill()
    ctx.strokeStyle = STEEL_DARK
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = STEEL_DARK
    for (const [rx, ry] of [[8, 8], [TILE - 9, 8], [8, TILE - 9], [TILE - 9, TILE - 9]] as const) {
      ctx.fillRect(x + rx, y + ry, 3, 3)
    }
  }
}

function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, t: number): void {
  // Invulnerability (spawn flash / post-hit) blinks the tank.
  if (tank.invuln > 0 && Math.floor(performance.now() / 110) % 2 === 0) return
  const x = tank.x
  const y = tank.y
  const isPlayer = tank.kind === 'player'
  const body = isPlayer ? PLAYER : ENEMY
  const dark = isPlayer ? THEME.bgBottom : '#a83a4e'
  const cx = x + TILE / 2
  const cy = y + TILE / 2

  // Treads: dark side strips with animated tick marks (3px inset, matching
  // the tank's slightly smaller collision body).
  ctx.fillStyle = TREAD
  roundRectPath(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 4)
  ctx.fill()
  const tick = Math.floor((t * 90 + (isPlayer ? 0 : 40)) % TILE)
  ctx.fillStyle = dark
  for (let i = 0; i < 3; i += 1) {
    const off = (tick + i * 12) % TILE
    ctx.fillRect(x + 6, y + 3 + off, 4, 5)
    ctx.fillRect(x + TILE - 10, y + 3 + off, 4, 5)
  }

  // Glowing rounded body.
  glow(ctx, body, 10)
  ctx.fillStyle = body
  roundRectPath(ctx, x + 8, y + 8, TILE - 16, TILE - 16, 5)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = dark
  ctx.lineWidth = 1
  ctx.stroke()

  // Turret + barrel in the facing direction.
  ctx.fillStyle = dark
  ctx.fillRect(cx - 4 + DIR_DX[tank.dir]! * 12, cy - 4 + DIR_DY[tank.dir]! * 12, 8, 8)
  ctx.fillStyle = body
  ctx.fillRect(cx - 3, cy - 3, 6, 6)
}

function drawBullet(ctx: CanvasRenderingContext2D, bullet: WorldState['bullets'][number]): void {
  const color = bullet.owner === 'player' ? THEME.gold : accent(4)
  glow(ctx, color, 12)
  ctx.fillStyle = color
  roundRectPath(ctx, bullet.x - 2, bullet.y - 2, 10, 10, 3)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = BULLET_CORE
  ctx.fillRect(bullet.x, bullet.y, 6, 6)
}

/** Draw one frame of the battle; `paused` veils the scene. */
export function renderTanks(ctx: CanvasRenderingContext2D, state: WorldState, paused: boolean): void {
  ctx.clearRect(0, 0, TANK_W, TANK_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, TANK_W, TANK_H)
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) {
      const tile = state.grid[ty]![tx]!
      if (tile !== 0) drawTile(ctx, tx, ty, tile)
    }
  }
  // Faint tile grid so the movement lanes (and tank alignment) are visible.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let tx = 1; tx < GRID_W; tx += 1) {
    ctx.beginPath()
    ctx.moveTo(tx * TILE + 0.5, 0)
    ctx.lineTo(tx * TILE + 0.5, TANK_H)
    ctx.stroke()
  }
  for (let ty = 1; ty < GRID_H; ty += 1) {
    ctx.beginPath()
    ctx.moveTo(0, ty * TILE + 0.5)
    ctx.lineTo(TANK_W, ty * TILE + 0.5)
    ctx.stroke()
  }

  // Explosion particles: a kill (score up) bursts at the newest effect;
  // brick/steel impacts burst a smaller puff where they happen.
  if (state.score > prevScore && state.effects.length > 0) {
    const e = state.effects[state.effects.length - 1]!
    particles.burst(e.x, e.y, accent(7), 18, 150)
  } else if (state.effects.length > prevEffects) {
    const e = state.effects[state.effects.length - 1]!
    particles.burst(e.x, e.y, THEME.gold, 8, 90)
  }
  prevScore = state.score
  prevEffects = state.effects.length
  particles.tick(ctx, dt)

  for (const bullet of state.bullets) drawBullet(ctx, bullet)
  for (const enemy of state.enemies) drawTank(ctx, enemy, state.t)
  if (state.player.alive) drawTank(ctx, state.player, state.t)

  // HUD: wave, enemies left, player lives.
  hudPair(ctx, 8, 16, `第 ${state.wave}/${WAVES} 波 · `, `剩余敌人 ${state.enemies.length + state.spawnQueue}`)
  hudPair(ctx, 8, 32, '生命 ', '♥'.repeat(Math.max(0, state.player.hp)), 'left', THEME.bad)
  hudPair(ctx, 8, 48, '得分 ', String(state.score), 'left', THEME.gold)

  if (state.result !== 'none') {
    drawOverlay(
      ctx, TANK_W, TANK_H,
      state.result === 'win' ? '胜利！' : 'GAME OVER',
      `得分 ${state.score} · 按 R 重新开始`,
      state.result === 'win' ? THEME.good : THEME.bad,
    )
  } else if (paused) {
    drawOverlay(ctx, TANK_W, TANK_H, '已暂停', '面板继续', THEME.text)
  }
}
