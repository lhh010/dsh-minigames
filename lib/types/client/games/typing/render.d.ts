/**
 * Typing meteors canvas renderer on the shared theme kit: gradient starry
 * backdrop, glowing monospace words (locked word highlighted, typed prefix
 * good-green, next letter underlined accent), a bad-glow danger line, a
 * lives/score/streak HUD, and themed pause/game-over overlays. Stateless —
 * all state is passed in.
 */
import { type TypingState } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 560;
export declare const HUD_H = 30;
export declare const WORD_FONT = "bold 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
/**
 * Draw one frame.
 * @param shakeDx - horizontal shake offset (px) applied to the word field.
 */
export declare function renderTyping(ctx: CanvasRenderingContext2D, state: TypingState, paused: boolean, shakeDx?: number): void;
