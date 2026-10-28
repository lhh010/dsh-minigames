/**
 * Mini Pool game definition: wires the pure billiards state machine into a
 * {@link MiniGameInstance} — drag from the cue ball to aim (slingshot: power
 * ∝ pull distance) and release to shoot, or ←/→ rotate the aim and hold
 * Space to charge. R restarts the level with the identical rack, P pauses
 * (panel pause works too). Pot events burst particles; level progress
 * persists through the shared level store (gameId 'pool').
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const poolGame: MiniGameDefinition;
