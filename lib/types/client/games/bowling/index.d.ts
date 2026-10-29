/**
 * Mini Bowling game definition: wires the pure lane physics into a
 * {@link MiniGameInstance} — ←/→ aim (±25°), hold Space to charge the power
 * meter and release to throw, A/D set the hook spin while charging, P pauses
 * (panel pause works too), R restarts the current level with the identical
 * rack sequence. Strike/spare/pin events burst particles; level progress
 * persists through the shared level store (gameId 'bowling').
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const bowlingGame: MiniGameDefinition;
