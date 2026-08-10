/**
 * Dino runner canvas renderer: chrome-dinosaur-style shapes drawn with rects
 * only (no assets), with a day/night theme that flips every THEME_INTERVAL
 * points (light day palette vs inverted night palette).
 */
import type { DinoState } from './engine.ts';
/** Draw one frame of the run. */
export declare function renderDino(ctx: CanvasRenderingContext2D, state: DinoState): void;
