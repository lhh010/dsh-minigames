/**
 * Huarong (15-puzzle, 4x4) game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — click a tile in the empty's row/column (or use
 * arrow keys) to slide, an interpolated slide animation, a move/time HUD, and
 * a solved overlay. Reports an efficiency score on solve (fewer moves = higher).
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const huarongGame: MiniGameDefinition;
