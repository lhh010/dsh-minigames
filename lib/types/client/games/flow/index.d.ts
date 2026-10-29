/**
 * 管道连线 game definition: wires the pure path logic into a
 * {@link MiniGameInstance} — pointer drag from a dot extends that color's
 * pipe (re-entering the own pipe truncates it, dragging another dot switches
 * colors), lifting the pointer keeps the path. Solving a level (every cell
 * filled, every pair dot-to-dot) fires onScore with the time bonus and
 * auto-advances 1.5s later. The internal level index is 0-based while the
 * displayed and persisted level is 1-based; sizes wrap 5×5→9×9. P toggles
 * pause (advance timer freezes via the stored-remainder pattern); R
 * restarts the CURRENT level with the same seed.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const flowGame: MiniGameDefinition;
