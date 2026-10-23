/**
 * Tower of Hanoi canvas renderer: 3 rods with rounded-rect discs in accent
 * ramp colors, a 层数/步数 HUD (with the 完美线 marker while the path is still
 * optimal), and overlays for pause and level-clear. State (selected rod, held
 * disc, toast) is caller-owned; the renderer stays stateless and uses the
 * shared visual kit (../theme.ts).
 */
import { RODS, type HanoiState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const GAP = 12
export const DISC_H = 18
export const DISC_GAP = 5
export const BASE_DISC_W = 44
export const STEP_DISC_W = 13
export const ROD_TOP = HUD_H + 26
export const ROD_H = DISC_H * 7 + DISC_GAP * 6 + 14
export const LOGICAL_W = 460
export const LOGICAL_H = ROD_TOP + ROD_H + 34

/** Center x of a rod in logical space. */
export function rodCenterX(rod: number): number {
  return (LOGICAL_W / RODS) * (rod + 0.5)
}

/** Which rod a logical-space x lands on, or null (any height: rods are columns). */
export function rodAt(x: number): number | null {
  for (let i = 0; i < RODS; i += 1) {
    const half = LOGICAL_W / RODS / 2
    if (Math.abs(x - rodCenterX(i)) <= half) return i
  }
  return null
}

function discWidth(size: number): number {
  return BASE_DISC_W + (size - 1) * STEP_DISC_W
}

/** Y of a disc stacked at `level` (0 = bottom) on a rod. */
function discY(level: number): number {
  return ROD_TOP + ROD_H - 10 - (level + 1) * (DISC_H + DISC_GAP)
}

function drawDisc(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number, lifted: boolean): void {
  const w = discWidth(size)
  const color = accent(size - 1)
  glow(ctx, color, lifted ? 22 : 8)
  ctx.fillStyle = color
  roundRectPath(ctx, cx - w / 2, y, w, DISC_H, DISC_H / 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(13,13,20,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/**
 * Draw one frame.
 * @param selected - keyboard-focused rod index, or null to hide the ring.
 * @param heldRod - rod whose top disc is lifted, or null when none is held.
 * @param par - optimal move count for the level (HUD 最少).
 * @param perfect - show the 完美线 marker (path still optimal).
 * @param toast - transient illegal-move message, or null.
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export function renderHanoi(
  ctx: CanvasRenderingContext2D, w: number, h: number, state: HanoiState,
  selected: number | null, heldRod: number | null, level: number, moves: number,
  par: number, perfect: boolean, paused: boolean, winText: string | null, toast: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP / 2, 21, '层数 ', String(level))
  hudPair(ctx, w - GAP / 2, 21, '步数 ', `${moves} / 最少 ${par}`, 'right', THEME.gold)
  if (perfect && winText === null) {
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.good
    glow(ctx, THEME.good, 8)
    ctx.fillText('完美线', w / 2, 21)
    noGlow(ctx)
  }

  const baseY = ROD_TOP + ROD_H - 10
  for (let rod = 0; rod < RODS; rod += 1) {
    const cx = rodCenterX(rod)
    // Rod pole.
    ctx.strokeStyle = rod === selected ? THEME.text : THEME.panelEdge
    ctx.lineWidth = rod === selected ? 3 : 2
    if (rod === selected) glow(ctx, THEME.text, 10)
    ctx.beginPath()
    ctx.moveTo(cx, ROD_TOP - 6)
    ctx.lineTo(cx, baseY)
    ctx.stroke()
    noGlow(ctx)
    // Base plate.
    ctx.fillStyle = rod === selected ? THEME.panelEdge : THEME.panel
    roundRectPath(ctx, cx - 72, baseY, 144, 8, 4)
    ctx.fill()

    const discs = state.rods[rod]!
    const topLifted = rod === heldRod
    for (let i = 0; i < discs.length; i += 1) {
      const size = discs[i]!
      if (topLifted && i === discs.length - 1) {
        drawDisc(ctx, cx, ROD_TOP - DISC_H - 6, size, true)
      } else {
        drawDisc(ctx, cx, discY(i), size, false)
      }
    }
  }

  if (toast !== null) {
    ctx.textAlign = 'center'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    glow(ctx, THEME.bad, 10)
    ctx.fillText(toast, w / 2, h - 14)
    noGlow(ctx)
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '完成', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
