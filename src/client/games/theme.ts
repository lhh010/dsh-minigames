/**
 * Shared visual kit for all games: one palette, one background, one particle
 * system, one overlay style. Games keep their own layout code and call into
 * these helpers so the whole panel reads as one product.
 *
 * All helpers are pure canvas drawing (no DOM, no state beyond the particle
 * pool a game owns through {@link createParticles}).
 */

/** The panel palette (Tokyo-Night-inspired, harmonious on the #15151b shell). */
export const THEME = {
  bgTop: '#181822',
  bgBottom: '#10101a',
  panel: '#1e1e2a',
  panelEdge: '#34344a',
  text: '#e2e2ee',
  textMuted: 'rgba(226,226,238,0.55)',
  /** Ordered accent ramp games pick stable indices from. */
  accents: ['#7aa2f7', '#bb9af7', '#9ece6a', '#e0af68', '#f7768e', '#7dcfff', '#ff9e64', '#73daca'],
  good: '#9ece6a',
  bad: '#f7768e',
  gold: '#e0af68',
} as const

/** A stable accent by index (wraps). */
export function accent(index: number): string {
  return THEME.accents[((index % THEME.accents.length) + THEME.accents.length) % THEME.accents.length]!
}

/** Fill the whole logical canvas with the shared vertical gradient. */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  gradient.addColorStop(0, THEME.bgTop)
  gradient.addColorStop(1, THEME.bgBottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

/** A soft outer glow for a shape about to be filled with `color`. */
export function glow(ctx: CanvasRenderingContext2D, color: string, blur = 10): void {
  ctx.shadowColor = color
  ctx.shadowBlur = blur
}

/** Clear the glow set by {@link glow}. */
export function noGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
}

/** Rounded rect path helper (fills/strokes are the caller's choice). */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
}

/** One HUD line: a muted label followed by a bright value. */
export function hudPair(
  ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string,
  align: CanvasTextAlign = 'left', valueColor: string = THEME.text,
): void {
  ctx.font = '600 13px system-ui, sans-serif'
  if (align === 'right') {
    // Right edge: value flush at x, muted label to its left with a gap.
    ctx.textAlign = 'right'
    const valueWidth = ctx.measureText(value).width
    ctx.fillStyle = valueColor
    ctx.fillText(value, x, y)
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(label, x - valueWidth - 6, y)
    return
  }
  ctx.textAlign = align
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(label, x, y)
  ctx.fillStyle = valueColor
  ctx.fillText(value, x + ctx.measureText(label + ' ').width, y)
}

/** The shared end/pause veil: dark cover, spaced title, muted subtitle. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D, w: number, h: number, title: string, subtitle: string, titleColor: string = THEME.text,
): void {
  ctx.fillStyle = 'rgba(13,13,20,0.74)'
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.fillStyle = titleColor
  ctx.fillText(spaced(title), w / 2, h / 2 - 8)
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(subtitle, w / 2, h / 2 + 20)
}

/** Letter-space a CJK/latin title for the overlay look ('游戏结束' → '游 戏 结 束'). */
export function spaced(text: string): string {
  return [...text].join(' ')
}

/** One particle: a fading glow square or circle moving off with gravity. */
interface Particle {
  x: number, y: number, vx: number, vy: number
  life: number, maxLife: number, size: number, color: string, circle: boolean
}

/** Bounded particle pool a game ticks each frame; max 160, oldest dropped. */
export interface ParticleSystem {
  /** Spawn a burst at a point (mixed squares and circles). */
  burst(x: number, y: number, color: string, count?: number, speed?: number): void
  /** Advance and draw; call once per frame after the scene, before overlays. */
  tick(ctx: CanvasRenderingContext2D, dtMs: number): void
  /** Particle count (tests / debugging). */
  size(): number
}

export function createParticles(): ParticleSystem {
  const pool: Particle[] = []
  const spawn = (x: number, y: number, color: string, speed: number): void => {
    if (pool.length >= 160) pool.shift()
    const angle = Math.random() * Math.PI * 2
    const v = speed * (0.35 + Math.random() * 0.65)
    pool.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - speed * 0.25,
      life: 0,
      maxLife: 380 + Math.random() * 320,
      size: 2 + Math.random() * 3,
      color,
      circle: Math.random() < 0.5,
    })
  }
  return {
    burst(x, y, color, count = 10, speed = 130): void {
      for (let i = 0; i < count; i += 1) spawn(x, y, color, speed)
    },
    tick(ctx, dtMs): void {
      const dt = dtMs / 1000
      for (let i = pool.length - 1; i >= 0; i -= 1) {
        const p = pool[i]!
        p.life += dtMs
        if (p.life >= p.maxLife) { pool.splice(i, 1); continue }
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 260 * dt
        const alpha = 1 - p.life / p.maxLife
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        glow(ctx, p.color, 6)
        if (p.circle) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        }
        noGlow(ctx)
      }
      ctx.globalAlpha = 1
    },
    size(): number { return pool.length },
  }
}
