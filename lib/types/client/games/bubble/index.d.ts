/**
 * 泡泡龙 game definition: wires the pure hex-grid logic into a
 * {@link MiniGameInstance} — ← → fine-aim (or mouse move), Space/click fires
 * the loaded bubble, P pauses (panel pause works too), R restarts the
 * CURRENT level (same seed → the same initial board), [ / ] jump between
 * unlocked levels. Clearing the field
 * auto-advances 1.5s later (stored-remainder pattern keeps the advance
 * timer frozen across pauses); level progress persists via level-progress.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const bubbleGame: MiniGameDefinition;
