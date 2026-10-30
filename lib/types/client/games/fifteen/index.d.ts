/**
 * 15-Puzzle 数字华容道 game definition: wires the pure slide logic into a
 * {@link MiniGameInstance} — arrow keys slide the tile adjacent to the blank
 * in the pressed direction, clicking an adjacent tile slides it; Z/Backspace
 * undoes, R restarts the CURRENT level (same seed → same scramble); levels
 * grow 3×3 → 4×4 → 5×5 and auto-advance 1.5s after the win overlay via the
 * stored-remainder pattern; P toggles pause. [ / ] jump between unlocked
 * levels (bounded to the persisted highest reached). The highest level
 * reached persists per game id, so re-entering resumes where the player
 * left off.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const fifteenGame: MiniGameDefinition;
