/**
 * Tower of Hanoi 河内塔 game definition: wires the pure move logic into a
 * {@link MiniGameInstance} — ←/→ or A/D select a rod, Enter/Space/↑ picks up
 * and drops the top disc (or click source then target rod); illegal drops
 * shake the board with a toast. Z/Backspace rewinds the last move; R restarts
 * the CURRENT level; completing a level (all discs on the rightmost rod)
 * fires onScore and auto-advances 1.5s later via the stored-remainder pause
 * pattern. There is no pause hotkey.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const hanoiGame: MiniGameDefinition;
