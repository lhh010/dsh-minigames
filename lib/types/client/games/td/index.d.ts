/**
 * Tower-defense game definition: wires the pure logic into a
 * {@link MiniGameInstance} — 1/2/3 (or toolbar click) selects a tower kind,
 * board clicks build, clicking a placed tower selects it (range circle +
 * upgrade/sell buttons, U upgrades), Space sends the wave early for bonus
 * gold, R restarts the level on the same map seed, P pauses, Enter restarts
 * after a loss. Level progress persists via level-progress.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const tdGame: MiniGameDefinition;
