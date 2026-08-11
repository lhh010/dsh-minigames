/**
 * FPS aim-tracking game definition: wires the pure tracking logic into a
 * {@link MiniGameInstance}. The mouse is captured via the Pointer Lock API —
 * the crosshair stays fixed at the screen centre and raw mouse movement
 * rotates the view; the left button shoots with recoil and shake. Clicking
 * the canvas enters the lock; Esc or P exits to a paused overlay.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const aimTrackGame: MiniGameDefinition;
