/**
 * 泡泡龙 canvas renderer: the walled hex playfield with a ceiling, the
 * danger line, glowing bubbles, the rotating shooter with its loaded and
 * next bubble, a dotted aim guide, and overlays for pause / game over /
 * level clear. The renderer stays stateless and draws caller-owned logic
 * state using the shared visual kit (../theme.ts); geometry constants come
 * from logic.ts so tests and rendering share one truth.
 */
import { LOGICAL_W, LOGICAL_H, type BubbleState } from './logic.ts';
export { LOGICAL_W, LOGICAL_H };
export declare const HUD_H = 54;
/**
 * Draw one frame.
 * @param paused - show the 已暂停 overlay.
 */
export declare function renderBubble(ctx: CanvasRenderingContext2D, w: number, h: number, state: BubbleState, paused: boolean): void;
