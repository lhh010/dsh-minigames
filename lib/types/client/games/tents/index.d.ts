/**
 * 露营帐篷 game definition: wires the pure tents logic into a
 * MiniGameInstance — click (or arrows + Space/Enter) toggles a tent on a
 * grass cell; illegal placements (tree cell / touching an existing tent)
 * are rejected by the toggle guard. Solving (every tree matched, all
 * row/column counts met, no touching tents) fires onScore with the time
 * bonus and auto-advances 1.5s later. Persisted level resumes where the
 * player left off; P pauses (advance timer freezes via the stored-remainder
 * pattern); R restarts the CURRENT level; [ ] switches within reached
 * levels.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const tentsGame: MiniGameDefinition;
