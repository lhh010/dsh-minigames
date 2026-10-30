/**
 * Zuma game definition: wires the pure state machine into a
 * {@link MiniGameInstance} — ← → fine-aim (2.2 rad/s) or mouse aim,
 * Space/click fires, R restarts the CURRENT level (same per-level seed, so
 * the chain replays identically), [ / ] jump between unlocked levels
 * (bounded to the persisted highest reached), P pauses (panel pause works too, lightsout
 * stored-remainder pattern: the final paused frame stays on canvas). WebAudio
 * plops/explosion sounds are synthesized (no assets), initialized on the
 * first start gesture.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const zumaGame: MiniGameDefinition;
