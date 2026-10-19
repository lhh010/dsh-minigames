/**
 * Simon game definition: wires the pure sequence logic into a
 * {@link MiniGameInstance} — the sequence flashes pad by pad, the player
 * repeats it with clicks or A/S/D/F keys, rounds grow and speed up, and
 * pause freezes the show timers via the stored-remainder pattern.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const simonGame: MiniGameDefinition;
