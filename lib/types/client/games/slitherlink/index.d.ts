/**
 * Slitherlink game definition: wires the pure puzzle logic into a
 * {@link MiniGameInstance} — left-click toggles an edge line, right-click or
 * Shift+click marks a cross; solving a level fires onScore and auto-advances.
 * The internal level index is 0-based while the displayed and persisted
 * level is 1-based; the highest level reached persists through the shared
 * level-progress helper, so a remount resumes there instead of restarting
 * at the first puzzle. P toggles pause (run clock and advance timer freeze
 * via the stored-remainder pattern); R restarts the CURRENT level; [ / ]
 * jump between unlocked levels (bounded to the persisted highest reached).
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const slitherlinkGame: MiniGameDefinition;
