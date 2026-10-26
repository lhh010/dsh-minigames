/**
 * Bomberman game definition: wires the pure world logic into a
 * {@link MiniGameInstance} — an rAF loop (createFrameLoop, continuous mode),
 * WASD/arrows to move, Space to place a bomb, P pause, R restart the current
 * level, Enter restarts after death. Level progress persists via
 * level-progress ('bomber').
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const bomberGame: MiniGameDefinition;
