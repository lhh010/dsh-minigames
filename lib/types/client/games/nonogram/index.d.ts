/**
 * Nonogram game definition: wires the pure pattern logic into a
 * {@link MiniGameInstance} — 6 seeded levels; left-click / Space fills,
 * right-click / Shift+Space crosses (X), arrow keys move the cursor; filled
 * cells matching the pattern win, onScore fires, and the next level starts
 * 1.5s later (stored-remainder pattern keeps the advance timer paused-safe).
 * The highest level reached persists through the shared level-progress
 * helper, so a remount resumes there instead of restarting at level 1.
 * P toggles pause; R restarts the CURRENT level (same seed → same pattern);
 * [ / ] jump between unlocked levels (bounded to the persisted highest
 * reached).
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const nonogramGame: MiniGameDefinition;
