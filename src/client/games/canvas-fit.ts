/**
 * Canvas sizing helper: makes a game canvas fit its host at device-pixel
 * resolution while keeping the game's logical coordinate space intact. The
 * canvas scales to the host width (capped), and shrinks further when the host
 * height cannot fit the aspect ratio — so a board is never clipped by a short
 * panel. All games draw in their fixed logical coordinates; the transform
 * handles the rest.
 */

export interface FitCanvasResult {
  ctx: CanvasRenderingContext2D
  /** Stop observing the host (call on destroy). */
  dispose: () => void
}

/**
 * Size a canvas to its host and return a context with the logical->pixel
 * transform applied. Re-fits on host resize.
 * @param host - the sized container the canvas lives in.
 * @param canvas - the game canvas.
 * @param logicalW - the game's logical width in px.
 * @param logicalH - the game's logical height in px.
 * @param maxWidth - display width cap in CSS px.
 * @returns the transformed context and a disposer, or null when 2d is unavailable.
 */
export function fitCanvas(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
  maxWidth = 960,
): FitCanvasResult | null {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null

  const apply = (): void => {
    const dpr = window.devicePixelRatio || 1
    const availW = host.clientWidth
    const availH = host.clientHeight
    let cssW = Math.min(availW > 0 ? availW : logicalW, maxWidth)
    let cssH = cssW * (logicalH / logicalW)
    if (availH > 0 && cssH > availH) {
      cssH = availH
      cssW = cssH * (logicalW / logicalH)
    }
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.max(1, Math.round(cssW * dpr))
    canvas.height = Math.max(1, Math.round(cssH * dpr))
    ctx.setTransform((cssW / logicalW) * dpr, 0, 0, (cssH / logicalH) * dpr, 0, 0)
  }
  apply()

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
  observer?.observe(host)
  return { ctx, dispose: () => observer?.disconnect() }
}
