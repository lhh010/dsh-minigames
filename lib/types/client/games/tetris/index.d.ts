/**
 * Tetris game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — a gravity-driven rAF loop, keyboard input
 * (arrows/WASD, space hard drop, up/X/Z rotate, C hold, P pause), and restart
 * on game over.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const tetrisGame: MiniGameDefinition;
