/**
 * Canvas sizing helper: makes a game canvas fit its host at device-pixel
 * resolution while keeping the game's logical coordinate space intact. The
 * canvas scales to the host width (capped), and shrinks further when the host
 * height cannot fit the aspect ratio — so a board is never clipped by a short
 * panel. All games draw in their fixed logical coordinates; the transform
 * handles the rest.
 */
export interface FitCanvasResult {
    ctx: CanvasRenderingContext2D;
    /** Stop observing the host (call on destroy). */
    dispose: () => void;
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
export declare function fitCanvas(host: HTMLElement, canvas: HTMLCanvasElement, logicalW: number, logicalH: number, maxWidth?: number): FitCanvasResult | null;
