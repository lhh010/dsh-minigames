/**
 * Tank battle canvas renderer: brick/steel tiles, tanks with directional
 * turrets and animated treads, glowing bullets, and explosion effects.
 * Palette tuned for the DSH dark shell.
 */
import {
  TILE, GRID_W, GRID_H, DIR_DX, DIR_DY, WAVES,
  type Tank, type WorldState,
} from './logic.ts'

const BRICK = '#8a5a3a'
const BRICK_LIGHT = '#9c6a46'
const BRICK_DARK = '#5f3c26'
const STEEL = '#8a8a98'
const STEEL_DARK = '#5c5c68'
const PLAYER = '#6aa7ff'
const PLAYER_DARK = '#3f6ec0'
const ENEMY = '#ff7a6a'
const ENEMY_DARK = '#c04a3c'
const TREAD = '#3a3a44'
const BULLET_CORE = '#ffffff'
const BULLET_PLAYER = '#ffe08a'
const BULLET_ENEMY = '#ff9d6b'
const TEXT = '#d8d8e0'

export const TANK_W = GRID_W * TILE
export const TANK_H = GRID_H * TILE

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
    ctx.fillStyle = STEEL
    ctx.fillRect(x, y, TILE, TILE)
    ctx.strokeStyle = STEEL_DARK
    ctx.lineWidth = 2
    ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6)
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
  const dark = isPlayer ? PLAYER_DARK : ENEMY_DARK
  const cx = x + TILE / 2
  const cy = y + TILE / 2

  // Treads: dark side strips with animated tick marks (2px inset, matching
  // the tank's slightly smaller collision body).
  ctx.fillStyle = TREAD
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
  const tick = Math.floor((t * 90 + (isPlayer ? 0 : 40)) % TILE)
  ctx.fillStyle = dark
  for (let i = 0; i < 3; i += 1) {
    const off = (tick + i * 12) % TILE
    ctx.fillRect(x + 5, y + 2 + off, 4, 5)
    ctx.fillRect(x + TILE - 9, y + 2 + off, 4, 5)
  }

  // Body with a dark outline.
  ctx.fillStyle = body
  ctx.fillRect(x + 7, y + 7, TILE - 14, TILE - 14)
  ctx.strokeStyle = dark
  ctx.lineWidth = 1
  ctx.strokeRect(x + 7.5, y + 7.5, TILE - 15, TILE - 15)

  // Turret + barrel in the facing direction.
  ctx.fillStyle = dark
  ctx.fillRect(cx - 4 + DIR_DX[tank.dir]! * 12, cy - 4 + DIR_DY[tank.dir]! * 12, 8, 8)
  ctx.fillStyle = body
  ctx.fillRect(cx - 3, cy - 3, 6, 6)
}

function drawBullet(ctx: CanvasRenderingContext2D, bullet: WorldState['bullets'][number]): void {
  const glow = bullet.owner === 'player' ? BULLET_PLAYER : BULLET_ENEMY
  ctx.fillStyle = glow
  ctx.fillRect(bullet.x - 2, bullet.y - 2, 10, 10)
  ctx.fillStyle = BULLET_CORE
  ctx.fillRect(bullet.x, bullet.y, 6, 6)
}

function drawEffects(ctx: CanvasRenderingContext2D, state: WorldState): void {
  for (const effect of state.effects) {
    const k = effect.t / effect.life
    ctx.globalAlpha = 1 - k
    ctx.fillStyle = k < 0.5 ? '#ffe08a' : '#ff9d6b'
    const r = 3 + 16 * k
    ctx.beginPath()
    ctx.arc(effect.x, effect.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

/** Draw one frame of the battle. */
export function renderTanks(ctx: CanvasRenderingContext2D, state: WorldState): void {
  ctx.clearRect(0, 0, TANK_W, TANK_H)
  ctx.fillStyle = '#131318'
  ctx.fillRect(0, 0, TANK_W, TANK_H)
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
  drawEffects(ctx, state)
  for (const bullet of state.bullets) drawBullet(ctx, bullet)
  for (const enemy of state.enemies) drawTank(ctx, enemy, state.t)
  if (state.player.alive) drawTank(ctx, state.player, state.t)

  // HUD: wave, enemies left, player lives.
  ctx.fillStyle = TEXT
  ctx.font = '12px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`第 ${state.wave}/${WAVES} 波`, 8, 16)
  ctx.fillText(`剩余敌人 ${state.enemies.length + state.spawnQueue}`, 8, 32)
  ctx.fillText(`生命 ${'♥'.repeat(Math.max(0, state.player.hp))}`, 8, 48)

  if (state.result !== 'none') {
    ctx.fillStyle = TEXT
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(state.result === 'win' ? '胜 利 ！' : 'G A M E  O V E R', TANK_W / 2, TANK_H / 2 - 10)
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, TANK_W / 2, TANK_H / 2 + 20)
  }
}
