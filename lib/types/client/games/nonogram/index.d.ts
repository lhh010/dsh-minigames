/**
 * Nonogram game definition: wires the pure pattern logic into a
 * {@link MiniGameInstance} — 6 seeded levels; left-click / Space fills,
 * right-click / Shift+Space crosses (X), arrow keys move the cursor; filled
 * cells matching the pattern win, onScore fires, and the next level starts
 * 1.5s later (stored-remainder pattern keeps the advance timer paused-safe).
 * R restarts the CURRENT level (same seed → same pattern).
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const nonogramGame: MiniGameDefinition;
