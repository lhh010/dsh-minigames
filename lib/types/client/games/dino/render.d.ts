/**
 * Dino runner canvas renderer: chrome-dinosaur-style shapes drawn with rects
 * only (no assets). Palette is tuned for the DSH dark shell; the dino is a
 * cleaner two-tone silhouette with an animated eye, arm, tail, and legs.
 */
import type { DinoState } from './engine.ts';
/** Draw one frame of the run. */
export declare function renderDino(ctx: CanvasRenderingContext2D, state: DinoState): void;
