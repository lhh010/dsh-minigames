/**
 * Pipes game definition: wires the pure pipe logic into a
 * {@link MiniGameInstance} — click a tile (or move a cursor with arrows and
 * rotate with Space/Enter) to rotate it 90°, a 90s per-level countdown ends
 * the game at zero, and a connected source→sink board scores +200 and
 * auto-advances to a bigger board (or N immediately). The countdown is
 * dt-driven inside the frame loop, so pausing (P) freezes both the timer and
 * input; R restarts from level 1.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pipesGame: MiniGameDefinition;
