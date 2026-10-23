/**
 * Stack canvas renderer on the shared theme kit: gradient sky, the tower as
 * accent(layer)-colored slabs scrolled by a camera that keeps the top layer
 * near a fixed height (the tower grows visually upward), the glowing slider
 * at the top, tumbling overhang pieces, a perfect-drop white flash, a
 * 层数/得分 HUD, and the bad-red themed collapse overlay 「倒塌了 · X 层」.
 */
import type { StackState } from './logic.ts';
export declare const STACK_W = 420;
export declare const STACK_H = 640;
/** Draw one frame. */
export declare function renderStack(ctx: CanvasRenderingContext2D, state: StackState): void;
