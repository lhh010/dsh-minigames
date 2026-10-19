/**
 * Sokoban game definition: wires the pure push logic into a
 * {@link MiniGameInstance} — arrows/WASD move, Z undo, R restart, N or a
 * timed auto-advance after a particle-burst clear, and a gold win overlay
 * after the last level. Score (+100 per boxed goal, +500 per clear) is
 * reported through onScore. Turn-based: pausing freezes input and the
 * auto-advance only; there are no gameplay timers.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const sokobanGame: MiniGameDefinition;
