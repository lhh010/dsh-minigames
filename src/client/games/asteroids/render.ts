/**
 * Asteroids canvas renderer on the shared theme kit: gradient void, glowing
 * stroked rock polygons (accent by size), glowing ship triangle with thrust
 * flame, bullet dots, particle bursts observed from the logic-provided
 * destruction events, a hudPair HUD, and the themed game-over overlay.
 */
import {
  W, H, ROCK_RADIUS,
  type AsteroidsState, type Rock, type RockSize,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
} from '../theme.ts'

export const AST_W = W
export const AST_H = H

const SHIP_COLOR = accent(0)
const BULLET_COLOR = THEME.gold
const ROCK_COLOR: Record<RockSize, string> = {
  large: accent(4),
  medium: accent(3),
  small: accent(7),
}

// Render-side particles, fed by the pure logic's per-step destruction events.
const particles = createParticles()
let lastT = -1
let lastFrame = 0

function drawRock(ctx: CanvasRenderingContext2D, rock: Rock): void {
  const color = ROCK_COLOR[rock.size]
  const radius = ROCK_RADIUS[rock.size]
  ctx.save()
  ctx.translate(rock.x, rock.y)
  ctx.rotate(rock.angle)
  glow(ctx, color, 12)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  const step = (Math.PI * 2) / rock.verts.length
  for (let i = 0; i < rock.verts.length; i += 1) {
    const a = i * step
    const r = radius * rock.verts[i]!
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()
  noGlow(ctx)
  ctx.restore()
}

function drawShip(ctx: CanvasRenderingContext2D, state: AsteroidsState): void {
  const ship = state.ship
  // Respawn invulnerability flickers the hull.
  if (state.invuln > 0 && Math.floor(state.t / 110) % 2 === 0) return
  ctx.save()
  ctx.translate(ship.x, ship.y)
  ctx.rotate(ship.angle)
  glow(ctx, SHIP_COLOR, 14)
  ctx.strokeStyle = SHIP_COLOR
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(0, -16)
  ctx.lineTo(-11, 12)
  ctx.lineTo(0, 6)
  ctx.lineTo(11, 12)
  ctx.closePath()
  ctx.stroke()
  if (ship.thrusting) {
    // Exhaust flame: a shorter glowing triangle behind the hull.
    glow(ctx, accent(0), 10)
    ctx.strokeStyle = accent(0)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-6, 12)
    ctx.lineTo(0, 12 + 8 + Math.sin(state.t / 40) * 4)
    ctx.lineTo(6, 12)
    ctx.stroke()
  }
  noGlow(ctx)
  ctx.restore()
}

function drawBullet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  glow(ctx, BULLET_COLOR, 10)
  ctx.fillStyle = BULLET_COLOR
  ctx.beginPath()
  ctx.arc(x, y, 2.5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/** Draw one frame of the asteroid field. */
export function renderAsteroids(ctx: CanvasRenderingContext2D, state: AsteroidsState): void {
  ctx.clearRect(0, 0, W, H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, W, H)

  // Rock destruction bursts: fired once per stepped frame (state.t moves),
  // so a paused render loop never replays the same events.
  if (state.t !== lastT) {
    for (const event of state.events) {
      particles.burst(event.x, event.y, ROCK_COLOR[event.size], event.size === 'small' ? 10 : 16, 140)
    }
    lastT = state.t
  }
  particles.tick(ctx, dt)

  for (const rock of state.rocks) drawRock(ctx, rock)
  for (const bullet of state.bullets) drawBullet(ctx, bullet.x, bullet.y)
  if (state.result === 'none') drawShip(ctx, state)

  // HUD: wave, lives as heart icons, score.
  hudPair(ctx, 8, 16, '波次 ', String(state.wave))
  hudPair(ctx, 8, 32, '生命 ', '♥'.repeat(Math.max(0, state.lives)), 'left', THEME.bad)
  hudPair(ctx, 8, 48, '得分 ', String(state.score), 'left', THEME.gold)

  if (state.result === 'lose') {
    drawOverlay(ctx, W, H, 'GAME OVER', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  }
}
