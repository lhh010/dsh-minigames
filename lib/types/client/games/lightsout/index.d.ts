/**
 * Lights Out game definition: wires the pure toggle logic into a
 * {@link MiniGameInstance} — click or arrow-navigate + Space/Enter toggles a
 * cell and its neighbors; clearing a level fires onScore, bursts particles,
 * and auto-advances 1.5s later; pause freezes the advance timer via the
 * stored-remainder pattern.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const lightsOutGame: MiniGameDefinition;
