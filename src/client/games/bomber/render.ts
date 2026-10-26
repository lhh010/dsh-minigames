/**
 * Bomberman canvas renderer on the shared theme kit: gradient field, themed
 * brick/wall tiles, glowing bombs and cross flames, chase particles, a
 * hudPair HUD, and themed end/pause overlays.
 */
import {
  TILE, GRID_W, GRID_H, FUSE_S, LEVELS, actorTile,
  type Actor, type WorldState,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

const BRICK = '#8a5a3a'
const BRICK_LIGHT = '#9c6a46'
const BRICK_DARK = '#5f3c26'
const WALL = '#5c5c68'
const WALL_LIGHT = '#8a8a98'

const PLAYER_COLOR = accent(0)
const ENEMY_COLOR = accent(4)
const BOMB_COLOR = accent(3)
const FLAME_CORE = '#ffffff'
const FLAME_OUT = '#f7768e'

export const BOARD_W = GRID_W * TILE
export const BOARD_H = GRID_H * TILE

// Render-side particles, observed from score/flame deltas.
const particles = createParticles()
let prevScore = -1
let prevFlames = 0
let lastFrame = 0

function drawTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, tile: number): void {
  const x = tx * TILE
  const y = ty * TILE
  if (tile === 1) {
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
    roundRectPath(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 4)
    ctx.fillStyle = WALL
    ctx.fill()
    ctx.strokeStyle = WALL_LIGHT
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = WALL_LIGHT
    for (const [rx, ry] of [[8, 8], [TILE - 9, 8], [8, TILE - 9], [TILE - 9, TILE - 9]] as const) {
      ctx.fillRect(x + rx, y + ry, 3, 3)
    }
  }
}

function drawActor(ctx: CanvasRenderingContext2D, actor: Actor, isPlayer: boolean): void {
  const color = isPlayer ? PLAYER_COLOR : ENEMY_COLOR
  glow(ctx, color, 10)
  ctx.fillStyle = color
  roundRectPath(ctx, actor.x + 6, actor.y + 6, TILE - 12, TILE - 12, 6)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(13,13,20,0.7)'
  ctx.lineWidth = 1
  ctx.stroke()
  // Eyes toward the heading.
  const [tx, ty] = actorTile(actor)
  const cx = tx * TILE + TILE / 2
  const cy = ty * TILE + TILE / 2
  ctx.fillStyle = '#15151b'
  ctx.fillRect(cx - 6 + (actor.dir === 1 ? 4 : actor.dir === 3 ? -4 : 0), cy - 5, 4, 4)
  ctx.fillRect(cx + 2 + (actor.dir === 1 ? 4 : actor.dir === 3 ? -4 : 0), cy - 5, 4, 4)
}

function drawBomb(ctx: CanvasRenderingContext2D, bomb: WorldState['bombs'][number], t: number): void {
  const cx = bomb.tx * TILE + TILE / 2
  const cy = bomb.ty * TILE + TILE / 2
  // Pulse faster as the fuse runs down.
  const pulse = 0.75 + 0.25 * Math.sin(t * (6 + 14 * (1 - bomb.fuse / FUSE_S)))
  glow(ctx, BOMB_COLOR, 12 * pulse)
  ctx.fillStyle = '#22222c'
  ctx.beginPath()
  ctx.arc(cx, cy, 11 * pulse, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = BOMB_COLOR
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = BOMB_COLOR
  ctx.fillRect(cx - 1, cy - 15, 2, 5)
}

function drawFlame(ctx: CanvasRenderingContext2D, flame: WorldState['flames'][number]): void {
  const x = flame.tx * TILE
  const y = flame.ty * TILE
  const k = Math.max(0, 1 - flame.t / 0.4)
  glow(ctx, FLAME_OUT, 14)
  ctx.fillStyle = FLAME_OUT
  ctx.globalAlpha = 0.55 + 0.45 * k
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
  noGlow(ctx)
  ctx.globalAlpha = k
  ctx.fillStyle = FLAME_CORE
  ctx.fillRect(x + TILE / 4, y + TILE / 4, TILE / 2, TILE / 2)
  ctx.globalAlpha = 1
}

/** Draw one frame of the game; `paused` veils the scene. */
export function renderBomber(ctx: CanvasRenderingContext2D, state: WorldState, paused: boolean): void {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, BOARD_W, BOARD_H)
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) {
      const tile = state.grid[ty]![tx]!
      if (tile !== 0) drawTile(ctx, tx, ty, tile)
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let tx = 1; tx < GRID_W; tx += 1) {
    ctx.beginPath()
    ctx.moveTo(tx * TILE + 0.5, 0)
    ctx.lineTo(tx * TILE + 0.5, BOARD_H)
    ctx.stroke()
  }
  for (let ty = 1; ty < GRID_H; ty += 1) {
    ctx.beginPath()
    ctx.moveTo(0, ty * TILE + 0.5)
    ctx.lineTo(BOARD_W, ty * TILE + 0.5)
    ctx.stroke()
  }

  // Particles: a kill (score up) bursts at the newest flame; brick burns
  // burst a smaller puff.
  if (state.score > prevScore && state.flames.length > 0) {
    const f = state.flames[state.flames.length - 1]!
    particles.burst(f.tx * TILE + TILE / 2, f.ty * TILE + TILE / 2, accent(7), 16, 140)
  } else if (state.flames.length > prevFlames) {
    const f = state.flames[state.flames.length - 1]!
    particles.burst(f.tx * TILE + TILE / 2, f.ty * TILE + TILE / 2, THEME.gold, 8, 90)
  }
  prevScore = state.score
  prevFlames = state.flames.length
  particles.tick(ctx, dt)

  for (const flame of state.flames) drawFlame(ctx, flame)
  for (const bomb of state.bombs) drawBomb(ctx, bomb, state.t)
  for (const enemy of state.enemies) drawActor(ctx, enemy, false)
  if (state.player.alive) drawActor(ctx, state.player, true)

  hudPair(ctx, 8, 16, `第 ${((state.level - 1) % LEVELS) + 1}/${LEVELS} 关 · `, `敌人 ${state.enemies.length}`)
  hudPair(ctx, 8, 32, '炸弹 ', `${state.bombs.length}/2`, 'left', BOMB_COLOR)
  hudPair(ctx, 8, 48, '得分 ', String(state.score), 'left', THEME.gold)

  if (state.result === 'lose') {
    drawOverlay(ctx, BOARD_W, BOARD_H, 'GAME OVER', `得分 ${state.score} · 按 回车/R 重开本关`, THEME.bad)
  } else if (state.result === 'cleared') {
    drawOverlay(ctx, BOARD_W, BOARD_H, '过关！', `得分 ${state.score} · 即将进入下一关`, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, BOARD_W, BOARD_H, '已暂停', '面板继续', THEME.text)
  }
}
