/**
 * Lights Out game definition: wires the pure toggle logic into a
 * {@link MiniGameInstance} — click or arrow-navigate + Space/Enter toggles a
 * cell and its neighbors; Z/Backspace rewinds the last move; R restarts the
 * CURRENT level (deterministic per-level scramble, so the initial board is
 * identical); clearing a level fires onScore, bursts particles, and
 * auto-advances 1.5s later. Panel-driven pause freezes the advance timer via
 * the stored-remainder pattern; there is no pause hotkey.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const lightsOutGame: MiniGameDefinition;
