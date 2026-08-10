/**
 * Tank battle canvas renderer: tiles (brick/steel), tanks with directional
 * turrets, and bullets. Palette tuned for the DSH dark shell.
 */
import {
  TILE, GRID_W, GRID_H, DIR_DX, DIR_DY, WAVES,
  type Tank, type WorldState,
} from './logic.ts'

const BRICK = '#8a5a3a'
const BRICK_LINE = '#6e442a'
const STEEL = '#7a7a88'
const STEEL_LINE = '#5c5c68'
const PLAYER = '#5f8ae8'
const PLAYER_TREAD = '#3c5aa0'
const ENEMY = '#e05f5f'
const ENEMY_TREAD = '#a03c3c'
const TEXT = '#d8d8e0'

export const TANK_W = GRID_W * TILE
export const TANK_H = GRID_H * TILE

function drawTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, tile: number): void {
  const x = tx * TILE
  const y = ty * TILE
  if (tile === 1) {
    ctx.fillStyle = BRICK
    ctx.fillRect(x, y, TILE, TILE)
    ctx.strokeStyle = BRICK_LINE
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath()
      ctx.moveTo(x, y + (TILE / 4) * i)
      ctx.lineTo(x + TILE, y + (TILE / 4) * i)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(x + TILE / 2, y)
    ctx.lineTo(x + TILE / 2, y + TILE)
    ctx.stroke()
  } else if (tile === 2) {
    ctx.fillStyle = STEEL
    ctx.fillRect(x, y, TILE, TILE)
    ctx.strokeStyle = STEEL_LINE
    ctx.lineWidth = 2
    ctx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8)
  }
}

function drawTank(ctx: CanvasRenderingContext2D, tank: Tank): void {
  // Invulnerability flash: skip every other 120ms.
  if (tank.invuln > 0 && Math.floor(performance.now() / 120) % 2 === 0) return
  const x = tank.x
  const y = tank.y
  const body = tank.kind === 'player' ? PLAYER : ENEMY
  const tread = tank.kind === 'player' ? PLAYER_TREAD : ENEMY_TREAD
  ctx.fillStyle = tread
  ctx.fillRect(x, y, TILE, TILE)
  ctx.fillStyle = body
  ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8)
  // Turret in the facing direction.
  ctx.fillStyle = body
  const cx = x + TILE / 2 - 3
  const cy = y + TILE / 2 - 3
  ctx.fillRect(cx + DIR_DX[tank.dir]! * 10, cy + DIR_DY[tank.dir]! * 10, 6, 6)
}

/** Draw one frame of the battle. */
export function renderTanks(ctx: CanvasRenderingContext2D, state: WorldState): void {
  ctx.clearRect(0, 0, TANK_W, TANK_H)
  ctx.fillStyle = '#15151b'
  ctx.fillRect(0, 0, TANK_W, TANK_H)
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) {
      const tile = state.grid[ty]![tx]!
      if (tile !== 0) drawTile(ctx, tx, ty, tile)
    }
  }
  for (const bullet of state.bullets) {
    ctx.fillStyle = bullet.owner === 'player' ? '#ffe08a' : '#ff9d6b'
    ctx.fillRect(bullet.x, bullet.y, 6, 6)
  }
  for (const enemy of state.enemies) drawTank(ctx, enemy)
  if (state.player.alive) drawTank(ctx, state.player)

  // Wave / remaining HUD.
  ctx.fillStyle = TEXT
  ctx.font = '11px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`第 ${state.wave}/${WAVES} 波`, 6, 14)
  ctx.fillText(`剩余敌人 ${state.enemies.length + state.spawnQueue}`, 6, 30)
  ctx.fillText(`生命 ${'♥'.repeat(state.player.hp)}`, 6, 46)

  if (state.result !== 'none') {
    ctx.fillStyle = TEXT
    ctx.font = 'bold 22px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(state.result === 'win' ? '胜利！' : 'GAME OVER', TANK_W / 2, TANK_H / 2 - 8)
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText('按 R 重新开始', TANK_W / 2, TANK_H / 2 + 20)
  }
}
